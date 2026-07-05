/* ============================================================
   INGEST PAGE — Scraper status from Supabase, rest static
   ============================================================ */
async function renderIngest() {
  // Fetch live scan info for the scraper banner
  const scanRaw = await fetchScanInfo();
  const scanMap = {};
  scanRaw.forEach(s => { scanMap[s.scan_type] = s; });

  const lastScanTimestamp = scanMap['circular_scan']?.completed_at
    ? formatTimestamp(scanMap['circular_scan'].completed_at)
    : DATA.scanInfo.lastCircularScan.timestamp;

  const scraperStatus = scanMap['circular_scan']?.status === 'running' ? 'Running…' : 'Active';

  const SOURCES = [
    { name: 'ISO 27001:2022',     type: 'Framework',       note: 'Document', connected: true },
    { name: 'NIST CSF 2.0',       type: 'Framework',       note: 'Document', connected: true },
    { name: 'RBI CSF v2',         type: 'Framework',       note: 'Document', connected: true },
    { name: 'PCI-DSS v4.0',       type: 'Framework',       note: 'Document', connected: true },
    { name: 'COBIT 2019',         type: 'Framework',       note: 'Document', connected: true },
    { name: 'SOX',                type: 'Framework',       note: 'Document', connected: true },
    { name: 'RBI Circular 2024',  type: 'Circular',        note: 'Document', connected: true },
    { name: 'Internal Policy v3', type: 'Internal Policy', note: 'Document', connected: true },
  ];

  const JOBS = [
    { source: 'RBI CSF v2.0',       type: 'Circular',        controls: 85,   status: 'Completed',  time: 'Today 09:14',  method: 'AI Fetch',      uploader: 'System',    uploaderDesig: '',                   approver: 'Rajiv Chaudhary', approverDesig: 'VP Compliance' },
    { source: 'ISO 27001',          type: 'Framework',       controls: 1204, status: 'Completed',  time: 'Today 07:00',  method: 'AI Fetch',      uploader: 'System',    uploaderDesig: '',                   approver: 'Priya Sharma',    approverDesig: 'Director Risk' },
    { source: 'Internal Policy v3', type: 'Internal Policy', controls: 89,   status: 'Completed',  time: 'Yesterday',    method: 'Manual Upload', uploader: 'Anita Roy', uploaderDesig: 'Senior Analyst',     approver: 'Sanjay Mehta',    approverDesig: 'Manager IT Security' },
    { source: 'SOX RCM Q1',         type: 'Framework',       controls: 214,  status: 'Processing', time: 'Today 10:42',  method: 'Manual Upload', uploader: 'Mohan Das', uploaderDesig: 'Compliance Analyst', approver: 'Pending',         approverDesig: '' },
  ];

  const typeColor = { Framework: 'blue', Circular: 'amber', 'Internal Policy': 'gray' };
  const icons     = { Framework: '📋', Circular: '📜', 'Internal Policy': '📁' };

  return `
  <!-- Live Web Scraper Status — timestamp from Supabase -->
  <div class="card" style="background:var(--bg-success);border-color:var(--border-success);margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:24px">🔄</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700;color:var(--text-success);margin-bottom:2px">Live Web Scraper — ${scraperStatus}</div>
        <div style="font-size:11px;color:var(--text-success)">Continuously monitoring regulatory sources for new circulars and updates</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:var(--text-success);margin-bottom:2px">Last scan</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-success)">${lastScanTimestamp}</div>
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:var(--text-success);animation:pulse 2s infinite"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Source systems</div>
    <div class="src-grid">
      ${SOURCES.map(s => `
        <div class="src-chip${s.connected ? ' connected' : ''}">
          <div style="font-size:18px">${icons[s.type]}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${s.name}</div>
            <div style="font-size:10px;color:var(--text-secondary)">${s.type} · ${s.note}</div>
          </div>
          <div class="src-dot ${s.connected ? 'dot-on' : 'dot-off'}"></div>
        </div>`).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Upload control document</div>
    <div class="upload-zone" style="padding:20px">
      <div style="font-size:20px;margin-bottom:6px">↑</div>
      <div style="font-size:12px;font-weight:600">Drop PDF, Word, or Excel files here</div>
      <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">Supports .pdf · .docx · .xlsx · .csv</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Recent ingestion jobs</div>
    <table class="data-table">
      <thead><tr><th style="width:28%">Source</th><th style="width:14%">Type</th><th style="width:10%">Controls</th><th style="width:12%">Method</th><th style="width:12%">Uploader</th><th style="width:12%">Approver</th><th style="width:12%">Status</th></tr></thead>
      <tbody>
        ${JOBS.map(j => `
          <tr>
            <td style="font-size:12px;font-weight:500">${j.source}</td>
            <td>${badge(j.type, typeColor[j.type])}</td>
            <td style="font-weight:600">${j.controls.toLocaleString()}</td>
            <td style="font-size:11px;color:var(--text-secondary)">${j.method}</td>
            <td>
              <div style="font-size:11px;color:var(--text-primary)">${j.uploader}</div>
              ${j.uploaderDesig ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">${j.uploaderDesig}</div>` : ''}
            </td>
            <td>
              <div style="font-size:11px;color:var(--text-primary)">${j.approver}</div>
              ${j.approverDesig ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">${j.approverDesig}</div>` : ''}
            </td>
            <td>${statusBadge(j.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ============================================================
   LIBRARY PAGE — Controls from Supabase via fetchControls()
   ============================================================ */
async function renderLibrary() {
  const [controlsRaw, metricsRaw] = await Promise.all([
    fetchControls(),
    fetchMetrics(),
  ]);

  const controls = controlsRaw.length ? controlsRaw.map(c => ({
    id:          c.control_code,
    name:        c.name,
    domain:      c.domain_name,
    description: c.description,
    frameworks:  [],
    extra:       [],
    owner:       c.owner_name || '—',
    domainHead:  c.domain_head_name || '—',
    status:      c.status,
    confidence:  c.confidence_score ?? 0.85,
    reason:      c.status_reason || '—',
  })) : DATA.controls;

  const total = controls.length;
  // For summary cards, use metrics.unique_canonical as the total
  // so it matches dashboard exactly (same source)
  const metricTotal = metricsRaw ? (metricsRaw.unique_canonical || total) : total;
  const autoRate = metricsRaw ? Math.round(metricsRaw.ai_auto_approval_rate || 0) : Math.round(DATA.metrics.aiAutoApprovalRate);
  const approved = Math.round((autoRate / 100) * metricTotal);
  const smeQueue = metricsRaw ? (metricsRaw.in_progress_sme || 0) : DATA.metrics.inProgress.pendingSME;

  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
    ${metricCard('Total unique controls', metricTotal, 'Matches Dashboard Unique Canonical', 'good')}
    ${metricCard('Auto-approved', approved, `${autoRate}% · Confidence ≥ 0.85 · Matches Dashboard AI Auto-Approval`, 'good')}
    <div class="metric-card" onclick="toggleAIConfidenceBreakdown()" style="position:relative">
      <div class="metric-label">SME Review Queue</div>
      <div class="metric-value">${smeQueue}</div>
      <div class="metric-delta text-warning" style="cursor:pointer">Matches Dashboard In Progress - SME</div>
      <div id="ai-conf-breakdown" class="hidden" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:var(--bg-primary);border:0.5px solid var(--border-s);border-radius:var(--r-md);padding:10px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:8px;align-items:center;font-size:11px">
            <div style="width:8px;height:8px;border-radius:2px;background:var(--text-success);flex-shrink:0"></div>
            <div style="color:var(--text-secondary)">≥ 0.85 — auto-approved (${approved} controls, ${autoRate}%)</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;font-size:11px">
            <div style="width:8px;height:8px;border-radius:2px;background:var(--text-warning);flex-shrink:0"></div>
            <div style="color:var(--text-secondary)">Pending SME review: ${smeQueue} (from dashboard in-progress)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Unified control library</div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <div class="search-wrap" style="flex:1;min-width:200px">
        <span class="search-icon">⌕</span>
        <input type="text" id="lib-search" placeholder="Search by keyword, control ID, or name…" oninput="filterLibrary()">
      </div>
      <select class="filter-select" id="lib-fw" onchange="filterLibrary()">
        <option value="">All frameworks</option>
        <option>ISO 27001</option><option>NIST CSF</option><option>RBI CSF</option><option>SOX</option>
      </select>
      <select class="filter-select" id="lib-domain" onchange="filterLibrary()">
        <option value="">All domains</option>
        <option>Access Control</option><option>Incident Mgmt</option><option>Data Protection</option>
      </select>
      <select class="filter-select" id="lib-status" onchange="filterLibrary()">
        <option value="">All status</option>
        <option>Active</option><option>Under Review</option><option>Failed</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="lib-table" style="table-layout:fixed">
        <thead>
          <tr>
            <th style="width:130px">Control ID / Name</th>
            <th style="width:200px">Description</th>
            <th style="width:120px">Domain / Domain Head</th>
            <th style="width:185px">Mapped frameworks</th>
            <th style="width:100px">Control Owner</th>
            <th style="width:70px">Confidence</th>
            <th style="width:80px">Status</th>
            <th style="width:70px">Evidence</th>
            <th style="width:90px">Reason</th>
          </tr>
        </thead>
        <tbody id="lib-tbody">
          ${renderLibraryRows(controls)}
        </tbody>
      </table>
    </div>
  </div>`;
}

let _libraryControls = null;

function renderLibraryRows(controls) {
  _libraryControls = controls;
  const domColors = { 'Access Control': 'blue', 'Privileged Access': 'amber', 'Incident Mgmt': 'red', 'Data Protection': 'green', 'Change Mgmt': 'gray' };
  return controls.map(c => `
    <tr>
      <td>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">${c.id}</div>
        <div style="font-size:12px;font-weight:600;margin-top:2px">${c.name}</div>
      </td>
      <td style="font-size:11px;color:var(--text-secondary)">${c.description}</td>
      <td>
        ${badge(c.domain, domColors[c.domain] || 'gray')}
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px">${c.domainHead}</div>
      </td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:3px">
          ${(c.frameworks || []).map(f => badge(f,'green')).join('')}
        </div>
        ${(c.extra || []).length ? `<span class="ctrl-expand" onclick="toggleExtra(this)">+ ${c.extra.length} more</span>
        <div class="ctrl-sub hidden">${c.extra.map(f => badge(f,'blue')).join(' ')}</div>` : ''}
      </td>
      <td style="font-size:11px;color:var(--text-secondary)">${c.owner}</td>
      <td>${confPill(c.confidence)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><span class="ctrl-expand" onclick="goToEvidence('${c.id}')" style="cursor:pointer">Evidence</span></td>
      <td>
        <span class="ctrl-expand" onclick="toggleReason(this)" title="${c.reason}">Reason</span>
        <div class="ctrl-sub hidden" style="font-size:10px;line-height:1.4">${c.reason}</div>
      </td>
    </tr>`).join('');
}

function filterLibrary() {
  const search = (document.getElementById('lib-search')?.value || '').toLowerCase();
  const fw     = (document.getElementById('lib-fw')?.value || '').toLowerCase();
  const domain = (document.getElementById('lib-domain')?.value || '').toLowerCase();
  const status = (document.getElementById('lib-status')?.value || '').toLowerCase();

  const source = _libraryControls || DATA.controls;
  const filtered = source.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search) || c.id.toLowerCase().includes(search) || c.domain.toLowerCase().includes(search);
    const matchFw     = !fw     || (c.frameworks || []).some(f => f.toLowerCase().includes(fw));
    const matchDomain = !domain || c.domain.toLowerCase().includes(domain);
    const matchStatus = !status || c.status.toLowerCase().includes(status);
    return matchSearch && matchFw && matchDomain && matchStatus;
  });

  const tbody = document.getElementById('lib-tbody');
  if (tbody) tbody.innerHTML = renderLibraryRows(filtered);
}

function toggleExtra(el) {
  const sub = el.nextElementSibling;
  sub.classList.toggle('hidden');
  el.textContent = sub.classList.contains('hidden') ? `+ ${sub.querySelectorAll('.badge').length} more` : '− show less';
}

function toggleReason(el) {
  const sub = el.nextElementSibling;
  sub.classList.toggle('hidden');
  el.textContent = sub.classList.contains('hidden') ? 'Reason' : 'Hide';
}

function goToEvidence(controlId) {
  goTo('evidence');
  setTimeout(() => { if (typeof openEvidenceFolder === 'function') openEvidenceFolder(controlId); }, 150);
}

function toggleAIConfidenceBreakdown() {
  const el = document.getElementById('ai-conf-breakdown');
  if (el) el.classList.toggle('hidden');
}

/* ============================================================
   QUEUE PAGE — Live from Supabase sme_review_queue
   ============================================================ */
async function renderQueue() {
  const queueItems = await fetchQueue('Pending');

  // Map Supabase queue items to frontend shape
  // sme_review_queue: id, mapping_id, control_id_a, control_id_b, framework_id, clause_ref,
  //   confidence_score, ai_rationale, status, reviewed_by, reviewed_at, justification, assigned_to
  // Joined: controls(control_code, name), frameworks(name)
  const queue = queueItems.length ? queueItems.map(item => ({
    id:            item.mapping_id,
    dbId:          item.id,
    conf:          item.confidence_score,
    uniqueControl: item.controls?.name || 'Control mapping pending review',
    controlCode:   item.controls?.control_code || '—',
    frameworkName: item.frameworks?.name || '—',
    clauseRef:     item.clause_ref || '—',
    aiRationale:   item.ai_rationale || 'AI rationale not available.',
    frameworks:    [{ label: item.frameworks?.name || 'Framework', color: 'blue' }],
    conflict:      null,
    conflictDetail: null,
  })) : DATA.queue.map(item => ({
    id:            item.id,
    dbId:          null,  // static fallback — no DB id
    conf:          item.conf,
    uniqueControl: item.uniqueControl,
    controlCode:   '—',
    frameworkName: item.frameworks?.[0]?.label || '—',
    clauseRef:     item.conflict || '—',
    aiRationale:   item.conflictDetail?.issue || 'Review required.',
    frameworks:    item.frameworks || [],
    conflict:      item.conflict,
    conflictDetail: item.conflictDetail,
  }));

  return `
  <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
    <span style="font-size:12px;color:var(--text-secondary)">${queue.length} items pending SME review (confidence 0.65–0.84)</span>
  </div>

  <div id="queue-list">
    ${queue.map(item => `
      <div class="queue-item" id="qi-${item.id}">
        <div class="queue-header" onclick="toggleQueueItem('${item.id}')" style="cursor:pointer">
          <div class="queue-id">${item.id}</div>
          <div style="flex:1">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:2px">Unique Control Formed</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${item.uniqueControl}</div>
          </div>
          ${confPill(item.conf)}
          ${item.conflict ? `<button class="btn-sm" style="border-color:var(--border-danger);color:var(--text-danger);margin-left:8px" onclick="event.stopPropagation();toggleConflictDetail('conflict-${item.id}')">⚠ Conflict</button>` : ''}
          <span id="chevron-${item.id}" style="font-size:11px;color:var(--text-tertiary);margin-left:8px">▶</span>
        </div>
        <div id="qbody-${item.id}" class="hidden" style="padding-top:10px">
          <div style="background:var(--bg-secondary);border-radius:var(--r-md);padding:10px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Mapping Details</div>
            <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px solid var(--border-t)">
              <div style="font-size:11px;font-weight:600;color:var(--text-info);margin-bottom:3px">${item.frameworkName} — ${item.clauseRef}</div>
              <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${item.aiRationale}</div>
            </div>
          </div>
          <div class="queue-meta">${item.frameworks.map(f => badge(f.label, f.color)).join('')}</div>
          <div style="margin-bottom:8px">
            <textarea class="form-textarea" id="justification-${item.id}" placeholder="Add SME justification or override note…" rows="2"></textarea>
          </div>
          <div class="queue-actions">
            <button class="btn-sm btn-success" onclick="approveQueueItemUI('${item.dbId}','${item.id}')">✓ Approve</button>
            <button class="btn-sm btn-danger" onclick="rejectQueueItemUI('${item.dbId}','${item.id}')">✗ Reject</button>
            <button class="btn-sm btn-info">✎ Edit Control</button>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

function toggleQueueItem(id) {
  const body = document.getElementById('qbody-' + id);
  const chevron = document.getElementById('chevron-' + id);
  if (body && chevron) { body.classList.toggle('hidden'); chevron.textContent = body.classList.contains('hidden') ? '▶' : '▼'; }
}

function toggleConflictDetail(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden');
}

async function approveQueueItemUI(dbId, displayId) {
  const justification = document.getElementById('justification-' + displayId)?.value || '';
  if (dbId && dbId !== 'null') {
    try {
      await approveQueueItem(dbId, justification);
    } catch (err) {
      showError(err.message); return;
    }
  }
  dismissQueueItem(displayId);
  showSuccess('Queue item approved');
}

async function rejectQueueItemUI(dbId, displayId) {
  const justification = document.getElementById('justification-' + displayId)?.value || '';
  if (!justification.trim()) { showError('Justification is required to reject'); return; }
  if (dbId && dbId !== 'null') {
    try {
      await rejectQueueItem(dbId, justification);
    } catch (err) {
      showError(err.message); return;
    }
  }
  dismissQueueItem(displayId);
  showSuccess('Queue item rejected');
}

function dismissQueueItem(id) {
  const el = document.getElementById('qi-' + id);
  if (!el) return;
  el.style.opacity = '0.4';
  el.style.pointerEvents = 'none';
  setTimeout(() => {
    el.remove();
    const remaining = document.querySelectorAll('.queue-item').length;
    const b = document.getElementById('badge-queue');
    if (b) b.textContent = remaining;
    if (remaining === 0) {
      document.getElementById('queue-list').innerHTML =
        '<div class="card" style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px">All mappings reviewed. Queue is empty. ✓</div>';
    }
  }, 300);
}

/* ── Mapping page (unchanged, uses DATA.mappings) ── */
function renderMapping(opts) {
  const highlight = (opts && opts.controlId) || mappingHighlight;
  let selectedId = highlight || null;
  return `
  <div class="banner banner-info">
    <div class="banner-icon">📊</div>
    <div class="banner-body" style="flex:1">
      <div style="font-size:28px;font-weight:800;color:var(--text-info);line-height:1">1 → 5.2×</div>
      <div style="font-size:12px;color:var(--text-info);margin-top:4px">On average, implementing 1 canonical control satisfies 5.2 framework requirements. Click any row to see its exact multiplier and all satisfied frameworks.</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:14px;font-weight:700;color:var(--text-info)">4,128 total mappings</div>
      <div style="font-size:11px;color:var(--text-info)">from 1,204 canonical controls</div>
    </div>
  </div>
  <div class="grid-4">
    ${metricCard('Total mappings', '4,128', '↑ 340 this week', 'good')}
    ${metricCard('Auto-approved', '3,876', '93.9% of all mappings', 'good')}
    ${metricCard('Avg. frameworks / control', '5.2×', 'Test once, satisfy 5', 'good')}
    ${metricCard('Conflicts flagged', '19', 'Require SME review', 'warn')}
  </div>
  <div id="map-detail-box" class="${highlight ? 'map-detail-box' : 'hidden'}">
    ${highlight ? renderMapDetail(DATA.mappings.find(m => m.id === highlight)) : ''}
  </div>
  <div class="card">
    <div class="card-title">Cross-framework mapping — click a row to see full detail</div>
    <div class="table-wrap">
      <table class="data-table" style="table-layout:fixed;min-width:780px">
        <thead><tr><th style="width:85px">Control ID</th><th style="width:140px">Control name</th><th style="width:170px">Canonical requirement</th><th style="width:85px">ISO 27001</th><th style="width:72px">NIST CSF</th><th style="width:65px">RBI CSF</th><th style="width:60px">SOX</th><th style="width:66px">Confidence</th><th style="width:72px">Multiplier</th></tr></thead>
        <tbody>
          ${DATA.mappings.map(m => `
            <tr class="clickable" id="map-row-${m.id}" style="${selectedId === m.id ? 'background:var(--bg-info)' : ''}" onclick="selectMapping('${m.id}')">
              <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${m.id}</td>
              <td style="font-size:12px;font-weight:600">${m.name}</td>
              <td style="font-size:11px;color:var(--text-secondary)">${m.canon}</td>
              <td style="font-size:11px">${m.iso}</td><td style="font-size:11px">${m.nist}</td>
              <td style="font-size:11px">${m.rbi}</td><td style="font-size:11px">${m.sox}</td>
              <td>${confPill(m.conf)}</td><td>${badge(m.mult + '×', m.multColor)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderMapDetail(m) {
  if (!m) return '';
  return `<div class="map-detail-title">${m.id} — ${m.name}</div>
    <div class="map-detail-body"><strong>Canonical requirement:</strong> ${m.canon}<br>
    <strong>Framework clauses:</strong> ISO ${m.iso} · NIST ${m.nist} · RBI ${m.rbi} · SOX ${m.sox}<br>
    <strong>AI confidence:</strong> ${m.conf} &nbsp;|&nbsp; <strong>Impact multiplier:</strong> satisfies ${m.satisfies}</div>`;
}

function selectMapping(id) {
  const m = DATA.mappings.find(x => x.id === id);
  const box = document.getElementById('map-detail-box');
  if (!box) return;
  box.classList.remove('hidden');
  box.className = 'map-detail-box';
  box.innerHTML = renderMapDetail(m);
  document.querySelectorAll('[id^="map-row-"]').forEach(r => r.style.background = '');
  const row = document.getElementById('map-row-' + id);
  if (row) { row.style.background = 'var(--bg-info)'; box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
