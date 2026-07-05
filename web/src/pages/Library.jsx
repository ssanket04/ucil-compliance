import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchControls, fetchMetrics } from '../supabaseClient';
import MetricCard from '../components/MetricCard';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';
import ConfPill from '../components/ConfPill';

export default function Library({ onNavigate }) {
  const [controls, setControls] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAIConfBreakdown, setShowAIConfBreakdown] = useState(false);

  const [search, setSearch] = useState('');
  const [fwFilter, setFwFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [expandedExtras, setExpandedExtras] = useState({});
  const [expandedReasons, setExpandedReasons] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [controlsRaw, metricsRaw] = await Promise.all([
          fetchControls(),
          fetchMetrics(),
        ]);

        const mappedControls = controlsRaw.length ? controlsRaw.map(c => ({
          id:          c.control_code,
          name:        c.name,
          domain:      c.domain_name,
          description: c.description,
          frameworks:  c.frameworks || [],
          extra:       c.extra || [],
          owner:       c.owner_name || '—',
          domainHead:  c.domain_head_name || '—',
          status:      c.status,
          confidence:  c.confidence_score ?? 0.85,
          reason:      c.status_reason || '—',
        })) : DATA.controls;

        setControls(mappedControls);
        setMetrics(metricsRaw);
      } catch (err) {
        console.error('Error loading library:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading Unified Control Library...</div>;
  }

  const total = controls.length;
  const metricTotal = metrics ? (metrics.unique_canonical || total) : total;
  const autoRate = metrics ? Math.round(metrics.ai_auto_approval_rate || 0) : Math.round(DATA.metrics.aiAutoApprovalRate);
  const approved = Math.round((autoRate / 100) * metricTotal);
  const smeQueue = metrics ? (metrics.in_progress_sme || 0) : DATA.metrics.inProgress.pendingSME;

  const domColors = {
    'Access Control': 'blue',
    'Privileged Access': 'amber',
    'Incident Mgmt': 'red',
    'Data Protection': 'green',
    'Change Mgmt': 'gray'
  };

  const filtered = controls.filter(c => {
    const sTerm = search.toLowerCase();
    const matchSearch = !search || c.name.toLowerCase().includes(sTerm) || c.id.toLowerCase().includes(sTerm) || c.domain.toLowerCase().includes(sTerm);
    const matchFw     = !fwFilter || (c.frameworks || []).some(f => f.toLowerCase().includes(fwFilter.toLowerCase()));
    const matchDomain = !domainFilter || c.domain.toLowerCase().includes(domainFilter.toLowerCase());
    const matchStatus = !statusFilter || c.status.toLowerCase().includes(statusFilter.toLowerCase());
    return matchSearch && matchFw && matchDomain && matchStatus;
  });

  const toggleExtra = (id) => {
    setExpandedExtras(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleReason = (id) => {
    setExpandedReasons(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '14px' }}>
        <MetricCard label="Total unique controls" value={metricTotal} delta="Matches Dashboard Unique Canonical" deltaType="good" />
        <MetricCard label="Auto-approved" value={approved} delta={`${autoRate}% · Confidence ≥ 0.85 · Matches Dashboard AI Auto-Approval`} deltaType="good" />
        <div className="metric-card" onClick={() => setShowAIConfBreakdown(!showAIConfBreakdown)} style={{ position: 'relative' }}>
          <div className="metric-label">SME Review Queue</div>
          <div className="metric-value">{smeQueue}</div>
          <div className="metric-delta text-warning" style={{ cursor: 'pointer' }}>Matches Dashboard In Progress - SME</div>
          {showAIConfBreakdown && (
            <div id="ai-conf-breakdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--bg-primary)', border: '0.5px solid var(--border-s)', borderRadius: 'var(--r-md)', padding: '10px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--text-success)', flexShrink: 0 }}></div>
                  <div style={{ color: 'var(--text-secondary)' }}>≥ 0.85 — auto-approved ({approved} controls, {autoRate}%)</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--text-warning)', flexShrink: 0 }}></div>
                  <div style={{ color: 'var(--text-secondary)' }}>Pending SME review: {smeQueue} (from dashboard in-progress)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Unified control library</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
            <span className="search-icon">⌕</span>
            <input type="text" placeholder="Search by keyword, control ID, or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="filter-select" value={fwFilter} onChange={(e) => setFwFilter(e.target.value)}>
            <option value="">All frameworks</option>
            <option value="ISO 27001">ISO 27001</option>
            <option value="NIST CSF">NIST CSF</option>
            <option value="RBI CSF">RBI CSF</option>
            <option value="SOX">SOX</option>
          </select>
          <select className="filter-select" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">All domains</option>
            <option value="Access Control">Access Control</option>
            <option value="Incident Mgmt">Incident Mgmt</option>
            <option value="Data Protection">Data Protection</option>
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="Active">Active</option>
            <option value="Under Review">Under Review</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Control ID / Name</th>
                <th style={{ width: '200px' }}>Description</th>
                <th style={{ width: '120px' }}>Domain / Domain Head</th>
                <th style={{ width: '185px' }}>Mapped frameworks</th>
                <th style={{ width: '100px' }}>Control Owner</th>
                <th style={{ width: '70px' }}>Confidence</th>
                <th style={{ width: '80px' }}>Status</th>
                <th style={{ width: '70px' }}>Evidence</th>
                <th style={{ width: '90px' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isExtraExpanded = expandedExtras[c.id];
                const isReasonExpanded = expandedReasons[c.id];

                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{c.id}</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>{c.name}</div>
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.description}</td>
                    <td>
                      <Badge text={c.domain} color={domColors[c.domain] || 'gray'} />
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '3px' }}>{c.domainHead}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {(c.frameworks || []).map((f, i) => <Badge key={i} text={f} color="green" />)}
                      </div>
                      {(c.extra || []).length > 0 && (
                        <>
                          <span className="ctrl-expand" onClick={() => toggleExtra(c.id)}>
                            {isExtraExpanded ? '− show less' : `+ ${c.extra.length} more`}
                          </span>
                          {isExtraExpanded && (
                            <div className="ctrl-sub">
                              {c.extra.map((f, i) => <Badge key={i} text={f} color="blue" />)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.owner}</td>
                    <td><ConfPill value={c.confidence} /></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <span className="ctrl-expand" onClick={() => onNavigate('evidence', { controlId: c.id })} style={{ cursor: 'pointer' }}>
                        Evidence
                      </span>
                    </td>
                    <td>
                      <span className="ctrl-expand" onClick={() => toggleReason(c.id)} title={c.reason}>
                        {isReasonExpanded ? 'Hide' : 'Reason'}
                      </span>
                      {isReasonExpanded && (
                        <div className="ctrl-sub" style={{ fontSize: '10px', lineHeight: '1.4' }}>{c.reason}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
