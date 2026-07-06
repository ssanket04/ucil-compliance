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

        // Use database controls only; do not fall back to DATA.controls if empty (Q22-A / Zero-state alignment)
        const mappedControls = controlsRaw && controlsRaw.length > 0 ? controlsRaw.map(c => ({
          id:          c.control_code,
          name:        c.name,
          domain:      c.domain_name || 'Unassigned',
          description: c.description,
          frameworks:  c.frameworks || [],
          extra:       c.extra || [],
          owner:       c.owner_name || '—',
          domainHead:  c.domain_head_name || '—',
          status:      c.status,
          confidence:  c.confidence_score ?? 0.85,
          reason:      c.status_reason || '—',
        })) : [];

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
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading Unified Control Library...</div>;
  }

  const total = controls.length;
  
  // Use Nullish Coalescing (??) to prevent 0 falling back to DATA
  const metricTotal = metrics ? (metrics.unique_canonical ?? total) : total;
  const autoRate = metrics ? Math.round(metrics.ai_auto_approval_rate ?? 0) : 0;
  const approved = Math.round((autoRate / 100) * metricTotal);
  const smeQueue = metrics ? (metrics.in_progress_sme ?? 0) : 0;

  const domColors = {
    'Access Control': 'blue',
    'Privileged Access': 'amber',
    'Incident Mgmt': 'red',
    'Data Protection': 'green',
    'Change Mgmt': 'gray'
  };

  const filtered = controls.filter(c => {
    const sTerm = search.toLowerCase();
    const matchSearch = !search || c.name.toLowerCase().includes(sTerm) || c.id.toLowerCase().includes(sTerm) || (c.domain && c.domain.toLowerCase().includes(sTerm));
    const matchFw     = !fwFilter || (c.frameworks || []).some(f => f.toLowerCase().includes(fwFilter.toLowerCase()));
    const matchDomain = !domainFilter || (c.domain && c.domain.toLowerCase().includes(domainFilter.toLowerCase()));
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
      {/* Metric Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <MetricCard label="Total Unique Controls" value={metricTotal} delta="Canonical Unified Inventory" deltaType="good" />
        <MetricCard label="Auto-Approved Mappings" value={approved} delta={`${autoRate}% matched automatically`} deltaType="good" />
        
        <div className="metric-card" onClick={() => setShowAIConfBreakdown(!showAIConfBreakdown)} style={{ position: 'relative' }}>
          <div className="metric-label">SME Review Queue</div>
          <div className="metric-value">{smeQueue}</div>
          <div className="metric-delta text-warning" style={{ cursor: 'pointer' }}>Pending manual sign-off</div>
          {showAIConfBreakdown && (
            <div id="ai-conf-breakdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-gold)', borderRadius: 'var(--r-md)', padding: '12px', zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--text-success)', flexShrink: 0 }}></div>
                  <div style={{ color: 'var(--text-secondary)' }}>≥ 0.85 — Auto-Approved ({approved} controls)</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--text-warning)', flexShrink: 0 }}></div>
                  <div style={{ color: 'var(--text-secondary)' }}>0.50–0.84 — SME Review Queue ({smeQueue} items)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Library Table Card */}
      <div className="card">
        <div className="card-title">Unified Control Library</div>
        
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '220px' }}>
            <span className="search-icon">⌕</span>
            <input type="text" placeholder="Search by keyword, control ID, or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="filter-select" value={fwFilter} onChange={(e) => setFwFilter(e.target.value)}>
            <option value="">All frameworks</option>
            <option value="ISO 27001">ISO 27001</option>
            <option value="NIST">NIST</option>
            <option value="RBI">RBI</option>
            <option value="SOX">SOX</option>
          </select>
          <select className="filter-select" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">All domains</option>
            <option value="Access Control">Access Control</option>
            <option value="Incident Mgmt">Incident Mgmt</option>
            <option value="Data Protection">Data Protection</option>
            <option value="Privileged Access">Privileged Access</option>
            <option value="Change Mgmt">Change Mgmt</option>
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="Active">Active</option>
            <option value="Under Review">Under Review</option>
            <option value="Failed">Failed</option>
          </select>
        </div>

        {/* Data Table */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Control ID & Title</th>
                <th>Requirement Description</th>
                <th style={{ width: '160px' }}>Domain / Head</th>
                <th style={{ width: '180px' }}>Satisfied Frameworks</th>
                <th style={{ width: '110px' }}>Owner</th>
                <th style={{ width: '80px' }}>AI Match</th>
                <th style={{ width: '100px' }}>Status</th>
                <th style={{ width: '90px' }}>Evidence</th>
                <th style={{ width: '90px' }}>Logs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((c) => {
                  const isExtraExpanded = expandedExtras[c.id];
                  const isReasonExpanded = expandedReasons[c.id];

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-gold-lt)', fontWeight: 'bold' }}>{c.id}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', color: 'var(--text-primary)' }}>{c.name}</div>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{c.description}</td>
                      <td>
                        <Badge text={c.domain} color={domColors[c.domain] || 'gray'} />
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{c.domainHead}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(c.frameworks || []).map((f, i) => <Badge key={i} text={f} color="green" />)}
                        </div>
                        {(c.extra || []).length > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            <span className="ctrl-expand" onClick={() => toggleExtra(c.id)}>
                              {isExtraExpanded ? '− Show less' : `+ ${c.extra.length} more frameworks`}
                            </span>
                            {isExtraExpanded && (
                              <div className="ctrl-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
                                {c.extra.map((f, i) => <Badge key={i} text={f} color="blue" />)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.owner}</td>
                      <td><ConfPill value={c.confidence} /></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <button className="btn-sm" onClick={() => onNavigate('evidence', { controlId: c.id })}>
                          Files
                        </button>
                      </td>
                      <td>
                        <span className="ctrl-expand" onClick={() => toggleReason(c.id)}>
                          {isReasonExpanded ? 'Hide' : 'Reason'}
                        </span>
                        {isReasonExpanded && (
                          <div className="ctrl-sub" style={{ fontSize: '10px', lineHeight: '1.4', color: 'var(--text-secondary)' }}>{c.reason}</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-tertiary)', fontSize: '12.5px' }}>
                    No compliance controls mapped yet. Ingest your first document to dynamically build this library.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
