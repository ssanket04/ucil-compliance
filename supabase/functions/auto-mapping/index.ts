// supabase/functions/auto-mapping/index.ts
// Runs after a new framework is ingested
// Compares each new clause against all existing canonical controls
// Auto-approves >= 0.85, routes 0.50–0.84 to SME queue, rejects < 0.50
//
// POST body: { framework_id, clauses: [{ref, text}] }
// Returns:   { processed, auto_approved, sme_queue, auto_rejected, conflicts_found }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin, getActivePrompt } from '../_shared/utils.ts'

const SYSTEM_FALLBACK = `You are a compliance mapping engine.
Compare a new framework clause against multiple existing controls and find the best match.

Respond ONLY with valid JSON:
{
  "best_match_index": 2,
  "confidence": 0.91,
  "rationale": "Both controls require the same access revocation process on role change.",
  "is_conflict": false,
  "conflict_note": ""
}

best_match_index: 0-based index of the best matching control, or -1 if no match
confidence: 0 to 1
is_conflict: true if the clause conflicts with an existing control`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { framework_id, clauses } = await req.json()
    if (!framework_id || !clauses?.length) {
      return errorResponse('framework_id and clauses are required', 400)
    }

    const supabase = getSupabaseAdmin()

    // Load active prompt from DB (hot-swappable without redeploy)
    const SYSTEM = await getActivePrompt('auto-mapping', SYSTEM_FALLBACK)

    // Fetch all canonical controls
    const { data: controls } = await supabase
      .from('controls')
      .select('id, control_code, name, canonical_text, description')
      .eq('is_canonical', true)
      .limit(200)

    if (!controls?.length) return errorResponse('No canonical controls found', 400)

    const controlsText = controls.map((c: {
      control_code: string; name: string; canonical_text?: string; description: string
    }, i: number) =>
      `[${i}] ${c.control_code}: ${c.name} — ${c.canonical_text || c.description}`
    ).join('\n')

    let autoApproved = 0
    let smeQueue = 0
    let autoRejected = 0
    let conflictsFound = 0
    const processed = []

    // Process each clause
    for (const clause of clauses) {
      try {
        const prompt = `Find the best matching control for this new framework clause.

NEW CLAUSE (${clause.ref}):
${clause.text}

EXISTING CONTROLS:
${controlsText}

Which existing control best matches this clause? Return the best match index and confidence.`

        const result = await callClaudeJSON<{
          best_match_index: number
          confidence: number
          rationale: string
          is_conflict: boolean
          conflict_note: string
        }>(prompt, SYSTEM, 400)

        const matchedControl = result.best_match_index >= 0 ? controls[result.best_match_index] : null

        if (matchedControl && result.confidence >= 0.85) {
          // Auto-approve: save to control_framework_mappings
          await supabase.from('control_framework_mappings').upsert({
            control_id:       matchedControl.id,
            framework_id,
            clause_ref:       clause.ref,
            clause_text:      clause.text,
            confidence_score: result.confidence,
            rationale:        result.rationale,
            status:           'Auto-Approved',
          }, { onConflict: 'control_id,framework_id,clause_ref' })
          autoApproved++

        } else if (matchedControl && result.confidence >= 0.50) {
          // Route to SME queue — borderline matches only (0.50–0.84)
          await supabase.from('sme_review_queue').insert({
            mapping_id:       `MAP-${framework_id.slice(0,8)}-${Date.now()}`,
            control_id_a:     matchedControl.id,
            framework_id,
            clause_ref:       clause.ref,
            confidence_score: result.confidence,
            ai_rationale:     result.rationale,
            status:           'Pending',
          })
          smeQueue++

        } else {
          // Confidence < 0.50 or no match — auto-reject, create gap
          // Low-confidence mappings NEVER enter SME queue (prevents noise)
          autoRejected++
          await supabase.from('gaps').insert({
            gap_code:     `GAP-${framework_id.slice(0,8)}-${clause.ref.replace(/\./g,'')}`,
            framework_id,
            clause_ref:   clause.ref,
            severity:     result.confidence <= 0 ? 'critical' : 'medium',
            description:  `No matching control found for ${clause.ref}: ${clause.text.substring(0, 100)}`,
            why_critical: result.rationale || null,
            status:       'Open',
          }).select().maybeSingle()
        }

        if (result.is_conflict) {
          conflictsFound++
          // Trigger conflict detection for further analysis
          const edgeFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/conflict-detection`
          await fetch(edgeFnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              policy_ref_1:   clause.ref,
              requirement_1:  clause.text,
              policy_ref_2:   matchedControl?.control_code || '',
              requirement_2:  matchedControl?.canonical_text || matchedControl?.description || '',
              topic:          matchedControl?.name || 'Compliance requirement',
              save_to_db:     true,
            }),
          }).catch(console.error)
        }

        processed.push({
          clause_ref:    clause.ref,
          matched_to:    matchedControl?.control_code || null,
          confidence:    result.confidence,
          action:        result.confidence >= 0.85 ? 'auto-approved'
                       : result.confidence >= 0.50 ? 'sme-queue'
                       : 'auto-rejected',
        })

      } catch (clauseErr) {
        console.error(`Error processing clause ${clause.ref}:`, clauseErr)
        processed.push({ clause_ref: clause.ref, error: clauseErr.message })
      }

      // Small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // Update SME queue badge count via metrics recalculation trigger
    // (handled automatically by DB trigger trg_metrics_on_mappings)

    return jsonResponse({
      processed: processed.length,
      auto_approved:   autoApproved,
      sme_queue:       smeQueue,
      auto_rejected:   autoRejected,
      conflicts_found: conflictsFound,
      details:         processed,
    })

  } catch (err) {
    console.error('auto-mapping error:', err)
    return errorResponse(err.message)
  }
})
