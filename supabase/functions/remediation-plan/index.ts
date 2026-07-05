// supabase/functions/remediation-plan/index.ts
// Generates a prioritised remediation plan for all open gaps
// Called by: user clicks "Generate remediation plan" on Gap Analysis page
//
// POST body: { gap_ids? } — if empty, fetches all open gaps
// Returns:   { plan: [{gap_code, action, owner, effort, deadline, priority}], executive_summary }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin } from '../_shared/utils.ts'

const SYSTEM = `You are a Chief Risk Officer creating a remediation action plan for a bank's compliance gaps.
Write a clear, actionable plan that a compliance team can execute.

Respond ONLY with valid JSON in this exact format:
{
  "executive_summary": "7 compliance gaps identified requiring immediate attention. 2 critical gaps pose regulatory risk and must be resolved within 30 days. The remaining 5 gaps can be addressed in Q2 2025 through a structured remediation programme.",
  "plan": [
    {
      "gap_code": "CC-0287",
      "gap_description": "ITSM audit trail export failure",
      "severity": "critical",
      "recommended_action": "Restore ITSM integration, validate audit trail export, and run end-to-end compliance test. Escalate to IT Operations immediately.",
      "responsible_team": "IT Operations",
      "suggested_owner": "IT Governance",
      "estimated_effort": "3-5 days",
      "recommended_deadline": "30 Apr 2025",
      "priority": 1,
      "dependencies": []
    }
  ],
  "total_effort_estimate": "6-8 weeks for full remediation",
  "quick_wins": ["CC-0405 can be resolved in 1 day by linking training records to evidence system"],
  "blockers": ["CC-0287 resolution depends on IT Operations availability"]
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const { gap_ids } = body

    const supabase = getSupabaseAdmin()

    // Fetch gaps — either specific ones or all open
    let query = supabase
      .from('gaps')
      .select('*, frameworks(name)')
      .eq('status', 'Open')
      .order('severity')

    if (gap_ids && Array.isArray(gap_ids) && gap_ids.length > 0) {
      query = query.in('id', gap_ids)
    }

    const { data: gaps, error } = await query
    if (error) return errorResponse('Failed to fetch gaps', 500)
    if (!gaps || gaps.length === 0) return jsonResponse({ message: 'No open gaps found', plan: [] })

    // Build gap descriptions for the prompt
    const gapsList = gaps.map((g: {
      gap_code: string
      severity: string
      description: string
      why_critical?: string
      impact_if_unresolved?: string
    }, i: number) => `
GAP ${i + 1}:
Code: ${g.gap_code}
Severity: ${g.severity.toUpperCase()}
Description: ${g.description}
Why critical: ${g.why_critical || 'Not assessed yet'}
Impact: ${g.impact_if_unresolved || 'Not assessed yet'}`
    ).join('\n')

    const prompt = `Create a prioritised remediation action plan for these ${gaps.length} compliance gaps at a bank.

${gapsList}

Today's date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}

Prioritise by regulatory risk and severity. Critical gaps must have a 30-day deadline maximum.
For each gap, provide a specific, actionable remediation step.`

    const result = await callClaudeJSON<{
      executive_summary: string
      plan: Array<{
        gap_code: string
        gap_description: string
        severity: string
        recommended_action: string
        responsible_team: string
        suggested_owner: string
        estimated_effort: string
        recommended_deadline: string
        priority: number
        dependencies: string[]
      }>
      total_effort_estimate: string
      quick_wins: string[]
      blockers: string[]
    }>(prompt, SYSTEM, 2500)

    return jsonResponse(result)

  } catch (err) {
    console.error('remediation-plan error:', err)
    return errorResponse(err.message)
  }
})
