/* ============================================================
   DOMAIN HEAD VIEW — Live from Supabase
   Failed controls = gaps: linked via control_code = gap_code
   totalUniqueControls = sum of all domain controls = dashboard unique canonical
   totalActive         = dashboard implemented
   totalFailed         = dashboard open gaps
   ============================================================ */
async function renderDomainHead() {
  const [controlsRaw, allEvidence, allGaps] = await Promise.all([
    fetchDomainStats(),
    fetchAllEvidence(),
    fetchGaps(),
  ]);

  const gapByCode = {};
  allGaps.forEach(g => { gapByCode[g.gap_code] = g; });

  // Keep ALL evidence per control (not just latest)
  const evidenceByControlId = {};
  allEvidence.forEach(ev => {
    if (!evidenceByControlId[ev.control_id]) evidenceByControlId[ev.control_id] = [];
    evidenceByControlId[ev.control_id].push(ev);
  });

  const source = controlsRaw.length ? controlsRaw : DATA.controls.map(c => ({
    id:               null,
    control_code:     c.id,
    name:             c.name,
    domain_name:      c.domain,
    domain_head_name: c.domainHead,
    owner_name:       c.owner,
    status:           c.status,
    status_reason:    c.reason,
    confidence_score: c.confidence,
  }));

  const domainStats = {};
  source.forEach(c => {
    const key = c.domain_name;
    if (!domainStats[key]) {
      domainStats[key] = { name: key, head: c.domain_head_name, totalControls: 0, active: 0, underReview: 0, failed: 0, controls: [] };
    }
    domainStats[key].totalControls++;
    if (c.status === 'Active')            domainStats[key].active++;
    else if (c.status === 'Under Review') domainStats[key].underReview++;
    else if (c.status === 'Failed')       domainStats[key].failed++;
    domainStats[key].controls.push(c);
  });

  const domains = Object.values(domainStats);
  const totalUniqueControls = source.length;
  const totalActive      = domains.reduce((s, d) => s + d.active, 0);
  const totalUnderReview = domains.reduce((s, d) => s + d.underReview, 0);
  const totalFailed      = domains.reduce((s, d) => s + d.failed, 0);

  return `
  <!-- Summary metrics — totals match dashboard -->
  <div class="card" style="background:var(--bg-info);border-color:var(--border-info);margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;color:var(--text-info);margin-bottom:4px">Total Unique Controls</div>
        <div style="font-size:32px;font-weight:800;color:var(--text-info);line-height:1">${totalUniqueControls}</div>
        <div style="font-size:10px;color:var(--text-info);margin-top:2px">= Dashboard Unique Canonical = Library Total</div>
      </div>
      <div style="flex:1;display:flex;gap:12px;flex-wrap:wrap">
        ${domains.map(d => `
          <div style="background:var(--bg-primary);border-radius:var(--r-md);padding:8px 12px">
            <div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px">${d.name}</div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${d.totalControls}</div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-shrink:0">
        <div style="background:var(--bg-primary);border-radius:var(--r-md);padding:8px 14px;text-align:center">
          <div style="font-size:10px;color:var(--text-success);margin-bottom:2px">Active</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-success)">${totalActive}</div>
          <div style="font-size:9px;color:var(--text-success);margin-top:1px">= Dashboard Implemented</div>
        </div>
        <div style="background:var(--bg-primary);border-radius:var(--r-md);padding:8px 14px;text-align:center">
          <div style="font-size:10px;color:var(--text-warning);margin-bottom:2px">Under Review</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-warning)">${totalUnderReview}</div>
          <div style="font-size:9px;color:var(--text-warning);margin-top:1px">= Dashboard In Progress</div>
        </div>
        <div style="background:var(--bg-primary);border-radius:var(--r-md);padding:8px 14px;text-align:center">
          <div style="font-size:10px;color:var(--text-danger);margin-bottom:2px">Failed / Gaps</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-danger)">${totalFailed}</div>
          <div style="font-size:9px;color:var(--text-danger);margin-top:1px">= Dashboard Gaps</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Domain overview -->
  <div class="card">
    <div class="card-title">Domain overview — access all controls and evidence under your domain</div>
    ${domains.map(d => `
      <div class="domain-stat-row">
        <div>
          <div class="domain-stat-name">${d.name}</div>
          <div class="domain-stat-meta">Domain Head: ${d.head} · ${d.totalControls} controls</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${d.active > 0      ? badge(d.active + ' active', 'green') : ''}
          ${d.underReview > 0 ? badge(d.underReview + ' under review', 'amber') : ''}
          ${d.failed > 0      ? badge(d.failed + ' failed / gaps', 'red') : ''}
        </div>
        <button class="btn-sm btn-info" onclick="expandDomain('domain-${d.name.replace(/ /g,'-')}')">View controls →</button>
      </div>
      <div class="hidden" id="domain-${d.name.replace(/ /g,'-')}" style="padding:0 0 10px 14px;border-left:2px solid var(--border-t);margin:0 0 10px 8px">
        ${d.controls.map(c => {
          const evList = evidenceByControlId[c.id] || [];
          const latestEv = evList[0] || null;
          const gap = gapByCode[c.control_code] || null;
          const isFailed = c.status === 'Failed';

          // Determine evidence display status
          const evStatuses = evList.map(e => e.status);
          const evOverall = evStatuses.includes('Rejected') ? 'Rejected'
            : evStatuses.includes('Reassigned') ? 'Reassigned'
            : evStatuses.includes('Under Review') ? 'Under Review'
            : evStatuses.includes('Pending') ? 'Pending'
            : evStatuses.length > 0 ? 'Approved' : null;

          return `
          <div style="background:var(--bg-secondary);border-radius:var(--r-md);padding:12px;margin-bottom:8px;${isFailed ? 'border-left:3px solid var(--border-danger)' : ''}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div>
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">${c.control_code}</div>
                <div style="font-size:12px;font-weight:600">${c.name}</div>
              </div>
              <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                ${statusBadge(c.status)}
                ${evOverall ? badge('Evidence: ' + evOverall, evOverall === 'Approved' ? 'green' : evOverall === 'Rejected' ? 'red' : 'amber') : badge('No evidence', 'gray')}
                ${isFailed ? badge(gap ? (gap.severity.charAt(0).toUpperCase() + gap.severity.slice(1) + ' gap') : 'Gap', gap && gap.severity === 'critical' ? 'red' : gap && gap.severity === 'high' ? 'amber' : 'red') : ''}
              </div>
            </div>
            ${isFailed ? `
            <div style="background:var(--bg-danger);border:0.5px solid var(--border-danger);border-radius:var(--r-sm);padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--text-danger)">
              <strong>Gap:</strong> ${gap ? gap.description : 'Control failed — gap record pending.'}
            </div>` : ''}
            ${c.status_reason ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${c.status_reason}</div>` : ''}
            ${latestEv ? `
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${evList.length} file(s) · Latest: ${latestEv.file_name} · ${latestEv.upload_date ? new Date(latestEv.upload_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</div>
            ${remarkBlock('Manual remarks', '✍️', latestEv.manual_remark, 'manual')}
            ${remarkBlock('AI Verdict', '🤖', latestEv.ai_verdict, 'ai')}
            <div style="display:flex;gap:6px;margin-top:10px">
              ${evOverall === 'Under Review' || evOverall === 'Approved' ? `
              <button class="btn-sm btn-success">✓ Approve (Domain Head)</button>
              <button class="btn-sm btn-danger">↩ Reject & Return</button>` : ''}
              <button class="btn-sm btn-info" onclick="goToEvidence('${c.control_code}')">View full evidence →</button>
            </div>` : '<div style="font-size:11px;color:var(--text-secondary)">No evidence uploaded yet.</div>'}
          </div>`;
        }).join('')}
      </div>`).join('')}
  </div>`;
}

function expandDomain(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden');
}

/* ============================================================
   NOTIFICATIONS PAGE
   ============================================================ */
function renderNotifications() {
  return `
  <div class="card">
    <div class="card-title">Notification triggers</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">The following events generate automatic notifications to responsible parties.</div>
    <table class="data-table">
      <thead><tr><th>Trigger event</th><th>Notifies</th><th>Channel</th></tr></thead>
      <tbody>
        ${[
          ['Evidence uploaded',              'Domain Head',              'Email'],
          ['Evidence approved',              'Control Owner',            'Email'],
          ['Evidence rejected / returned',   'Control Owner',            'Email'],
          ['Gap marked critical',            'Compliance Lead, CISO',    'Email'],
          ['Regulatory update detected',     'Compliance Team',          'Email'],
          ['Compliance conflict detected',   'CISO, Compliance Lead',    'Email'],
          ['SME review pending > 48h',       'Compliance Lead',          'Email'],
        ].map(([t,n,c]) => `<tr>
          <td style="font-size:12px">${t}</td>
          <td>${badge(n,'blue')}</td>
          <td style="font-size:11px;color:var(--text-secondary)">${c}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
