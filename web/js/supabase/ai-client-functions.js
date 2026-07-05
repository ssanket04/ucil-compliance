/* ============================================================
   AI INTEGRATION — Add these functions to supabase-client.js
   These call Edge Functions from the browser
   ============================================================ */

// ── Helper: call an edge function ────────────────────────────
async function callEdgeFunction(fnName, body) {
  const { data, error } = await sb.functions.invoke(fnName, { body });
  if (error) { console.error(`${fnName} error:`, error); throw error; }
  return data;
}

/* ── 1. Similarity Detection ─────────────────────────────────
   Called from: SME Queue page when comparing two controls
   Usage: await runSimilarityDetection(textA, textB)
*/
async function runSimilarityDetection(controlAText, controlBText, controlAId, controlBId) {
  return callEdgeFunction('similarity-detection', {
    control_a_text: controlAText,
    control_b_text: controlBText,
    control_a_id:   controlAId || null,
    control_b_id:   controlBId || null,
  });
}

/* ── 2. Canonical Control Generation ─────────────────────────
   Called from: after SME approves a cluster mapping
   Usage: await generateCanonicalControl([{text, framework}])
*/
async function generateCanonicalControl(controls, saveToDb, existingControlId) {
  return callEdgeFunction('canonical-generation', {
    controls,
    save_to_db:          saveToDb || false,
    existing_control_id: existingControlId || null,
  });
}

/* ── 3. Evidence Verdict ─────────────────────────────────────
   Called from: Evidence Management page after file upload
   Usage: await runEvidenceVerdict(evidenceId, controlId)
*/
async function runEvidenceVerdict(evidenceId, controlId) {
  return callEdgeFunction('evidence-verdict', {
    evidence_id: evidenceId,
    control_id:  controlId,
  });
}

/* ── 4. Gap Narrative ────────────────────────────────────────
   Called from: Gap Analysis page for gaps with no narrative yet
   Usage: await generateGapNarrative(gapId)
*/
async function generateGapNarrative(gapId) {
  return callEdgeFunction('gap-narrative', { gap_id: gapId });
}

/* ── 5. Regulatory Impact Analysis ──────────────────────────
   Called from: Regulatory Change Impact page
   Usage: await runRegulatoryImpact(regulatoryChangeId)
*/
async function runRegulatoryImpact(regulatoryChangeId) {
  return callEdgeFunction('regulatory-impact', {
    regulatory_change_id: regulatoryChangeId,
  });
}

/* ── 6. Conflict Detection ───────────────────────────────────
   Called from: Compliance Conflicts page
   Usage: await detectConflict({policyRef1, req1, fw1, policyRef2, req2, fw2, topic})
*/
async function detectConflict({ policyRef1, requirement1, framework1, policyRef2, requirement2, framework2, topic }) {
  return callEdgeFunction('conflict-detection', {
    policy_ref_1:   policyRef1,
    requirement_1:  requirement1,
    framework_1:    framework1,
    policy_ref_2:   policyRef2,
    requirement_2:  requirement2,
    framework_2:    framework2,
    topic,
    save_to_db: true,
  });
}

/* ── 7. Remediation Plan ─────────────────────────────────────
   Called from: Gap Analysis page "Generate remediation plan" button
   Usage: await generateRemediationPlan()  OR  await generateRemediationPlan(['gap-id-1', 'gap-id-2'])
*/
async function generateRemediationPlan(gapIds) {
  return callEdgeFunction('remediation-plan', {
    gap_ids: gapIds || null,
  });
}

/* ── 8. Auto-mapping after ingestion ─────────────────────────
   Called from: Data Ingestion page after framework upload
   Usage: await runAutoMapping(frameworkId, [{ref, text}])
*/
async function runAutoMapping(frameworkId, clauses) {
  return callEdgeFunction('auto-mapping', {
    framework_id: frameworkId,
    clauses,
  });
}

/* ── 9. Trigger web scraper manually ─────────────────────────
   Called from: Data Ingestion page "Run scraper now" button
   Usage: await triggerWebScraper()
*/
async function triggerWebScraper() {
  return callEdgeFunction('web-scraper', {});
}

/* ── UI helpers ──────────────────────────────────────────────*/

// Show AI loading state on a button
function setAILoading(buttonEl, loading, originalText) {
  if (loading) {
    buttonEl.disabled = true;
    buttonEl.textContent = '🤖 AI working…';
  } else {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}

// Render AI verdict badge
function renderAIVerdict(verdict) {
  if (!verdict) return '<span style="font-size:11px;color:var(--text-tertiary);font-style:italic">Pending AI analysis…</span>';
  const colors = { Sufficient: 'green', Partial: 'amber', Insufficient: 'red' };
  return `<span class="badge badge-${colors[verdict] || 'gray'}">${verdict}</span>`;
}
