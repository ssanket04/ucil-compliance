// supabase/functions/evidence-verdict/index.ts
// Reads uploaded evidence and judges if it proves the control is implemented
// Called by: Supabase Storage trigger when file is uploaded to evidence-files bucket
//
// POST body: { evidence_id, control_id }
// Returns:   { verdict, covered, missing, red_flags, detail }

import { callClaudeJSON, CORS, jsonResponse, errorResponse, getSupabaseAdmin, sendNotification } from '../_shared/utils.ts'

const SYSTEM = `You are a compliance auditor reviewing evidence documents.
Your job is to assess whether the uploaded evidence adequately proves that a compliance control is implemented.

Be specific, objective, and actionable in your findings.

Respond ONLY with valid JSON in this exact format:
{
  "verdict": "Sufficient",
  "covered": ["Quarterly access review process documented", "Revocation procedure clearly defined", "Sign-off from IT Security present"],
  "missing": [],
  "red_flags": [],
  "detail": "The uploaded access review report comprehensively documents the Q1 2025 review cycle. All user accounts are listed with their access levels, and revocations are recorded with timestamps. The document is signed by the IT Security team and meets ISO A.8.2 requirements.",
  "confidence": 0.91
}

verdict must be one of: "Sufficient", "Insufficient", "Partial"
covered: list of requirements that ARE evidenced
missing: list of requirements NOT evidenced
red_flags: list of concerns or inconsistencies found
confidence: 0 to 1 representing certainty of your assessment`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { evidence_id, control_id } = await req.json()
    if (!evidence_id || !control_id) {
      return errorResponse('evidence_id and control_id are required', 400)
    }

    const supabase = getSupabaseAdmin()

    // 1. Fetch evidence record
    const { data: evidence, error: evErr } = await supabase
      .from('evidence')
      .select('*, controls(name, description, canonical_text)')
      .eq('id', evidence_id)
      .single()

    if (evErr || !evidence) return errorResponse('Evidence not found', 404)

    // 2. Download the file from Supabase Storage
    const { data: fileData, error: fileErr } = await supabase.storage
      .from('evidence-files')
      .download(evidence.file_path)

    if (fileErr || !fileData) return errorResponse('Could not download evidence file', 500)

    // Calculate server-side SHA-256 hash to verify upload integrity
    let serverHash = ''
    let hashMatched = true
    try {
      const buffer = await fileData.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      serverHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      
      if (evidence.sha256_hash && evidence.sha256_hash !== serverHash) {
        hashMatched = false
      }
      
      if (!evidence.sha256_hash && serverHash) {
        await supabase
          .from('evidence')
          .update({ sha256_hash: serverHash })
          .eq('id', evidence_id)
      }
    } catch (hashErr) {
      console.error('Server-side hash check failed:', hashErr)
    }

    // 3. Extract text from file
    // For PDFs and text files, read as text. Binary files get a note.
    let fileText = ''
    const fileName = evidence.file_name.toLowerCase()

    if (fileName.endsWith('.pdf') || fileName.endsWith('.txt') || fileName.endsWith('.docx')) {
      try {
        fileText = await fileData.text()
        // Clean up binary artifacts from PDF
        fileText = fileText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').substring(0, 8000)
      } catch {
        fileText = `[File: ${evidence.file_name}, Size: ${evidence.file_size}. Binary content — assess based on file name and context.]`
      }
    } else {
      fileText = `[File: ${evidence.file_name}, Size: ${evidence.file_size}. Non-text format.]`
    }

    const control = evidence.controls
    const controlReq = control?.canonical_text || control?.description || 'Compliance control requirement'

    // 4. Ask Claude to assess the evidence
    const prompt = `Assess whether this evidence document proves the compliance control is implemented.

CONTROL REQUIREMENT:
${controlReq}

CONTROL NAME: ${control?.name || 'Unknown'}

EVIDENCE FILE: ${evidence.file_name}
EVIDENCE CONTENT (extracted):
${fileText}

Determine if this evidence sufficiently proves the control is in place.`

    const result = await callClaudeJSON<{
      verdict: string
      covered: string[]
      missing: string[]
      red_flags: string[]
      detail: string
      confidence: number
    }>(prompt, SYSTEM, 1200)

    // 5. Save AI verdict to evidence table
    const finalRedFlags = [...result.red_flags]
    let finalDetail = result.detail
    
    if (!hashMatched) {
      finalRedFlags.push('Cryptographic signature mismatch detected!')
      finalDetail = `[SECURITY WARNING: Client-submitted file hash (${evidence.sha256_hash || 'none'}) did not match the file hash calculated on the server (${serverHash}). The evidence file may have been altered during transmission.]\n\n` + finalDetail
    }

    await supabase
      .from('evidence')
      .update({
        ai_verdict:         !hashMatched ? 'Rejected' : result.verdict,
        ai_verdict_detail:  finalDetail,
        ai_missing_elements: result.missing.join('; '),
        ai_red_flags:       finalRedFlags.join('; '),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', evidence_id)

    // 6. Notify Domain Head if red flags found
    if (result.red_flags.length > 0) {
      const { data: ctrl } = await supabase
        .from('controls')
        .select('domain_head_id, control_code, name')
        .eq('id', control_id)
        .single()

      if (ctrl?.domain_head_id) {
        await sendNotification(
          supabase,
          ctrl.domain_head_id,
          'Evidence uploaded',
          `AI flagged issues in evidence for ${ctrl.control_code}`,
          `${ctrl.name}: AI verdict is "${result.verdict}". Red flags: ${result.red_flags.slice(0, 2).join(', ')}`,
          'evidence',
          evidence_id
        )
      }
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('evidence-verdict error:', err)
    return errorResponse(err.message)
  }
})
