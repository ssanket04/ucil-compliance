import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || 'YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

export let CURRENT_USER = null;
export let CURRENT_ROLE = null;

export function setCurrentUser(user) {
  CURRENT_USER = user;
  CURRENT_ROLE = user?.role || null;
}

/* ============================================================
   AUTH
   ============================================================ */
export async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: profile } = await sb.from('users').select('*').eq('id', data.user.id).single();
  setCurrentUser(profile);
  return profile;
}

export async function signUpUser(email, password, fullName, role = 'Compliance Lead') {
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

export async function logout() {
  await sb.auth.signOut();
  setCurrentUser(null);
}

export async function getCurrentSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile } = await sb.from('users').select('*').eq('id', session.user.id).single();
  if (profile) {
    setCurrentUser(profile);
  }
  return profile;
}

/* ============================================================
   METRICS  —  single row, kept live by DB triggers
   ============================================================ */
export async function fetchMetrics() {
  const { data, error } = await sb.from('metrics').select('*');
  if (error) { console.error('fetchMetrics:', error); return null; }
  const m = data?.[0] || null;
  
  if (!m) return null;
  
  const { data: cData } = await sb.from('controls').select('confidence_score');
  if (cData && cData.length > 0) {
    const total = cData.length;
    const autoApproved = cData.filter(c => (c.confidence_score ?? 0.85) >= 0.85).length;
    m.ai_auto_approval_rate = total > 0 ? Math.round((autoApproved / total) * 100 * 100) / 100 : 0;
    m.unique_canonical = m.unique_canonical || total;
  } else {
    if (!m.unique_canonical) return null;
  }
  
  if (m.frameworks_ingested && m.circulars_ingested && m.internal_policies) {
    m.total_sources = m.frameworks_ingested + m.circulars_ingested + m.internal_policies;
  }
  
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
export async function fetchFrameworks() {
  const { data: viewData, error: viewError } = await sb.from('v_framework_coverage').select('*').order('name');
  
  if (!viewError && viewData && viewData.length > 0) {
    return viewData;
  }
  
  console.log('Calculating framework coverage dynamically...');
  
  const { data: frameworks, error: fwError } = await sb.from('frameworks').select('id, name, type');
  if (fwError || !frameworks) {
    console.error('fetchFrameworks:', fwError);
    return [];
  }
  
  const { data: mappings, error: mapError } = await sb
    .from('control_framework_mappings')
    .select('framework_id, control_id, controls!inner(status)');
  
  if (mapError || !mappings) {
    console.error('fetchFrameworks mappings:', mapError);
    return [];
  }
  
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
    
    const satisfied = fwMappings.filter(m => m.controls.status === 'Active').length;
    const partial = fwMappings.filter(m => m.controls.status === 'Under Review').length;
    const missing = total - satisfied - partial;
    
    const satisfied_pct = Math.round((satisfied / total) * 100);
    const partial_pct = Math.round((partial / total) * 100);
    const missing_pct = 100 - satisfied_pct - partial_pct;
    
    let compliance_status = 'Not Compliant';
    if (satisfied_pct === 100) compliance_status = 'Compliant';
    else if (satisfied_pct > 0 || partial_pct > 0) compliance_status = 'Partially Compliant';
    
    return {
      name: fw.name,
      compliance_status,
      satisfied_pct,
      partial_pct,
      missing_pct,
      total_controls: total,
      satisfied_count: satisfied,
      partial_count: partial,
      missing_count: missing
    };
  });
  
  return coverage;
}

/* ============================================================
   CONTROLS (Unified Control Library)
   ============================================================ */
export async function fetchControls() {
  const { data: viewData, error: viewError } = await sb.from('v_controls_full').select('*').order('control_code');
  if (!viewError && viewData) return viewData;
  
  const { data, error } = await sb
    .from('controls')
    .select('*, users(full_name), dh:users!controls_domain_head_id_fkey(full_name)')
    .order('control_code');
  if (error) { console.error('fetchControls:', error); return []; }
  
  return data.map(c => ({
    ...c,
    owner_name: c.users?.full_name,
    domain_head_name: c.dh?.full_name
  })) || [];
}

/* ============================================================
   DOMAIN HEAD VIEW (Domain Breakdown)
   ============================================================ */
