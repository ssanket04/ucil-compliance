// supabase/functions/conflict-detection/index.ts
// Detects conflicts between two framework requirements on the same topic
// Called by: auto-mapping pipeline when two clauses cover the same control topic
//
// POST body: { policy_ref_1, requirement_1, framework_1, policy_ref_2, requirement_2, framework_2, topic }
// Returns:   { is_conflict, explanation, partial_status, suggested_resolution, severity }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin, sendNotification } from '../_shared/utils.ts'

const SYSTEM = `You are a regulatory compliance expert identifying conflicts between framework requirements.
A conflict exists when two frameworks mandate different standards on the same topic (e.g. different retention periods, different testing frequencies, different security thresholds).

Respond ONLY with valid JSON in this exact format:
{
  "is_conflict": true,
  "conflict_type": "Frequency conflict",
  "explanation": "ISO 27001 A.17.1 requires annual BCP testing while RBI CSF 6.3 mandates biannual testing. The bank currently tests annually, satisfying ISO but failing RBI's stricter requirement.",
  "currently_compliant_with": "ISO 27001 A.17.1",
  "currently_noncompliant_with": "RBI CSF 6.3",
  "partial_status": "Compliant with ISO 27001, Non-compliant with RBI CSF",
  "suggested_resolution": "Increase BCP testing to biannual frequency. This satisfies RBI's stricter requirement and also meets ISO's minimum annual requirement, achieving compliance with both frameworks.",
  "resolution_effort": "Low",
  "severity": "high"
}

is_conflict: true or false
conflict_type: "Frequency conflict", "Scope conflict", "Threshold conflict", "Process conflict", "No conflict"
resolution_effort: "Low", "Medium", "High"
severity: "critical", "high", "medium", "low" — only relevant if is_conflict is true`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const {
      policy_ref_1, requirement_1, framework_1,
      policy_ref_2, requirement_2, framework_2,
      topic, save_to_db = false,
    } = body

    if (!requirement_1 || !requirement_2) {
      return errorResponse('requirement_1 and requirement_2 are required', 400)
    }

    const prompt = `Analyse whether these two framework requirements conflict with each other.

TOPIC: ${topic || 'Compliance control requirement'}

REQUIREMENT 1 (${framework_1 || 'Framework A'} — ${policy_ref_1 || 'Unknown'}):
${requirement_1}

REQUIREMENT 2 (${framework_2 || 'Framework B'} — ${policy_ref_2 || 'Unknown'}):
${requirement_2}

Determine if they conflict and if so, explain the conflict and suggest how to satisfy both.`

    const result = await callClaudeJSON<{
      is_conflict: boolean
      conflict_type: string
      explanation: string
      currently_compliant_with: string
      currently_noncompliant_with: string
      partial_status: string
      suggested_resolution: string
      resolution_effort: string
      severity: string
    }>(prompt, SYSTEM, 800)

    // Optionally save conflict to database
    if (save_to_db && result.is_conflict) {
      const supabase = getSupabaseAdmin()

      const conflictCode = `CONF-${Date.now()}`
      await supabase.from('conflicts').insert({
        conflict_code:        conflictCode,
        title:                result.conflict_type + ': ' + (topic || 'Control requirement'),
        policy_ref_1,
        requirement_1,
        policy_ref_2,
        requirement_2,
        status:               'Conflict Detected',
        partial_status:       result.partial_status,
        explanation:          result.explanation,
        suggested_resolution: result.suggested_resolution,
      })

      // Notify CISO and Compliance Lead
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .in('role', ['CISO', 'Compliance Lead'])

      for (const admin of (admins || [])) {
        await sendNotification(
          supabase,
          admin.id,
          'Compliance conflict detected',
          `Conflict detected: ${topic || policy_ref_1 + ' vs ' + policy_ref_2}`,
          result.explanation,
          'notifications'
        )
      }
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('conflict-detection error:', err)
    return errorResponse(err.message)
  }
})
