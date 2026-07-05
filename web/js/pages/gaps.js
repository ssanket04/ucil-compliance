/* ============================================================
   GAPS PAGE — Live from Supabase
   ============================================================ */
async function renderGaps() {
  const gaps = await fetchGaps();

  const gapsData = gaps.length ? gaps.map(g => ({
    id:       g.gap_code,
    sev:      g.severity,
    desc:     g.description,
    why:      g.why_critical || 'Under assessment.',
    impact:   g.impact_if_unresolved || 'Impact being evaluated.',
    benefit:  g.benefit_if_resolved || 'Benefit being evaluated.',
    category: Array.isArray(g.impact_category) ? g.impact_category : ['Non-financial'],
  })) : DATA.gaps;

  const counts = {
    all:      gapsData.length,
    critical: gapsData.filter(g => g.sev === 'critical').length,
    high:     gapsData.filter(g => g.sev === 'high').length,
    medium:   gapsData.filter(g => g.sev === 'medium').length,
    low:      gapsData.filter(g => g.sev === 'low').length,
  };

  return `
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
    <div class="metric-card non-clickable">
      <div class="metric-label">Total gaps</div>
      <div class="metric-value">${counts.all}</div>
      <div class="metric-delta text-danger">= Dashboard Gaps = Library Failed</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Critical</div>
      <div class="metric-value">${counts.critical}</div>
      <div class="metric-delta text-danger">Immediate action required</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">High</div>
      <div class="metric-value">${counts.high}</div>
      <div class="metric-delta text-warning">Action required</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Medium</div>
      <div class="metric-value">${counts.medium}</div>
      <div class="metric-delta text-info">Planned remediation</div>
    </div>
    <div class="metric-card non-clickable">
      <div class="metric-label">Low</div>
      <div class="metric-value">${counts.low}</div>
      <div class="metric-delta text-success">Monitor</div>
    </div>
  </div>

  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <div class="pill-bar" style="margin-bottom:0;flex:1">
        <button class="pill active" id="gf-all"      onclick="filterGaps('all',this)">All (${counts.all})</button>
        <button class="pill" id="gf-critical"         onclick="filterGaps('critical',this)">Critical (${counts.critical})</button>
        <button class="pill" id="gf-high"             onclick="filterGaps('high',this)">High (${counts.high})</button>
        <button class="pill" id="gf-medium"           onclick="filterGaps('medium',this)">Medium (${counts.medium})</button>
        <button class="pill" id="gf-low"              onclick="filterGaps('low',this)">Low (${counts.low})</button>
      </div>
      <button class="btn btn-primary" onclick="handleRemediationPlan()">🤖 Generate Remediation Plan</button>
    </div>
    <div id="gap-list">
      ${gapsData.map(g => renderGapRow(g)).join('')}
    </div>
  </div>
  <div id="remediation-output" style="margin-top:16px"></div>`;
}

function renderGapRow(g) {
  const sevColor = { critical: 'red', high: 'amber', medium: 'blue', low: 'green' };
  const borderColor = g.sev === 'critical' ? 'var(--border-danger)'
    : g.sev === 'high' ? 'var(--border-warning)'
    : g.sev === 'medium' ? 'var(--border-info)' : 'var(--border-success)';

  return `
  <div data-sev="${g.sev}">
    <div class="gap-row" onclick="toggleGapExpand('gexp-${g.id}',this)">
      <div class="gap-id">${g.id}</div>
      <div class="gap-desc">${g.desc}</div>
      ${badge(g.sev.charAt(0).toUpperCase() + g.sev.slice(1), sevColor[g.sev])}
      <span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0">▶</span>
    </div>
    <div class="gap-expand hidden" id="gexp-${g.id}" style="border-left-color:${borderColor}">
      <div style="margin-bottom:8px"><strong>Why ${g.sev}:</strong> ${g.why}</div>
      <div style="margin-bottom:8px"><strong>Impact if not resolved:</strong> ${g.impact}</div>
      <div style="margin-bottom:10px"><strong>Benefit if resolved:</strong> ${g.benefit}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
        ${g.category.map(c => badge(c, 'gray')).join('')}
      </div>
    </div>
  </div>`;
}

function toggleGapExpand(id, row) {
  const exp = document.getElementById(id);
  if (!exp) return;
  exp.classList.toggle('hidden');
  const arrow = row.querySelector('span:last-child');
  if (arrow) arrow.textContent = exp.classList.contains('hidden') ? '▶' : '▼';
}

function filterGaps(sev, el) {
  document.querySelectorAll('[id^="gf-"]').forEach(p => {
    p.className = 'pill';
    if (p.id === 'gf-' + sev) {
      const map = { critical: 'active-red', high: 'active-amber', medium: 'active-blue', low: 'active-green', all: 'active' };
      p.className = 'pill ' + (map[sev] || 'active');
    }
  });
  document.querySelectorAll('#gap-list > div[data-sev]').forEach(r => {
    r.style.display = (sev === 'all' || r.dataset.sev === sev) ? 'block' : 'none';
  });
}

