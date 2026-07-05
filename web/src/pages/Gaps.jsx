import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchGaps, generateRemediationPlan } from '../supabaseClient';
import MetricCard from '../components/MetricCard';
import Badge from '../components/Badge';

export default function Gaps() {
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedGaps, setExpandedGaps] = useState({});
  const [remediationPlan, setRemediationPlan] = useState(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadGaps() {
      try {
        const gapsRaw = await fetchGaps();
        const mappedGaps = gapsRaw.length ? gapsRaw.map(g => ({
          id:       g.gap_code,
          sev:      g.severity,
          desc:     g.description,
          why:      g.why_critical || 'Under assessment.',
          impact:   g.impact_if_unresolved || 'Impact being evaluated.',
          benefit:  g.benefit_if_resolved || 'Benefit being evaluated.',
          category: Array.isArray(g.impact_category) ? g.impact_category : ['Non-financial'],
        })) : DATA.gaps;

        setGaps(mappedGaps);
      } catch (err) {
        console.error('Error loading gaps:', err);
      } finally {
        setLoading(false);
      }
    }
    loadGaps();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading gaps...</div>;
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '14px' }}>
        <MetricCard label="Total gaps" value={counts.all} delta="= Dashboard Gaps = Library Failed" deltaType="bad" />
        <MetricCard label="Critical" value={counts.critical} delta="Immediate action required" deltaType="bad" />
        <MetricCard label="High" value={counts.high} delta="Action required" deltaType="warn" />
        <MetricCard label="Medium" value={counts.medium} delta="Planned remediation" deltaType="info" />
        <MetricCard label="Low" value={counts.low} delta="Monitor" deltaType="good" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div className="pill-bar" style={{ marginBottom: 0, flex: 1 }}>
            <button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({counts.all})</button>
            <button className={`pill ${filter === 'critical' ? 'active-red' : ''}`} onClick={() => setFilter('critical')}>Critical ({counts.critical})</button>
            <button className={`pill ${filter === 'high' ? 'active-amber' : ''}`} onClick={() => setFilter('high')}>High ({counts.high})</button>
            <button className={`pill ${filter === 'medium' ? 'active-blue' : ''}`} onClick={() => setFilter('medium')}>Medium ({counts.medium})</button>
            <button className={`pill ${filter === 'low' ? 'active-green' : ''}`} onClick={() => setFilter('low')}>Low ({counts.low})</button>
          </div>
          <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={generatingPlan}>
            {generatingPlan ? '🤖 AI working…' : '🤖 Generate Remediation Plan'}
          </button>
        </div>

        {errorMsg && <div className="banner banner-danger" style={{ marginBottom: '12px' }}>{errorMsg}</div>}

        <div id="gap-list">
          {filteredGaps.map((g) => {
            const isExpanded = expandedGaps[g.id];
            const borderColor = g.sev === 'critical' ? 'var(--border-danger)'
              : g.sev === 'high' ? 'var(--border-warning)'
              : g.sev === 'medium' ? 'var(--border-info)' : 'var(--border-success)';

            return (
              <div key={g.id} data-sev={g.sev}>
                <div className="gap-row" onClick={() => toggleGapExpand(g.id)}>
                  <div className="gap-id">{g.id}</div>
                  <div className="gap-desc">{g.desc}</div>
                  <Badge text={g.sev.charAt(0).toUpperCase() + g.sev.slice(1)} color={sevColor[g.sev]} />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: '6px' }}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
                {isExpanded && (
                  <div className="gap-expand" style={{ borderLeftColor: borderColor, borderLeftWidth: '3px', borderLeftStyle: 'solid' }}>
                    <div style={{ marginBottom: '8px' }}><strong>Why {g.sev}:</strong> {g.why}</div>
                    <div style={{ marginBottom: '8px' }}><strong>Impact if not resolved:</strong> {g.impact}</div>
                    <div style={{ marginBottom: '10px' }}><strong>Benefit if resolved:</strong> {g.benefit}</div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {g.category.map((c, i) => <Badge key={i} text={c} color="gray" />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {remediationPlan && (
        <div id="remediation-output" style={{ marginTop: '16px' }}>
          <div className="card">
            <div className="card-title">AI Remediation Plan</div>
            <div style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {remediationPlan.executive_summary}
            </div>
            {remediationPlan.plan.map((p, idx) => (
              <div key={idx} style={{ border: '0.5px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.gap_code}</strong>
                  <Badge text={p.severity.charAt(0).toUpperCase() + p.severity.slice(1)} color={p.severity === 'critical' ? 'red' : p.severity === 'high' ? 'amber' : 'blue'} />
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{p.recommended_deadline}</span>
                </div>
                <div style={{ fontSize: '12px', marginBottom: '4px' }}>{p.recommended_action}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Owner: {p.suggested_owner} · Effort: {p.estimated_effort}</div>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: 'var(--text-success)', marginTop: '8px' }}>
              Total effort: {remediationPlan.total_effort_estimate}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
