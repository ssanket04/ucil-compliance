// supabase/functions/gap-narrative/index.ts
// Writes business-language gap explanations for CISO/CFO consumption
// Called by: when a new gap is created (DB trigger webhook) or manually
//
// POST body: { gap_id } OR { gap_code, clause_text, framework_name, severity }
// Returns:   { why_critical, impact_if_unresolved, benefit_if_resolved, impact_category }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin } from '../_shared/utils.ts'

const SYSTEM = `You are a Chief Risk Officer writing gap analysis narratives for a bank's board and regulators.
Your language must be:
- Plain English, no technical jargon
- Business-impact focused (financial, reputational, regulatory)
- Specific to the gap described
- Concise — 2-3 sentences per field maximum

Respond ONLY with valid JSON in this exact format:
{
  "why_critical": "This gap directly violates RBI's mandatory cyber resilience framework requirement. The absence of a documented cyber crisis plan means the bank has no tested procedure if a major cyber incident occurs, exposing it to regulatory action.",
  "impact_if_unresolved": "Financial penalty of up to ₹5 crore under RBI directions, potential supervisory observation in the next examination, and reputational damage if a cyber incident occurs without a documented response plan.",
  "benefit_if_resolved": "Closes the RBI CSF chapter 4 gap entirely, demonstrates proactive cyber governance posture to regulators, and reduces cyber incident response time by establishing a tested escalation path.",
  "impact_category": ["Financial", "Reputational"],
  "priority_score": 9
}

impact_category must be an array containing one or more of: Financial, Reputational, Non-financial, Regulatory
priority_score must be 1-10 where 10 is most urgent`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const supabase = getSupabaseAdmin()

    let gapId: string | null = null
    let gapCode: string
    let clauseText: string
    let frameworkName: string
    let severity: string

    // Can be called with gap_id (fetch from DB) or direct fields
    if (body.gap_id) {
      const { data: gap, error } = await supabase
        .from('gaps')
        .select('*, frameworks(name)')
        .eq('id', body.gap_id)
        .single()

      if (error || !gap) return errorResponse('Gap not found', 404)

      gapId       = gap.id
      gapCode     = gap.gap_code
      clauseText  = gap.description
      frameworkName = gap.frameworks?.name || 'Regulatory framework'
      severity    = gap.severity
    } else {
      gapCode     = body.gap_code || 'Unknown'
      clauseText  = body.clause_text
      frameworkName = body.framework_name || 'Regulatory framework'
      severity    = body.severity || 'high'
      if (!clauseText) return errorResponse('clause_text is required', 400)
    }

    const prompt = `A bank has a ${severity.toUpperCase()} severity compliance gap.

GAP ID: ${gapCode}
FRAMEWORK: ${frameworkName}
GAP DESCRIPTION: ${clauseText}

Write a business-language gap narrative for the bank's CISO and CFO.
Explain why this is ${severity}, what happens if it stays unresolved, and what the benefit of fixing it is.`

    const result = await callClaudeJSON<{
      why_critical: string
      impact_if_unresolved: string
      benefit_if_resolved: string
      impact_category: string[]
      priority_score: number
    }>(prompt, SYSTEM, 800)

    // Save to gaps table if we have an ID
    if (gapId) {
      await supabase.from('gaps').update({
        why_critical:         result.why_critical,
        impact_if_unresolved: result.impact_if_unresolved,
        benefit_if_resolved:  result.benefit_if_resolved,
        impact_category:      result.impact_category,
        updated_at:           new Date().toISOString(),
      }).eq('id', gapId)
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('gap-narrative error:', err)
    return errorResponse(err.message)
  }
})
