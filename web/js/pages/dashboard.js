/* ============================================================
   DASHBOARD PAGE — Live data from Supabase
   ============================================================ */

function toggleInProgressBreakdown() {
  const breakdown = document.getElementById('inprogress-breakdown');
  if (breakdown) {
    breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
  }
}

async function renderDashboard() {
  const [metricsRaw, frameworksRaw, regulatoryRaw, scanRaw, auditLog] = await Promise.all([
    fetchMetrics(),
    fetchFrameworks(),
    fetchRegulatoryChanges(),
    fetchScanInfo(),
    fetchAuditLog(5),
  ]);

  const m = metricsRaw ? {
    uniqueCanonical:      metricsRaw.unique_canonical      || DATA.metrics.uniqueCanonical,
    implemented:          metricsRaw.implemented           || DATA.metrics.implemented,
    inProgress: {
      pendingSME:          metricsRaw.in_progress_sme       || DATA.metrics.inProgress.pendingSME,
      evidenceUnderReview: metricsRaw.in_progress_ev_review || DATA.metrics.inProgress.evidenceUnderReview,
      evidencePending:     metricsRaw.in_progress_ev_pending || DATA.metrics.inProgress.evidencePending,
      evidenceReassigned:  metricsRaw.in_progress_ev_reassigned || DATA.metrics.inProgress.evidenceReassigned,
    },
    openGaps:             metricsRaw.open_gaps             || DATA.metrics.openGaps,
    criticalGaps:         metricsRaw.critical_gaps         || DATA.metrics.criticalGaps,
    circularsIngested:    metricsRaw.circulars_ingested    || DATA.metrics.circularsIngested,
    frameworksIngested:   metricsRaw.frameworks_ingested   || DATA.metrics.frameworksIngested,
    internalPolicies:     metricsRaw.internal_policies     || DATA.metrics.internalPolicies,
    totalSourcesIngested: metricsRaw.total_sources         || DATA.metrics.totalSourcesIngested,
    aiAutoApprovalRate:   metricsRaw.ai_auto_approval_rate || DATA.metrics.aiAutoApprovalRate,
    controlMultiplier:    metricsRaw.control_multiplier    || DATA.metrics.controlMultiplier,
    totalMappings:        metricsRaw.total_mappings        || DATA.metrics.totalMappings,
  } : DATA.metrics;

  // In Progress = SME + evidence (under review + reassigned + pending)
  // Note: SME count is separate, evidence counts exclude SME
  const totalInProgress = m.inProgress.pendingSME
    + m.inProgress.evidenceUnderReview
    + m.inProgress.evidencePending
    + m.inProgress.evidenceReassigned;

  const frameworks = frameworksRaw.length ? frameworksRaw.map(fw => ({
    name:      fw.name,
    status:    fw.compliance_status,
    satisfied: Math.round(fw.satisfied_pct),
    partial:   Math.round(fw.partial_pct),
    missing:   Math.round(fw.missing_pct),
  })) : DATA.frameworks;

  const regulatory = regulatoryRaw.length ? regulatoryRaw.map(r => ({
    id:               r.circular_id,
    title:            r.title,
    date:             r.issued_date ? new Date(r.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    impactedControls: r.total_impacted,
    gaps:             r.gaps_count || 0,
    status:           r.status,
  })) : DATA.regulatory;

  const scanMap = {};
  scanRaw.forEach(s => { scanMap[s.scan_type] = s; });
  const scanInfo = {
    lastCircularScan: {
      timestamp: scanMap['circular_scan']?.completed_at ? formatTimestamp(scanMap['circular_scan'].completed_at) : DATA.scanInfo.lastCircularScan.timestamp,
      status:    scanMap['circular_scan']?.status || DATA.scanInfo.lastCircularScan.status,
    },
  };

  // Confidence-based auto-approval rate (matches library page calculation)
  const autoApprovalDisplay = m.aiAutoApprovalRate ? `${Math.round(m.aiAutoApprovalRate)}%` : '0%';
  const autoApprovalSub = m.uniqueCanonical > 0
    ? `${Math.round(m.aiAutoApprovalRate * m.uniqueCanonical / 100)} of ${m.uniqueCanonical} controls auto-approved`
    : 'Confidence ≥ 0.85';

  const multiplierDisplay = m.controlMultiplier ? `1 → ${Number(m.controlMultiplier).toFixed(1)}×` : '1 → 5.2×';

  // Guard against division by zero
  const implementedPct = m.uniqueCanonical > 0
    ? Math.round(m.implemented / m.uniqueCanonical * 100)
    : 0;

  // Recent activity from audit log
  const activityItems = auditLog.length
    ? auditLog.map(a => ({
        text:  `${a.users?.full_name || 'System'} — ${a.action.replace(/_/g, ' ')}`,
        time:  timeAgo(a.performed_at),
        color: a.action.includes('gap') ? 'var(--text-danger)'
             : a.action.includes('approve') ? 'var(--text-success)'
             : a.action.includes('reject') ? 'var(--text-warning)'
             : 'var(--text-info)',
      }))
    : [
        { text: 'RBI CSF v2 ingestion completed — 85 controls mapped', time: '2h ago', color: 'var(--text-success)' },
        { text: '12 low-confidence mappings sent to SME queue', time: '4h ago', color: 'var(--text-warning)' },
        { text: 'Priya S. approved 8 ISO–SOX mappings', time: '6h ago', color: 'var(--text-info)' },
        { text: '3 conflicting controls flagged: NIST vs PCI-DSS', time: '1d ago', color: 'var(--text-danger)' },
        { text: 'Gap report exported for Q1 audit pack', time: '1d ago', color: 'var(--text-success)' },
      ];

  return `
  <!-- KPIs - Row 1 -->
  <div class="grid-4">
    ${metricCard('Unique canonical controls', m.uniqueCanonical, 'Total controls = Unified Library = Domain Head View', 'good', 'library')}
    ${metricCard('Implemented controls', m.implemented, `${implementedPct}% · Active in Library · Approved in Evidence`, 'good', 'library')}
    <div class="metric-card" onclick="toggleInProgressBreakdown()" style="cursor:pointer">
      <div class="metric-label">In Progress <span style="font-size:10px;opacity:0.7">(click for breakdown)</span></div>
      <div class="metric-value">${totalInProgress}</div>
      <div class="metric-delta text-warning">= Evidence (Under Review + Reassigned + Pending) + SME</div>
      <div id="inprogress-breakdown" style="display:none;margin-top:12px;padding-top:12px;border-top:0.5px solid var(--border-t)">
        <div style="font-size:11px;margin-bottom:6px;display:flex;justify-content:space-between;cursor:pointer" onclick="goTo('queue')">
          <span style="color:var(--text-secondary)">Pending SME review</span>
          <strong style="color:var(--text-primary)">${m.inProgress.pendingSME}</strong>
        </div>
        <div style="font-size:11px;margin-bottom:6px;display:flex;justify-content:space-between;cursor:pointer" onclick="goTo('evidence')">
          <span style="color:var(--text-secondary)">Evidence under review</span>
          <strong style="color:var(--text-primary)">${m.inProgress.evidenceUnderReview}</strong>
        </div>
        <div style="font-size:11px;margin-bottom:6px;display:flex;justify-content:space-between;cursor:pointer" onclick="goTo('evidence')">
          <span style="color:var(--text-secondary)">Evidence reassigned</span>
          <strong style="color:var(--text-primary)">${m.inProgress.evidenceReassigned}</strong>
        </div>
        <div style="font-size:11px;display:flex;justify-content:space-between;cursor:pointer" onclick="goTo('evidence')">
          <span style="color:var(--text-secondary)">Evidence pending</span>
          <strong style="color:var(--text-primary)">${m.inProgress.evidencePending}</strong>
        </div>
      </div>
    </div>
    ${metricCard('Open gaps', m.openGaps, `${m.criticalGaps} critical · Failed in Library · Rejected in Evidence`, 'bad', 'gaps')}
  </div>

  <!-- KPIs - Row 2 -->
  <div class="grid-4">
    ${metricCard('Total sources ingested', m.totalSourcesIngested, `${m.frameworksIngested} frameworks · ${m.circularsIngested} circulars · ${m.internalPolicies} policies`, 'good', 'ingest')}
    ${metricCard('Control Efficiency', multiplierDisplay, 'One control satisfies multiple frameworks', 'good', 'library')}
    ${metricCard('AI Auto-Approval Rate', autoApprovalDisplay, `${autoApprovalSub} · Matches Library auto-approved`, 'good', 'library')}
    ${metricCard('Web Scraper Status', 'Active', `Last scan: ${scanInfo.lastCircularScan.timestamp}`, 'good', 'ingest')}
  </div>

  <div class="row">
    <div class="col-14">
      <div class="card">
        <div class="card-title">Framework compliance status</div>
        <div style="max-height:700px;overflow-y:auto;overflow-x:hidden">
          ${frameworks.map(fw => frameworkBar(fw)).join('')}
        </div>
      </div>
    </div>
    <div class="col">
      <div class="card" style="height:100%">
        <div class="card-title">Recent activity</div>
        <div style="max-height:320px;overflow-y:auto">
          ${activityFeed(activityItems)}
        </div>
      </div>
    </div>
  </div>

  <!-- Recent regulatory updates -->
  <div class="row">
    <div class="col">
      <div class="card" style="height:100%">
        <div class="card-title" style="cursor:pointer" onclick="goTo('regulatory')">
          Recent regulatory updates <span style="font-size:11px;color:var(--text-info);font-weight:400">→ view all</span>
        </div>
        <div style="max-height:320px;overflow-y:auto">
          ${regulatory.slice(0, 3).map(r => `
            <div class="reg-update-item">
              <div class="reg-update-date">${r.date.split(' ').slice(0, 2).join(' ')}</div>
              <div class="reg-update-body">
                <div class="reg-update-title">${r.id}</div>
                <div class="reg-update-meta">${r.title} · Affects ${r.impactedControls} controls${r.gaps > 0 ? ` · ${r.gaps} gaps` : ''}</div>
              </div>
              <div>${badge(r.status === 'Remediated' ? 'Remediated' : 'In review', r.status === 'Remediated' ? 'green' : 'red')}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}
