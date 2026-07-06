import React, { useState, useEffect } from 'react';

import { fetchGaps, generateRemediationPlan } from '../supabaseClient';
import MetricCard from '../components/MetricCard';
import Badge from '../components/Badge';
import PageLoader from '../components/PageLoader';

export default function Gaps() {
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedGaps, setExpandedGaps] = useState({});
  const [remediationPlan, setRemediationPlan] = useState(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadGaps() {
      try {
        const gapsRaw = await fetchGaps();
        if (!isMounted) return;
        const mappedGaps = gapsRaw.length ? gapsRaw.map(g => ({
          id:       g.gap_code,
          sev:      g.severity,
          desc:     g.description,
          why:      g.why_critical || 'Under assessment.',
          impact:   g.impact_if_unresolved || 'Impact being evaluated.',
          benefit:  g.benefit_if_resolved || 'Benefit being evaluated.',
          category: Array.isArray(g.impact_category) ? g.impact_category : ['Non-financial'],
        })) : [];

        setGaps(mappedGaps);
      } catch (err) {
        console.error('Error loading gaps:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadGaps();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <PageLoader message="Loading compliance gaps..." />;
  }

  const counts = {
    all:      gaps.length,
    critical: gaps.filter(g => g.sev === 'critical').length,
    high:     gaps.filter(g => g.sev === 'high').length,
    medium:   gaps.filter(g => g.sev === 'medium').length,
    low:      gaps.filter(g => g.sev === 'low').length,
  };

  const filteredGaps = filter === 'all' ? gaps : gaps.filter(g => g.sev === filter);

  const toggleGapExpand = (id) => {
    setExpandedGaps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    setErrorMsg('');
    try {
      const result = await generateRemediationPlan();
      setRemediationPlan(result);
    } catch (err) {
      console.error('Remediation error:', err);
      setErrorMsg('Could not generate plan: ' + err.message);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const sevColor = { critical: 'red', high: 'amber', medium: 'blue', low: 'green' };

  return (
    <>
      {/* Gaps Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <MetricCard label="Total Gaps Flagged" value={counts.all} delta="Unified Library failures" deltaType="bad" />
        <MetricCard label="Critical Severity" value={counts.critical} delta="CISO review required" deltaType="bad" />
        <MetricCard label="High Severity" value={counts.high} delta="Immediate action needed" deltaType="warn" />
        <MetricCard label="Medium Severity" value={counts.medium} delta="Planned remediation" deltaType="info" />
        <MetricCard label="Low Severity" value={counts.low} delta="Regular monitoring" deltaType="good" />
      </div>

      {/* Main Gaps List Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {/* Severity Filters */}
          <div className="pill-bar" style={{ marginBottom: 0 }}>
            <button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({counts.all})</button>
            <button className={`pill ${filter === 'critical' ? 'active-red' : ''}`} onClick={() => setFilter('critical')}>Critical ({counts.critical})</button>
            <button className={`pill ${filter === 'high' ? 'active-amber' : ''}`} onClick={() => setFilter('high')}>High ({counts.high})</button>
            <button className={`pill ${filter === 'medium' ? 'active-blue' : ''}`} onClick={() => setFilter('medium')}>Medium ({counts.medium})</button>
            <button className={`pill ${filter === 'low' ? 'active-green' : ''}`} onClick={() => setFilter('low')}>Low ({counts.low})</button>
          </div>
          
          {/* AI Remediation Action */}
          <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={generatingPlan}>
            {generatingPlan ? '🤖 Orchestrating plan...' : '🤖 Generate AI Remediation Plan'}
          </button>
        </div>

        {errorMsg && <div className="banner banner-danger" style={{ marginBottom: '16px' }}>{errorMsg}</div>}

        {/* Gaps List */}
        <div id="gap-list" style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredGaps.length > 0 ? (
            filteredGaps.map((g) => {
              const isExpanded = expandedGaps[g.id];
              const borderColor = g.sev === 'critical' ? 'var(--text-danger)'
                : g.sev === 'high' ? 'var(--text-warning)'
                : g.sev === 'medium' ? 'var(--text-info)' : 'var(--text-success)';

              return (
                <div key={g.id} data-sev={g.sev} style={{ borderBottom: '1px solid var(--border-t)' }}>
                  <div className="gap-row" onClick={() => toggleGapExpand(g.id)} style={{ borderLeft: isExpanded ? `3px solid ${borderColor}` : '', paddingLeft: isExpanded ? '12px' : '6px' }}>
                    <div className="gap-id">{g.id}</div>
                    <div className="gap-desc">{g.desc}</div>
                    <Badge text={g.sev.toUpperCase()} color={sevColor[g.sev]} />
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: '12px' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="gap-expand" style={{ borderLeftColor: borderColor }}>
                      <div style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text-primary)' }}>Why marked {g.sev}:</strong> <span style={{ color: 'var(--text-secondary)' }}>{g.why}</span></div>
                      <div style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text-primary)' }}>Business Impact if unresolved:</strong> <span style={{ color: 'var(--text-secondary)' }}>{g.impact}</span></div>
                      <div style={{ marginBottom: '12px' }}><strong style={{ color: 'var(--text-primary)' }}>Resolution Benefit:</strong> <span style={{ color: 'var(--text-secondary)' }}>{g.benefit}</span></div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {g.category.map((c, i) => <Badge key={i} text={c} color="gray" />)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
              No open compliance gaps detected. Your library is fully covered!
            </div>
          )}
        </div>

      </div>

      {/* Remediation Output */}
      {remediationPlan && (
        <div id="remediation-output" style={{ marginTop: '20px' }}>
          <div className="card" style={{ border: '1px solid var(--border-success)', background: 'rgba(46, 204, 113, 0.02)' }}>
            <div className="card-title" style={{ color: 'var(--text-success)' }}>AI Generated Remediation Strategy</div>
            <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {remediationPlan.executive_summary}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {remediationPlan.plan.map((p, idx) => (
                <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-gold-lt)' }}>{p.gap_code}</strong>
                    <Badge text={p.severity.toUpperCase()} color={p.severity === 'critical' ? 'red' : p.severity === 'high' ? 'amber' : 'blue'} />
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Target: {p.recommended_deadline}</span>
                  </div>
                  <div style={{ fontSize: '12.5px', marginBottom: '10px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {p.recommended_action}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-t)', paddingTop: '8px' }}>
                    Suggested Owner: <strong>{p.suggested_owner}</strong> &nbsp;·&nbsp; Estimated Effort: <strong>{p.estimated_effort}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>✓ Total estimated resolution effort:</span>
              <span style={{ color: 'var(--accent-gold-lt)' }}>{remediationPlan.total_effort_estimate}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
