/* ============================================================
   supabase-client.js  —  UCIL v3
   ============================================================ */

const SUPABASE_URL  = 'https://kyhqwllhrjsikpuvfebk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aHF3bGxocmpzaWtwdXZmZWJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzI1MDcxMywiZXhwIjoyMDk4ODI2NzEzfQ.m5HBUK1PA5jyHvS18JaAU8w5vtZW-u_m5FX0EzJNXds';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let CURRENT_USER = null;
let CURRENT_ROLE = null;

/* ============================================================
   AUTH
   ============================================================ */
async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: profile } = await sb.from('users').select('*').eq('id', data.user.id).single();
  CURRENT_USER = profile;
  CURRENT_ROLE = profile?.role;
  return profile;
}

async function signUpUser(email, password, fullName, role = 'Compliance Lead') {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role
      }
    }
  });
  if (error) throw error;
  return data.user;
}

async function logout() {
  await sb.auth.signOut();
  CURRENT_USER = null;
  CURRENT_ROLE = null;
  window.location.reload();
}

async function getCurrentSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile } = await sb.from('users').select('*').eq('id', session.user.id).single();
  if (profile) { CURRENT_USER = profile; CURRENT_ROLE = profile.role; }
  return profile;
}

/* ============================================================
   METRICS  —  single row, kept live by DB triggers
   ============================================================ */
async function fetchMetrics() {
  const { data, error } = await sb.from('metrics').select('*');
  if (error) { console.error('fetchMetrics:', error); return null; }
  const m = data?.[0] || null;
  
  // If no metrics row exists, return null to trigger fallback to DATA.metrics
  if (!m) return null;
  
  // Calculate confidence-based auto-approval rate from controls table
  // This matches what the library page shows (confidence >= 0.85)
  const { data: cData } = await sb.from('controls').select('confidence_score');
  if (cData && cData.length > 0) {
    const total = cData.length;
    // NULL confidence_score treated as 0.85 (auto-approved by default)
    const autoApproved = cData.filter(c => (c.confidence_score ?? 0.85) >= 0.85).length;
    m.ai_auto_approval_rate = total > 0 ? Math.round((autoApproved / total) * 100 * 100) / 100 : 0;
    // If unique_canonical is 0 or null, use actual control count from database
    m.unique_canonical = m.unique_canonical || total;
  } else {
    // If no controls in database, return null to use DATA.metrics fallback
    if (!m.unique_canonical) return null;
  }
  
  // Ensure total_sources includes internal_policies
  // total_sources = frameworks_ingested + circulars_ingested + internal_policies
  if (m.frameworks_ingested && m.circulars_ingested && m.internal_policies) {
    m.total_sources = m.frameworks_ingested + m.circulars_ingested + m.internal_policies;
  }
  
  // Calculate control multiplier dynamically
  // Multiplier = Total mappings / Total unique controls
  const { data: mappingsData } = await sb.from('control_framework_mappings').select('id', { count: 'exact', head: true });
  if (mappingsData !== null && m.unique_canonical > 0) {
    const totalMappings = mappingsData || 0;
    m.total_mappings = totalMappings;
    m.control_multiplier = (totalMappings / m.unique_canonical).toFixed(2);
  }
  
  return m;
}

/* ============================================================
   FRAMEWORKS
   ============================================================ */
async function fetchFrameworks() {
  // Fetch framework coverage from view (if exists) or calculate dynamically
  const { data: viewData, error: viewError } = await sb.from('v_framework_coverage').select('*').order('name');
  
  if (!viewError && viewData && viewData.length > 0) {
    return viewData;
  }
  
  // Fallback: Calculate dynamically from control_framework_mappings
  console.log('Calculating framework coverage dynamically...');
  
  // Get all frameworks
  const { data: frameworks, error: fwError } = await sb.from('frameworks').select('id, name, type');
  if (fwError || !frameworks) {
    console.error('fetchFrameworks:', fwError);
    return [];
  }
  
  // Get all mappings with control status
  const { data: mappings, error: mapError } = await sb
    .from('control_framework_mappings')
    .select('framework_id, control_id, controls!inner(status)');
  
  if (mapError || !mappings) {
    console.error('fetchFrameworks mappings:', mapError);
    return [];
  }
  
  // Calculate coverage for each framework
  const coverage = frameworks.map(fw => {
    const fwMappings = mappings.filter(m => m.framework_id === fw.id);
    const total = fwMappings.length;
    
    if (total === 0) {
      return {
        name: fw.name,
        compliance_status: 'Not Mapped',
        satisfied_pct: 0,
        partial_pct: 0,
        missing_pct: 0,
        total_controls: 0,
        satisfied_count: 0,
        partial_count: 0,
        missing_count: 0
      };
    }
    
    // Count by status
    // Satisfied = Active controls
    // Missing = Failed + Under Review controls
    // Partial = remaining (if any)
    const satisfied = fwMappings.filter(m => m.controls?.status === 'Active').length;
    const underReview = fwMappings.filter(m => m.controls?.status === 'Under Review').length;
    const failed = fwMappings.filter(m => m.controls?.status === 'Failed').length;
    const missing = underReview + failed;
    
    const satisfiedPct = Math.round((satisfied / total) * 100);
    const missingPct = Math.round((missing / total) * 100);
    const partialPct = 100 - satisfiedPct - missingPct;
    
    // Determine compliance status
    let complianceStatus;
    if (satisfiedPct >= 90) complianceStatus = 'Compliant';
    else if (satisfiedPct >= 70) complianceStatus = 'Partially Compliant';
    else complianceStatus = 'Not Compliant';
    
    return {
      name: fw.name,
      compliance_status: complianceStatus,
      satisfied_pct: satisfiedPct,
      partial_pct: partialPct,
      missing_pct: missingPct,
      total_controls: total,
      satisfied_count: satisfied,
      partial_count: total - satisfied - missing,
      missing_count: missing
    };
  });
  
  return coverage.sort((a, b) => a.name.localeCompare(b.name));
}

