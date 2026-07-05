// supabase/functions/canonical-generation/index.ts
// Merges a cluster of similar controls into one canonical statement
// Called by: after SME approves or auto-approve threshold hit
//
// POST body: { controls: [{id, text, framework}], save_to_db? }
// Returns:   { canonical_text, reasoning, frameworks_satisfied }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin } from '../_shared/utils.ts'

const SYSTEM = `You are a compliance architect specialising in control rationalisation.
Your job is to synthesise multiple framework controls into a single canonical control statement.

The canonical statement must:
- Be framework-neutral (no mention of ISO, NIST, RBI etc.)
- Capture the shared underlying obligation
- Be precise enough to be auditable
- Be written in present tense, active voice
- Be one to three sentences maximum

Respond ONLY with valid JSON in this exact format:
{
  "canonical_text": "All user access rights shall be reviewed at defined intervals and revoked immediately upon role change or employment termination, with documented evidence retained for audit purposes.",
  "reasoning": "All three controls share the same core obligation: periodic access review with documented revocation. ISO specifies quarterly, NIST is risk-based, RBI is periodic. The canonical statement captures the shared intent without binding to a specific frequency.",
  "frameworks_satisfied": ["ISO 27001 A.8.2", "NIST PR.AC-1", "RBI CSF 3.1.2"],
  "control_name": "User access review and revocation",
  "domain": "Access Control"
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { controls, save_to_db = false, existing_control_id } = await req.json()

    if (!controls || !Array.isArray(controls) || controls.length === 0) {
      return errorResponse('controls array is required', 400)
    }

    const controlsList = controls.map((c: { text: string; framework: string }, i: number) =>
      `CONTROL ${i + 1} (${c.framework}):\n${c.text}`
    ).join('\n\n')

    const prompt = `Synthesise these ${controls.length} compliance controls into a single canonical control statement.

${controlsList}

These controls have been identified as representing the same underlying requirement across different frameworks.
Create a unified canonical statement that satisfies all of them.`

    const result = await callClaudeJSON<{
      canonical_text: string
      reasoning: string
      frameworks_satisfied: string[]
      control_name: string
      domain: string
    }>(prompt, SYSTEM, 1000)

    // Optionally save to controls table
    if (save_to_db && existing_control_id) {
      const supabase = getSupabaseAdmin()
      await supabase
        .from('controls')
        .update({
          canonical_text: result.canonical_text,
          is_canonical:   true,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', existing_control_id)
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('canonical-generation error:', err)
    return errorResponse(err.message)
  }
})
