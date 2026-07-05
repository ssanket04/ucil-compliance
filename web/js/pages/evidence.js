/* ============================================================
   EVIDENCE MANAGEMENT PAGE — Live from Supabase
   Approved count = metrics.implemented = dashboard Implemented = library Active
   Folders = one per control (falls back to DATA.controls if Supabase empty)
   ============================================================ */
async function renderEvidence() {
  const [allEvidence, allControls, metricsRaw, auditLog] = await Promise.all([
    fetchAllEvidence(),
    fetchControls(),
    fetchMetrics(),
    fetchAuditLog(20),
  ]);

  // Use DATA.controls as fallback if Supabase has no controls yet
  const controls = allControls.length ? allControls.map(c => ({
    id:          c.id,
    control_code: c.control_code,
    name:        c.name,
    domain:      c.domain_name || '—',
    owner:       c.owner_name || '—',
    domainHead:  c.domain_head_name || '—',
    status:      c.status,
  })) : DATA.controls.map(c => ({
    id:          c.id,   // DATA.controls uses id as control_code
    control_code: c.id,
    name:        c.name,
    domain:      c.domain,
    owner:       c.owner,
    domainHead:  c.domainHead,
    status:      c.status,
  }));

  // Build map: control_id → all evidence records
  const evidenceByControlId = {};
  allEvidence.forEach(ev => {
    if (!evidenceByControlId[ev.control_id]) evidenceByControlId[ev.control_id] = [];
    evidenceByControlId[ev.control_id].push(ev);
  });

  // Also map by control_code for DATA.controls fallback
  const evidenceByControlCode = {};
  allEvidence.forEach(ev => {
    if (!evidenceByControlCode[ev.control_code]) evidenceByControlCode[ev.control_code] = [];
    evidenceByControlCode[ev.control_code].push(ev);
  });

  // Build folders — one per control
  const allEvidenceFolders = controls.map(c => {
    // Try UUID match first, then control_code match
    const evRecords = evidenceByControlId[c.id] || evidenceByControlCode[c.control_code] || [];

    // Derive folder status from control status (single source of truth)
    // Active = Approved, Failed = Rejected, Under Review = Under Review, else Pending
    let overallStatus;
    if (c.status === 'Active')            overallStatus = 'Approved';
    else if (c.status === 'Failed')       overallStatus = 'Rejected';
    else if (c.status === 'Under Review') overallStatus = 'Under Review';
    else                                  overallStatus = 'Pending';

    // If we have real evidence records, use their status instead
    if (evRecords.length > 0) {
      const statuses = evRecords.map(e => e.status);
      if (statuses.includes('Rejected'))          overallStatus = 'Rejected';
      else if (statuses.includes('Reassigned'))   overallStatus = 'Reassigned';
      else if (statuses.includes('Under Review')) overallStatus = 'Under Review';
      else if (statuses.includes('Pending'))      overallStatus = 'Pending';
      else if (statuses.every(s => s === 'Approved')) overallStatus = 'Approved';
    }

    const files = evRecords.map(ev => ({
      id:           ev.id,
      name:         ev.file_name,
      size:         ev.file_size || '—',
      uploadedBy:   ev.uploaded_by_name || '—',
      uploadedDate: ev.upload_date ? new Date(ev.upload_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      status:       ev.status,
      reviewer:     ev.reviewed_by_name || '—',
      reviewDate:   ev.review_date ? new Date(ev.review_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null,
    }));

    const latest = evRecords[0] || null;

    return {
      controlId:       c.control_code,
      controlDbId:     c.id,
      controlName:     c.name,
      domain:          c.domain,
      files,
      overallStatus,
      aiVerdict:       latest?.ai_verdict || null,
      aiDetail:        latest?.ai_verdict_detail || null,
      manualRemark:    latest?.manual_remark || null,
      observations:    latest?.observations || null,
      rejectionReason: latest?.rejection_reason || null,
    };
  });

  // Summary counts — use metrics as source of truth to match dashboard
  // Approved = metrics.implemented (Active controls) = Dashboard Implemented
  // Rejected = metrics.open_gaps (Failed controls) = Dashboard Gaps
  // In Progress = metrics ev counts (excludes SME)
  const m = metricsRaw || DATA.metrics;
  const approvedCount    = m.implemented    || m.implemented    || allEvidenceFolders.filter(f => f.overallStatus === 'Approved').length;
  const underReviewCount = m.in_progress_ev_review    ?? m.inProgress?.evidenceUnderReview ?? allEvidenceFolders.filter(f => f.overallStatus === 'Under Review').length;
  const reassignedCount  = m.in_progress_ev_reassigned ?? m.inProgress?.evidenceReassigned  ?? allEvidenceFolders.filter(f => f.overallStatus === 'Reassigned').length;
  const pendingCount     = m.in_progress_ev_pending    ?? m.inProgress?.evidencePending     ?? allEvidenceFolders.filter(f => f.overallStatus === 'Pending').length;
  const rejectedCount    = m.open_gaps      || m.openGaps       || allEvidenceFolders.filter(f => f.overallStatus === 'Rejected').length;

  // In Progress total (for folder summary) = Under Review + Reassigned + Pending (excludes SME)
  const inProgressTotal = underReviewCount + reassignedCount + pendingCount;

  // Access log
  const accessLogRows = auditLog.length
    ? auditLog.slice(0, 8).map(a => `
        <tr>
          <td>${a.users?.full_name || 'System'}</td>
          <td>${badge(a.users?.role || 'System', 'blue')}</td>
          <td>${a.action.replace('evidence_', '').replace(/_/g, ' ')}</td>
          <td style="font-family:var(--font-mono);font-size:10px">${a.entity_id ? a.entity_id.slice(0,8) + '…' : '—'}</td>
          <td style="font-size:11px;color:var(--text-secondary)">${timeAgo(a.performed_at)}</td>
        </tr>`).join('')
    : `
        <tr><td>Anita Roy</td><td>${badge('Control Owner','blue')}</td><td>Uploaded evidence</td><td>CC-0041</td><td style="font-size:11px;color:var(--text-secondary)">Today 10:32</td></tr>
        <tr><td>Priya Sharma</td><td>${badge('Domain Head','amber')}</td><td>Reviewed evidence</td><td>CC-0203</td><td style="font-size:11px;color:var(--text-secondary)">Today 10:45</td></tr>
        <tr><td>Sanjay Mehta</td><td>${badge('Domain Head','amber')}</td><td>Approved evidence</td><td>CC-0041</td><td style="font-size:11px;color:var(--text-secondary)">Yesterday 09:15</td></tr>
        <tr><td>Sanket Sondawle</td><td>${badge('Compliance Lead','purple')}</td><td>Viewed library</td><td>—</td><td style="font-size:11px;color:var(--text-secondary)">Yesterday 14:00</td></tr>
        <tr><td>Anita Roy</td><td>${badge('Control Owner','blue')}</td><td>Uploaded evidence</td><td>CC-0112</td><td style="font-size:11px;color:var(--text-secondary)">2 days ago 11:20</td></tr>
        <tr><td>Mohan Das</td><td>${badge('Control Owner','blue')}</td><td>Uploaded evidence</td><td>CC-0203</td><td style="font-size:11px;color:var(--text-secondary)">3 days ago 14:20</td></tr>
        <tr><td>Priya Sharma</td><td>${badge('Domain Head','amber')}</td><td>Rejected evidence</td><td>CC-0203</td><td style="font-size:11px;color:var(--text-secondary)">3 days ago 10:45</td></tr>
        <tr><td>Sanjay Mehta</td><td>${badge('Domain Head','amber')}</td><td>Approved evidence</td><td>CC-0089</td><td style="font-size:11px;color:var(--text-secondary)">4 days ago 16:30</td></tr>`;

  return `
  <!-- 5 Status Summary boxes — all from metrics (same source as dashboard) -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
    <div class="metric-card non-clickable">
      <div class="metric-label">Approved</div>
      <div class="metric-value" style="color:var(--text-success)">${approvedCount}</div>
      <div class="metric-delta text-success">= Dashboard Implemented = Library Active</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Under Review</div>
      <div class="metric-value" style="color:var(--text-warning)">${underReviewCount}</div>
      <div class="metric-delta text-warning">= Dashboard In Progress breakdown</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Reassigned</div>
      <div class="metric-value" style="color:var(--text-info)">${reassignedCount}</div>
      <div class="metric-delta text-info">= Dashboard In Progress breakdown</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Pending</div>
      <div class="metric-value" style="color:var(--text-secondary)">${pendingCount}</div>
      <div class="metric-delta text-secondary">= Dashboard In Progress breakdown</div>
    </div>
    <div class="metric-card non-clickable" onclick="goTo('gaps')" style="cursor:pointer">
      <div class="metric-label">Rejected / Gaps</div>
      <div class="metric-value" style="color:var(--text-danger)">${rejectedCount}</div>
      <div class="metric-delta text-danger">= Dashboard Gaps = Library Failed</div>
    </div>
  </div>

  <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
    <div class="search-wrap" style="flex:1">
      <span class="search-icon">⌕</span>
      <input type="text" id="evidence-search" placeholder="Search by control ID or name…" oninput="filterEvidenceFolders()">
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('access-log-section').scrollIntoView({behavior:'smooth'})">
      ↓ Jump to logs
    </button>
  </div>

  <div class="card-title" style="margin-bottom:10px">Control evidence folders (${allEvidenceFolders.length} controls)</div>

  <div id="evidence-folders-list">
    ${allEvidenceFolders.map(ev => renderEvidenceFolder(ev)).join('')}
  </div>

  <div class="card" id="access-log-section">
    <div class="card-title">Access monitoring log</div>
    <div style="max-height:400px;overflow-y:auto">
      <table class="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Action</th><th>Control</th><th>Time</th></tr></thead>
        <tbody>${accessLogRows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderEvidenceFolder(ev) {
  const fileIcons = { '.pdf': '📄', '.xlsx': '📊', '.docx': '📝' };
  const getIcon = (name) => fileIcons[name.slice(name.lastIndexOf('.')).toLowerCase()] || '📎';
  const folderStatusClass = ev.overallStatus === 'Approved'     ? 'badge-green'
    : ev.overallStatus === 'Rejected'     ? 'badge-red'
    : ev.overallStatus === 'Reassigned'   ? 'badge-blue'
    : ev.overallStatus === 'Under Review' ? 'badge-amber' : 'badge-gray';

  return `
  <div class="evidence-folder" id="folder-${ev.controlId}" data-dbid="${ev.controlDbId}">
    <div class="folder-header" onclick="toggleFolder('${ev.controlId}')">
      <div class="folder-icon">📁</div>
      <div class="folder-name">${ev.controlId} — ${ev.controlName}</div>
      <div class="folder-meta">${ev.domain} · ${ev.files.length} file(s)</div>
      <span class="badge ${folderStatusClass}">${ev.overallStatus}</span>
      <div class="folder-chevron" id="chevron-${ev.controlId}">▶</div>
    </div>
    <div class="folder-body hidden" id="folderbody-${ev.controlId}">
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Upload Evidence</div>
        <div class="upload-zone" style="padding:20px;cursor:pointer" onclick="document.getElementById('fileinput-${ev.controlId}').click()">
          <div style="font-size:20px;margin-bottom:6px">↑</div>
          <div style="font-size:12px;font-weight:600">Drop files here or click to browse</div>
          <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">PDF, Word, Excel — max 50 MB</div>
        </div>
        <input type="file" id="fileinput-${ev.controlId}" style="display:none" onchange="handleFileUpload('${ev.controlDbId}', '${ev.controlId}')">
      </div>
      ${ev.files.length > 0 ? `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Files</div>
        ${ev.files.map(f => `
          <div class="ev-file-row">
            <div class="ev-file-icon">${getIcon(f.name)}</div>
            <div class="ev-file-info">
              <div class="ev-file-name">${f.name}</div>
              <div class="ev-file-meta">${f.size} · Uploaded by ${f.uploadedBy} · ${f.uploadedDate}</div>
            </div>
            <div style="margin-right:10px">${statusBadge(f.status)}</div>
            <div class="ev-file-actions"><button class="btn-sm">View</button></div>
          </div>`).join('')}
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        ${remarkBlock('AI Verdict', '🤖', ev.aiVerdict || ev.aiDetail || null, 'ai')}
        <div class="remark-block">
          <div class="remark-header">✍️ Manual Remarks</div>
          <div class="remark-body">
            <textarea class="form-textarea" placeholder="Add or edit manual remarks…" rows="3" style="min-height:60px;margin:0">${ev.manualRemark || ''}</textarea>
          </div>
        </div>
      </div>
      ${ev.observations ? remarkBlock('Observations / Red flags', '🚩', ev.observations, 'obs') : ''}
      ${ev.rejectionReason ? `<div style="background:var(--bg-danger);border:0.5px solid var(--border-danger);border-radius:var(--r-md);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text-danger)"><strong>Rejection reason:</strong> ${ev.rejectionReason}</div>` : ''}
      <div id="timeline-${ev.controlId}" style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Upload history timeline</div>
        <div class="timeline-loading" style="font-size:11px;color:var(--text-tertiary)">Loading timeline…</div>
      </div>
      <div style="background:var(--bg-secondary);border-radius:var(--r-md);padding:12px;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">Review Actions</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-sm btn-success">✓ Approve</button>
          <button class="btn-sm btn-danger">↩ Reject</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function toggleFolder(id) {
  const body    = document.getElementById('folderbody-' + id);
  const chevron = document.getElementById('chevron-' + id);
  body.classList.toggle('hidden');
  chevron.classList.toggle('open');
  chevron.textContent = chevron.classList.contains('open') ? '▼' : '▶';

  if (chevron.classList.contains('open')) {
    const timelineEl = document.getElementById('timeline-' + id);
    if (timelineEl && timelineEl.querySelector('.timeline-loading')) {
      const dbId = document.getElementById('folder-' + id)?.dataset?.dbid || '';
      const evRecords = await fetchEvidenceForControl(dbId);
      if (evRecords.length > 0) {
        const tlRaw = await fetchEvidenceTimeline(evRecords[0].id);
        if (tlRaw.length > 0) {
          const tlItems = tlRaw.map(t => ({
            action: t.action + (t.users?.full_name ? ` — ${t.users.full_name}` : ''),
            time:   formatTimestamp(t.performed_at),
            type:   t.action_type,
          }));
          timelineEl.innerHTML = `
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Upload history timeline</div>
            ${evidenceTimeline(tlItems)}`;
        } else {
          timelineEl.innerHTML = `
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Upload history timeline</div>
            <div style="font-size:11px;color:var(--text-tertiary)">No timeline entries yet.</div>`;
        }
      } else {
        timelineEl.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Upload history timeline</div>
          <div style="font-size:11px;color:var(--text-tertiary)">No evidence uploaded yet.</div>`;
      }
    }
  }
}