/* ============================================================
   CONTROLS
   ============================================================ */
async function fetchControls(filters = {}) {
  let query = sb.from('v_controls_full').select('*');
  if (filters.domain) query = query.eq('domain_name', filters.domain);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,control_code.ilike.%${filters.search}%`);
  const { data, error } = await query.order('control_code');
  if (error) { console.error('fetchControls:', error); return []; }
  return data || [];
}

async function fetchControlById(controlId) {
  const { data, error } = await sb.from('v_controls_full').select('*').eq('id', controlId).single();
  if (error) throw error;
  return data;
}

async function fetchControlMappings(controlId) {
  const { data, error } = await sb
    .from('control_framework_mappings')
    .select('*, frameworks(name, type)')
    .eq('control_id', controlId);
  if (error) { console.error('fetchControlMappings:', error); return []; }
  return data || [];
}

async function updateControlStatus(controlId, status, reason) {
  const { data, error } = await sb
    .from('controls')
    .update({ status, status_reason: reason })
    .eq('id', controlId).select().single();
  if (error) throw error;
  return data;
}

/* ============================================================
   MAPPINGS — for the Unified Library mapping view
   Returns controls joined with their framework mappings
   ============================================================ */
async function fetchMappings() {
  // Fetch all mappings with framework name and control code
  const { data, error } = await sb
    .from('control_framework_mappings')
    .select('*, controls(id, control_code, name, canonical_text, confidence_score, multiplier), frameworks(name)')
    .order('created_at');
  if (error) { console.error('fetchMappings:', error); return []; }
  return data || [];
}

/* ============================================================
   DOMAIN HEAD — aggregate stats + full control list per domain
   ============================================================ */
async function fetchDomainStats() {
  const { data, error } = await sb
    .from('v_controls_full')
    .select('id, control_code, name, description, domain_name, domain_head_name, owner_name, status, status_reason, confidence_score');
  if (error) { console.error('fetchDomainStats:', error); return []; }
  return data || [];
}

/* ============================================================
   GAPS
   ============================================================ */
async function fetchGaps(filters = {}) {
  let query = sb.from('gaps').select('*, frameworks(name)');
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.status)   query = query.eq('status', filters.status);
  else                  query = query.eq('status', 'Open');
  const { data, error } = await query.order('severity').order('created_at');
  if (error) { console.error('fetchGaps:', error); return []; }
  return data || [];
}

// Count of DISTINCT controls with at least one Rejected evidence (= gap count from evidence side)
async function fetchRejectedControlCount() {
  const { data, error } = await sb.from('evidence').select('control_id').eq('status', 'Rejected');
  if (error) { console.error('fetchRejectedControlCount:', error); return 0; }
  return new Set((data || []).map(e => e.control_id)).size;
}

// Fetch gaps for a specific set of control_codes (gap_code matches control_code)
async function fetchGapsForControls(controlCodes) {
  if (!controlCodes || controlCodes.length === 0) return [];
  const { data, error } = await sb
    .from('gaps')
    .select('gap_code, severity, description, status')
    .in('gap_code', controlCodes)
    .eq('status', 'Open');
  if (error) { console.error('fetchGapsForControls:', error); return []; }
  return data || [];
}

async function updateGapStatus(gapId, status) {
  const { data, error } = await sb
    .from('gaps').update({ status }).eq('id', gapId).select().single();
  if (error) throw error;
  return data;
}

/* ============================================================
   EVIDENCE
   ============================================================ */
async function fetchEvidenceCounts() {
  const { data, error } = await sb.from('evidence').select('status');
  if (error) { console.error('fetchEvidenceCounts:', error); return {}; }
  const counts = { Approved: 0, 'Under Review': 0, Reassigned: 0, Pending: 0 };
  (data || []).forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });
  return counts;
}

async function fetchAllEvidence(filters = {}) {
  let query = sb.from('v_evidence_full').select('*');
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.domain) query = query.eq('domain_name', filters.domain);
  const { data, error } = await query.order('upload_date', { ascending: false });
  if (error) { console.error('fetchAllEvidence:', error); return []; }
  return data || [];
}

async function fetchEvidenceForControl(controlId) {
  const { data, error } = await sb
    .from('v_evidence_full').select('*')
    .eq('control_id', controlId)
    .order('upload_date', { ascending: false });
  if (error) { console.error('fetchEvidence:', error); return []; }
  return data || [];
}

// Fetch timeline entries for a specific evidence record
async function fetchEvidenceTimeline(evidenceId) {
  const { data, error } = await sb
    .from('evidence_timeline')
    .select('*, users(full_name)')
    .eq('evidence_id', evidenceId)
    .order('performed_at', { ascending: true });
  if (error) { console.error('fetchEvidenceTimeline:', error); return []; }
  return data || [];
}

async function uploadEvidence(controlId, file) {
  const filePath = `evidence/${controlId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await sb.storage
    .from('evidence-files').upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await sb.from('evidence').insert({
    control_id:  controlId,
    file_name:   file.name,
    file_path:   filePath,
    file_size:   formatFileSize(file.size),
    file_type:   file.type,
    uploaded_by: CURRENT_USER.id,
    status:      'Pending',
  }).select().single();
  if (error) throw error;
  return data;
}

async function approveEvidence(evidenceId) {
  const { data, error } = await sb.from('evidence').update({
    status:      'Approved',
    reviewed_by: CURRENT_USER.id,
    review_date: new Date().toISOString(),
  }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

async function rejectEvidence(evidenceId, rejectionReason, manualRemark) {
  if (!rejectionReason?.trim()) throw new Error('Rejection reason is mandatory');
  const { data, error } = await sb.from('evidence').update({
    status:           'Rejected',
    reviewed_by:      CURRENT_USER.id,
    review_date:      new Date().toISOString(),
    rejection_reason: rejectionReason,
    manual_remark:    manualRemark || null,
  }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

async function submitEvidenceForReview(evidenceId) {
  const { data, error } = await sb.from('evidence')
    .update({ status: 'Under Review' }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

async function saveEvidenceRemark(evidenceId, remark) {
  const { data, error } = await sb.from('evidence')
    .update({ manual_remark: remark }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

async function getEvidenceFileUrl(filePath) {
  const { data, error } = await sb.storage
    .from('evidence-files').createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ============================================================
   AUDIT LOG
   ============================================================ */
async function fetchAuditLog(limit = 20) {
  const { data, error } = await sb
    .from('audit_log')
    .select('*, users(full_name, role)')
    .order('performed_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchAuditLog:', error); return []; }
  return data || [];
}

/* ============================================================
   SME REVIEW QUEUE
   ============================================================ */
async function fetchQueue(status = 'Pending') {
  const { data, error } = await sb
    .from('sme_review_queue')
    .select('*, controls!sme_review_queue_control_id_a_fkey(control_code, name), frameworks(name)')
    .eq('status', status)
    .order('confidence_score');
  if (error) { console.error('fetchQueue:', error); return []; }
  return data || [];
}

async function approveQueueItem(queueId, justification) {
  if (!CURRENT_USER) throw new Error('Not authenticated');
  const { data, error } = await sb.from('sme_review_queue').update({
    status:      'Approved',
    reviewed_by: CURRENT_USER.id,
    reviewed_at: new Date().toISOString(),
    justification,
  }).eq('id', queueId).select().single();
  if (error) throw error;
  return data;
}

async function rejectQueueItem(queueId, justification) {
  if (!justification?.trim()) throw new Error('Justification is mandatory');
  if (!CURRENT_USER) throw new Error('Not authenticated');
  const { data, error } = await sb.from('sme_review_queue').update({
    status:      'Rejected',
    reviewed_by: CURRENT_USER.id,
    reviewed_at: new Date().toISOString(),
    justification,
  }).eq('id', queueId).select().single();
  if (error) throw error;
  return data;
}

/* ============================================================
   REGULATORY CHANGES
   ============================================================ */
async function fetchRegulatoryChanges() {
  const { data, error } = await sb
    .from('regulatory_changes')
    .select('*')
    .order('issued_date', { ascending: false });
  if (error) { console.error('fetchRegulatoryChanges:', error); return []; }
  return data || [];
}

/* ============================================================
   CONFLICTS
   ============================================================ */
async function fetchConflicts() {
  const { data, error } = await sb
    .from('conflicts')
    .select('*, f1:frameworks!conflicts_framework_id_1_fkey(name), f2:frameworks!conflicts_framework_id_2_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchConflicts:', error); return []; }
  return data || [];
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
async function fetchNotifications() {
  if (!CURRENT_USER) return [];
  const { data, error } = await sb
    .from('notifications').select('*')
    .eq('recipient_id', CURRENT_USER.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('fetchNotifications:', error); return []; }
  return data || [];
}

async function markAllNotificationsRead() {
  if (!CURRENT_USER) return;
  await sb.from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', CURRENT_USER.id)
    .eq('is_read', false);
}

/* ============================================================
   SCAN INFO
   ============================================================ */
async function fetchScanInfo() {
  const { data, error } = await sb.from('v_latest_scans').select('*');
  if (error) { console.error('fetchScanInfo:', error); return []; }
  return data || [];
}

/* ============================================================
   REAL-TIME SUBSCRIPTIONS
   ============================================================ */
function subscribeToNotifications(callback) {
  if (!CURRENT_USER) return null;
  return sb.channel('notifications')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `recipient_id=eq.${CURRENT_USER.id}`,
    }, payload => callback(payload.new))
    .subscribe();
}

function subscribeToEvidence(callback) {
  return sb.channel('evidence-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evidence' },
      payload => callback(payload))
    .subscribe();
}

function subscribeToGaps(callback) {
  return sb.channel('gap-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gaps' },
      payload => callback(payload.new))
    .subscribe();
}

// Subscribe to metrics changes — used to keep sidebar badge live
function subscribeToMetrics(callback) {
  return sb.channel('metrics-updates')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'metrics' },
      payload => callback(payload.new))
    .subscribe();
}

/* ============================================================
   UTILITY HELPERS
   ============================================================ */
function formatFileSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return days  + 'd ago';
  if (hours > 0) return hours + 'h ago';
  if (mins > 0)  return mins  + 'm ago';
  return 'Just now';
}

function showError(message)   { console.error(message); alert('Error: ' + message); }
function showSuccess(message) { console.log('✓', message); }

/* ============================================================
   AI CLIENT FUNCTIONS — Browser API Callers
   ============================================================ */

// Helper to call any edge function
async function callEdgeFunction(fnName, body) {
  const { data, error } = await sb.functions.invoke(fnName, { body });
  if (error) { console.error(`${fnName} error:`, error); throw error; }
  return data;
}

// 1. Similarity Detection (SME Review comparisons)
async function runSimilarityDetection(controlAText, controlBText, controlAId, controlBId) {
  return callEdgeFunction('similarity-detection', {
    control_a_text: controlAText,
    control_b_text: controlBText,
    control_a_id:   controlAId || null,
    control_b_id:   controlBId || null,
  });
}

// 2. Canonical Control Generation
async function generateCanonicalControl(controls, saveToDb, existingControlId) {
  return callEdgeFunction('canonical-generation', {
    controls,
    save_to_db:          saveToDb || false,
    existing_control_id: existingControlId || null,
  });
}

// 3. Evidence Verdict Analyzer
async function runEvidenceVerdict(evidenceId, controlId) {
  return callEdgeFunction('evidence-verdict', {
    evidence_id: evidenceId,
    control_id:  controlId,
  });
}

// 4. Gap Risk Narrative generator
async function generateGapNarrative(gapId) {
  return callEdgeFunction('gap-narrative', { gap_id: gapId });
}

// 5. Regulatory Impact Mapper
async function runRegulatoryImpact(regulatoryChangeId) {
  return callEdgeFunction('regulatory-impact', {
    regulatory_change_id: regulatoryChangeId,
  });
}

// 6. Framework Conflict Detection
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

// 7. Gap Analysis Remediation Planner
async function generateRemediationPlan(gapIds) {
  return callEdgeFunction('remediation-plan', {
    gap_ids: gapIds || null,
  });
}

// 8. Auto-mapping
async function runAutoMapping(frameworkId, clauses) {
  return callEdgeFunction('auto-mapping', {
    framework_id: frameworkId,
    clauses,
  });
}

// 9. Manual Scraper Trigger
async function triggerWebScraper() {
  return callEdgeFunction('web-scraper', {});
}

// UI Loading status handler
function setAILoading(buttonEl, loading, originalText) {
  if (loading) {
    buttonEl.disabled = true;
    buttonEl.textContent = '🤖 AI working…';
  } else {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}

// Render AI verdict badge style
function renderAIVerdict(verdict) {
  if (!verdict) return '<span style="font-size:11px;color:var(--text-tertiary);font-style:italic">Pending AI analysis…</span>';
  const colors = { Sufficient: 'green', Partial: 'amber', Insufficient: 'red' };
  return `<span class="badge badge-${colors[verdict] || 'gray'}">${verdict}</span>`;
}