// supabase/functions/similarity-detection/index.ts
// Compares two control texts and returns confidence score + rationale
// Called by: auto-mapping pipeline after ingestion
//
// POST body: { control_a_text, control_b_text, control_a_id?, control_b_id? }
// Returns:   { confidence, rationale, verdict }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin } from '../_shared/utils.ts'

const SYSTEM = `You are a compliance expert specialising in control framework mapping.
Your job is to determine whether two compliance controls represent the same underlying requirement.

Respond ONLY with valid JSON in this exact format:
{
  "confidence": 0.92,
  "verdict": "Strong match",
  "rationale": "Both controls require quarterly user access reviews with documented evidence of revocation upon role change. The core obligation is identical across both frameworks.",
  "differences": "ISO specifies quarterly frequency explicitly; NIST leaves frequency to risk assessment.",
  "recommendation": "auto-approve"
}

recommendation must be one of: "auto-approve", "sme-review", "reject"
confidence must be a number between 0 and 1.
verdict must be one of: "Strong match", "Partial match", "Weak match", "No match"`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { control_a_text, control_b_text, control_a_id, control_b_id } = await req.json()

    if (!control_a_text || !control_b_text) {
      return errorResponse('control_a_text and control_b_text are required', 400)
    }

    const prompt = `Compare these two compliance controls and determine if they represent the same underlying requirement.

CONTROL A:
${control_a_text}

CONTROL B:
${control_b_text}

Analyse their intent, scope, and obligations. Return your analysis as JSON.`

    const result = await callClaudeJSON<{
      confidence: number
      verdict: string
      rationale: string
      differences: string
      recommendation: string
    }>(prompt, SYSTEM)

    // If IDs provided, save mapping to sme_review_queue or control_framework_mappings
    if (control_a_id && control_b_id) {
      const supabase = getSupabaseAdmin()

      if (result.confidence >= 0.85) {
        // Auto-approve: save to control_framework_mappings
        await supabase.from('control_framework_mappings').upsert({
          control_id:       control_a_id,
          clause_ref:       control_b_id,
          confidence_score: result.confidence,
          rationale:        result.rationale,
          status:           'Auto-Approved',
        })
      } else if (result.confidence >= 0.65) {
        // Route to SME queue
        await supabase.from('sme_review_queue').insert({
          mapping_id:       `MAP-${Date.now()}`,
          control_id_a:     control_a_id,
          confidence_score: result.confidence,
          ai_rationale:     result.rationale,
          status:           'Pending',
        })
      }
      // Below 0.65: no action, just return result
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('similarity-detection error:', err)
    return errorResponse(err.message)
  }
})
