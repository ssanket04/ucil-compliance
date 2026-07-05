import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchDomainStats, fetchAllEvidence, fetchGaps } from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';
import RemarkBlock from '../components/RemarkBlock';

export default function DomainHead({ onNavigate }) {
  const [domains, setDomains] = useState([]);
  const [evidenceByControl, setEvidenceByControl] = useState({});
  const [gapByCode, setGapByCode] = useState({});
  const [totalControlsCount, setTotalControlsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedDomains, setExpandedDomains] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [controlsRaw, allEvidence, allGaps] = await Promise.all([
          fetchDomainStats(),
          fetchAllEvidence(),
          fetchGaps(),
        ]);

        const gMap = {};
        allGaps.forEach(g => { gMap[g.gap_code] = g; });
        setGapByCode(gMap);

        const evMap = {};
        allEvidence.forEach(ev => {
          if (!evMap[ev.control_id]) evMap[ev.control_id] = [];
          evMap[ev.control_id].push(ev);
        });
        setEvidenceByControl(evMap);

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

        setTotalControlsCount(source.length);

        const dStats = {};
        source.forEach(c => {
          const key = c.domain_name;
          if (!dStats[key]) {
            dStats[key] = {
              name: key,
              head: c.domain_head_name,
              totalControls: 0,
              active: 0,
              underReview: 0,
              failed: 0,
              controls: []
            };
          }
          dStats[key].totalControls++;
          if (c.status === 'Active')            dStats[key].active++;
          else if (c.status === 'Under Review') dStats[key].underReview++;
          else if (c.status === 'Failed')       dStats[key].failed++;
          dStats[key].controls.push(c);
        });

        setDomains(Object.values(dStats));
      } catch (err) {
        console.error('Error loading Domain Head View:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading Domain Head View...</div>;
  }

  const totalActive      = domains.reduce((s, d) => s + d.active, 0);
  const totalUnderReview = domains.reduce((s, d) => s + d.underReview, 0);
  const totalFailed      = domains.reduce((s, d) => s + d.failed, 0);

  const toggleDomain = (name) => {
    setExpandedDomains(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      <div className="card" style={{ background: 'var(--bg-info)', borderColor: 'var(--border-info)', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-info)', marginBottom: '4px' }}>Total Unique Controls</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-info)', lineHeight: 1 }}>{totalControlsCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-info)', marginTop: '2px' }}>= Dashboard Unique Canonical = Library Total</div>
          </div>
          <div style={{ flex: 1, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {domains.map((d, idx) => (
              <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--r-md)', padding: '8px 12px' }} key={idx}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>{d.name}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.totalControls}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--r-md)', padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-success)', marginBottom: '2px' }}>Active</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-success)' }}>{totalActive}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-success)', marginTop: '1px' }}>= Dashboard Implemented</div>
            </div>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--r-md)', padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-warning)', marginBottom: '2px' }}>Under Review</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-warning)' }}>{totalUnderReview}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-warning)', marginTop: '1px' }}>= Dashboard In Progress</div>
            </div>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--r-md)', padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-danger)', marginBottom: '2px' }}>Failed / Gaps</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-danger)' }}>{totalFailed}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-danger)', marginTop: '1px' }}>= Dashboard Gaps</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Domain overview — access all controls and evidence under your domain</div>
        {domains.map((d, idx) => {
          const isExpanded = expandedDomains[d.name];

          return (
            <div key={idx}>
              <div className="domain-stat-row">
                <div>
                  <div className="domain-stat-name">{d.name}</div>
                  <div className="domain-stat-meta">Domain Head: {d.head} · {d.totalControls} controls</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {d.active > 0 && <Badge text={`${d.active} active`} color="green" />}
                  {d.underReview > 0 && <Badge text={`${d.underReview} under review`} color="amber" />}
                  {d.failed > 0 && <Badge text={`${d.failed} failed / gaps`} color="red" />}
                </div>
                <button className="btn-sm btn-info" onClick={() => toggleDomain(d.name)}>
                  {isExpanded ? 'Hide controls' : 'View controls →'}
                </button>
              </div>
              {isExpanded && (
                <div style={{ padding: '0 0 10px 14px', borderLeft: '2px solid var(--border-t)', margin: '0 0 10px 8px' }}>
                  {d.controls.map((c) => {
                    const evList = evidenceByControl[c.id] || [];
                    const latestEv = evList[0] || null;
                    const gap = gapByCode[c.control_code] || null;
                    const isFailed = c.status === 'Failed';

                    const evStatuses = evList.map(e => e.status);
                    const evOverall = evStatuses.includes('Rejected') ? 'Rejected'
                      : evStatuses.includes('Reassigned') ? 'Reassigned'
                      : evStatuses.includes('Under Review') ? 'Under Review'
                      : evStatuses.includes('Pending') ? 'Pending'
                      : evStatuses.length > 0 ? 'Approved' : null;

                    return (
                      <div key={c.control_code} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '12px', marginBottom: '8px', borderLeft: isFailed ? '3px solid var(--border-danger)' : '' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{c.control_code}</div>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{c.name}</div>
                          </div>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <StatusBadge status={c.status} />
                            {evOverall ? (
                              <Badge text={`Evidence: ${evOverall}`} color={evOverall === 'Approved' ? 'green' : evOverall === 'Rejected' ? 'red' : 'amber'} />
                            ) : (
                              <Badge text="No evidence" color="gray" />
                            )}
                            {isFailed && (
                              <Badge text={gap ? (gap.severity.charAt(0).toUpperCase() + gap.severity.slice(1) + ' gap') : 'Gap'} color={gap && gap.severity === 'critical' ? 'red' : 'amber'} />
                            )}
                          </div>
                        </div>
                        {isFailed && (
                          <div style={{ background: 'var(--bg-danger)', border: '0.5px solid var(--border-danger)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: '8px', fontSize: '11px', color: 'var(--text-danger)' }}>
                            <strong>Gap:</strong> {gap ? gap.description : 'Control failed — gap record pending.'}
                          </div>
                        )}
                        {c.status_reason && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{c.status_reason}</div>
                        )}
                        {latestEv ? (
                          <>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                              {evList.length} file(s) · Latest: {latestEv.file_name} · {latestEv.upload_date ? new Date(latestEv.upload_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                            </div>
                            <RemarkBlock title="Manual remarks" icon="✍️" content={latestEv.manual_remark} type="manual" />
                            <RemarkBlock title="AI Verdict" icon="🤖" content={latestEv.ai_verdict} type="ai" />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                              {(evOverall === 'Under Review' || evOverall === 'Approved') && (
                                <>
                                  <button className="btn-sm btn-success">✓ Approve (Domain Head)</button>
                                  <button className="btn-sm btn-danger">↩ Reject & Return</button>
                                </>
                              )}
                              <button className="btn-sm btn-info" onClick={() => onNavigate('evidence', { controlId: c.control_code })}>View full evidence →</button>
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>No evidence uploaded yet.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