// Module-level cache so showRegulatoryDetail can access resolved data
let _regDataCache = [];

async function renderRegulatoryWrapper() {
  const [regulatory, allControls, allMappings] = await Promise.all([
    fetchRegulatoryChanges(),
    fetchControls(),
    fetchMappings(),
  ]);
  
  const controlByUUID = {};
  allControls.forEach(c => { controlByUUID[c.id] = c; });

  _regDataCache = regulatory.length ? regulatory.map(r => {
    // Get impacted controls from database field OR calculate from mappings
    let impactedIds = [];
    
    // Try to get from database first
    if (r.impacted_control_ids && r.impacted_control_ids.length > 0) {
      impactedIds = r.impacted_control_ids.map(uid => controlByUUID[uid]).filter(Boolean);
    } else {
      // Fallback: Calculate from mappings if we have framework_id
      if (r.framework_id && allMappings.length > 0) {
        const frameworkMappings = allMappings.filter(m => m.framework_id === r.framework_id);
        impactedIds = frameworkMappings
          .map(m => m.controls)
          .filter(Boolean);
      }
    }
    
    // Calculate actual count from impactedIds
    const actualImpactedCount = impactedIds.length;
    
    // Calculate gaps: count controls with status 'Failed' from impacted controls
    const gapsCount = impactedIds.filter(c => c.status === 'Failed').length;
    
    return {
      id:              r.circular_id,
      title:           r.title,
      date:            r.issued_date ? new Date(r.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      impactedControls: actualImpactedCount || r.total_impacted || 0,
      gaps:            gapsCount || r.gaps_count || 0,
      status:          (gapsCount > 0 || (r.gaps_count && r.gaps_count > 0)) ? 'In review' : 'Remediated',
      impactedIds:     impactedIds,
      unmatched:       r.unmatched_clauses || [],
    };
  }) : DATA.regulatory.map(r => ({
    ...r,
    impactedIds: [],
    unmatched: [],
    status: r.gaps > 0 ? 'In review' : 'Remediated'
  }));

  const firstId = _regDataCache[0]?.id || '';

  return `
  <div class="card">
    <div class="card-title">Regulatory change log</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40%">Circular / Update</th>
            <th style="width:15%">Issued</th>
            <th style="width:15%">Impacted</th>
            <th style="width:30%">Action</th>
          </tr>
        </thead>
        <tbody>
          ${_regDataCache.map(r => `
            <tr class="clickable" onclick="showRegulatoryDetail('${r.id}')">
              <td>
                <div style="font-size:12px;font-weight:600">${r.id}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${r.title}</div>
              </td>
              <td style="font-size:11px;color:var(--text-secondary)">${r.date}</td>
              <td style="font-size:12px;color:var(--text-primary)">${r.impactedControls}${r.gaps > 0 ? ` · ${r.gaps} gaps` : ''}</td>
              <td><button class="btn-sm btn-info" onclick="event.stopPropagation();showRegulatoryDetail('${r.id}')">Details →</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div id="regulatory-detail">
    ${firstId ? renderRegulatoryDetail(firstId) : ''}
  </div>`;
}

// Override renderRegulatory to use the wrapper that populates the cache
async function renderRegulatory() {
  return renderRegulatoryWrapper();
}

function renderRegulatoryDetail(regulatoryId) {
  const r = _regDataCache.find(x => x.id === regulatoryId);
  if (!r) return '';

  // impactedIds are already resolved control objects from v_controls_full
  const impactedControls = r.impactedIds.map(c => ({
    id:     c.control_code,
    name:   c.name,
    status: c.status,
  }));

  // unmatched_clauses from Supabase JSONB: array of {ref, desc} or {unifiedId, ref, desc}
  const unmatchedControls = Array.isArray(r.unmatched) ? r.unmatched : [];

  return `
  <div class="row">
    <div class="col">
      <div class="card">
        <div class="card-title">Impacted controls</div>
        <div class="card-subtitle">Controls affected by ${regulatoryId} (${impactedControls.length} total)</div>
        <div style="max-height:400px;overflow-y:auto">
          ${impactedControls.length ? impactedControls.map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border-t)">
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">${c.id}</div>
              <div style="font-size:12px;font-weight:500;flex:1">${c.name}</div>
              ${statusBadge(c.status)}
            </div>`).join('')
          : '<div style="font-size:12px;color:var(--text-secondary);padding:10px 0">No impacted controls recorded yet.</div>'}
        </div>
      </div>
    </div>
    <div class="col">
      <div class="card">
        <div class="card-title">Unmatched controls</div>
        <div class="card-subtitle">New requirements with no existing control mapping</div>
        ${unmatchedControls.length ? unmatchedControls.map(u => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border-t)">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">${u.unifiedId || u.ref || '—'}</div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)">${u.ref || ''}</div>
            <div style="font-size:12px;flex:1">${u.desc || u.description || '—'}</div>
            ${badge('No mapping', 'red')}
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--text-secondary);padding:10px 0">No unmatched clauses recorded.</div>'}
      </div>
    </div>
  </div>`;
}

function showRegulatoryDetail(regulatoryId) {
  const el = document.getElementById('regulatory-detail');
  if (el) el.innerHTML = renderRegulatoryDetail(regulatoryId);
}

/* ============================================================
   CONFLICTS PAGE — Live from Supabase
   ============================================================ */
async function renderConflicts() {
  const conflicts = await fetchConflicts();

  const conflictsData = conflicts.length ? conflicts.map(c => ({
    id:              c.conflict_code,
    title:           c.title,
    policy1:         c.policy_ref_1,
    req1:            c.requirement_1,
    policy2:         c.policy_ref_2,
    req2:            c.requirement_2,
    status:          c.status,
    partialStatus:   c.partial_status || '',
    explanation:     c.explanation || '',
    resolution:      c.suggested_resolution || 'Resolution pending review.',
    affectedControls: c.affected_control_ids || [],
  })) : DATA.conflicts;

  return `
  <div class="banner banner-danger">
    <div class="banner-icon">⚠</div>
    <div class="banner-body">
      <div class="banner-title" style="color:var(--text-danger)">${conflictsData.length} compliance conflicts detected</div>
      <div class="banner-text" style="color:var(--text-danger)">Conflicting requirements between frameworks. Review each conflict and apply the suggested resolution or escalate to CISO.</div>
    </div>
  </div>

  ${conflictsData.map(c => `
    <div class="conflict-card">
      <div class="conflict-header">
        <div style="font-size:14px">⚠</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--text-danger)">${c.id} — ${c.title}</div>
          <div style="font-size:11px;color:var(--text-danger);margin-top:2px">Status: <strong>${c.status}</strong></div>
        </div>
        ${badge(c.partialStatus.includes('Non-compliant') ? 'Partial compliance' : 'Conflict detected', 'amber')}
      </div>
      <div class="conflict-body">
        <div class="grid-2" style="margin-bottom:14px">
          <div style="background:var(--bg-secondary);border-radius:var(--r-md);padding:12px">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${c.policy1}</div>
            <div style="font-size:12px;color:var(--text-primary)">${c.req1}</div>
          </div>
          <div style="background:var(--bg-secondary);border-radius:var(--r-md);padding:12px">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${c.policy2}</div>
            <div style="font-size:12px;color:var(--text-primary)">${c.req2}</div>
          </div>
        </div>
        <div style="background:var(--bg-warning);border:0.5px solid var(--border-warning);border-radius:var(--r-md);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text-warning)">
          <strong>Compliance status:</strong> ${c.partialStatus}
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">CONFLICT EXPLANATION</div>
          <div style="font-size:12px;color:var(--text-primary);line-height:1.6">${c.explanation}</div>
        </div>
        ${c.affectedControls.length ? `
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">AFFECTED CONTROLS</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${c.affectedControls.map(id => `<span class="badge badge-blue" style="cursor:pointer" onclick="goTo('library')">${id}</span>`).join('')}
          </div>
        </div>` : ''}
        <div style="background:var(--bg-success);border:0.5px solid var(--border-success);border-radius:var(--r-md);padding:10px 12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text-success);margin-bottom:4px">💡 SUGGESTED RESOLUTION</div>
          <div style="font-size:12px;color:var(--text-success);line-height:1.5">${c.resolution}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm btn-success">Apply resolution</button>
          <button class="btn-sm">Escalate to CISO</button>
          <button class="btn-sm btn-info" onclick="goTo('gaps')">View related gaps →</button>
        </div>
      </div>
    </div>`).join('')}`;
}

