import React, { useState, useEffect } from 'react';

import { fetchControls, fetchAllEvidence, fetchGaps, approveEvidence, rejectEvidence } from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';
import RemarkBlock from '../components/RemarkBlock';
import PageLoader from '../components/PageLoader';

export default function DomainHead({ onNavigate }) {
  const [domains, setDomains] = useState([]);
  const [evidenceByControl, setEvidenceByControl] = useState({});
  const [gapByCode, setGapByCode] = useState({});
  const [totalControlsCount, setTotalControlsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedDomains, setExpandedDomains] = useState({});

  const loadData = async (isMounted = true) => {
    try {
      const [controlsRaw, allEvidence, allGaps] = await Promise.all([
        fetchControls(),
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

      const source = controlsRaw.length ? controlsRaw : [];


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

      if (isMounted) {
        setDomains(Object.values(dStats));
      }
    } catch (err) {
      console.error('Error loading Domain Head View:', err);
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      await loadData(isMounted);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleApprove = async (evidenceId) => {
    try {
      await approveEvidence(evidenceId);
      alert('Evidence approved successfully!');
      await loadData();
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  };

  const handleReject = async (evidenceId) => {
    const reason = prompt('Please enter a rejection reason:');
    if (!reason?.trim()) return;
    try {
      await rejectEvidence(evidenceId, reason, '');
      alert('Evidence returned/rejected successfully!');
      await loadData();
    } catch (err) {
      alert('Rejection failed: ' + err.message);
    }
  };

  if (loading) {
    return <PageLoader message="Loading domain coverage view..." />;
  }

  const totalActive      = domains.reduce((s, d) => s + d.active, 0);
  const totalUnderReview = domains.reduce((s, d) => s + d.underReview, 0);
  const totalFailed      = domains.reduce((s, d) => s + d.failed, 0);

  const toggleDomain = (name) => {
    setExpandedDomains(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      {/* Top Banner Card */}
      <div className="card" style={{ background: 'rgba(59, 124, 244, 0.02)', border: '1px solid var(--border-info)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Unique Controls</div>
            <div style={{ fontSize: '36px', fontWeight: 600, fontFamily: 'var(--font-heading)', background: 'linear-gradient(135deg, #FFF 30%, var(--accent-gold-lt) 100%)', webkitBackgroundClip: 'text', webkitTextFillColor: 'transparent', lineHeight: 1 }}>{totalControlsCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Matches Unified Inventory</div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {domains.map((d, idx) => (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '10px 14px' }} key={idx}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{d.name}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.totalControls}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-success)', borderRadius: 'var(--r-md)', padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Active</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-success)' }}>{totalActive}</div>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-warning)', borderRadius: 'var(--r-md)', padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-warning)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Review</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-warning)' }}>{totalUnderReview}</div>
            </div>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-danger)', borderRadius: 'var(--r-md)', padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Failed</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-danger)' }}>{totalFailed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="card">
        <div className="card-title">Domain Head Overview</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {domains.length > 0 ? (
            domains.map((d, idx) => {
              const isExpanded = expandedDomains[d.name];


            return (
              <div key={idx} style={{ borderBottom: '1px solid var(--border-t)', paddingBottom: isExpanded ? '14px' : '0' }}>
                <div className="domain-stat-row">
                  <div style={{ flex: 1 }}>
                    <div className="domain-stat-name">{d.name}</div>
                    <div className="domain-stat-meta" style={{ marginTop: '2px' }}>Domain Head: <strong>{d.head}</strong> &nbsp;·&nbsp; {d.totalControls} controls managed</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '16px' }}>
                    {d.active > 0 && <Badge text={`${d.active} active`} color="green" />}
                    {d.underReview > 0 && <Badge text={`${d.underReview} pending`} color="amber" />}
                    {d.failed > 0 && <Badge text={`${d.failed} failed`} color="red" />}
                  </div>
                  <button className="btn btn-sm" onClick={() => toggleDomain(d.name)}>
                    {isExpanded ? 'Hide Controls' : 'View Controls'}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ padding: '12px 0 0 16px', borderLeft: '2px solid var(--border-s)', margin: '8px 0 0 8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                        <div key={c.control_code} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '16px', borderLeft: isFailed ? '3px solid var(--text-danger)' : '' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-gold-lt)', fontWeight: 'bold' }}>{c.control_code}</div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <StatusBadge status={c.status} />
                              {evOverall ? (
                                <Badge text={`Evidence: ${evOverall}`} color={evOverall === 'Approved' ? 'green' : evOverall === 'Rejected' ? 'red' : 'amber'} />
                              ) : (
                                <Badge text="No evidence" color="gray" />
                              )}
                              {isFailed && (
                                <Badge text={gap ? `${gap.severity.toUpperCase()} gap` : 'Gap'} color={gap && gap.severity === 'critical' ? 'red' : 'amber'} />
                              )}
                            </div>
                          </div>

                          {isFailed && (
                            <div className="banner banner-danger" style={{ padding: '10px 14px', marginBottom: '10px', borderRadius: '6px' }}>
                              <div className="banner-icon">⚠</div>
                              <div className="banner-body">
                                <div className="banner-title" style={{ fontSize: '11.5px' }}>Gap Detected</div>
                                <div className="banner-text" style={{ fontSize: '11px' }}>{gap ? gap.description : 'Control failed — gap record pending.'}</div>
                              </div>
                            </div>
                          )}

                          {c.status_reason && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>{c.status_reason}</div>
                          )}

                          {latestEv ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {evList.length} files attached · Latest: <strong>{latestEv.file_name}</strong> · Uploaded {latestEv.upload_date ? new Date(latestEv.upload_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <RemarkBlock title="Manual Remarks" icon="✍️" content={latestEv.manual_remark} type="manual" />
                                <RemarkBlock title="AI Compliance Verdict" icon="🤖" content={latestEv.ai_verdict} type="ai" />
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                {(evOverall === 'Under Review' || evOverall === 'Approved') && (
                                  <>
                                    <button className="btn btn-sm btn-success" onClick={() => handleApprove(latestEv.id)}>✓ Approve Evidence</button>
                                    <button className="btn btn-sm btn-danger" onClick={() => handleReject(latestEv.id)}>↩ Return to Owner</button>
                                  </>
                                )}
                                <button className="btn btn-sm btn-info" onClick={() => onNavigate('evidence', { controlId: c.control_code })}>View Full Evidence Folder →</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>No evidence files uploaded for this control.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
            No compliance domains or controls registered yet. Ingest a circular to begin.
          </div>
        )}
        </div>
      </div>

    </>
  );
}