function filterEvidenceFolders() {
  const search = (document.getElementById('evidence-search').value || '').toLowerCase();
  document.querySelectorAll('.evidence-folder').forEach(folder => {
    folder.style.display = folder.textContent.toLowerCase().includes(search) ? 'block' : 'none';
  });
}

function openEvidenceFolder(controlId) {
  const folder = document.getElementById('folder-' + controlId);
  if (!folder) return;
  folder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const body = document.getElementById('folderbody-' + controlId);
  if (body && body.classList.contains('hidden')) toggleFolder(controlId);
}

async function handleFileUpload(controlDbId, controlId) {
  const input = document.getElementById('fileinput-' + controlId);
  if (!input || !input.files || input.files.length === 0) return;
  
  const file = input.files[0];
  try {
    showSuccess('Uploading ' + file.name + '...');
    const result = await uploadEvidence(controlDbId, file);
    showSuccess('Upload successful! Running AI verdict analysis...');
    
    await submitEvidenceForReview(result.id);
    
    try {
      await runAIOnEvidence(result.id, controlDbId);
    } catch (aiErr) {
      console.error('AI Verdict failed:', aiErr);
    }
    
    await goTo('evidence');
    
  } catch (err) {
    showError('Upload failed: ' + err.message);
  }
}

async function runAIOnEvidence(evidenceId, controlId) {
  const result = await runEvidenceVerdict(evidenceId, controlId);
  const verdictEl = document.getElementById('ai-verdict-' + evidenceId);
  if (verdictEl) {
    verdictEl.innerHTML = `
      <div>${renderAIVerdict(result.verdict)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${result.detail || ''}</div>
      ${result.missing && result.missing.length ? `<div style="font-size:11px;color:var(--text-warning);margin-top:4px">Missing: ${result.missing.join(', ')}</div>` : ''}
      ${result.red_flags && result.red_flags.length ? `<div style="font-size:11px;color:var(--text-danger);margin-top:4px">⚠ ${result.red_flags.join(', ')}</div>` : ''}`;
  }
}