async function handleRemediationPlan() {
  const btn = event.target;
  setAILoading(btn, true, 'Generate remediation plan');
  try {
    const result = await generateRemediationPlan();
    document.getElementById('remediation-output').innerHTML = `
      <div class="card">
        <div class="card-title">AI Remediation Plan</div>
        <div style="font-size:12px;line-height:1.7;color:var(--text-secondary);margin-bottom:12px">
          ${result.executive_summary}
        </div>
        ${result.plan.map(p => `
          <div style="border:0.5px solid var(--border-t);border-radius:var(--r-md);padding:12px;margin-bottom:8px">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <strong style="font-family:monospace;font-size:11px">${p.gap_code}</strong>
              ${badge(p.severity, p.severity === 'critical' ? 'red' : p.severity === 'high' ? 'amber' : 'blue')}
              <span style="font-size:10px;color:var(--text-secondary);margin-left:auto">${p.recommended_deadline}</span>
            </div>
            <div style="font-size:12px;margin-bottom:4px">${p.recommended_action}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Owner: ${p.suggested_owner} · Effort: ${p.estimated_effort}</div>
          </div>`).join('')}
        <div style="font-size:11px;color:var(--text-success);margin-top:8px">
          Total effort: ${result.total_effort_estimate}
        </div>
      </div>`;
  } catch(err) {
    showError('Could not generate plan: ' + err.message);
  }
  setAILoading(btn, false, 'Generate remediation plan');
}