export async function fetchDomainStats() {
  const { data, error } = await sb
    .from('controls')
    .select('*, users(full_name), dh:users!controls_domain_head_id_fkey(full_name)')
    .order('control_code');
  if (error) { console.error('fetchDomainStats:', error); return []; }
  return data.map(c => ({
    ...c,
    owner_name: c.users?.full_name,
    domain_head_name: c.dh?.full_name
  })) || [];
}

/* ============================================================
   GAPS (Failed Controls)
   ============================================================ */
export async function fetchGaps() {
  const { data, error } = await sb
    .from('gaps')
    .select('*, controls(control_code, name, status)')
    .order('severity', { ascending: false });
  if (error) { console.error('fetchGaps:', error); return []; }
  return data || [];
}

/* ============================================================
   EVIDENCE MANAGEMENT
   ============================================================ */
export async function fetchAllEvidence(controlId = null) {
  let query = sb.from('v_evidence_full').select('*, users!evidence_uploaded_by_fkey(full_name)');
  if (controlId) {
    query = query.eq('control_id', controlId);
  }
  const { data, error } = await query.order('upload_date', { ascending: false });
  if (error) { console.error('fetchAllEvidence:', error); return []; }
  return data || [];
}

export async function fetchEvidenceForControl(controlId) {
  const { data, error } = await sb
    .from('v_evidence_full').select('*')
    .eq('control_id', controlId)
    .order('upload_date', { ascending: false });
  if (error) { console.error('fetchEvidence:', error); return []; }
  return data || [];
}

export async function fetchEvidenceTimeline(evidenceId) {
  const { data, error } = await sb
    .from('evidence_timeline')
    .select('*, users(full_name)')
    .eq('evidence_id', evidenceId)
    .order('performed_at', { ascending: true });
  if (error) { console.error('fetchEvidenceTimeline:', error); return []; }
  return data || [];
}

