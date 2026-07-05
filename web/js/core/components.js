/* ============================================================
   COMPONENTS.JS — Reusable HTML builder functions
   ============================================================ */

function badge(text, color) {
  return `<span class="badge badge-${color || 'gray'}">${text}</span>`;
}

function statusBadge(status) {
  const map = {
    'Active':               'status-active',
    'Failed':               'status-failed',
    'Under Review':         'status-underreview',
    'Reassigned':           'status-reassigned',
    'Updated':              'status-updated',
    'Rejected':             'status-rejected',
    'Pending':              'status-pending',
    'Approved':             'status-approved',
    'Compliant':            'status-compliant',
    'Partially Compliant':  'status-partial',
    'Not Compliant':        'status-noncompliant',
    'In progress':          'status-inprogress',
    'Gap risk':             'status-noncompliant',
    'Non-compliant':        'status-noncompliant',
    'Processing':           'status-inprogress',
    'Completed':            'status-compliant',
  };
  return `<span class="status-badge ${map[status] || 'status-pending'}">${status}</span>`;
}

function confPill(v) {
  const cls = v >= 0.85 ? 'conf-hi' : v >= 0.65 ? 'conf-mid' : 'conf-lo';
  const formatted = typeof v === 'number' ? v.toFixed(2) : v;
  return `<span class="conf-pill ${cls}">${formatted}</span>`;
}

function metricCard(label, value, delta, deltaType, page) {
  const dc = deltaType === 'good' ? 'text-success' : deltaType === 'warn' ? 'text-warning' : 'text-danger';
  return `
    <div class="metric-card${page ? '' : ' non-clickable'}" ${page ? `onclick="goTo('${page}')"` : ''}>
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${delta ? `<div class="metric-delta ${dc}">${delta}</div>` : ''}
    </div>`;
}

function frameworkBar(fw) {
  const colors = { 'Compliant': '#1D9E75', 'Partially Compliant': '#BA7517', 'Not Compliant': '#C1554D' };
  const fill = colors[fw.status] || '#888780';
  return `
    <div class="fw-row">
      <div class="fw-name">${fw.name}</div>
      <div class="split-bar" style="flex:1;border-radius:4px;overflow:hidden;height:8px">
        <div class="split-satisfied" style="width:${fw.satisfied}%"></div>
        <div class="split-partial"   style="width:${fw.partial}%"></div>
        <div class="split-unsatisfied" style="width:${fw.missing}%;background:var(--bg-secondary)"></div>
      </div>
      <div style="font-size:10px;color:var(--text-secondary);width:120px;text-align:right;flex-shrink:0">
        ${fw.satisfied}% full · ${fw.partial}% partial
      </div>
      <div class="fw-status-col">${statusBadge(fw.status)}</div>
    </div>`;
}

function partialBar(fw) {
  return `
    <div class="fw-row">
      <div class="fw-name">${fw.name}</div>
      <div class="split-bar" style="flex:1;border-radius:4px;overflow:hidden;height:8px">
        <div class="split-satisfied" style="width:${fw.satisfied}%"></div>
        <div class="split-partial"   style="width:${fw.partial}%"></div>
        <div class="split-unsatisfied" style="width:${fw.missing}%;background:var(--bg-secondary)"></div>
      </div>
      <div style="font-size:10px;color:var(--text-secondary);width:100px;text-align:right;flex-shrink:0">
        ${fw.satisfied}% full · ${fw.partial}% partial
      </div>
    </div>`;
}

function activityFeed(items) {
  return items.map(a =>
    `<div class="activity-item">
      <div class="act-dot" style="background:${a.color}"></div>
      <div class="act-text">${a.text}</div>
      <div class="act-time">${a.time}</div>
    </div>`
  ).join('');
}

function remarkBlock(title, icon, content, type) {
  const isAI = type === 'ai';
  return `
    <div class="remark-block">
      <div class="remark-header">${icon} ${title}</div>
      <div class="remark-body">
        ${content
          ? `<span>${content}</span>`
          : `<span class="remark-placeholder">${isAI ? 'AI verdict pending — model will analyse evidence and generate verdict after submission.' : 'No remarks added yet.'}</span>`
        }
      </div>
    </div>`;
}

function accessIndicator(role, action) {
  const icons = { 'Control Owner': '👤', 'Domain Head': '🏛', 'CISO': '🔒' };
  return `
    <div class="access-indicator">
      <span class="ai-icon">${icons[role] || '👤'}</span>
      <span><strong>${action}</strong> enabled for: <strong>${role}</strong></span>
    </div>`;
}

function evidenceTimeline(items) {
  const dots = { info: 'dot-info', warning: 'dot-warning', success: 'dot-success', danger: 'dot-danger' };
  return `
    <div class="ev-timeline">
      ${items.map(t => `
        <div class="ev-timeline-item">
          <div class="ev-tl-dot ${dots[t.type] || ''}"></div>
          <div class="ev-tl-body">
            <div class="ev-tl-title">${t.action}</div>
            <div class="ev-tl-time">${t.time}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function scanWidget(scanInfo) {
  function scanDot(status) {
    if (status === 'up-to-date') return '<span style="color:var(--text-success)">●</span>';
    if (status === 'pending')    return '<span style="color:var(--text-warning)">●</span>';
    return '<span style="color:var(--text-danger)">●</span>';
  }
  function scanClass(status) {
    return status === 'up-to-date' ? 'scan-up-to-date' : status === 'pending' ? 'scan-pending' : 'scan-failed';
  }
  function scanLabel(status) {
    return status === 'up-to-date' ? 'Up-to-date' : status === 'pending' ? 'Pending' : 'Failed';
  }
  return `
    <div class="scan-widget">
      <div class="scan-item">
        <div class="scan-label">Last circular scan</div>
        <div class="scan-value">${scanDot(scanInfo.lastCircularScan.status)} Circular monitoring</div>
        <div class="scan-time">${scanInfo.lastCircularScan.timestamp}</div>
        <div class="scan-status-badge ${scanClass(scanInfo.lastCircularScan.status)}">${scanLabel(scanInfo.lastCircularScan.status)}</div>
      </div>
      <div class="scan-item">
        <div class="scan-label">Last compliance evaluation</div>
        <div class="scan-value">${scanDot(scanInfo.lastComplianceEval.status)} Control assessment</div>
        <div class="scan-time">${scanInfo.lastComplianceEval.timestamp}</div>
        <div class="scan-status-badge ${scanClass(scanInfo.lastComplianceEval.status)}">${scanLabel(scanInfo.lastComplianceEval.status)}</div>
      </div>
      <div class="scan-item">
        <div class="scan-label">Next scheduled scan</div>
        <div class="scan-value">${scanDot(scanInfo.nextScheduledScan.status)} Automated run</div>
        <div class="scan-time">${scanInfo.nextScheduledScan.timestamp}</div>
        <div class="scan-status-badge ${scanClass(scanInfo.nextScheduledScan.status)}">${scanLabel(scanInfo.nextScheduledScan.status)}</div>
      </div>
    </div>`;
}
