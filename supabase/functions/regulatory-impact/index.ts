// supabase/functions/regulatory-impact/index.ts
// Reads a new circular and maps it against existing controls
// Called by: web-scraper or manual upload trigger
//
// POST body: { regulatory_change_id }
// Returns:   { matched_controls, unmatched_clauses, impact_summary, total_impacted }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin, sendNotification } from '../_shared/utils.ts'

const SYSTEM = `You are a regulatory compliance expert at a bank.
You are given a new regulatory circular and a list of existing internal controls.
Your job is to identify which existing controls are affected by this circular and which new requirements have no matching control.

Respond ONLY with valid JSON in this exact format:
{
  "matched_controls": [
    {
      "control_code": "CC-0041",
      "clause_reference": "Section 3.2.1",
      "impact_type": "Update required",
      "impact_description": "Existing control covers access review but RBI now mandates monthly frequency instead of quarterly."
    }
  ],
  "unmatched_clauses": [
    {
      "clause_reference": "Section 4.2.1",
      "clause_text": "Banks shall maintain a documented cyber crisis management plan tested biannually.",
      "description": "No existing internal control covers cyber crisis management plan requirement.",
      "severity": "critical"
    }
  ],
  "impact_summary": "This circular primarily strengthens monitoring and incident response requirements. 3 existing controls need updates and 2 new controls must be created.",
  "total_impacted": 5,
  "total_new_gaps": 2
}

impact_type must be one of: "No change required", "Minor update", "Update required", "Major revision required"
severity for unmatched must be one of: "critical", "high", "medium", "low"`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { regulatory_change_id } = await req.json()
    if (!regulatory_change_id) return errorResponse('regulatory_change_id is required', 400)

    const supabase = getSupabaseAdmin()

    // 1. Fetch the regulatory change record
    const { data: regChange, error: regErr } = await supabase
      .from('regulatory_changes')
      .select('*')
      .eq('id', regulatory_change_id)
      .single()

    if (regErr || !regChange) return errorResponse('Regulatory change not found', 404)

    // 2. Download circular document if available
    let circularText = `Circular: ${regChange.circular_id}\nTitle: ${regChange.title}`
    if (regChange.file_path) {
      try {
        const { data: fileData } = await supabase.storage
          .from('evidence-files')
          .download(regChange.file_path)
        if (fileData) {
          const raw = await fileData.text()
          circularText = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').substring(0, 10000)
        }
      } catch {
        // Use title/id as fallback
      }
    }

    // 3. Fetch existing controls (summary for context window efficiency)
    const { data: controls } = await supabase
      .from('controls')
      .select('control_code, name, description, canonical_text')
      .eq('is_canonical', true)
      .limit(100) // Send first 100 to stay within context

    const controlsList = (controls || []).map((c: {
      control_code: string; name: string; canonical_text?: string; description: string
    }) =>
      `${c.control_code}: ${c.name} — ${c.canonical_text || c.description}`
    ).join('\n')

    // 4. Ask Claude to map circular to controls
    const prompt = `Analyse this new regulatory circular against the bank's existing control library.

CIRCULAR CONTENT:
${circularText}

EXISTING CONTROLS (${controls?.length || 0} canonical controls):
${controlsList}

For each requirement in the circular:
1. Find matching existing controls and describe the impact
2. Identify requirements with NO matching control (these become new gaps)

Be precise about which control codes match which circular sections.`

    const result = await callClaudeJSON<{
      matched_controls: Array<{
        control_code: string
        clause_reference: string
        impact_type: string
        impact_description: string
      }>
      unmatched_clauses: Array<{
        clause_reference: string
        clause_text: string
        description: string
        severity: string
      }>
      impact_summary: string
      total_impacted: number
      total_new_gaps: number
    }>(prompt, SYSTEM, 2000)

    // 5. Update regulatory_changes record
    await supabase.from('regulatory_changes').update({
      total_impacted:    result.total_impacted,
      total_gaps_created: result.total_new_gaps,
      ai_impact_summary: result.impact_summary,
      status:            'In review',
      updated_at:        new Date().toISOString(),
    }).eq('id', regulatory_change_id)

    // 6. Create new gaps for unmatched clauses
    for (const clause of (result.unmatched_clauses || [])) {
      const gapCode = `GAP-${regChange.circular_id.replace(/[^A-Z0-9]/g, '')}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const rawSev = (clause.severity || 'medium').toLowerCase().trim();
      const validSevs = ['critical', 'high', 'medium', 'low'];
      const finalSev = validSevs.includes(rawSev) ? rawSev : 'medium';
      // description is NOT NULL — fall back through clause_text / reference so a
      // model that omits `description` can't null out the row (and abort the batch).
      const description = clause.description || clause.clause_text
        || `Unmatched clause ${clause.clause_reference || ''}`.trim();

      const { error: gapErr } = await supabase.from('gaps').insert({
        gap_code:     gapCode,
        clause_ref:   clause.clause_reference || '—',
        clause_text:  clause.clause_text || null,
        severity:     finalSev,
        description,
        status:       'Open',
      })
      if (gapErr) console.error(`Failed to insert gap for clause ${clause.clause_reference}:`, gapErr.message)
    }

    // 7. Notify Compliance Lead and CISO
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .in('role', ['Compliance Lead', 'CISO'])

    for (const admin of (admins || [])) {
      await sendNotification(
        supabase,
        admin.id,
        'Regulatory update detected',
        `Impact analysis complete: ${regChange.circular_id}`,
        `${result.total_impacted} controls impacted, ${result.total_new_gaps} new gaps created. ${result.impact_summary}`,
        'regulatory',
        regulatory_change_id
      )
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('regulatory-impact error:', err)
    return errorResponse(err.message)
  }
})