export async function uploadEvidence(controlId, file) {
  // Step 1: Calculate SHA-256 BEFORE upload — if crypto fails, abort entirely
  let sha256Hash = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (hashErr) {
    console.error('SHA-256 hash calculation failed:', hashErr);
  }

  // Hard enforcement: do NOT allow uploads without a cryptographic signature
  if (!sha256Hash) {
    throw new Error('File integrity check failed. Your browser does not support secure file hashing. Please use a modern browser (Chrome 90+, Firefox 90+, Edge 90+) to upload evidence.');
  }

  // Step 2: Upload file to storage
  const filePath = `evidence/${controlId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await sb.storage
    .from('evidence-files').upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  // Step 3: Insert metadata with verified hash
  const { data, error } = await sb.from('evidence').insert({
    control_id:  controlId,
    file_name:   file.name,
    file_path:   filePath,
    file_size:   formatFileSize(file.size),
    file_type:   file.type,
    uploaded_by: CURRENT_USER ? CURRENT_USER.id : null,
    status:      'Pending',
    sha256_hash: sha256Hash,
  }).select().single();
  if (error) throw error;
  return data;
}


export async function approveEvidence(evidenceId) {
  const { data, error } = await sb.from('evidence').update({
    status:      'Approved',
    reviewed_by: CURRENT_USER ? CURRENT_USER.id : null,
    review_date: new Date().toISOString(),
  }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

export async function rejectEvidence(evidenceId, rejectionReason, manualRemark) {
  if (!rejectionReason?.trim()) throw new Error('Rejection reason is mandatory');
  const { data, error } = await sb.from('evidence').update({
    status:           'Rejected',
    reviewed_by:      CURRENT_USER ? CURRENT_USER.id : null,
    review_date:      new Date().toISOString(),
    rejection_reason: rejectionReason,
    manual_remark:    manualRemark || null,
  }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

export async function submitEvidenceForReview(evidenceId) {
  const { data, error } = await sb.from('evidence')
    .update({ status: 'Under Review' }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

export async function saveEvidenceRemark(evidenceId, remark) {
  const { data, error } = await sb.from('evidence')
    .update({ manual_remark: remark }).eq('id', evidenceId).select().single();
  if (error) throw error;
  return data;
}

export async function getEvidenceFileUrl(filePath) {
  const { data, error } = await sb.storage
    .from('evidence-files').createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ============================================================
   AUDIT LOG
   ============================================================ */
export async function fetchAuditLog(limit = 20) {
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
export async function fetchQueue(status = 'Pending') {
  const { data, error } = await sb
    .from('sme_review_queue')
    .select('*, controls!sme_review_queue_control_id_a_fkey(control_code, name), frameworks(name)')
    .eq('status', status)
    .order('confidence_score');
  if (error) { console.error('fetchQueue:', error); return []; }
  return data || [];
}

export async function approveQueueItem(queueId, justification) {
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

export async function rejectQueueItem(queueId, justification) {
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
export async function fetchRegulatoryChanges() {
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
export async function fetchConflicts() {
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
export async function fetchNotifications() {
  if (!CURRENT_USER) return [];
  const { data, error } = await sb
    .from('notifications').select('*')
    .eq('recipient_id', CURRENT_USER.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('fetchNotifications:', error); return []; }
  return data || [];
}

export async function markAllNotificationsRead() {
  if (!CURRENT_USER) return;
  await sb.from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', CURRENT_USER.id)
    .eq('is_read', false);
}

/* ============================================================
   SCAN INFO
   ============================================================ */
export async function fetchScanInfo() {
  const { data, error } = await sb.from('v_latest_scans').select('*');
  if (error) { console.error('fetchScanInfo:', error); return []; }
  return data || [];
}

/* ============================================================
   REAL-TIME SUBSCRIPTIONS
   ============================================================ */
export function subscribeToNotifications(callback) {
  if (!CURRENT_USER) return null;
  return sb.channel('notifications')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `recipient_id=eq.${CURRENT_USER.id}`,
    }, payload => callback(payload.new))
    .subscribe();
}

export function subscribeToEvidence(callback) {
  return sb.channel('evidence-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evidence' },
      payload => callback(payload))
    .subscribe();
}

export function subscribeToGaps(callback) {
  return sb.channel('gap-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gaps' },
      payload => callback(payload.new))
    .subscribe();
}

export function subscribeToMetrics(callback) {
  return sb.channel('metrics-updates')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'metrics' },
      payload => callback(payload.new))
    .subscribe();
}

/* ============================================================
   UTILITY HELPERS
   ============================================================ */
export function formatFileSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

export function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(iso) {
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

export function showError(message)   { console.error(message); alert('Error: ' + message); }
export function showSuccess(message) { console.log('✓', message); }

/* ============================================================
   AI CLIENT FUNCTIONS — Browser API Callers
   ============================================================ */

async function callEdgeFunction(fnName, body) {
  const { data, error } = await sb.functions.invoke(fnName, { body });
  if (error) { console.error(`${fnName} error:`, error); throw error; }
  return data;
}

export async function runSimilarityDetection(controlAText, controlBText, controlAId, controlBId) {
  return callEdgeFunction('similarity-detection', {
    control_a_text: controlAText,
    control_b_text: controlBText,
    control_a_id:   controlAId || null,
    control_b_id:   controlBId || null,
  });
}

export async function generateCanonicalControl(controls, saveToDb, existingControlId) {
  return callEdgeFunction('canonical-generation', {
    controls,
    save_to_db:          saveToDb || false,
    existing_control_id: existingControlId || null,
  });
}

export async function runEvidenceVerdict(evidenceId, controlId) {
  return callEdgeFunction('evidence-verdict', {
    evidence_id: evidenceId,
    control_id:  controlId,
  });
}

export async function generateGapNarrative(gapId) {
  return callEdgeFunction('gap-narrative', { gap_id: gapId });
}

export async function runRegulatoryImpact(regulatoryChangeId) {
  return callEdgeFunction('regulatory-impact', {
    regulatory_change_id: regulatoryChangeId,
  });
}

export async function detectConflict({ policyRef1, requirement1, framework1, policyRef2, requirement2, framework2, topic }) {
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

export async function generateRemediationPlan(gapIds) {
  return callEdgeFunction('remediation-plan', {
    gap_ids: gapIds || null,
  });
}

export async function runAutoMapping(frameworkId, clauses) {
  return callEdgeFunction('auto-mapping', {
    framework_id: frameworkId,
    clauses,
  });
}

export async function triggerWebScraper() {
  return callEdgeFunction('web-scraper', {});
}

export function setAILoading(buttonEl, loading, originalText) {
  if (loading) {
    buttonEl.disabled = true;
    buttonEl.textContent = '🤖 AI working…';
  } else {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}

export function renderAIVerdict(verdict) {
  if (!verdict) return '<span style="font-size:11px;color:var(--text-tertiary);font-style:italic">Pending AI analysis…</span>';
  const colors = { Sufficient: 'green', Partial: 'amber', Insufficient: 'red' };
  return `<span class="badge badge-${colors[verdict] || 'gray'}">${verdict}</span>`;
}
