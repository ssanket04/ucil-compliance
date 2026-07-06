import React, { useState, useEffect } from 'react';

import { fetchConflicts, updateConflictStatus } from '../supabaseClient';
import Badge from '../components/Badge';
import PageLoader from '../components/PageLoader';

export default function Conflicts({ onNavigate }) {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  const applyStatus = async (code, status) => {
    setActionMsg('');
    setActionErr('');
    try {
      await updateConflictStatus(code, status);
      setConflicts(prev => prev.map(c => (c.id === code ? { ...c, status } : c)));
      setActionMsg(status === 'Resolved'
        ? `${code} marked as Resolved.`
        : `${code} escalated to CISO (Under Review).`);
    } catch (err) {
      setActionErr(`Action failed for ${code}: ${err.message}`);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadConflicts() {
      try {
        const conflictsRaw = await fetchConflicts();
        if (!isMounted) return;
        const mappedConflicts = conflictsRaw.length ? conflictsRaw.map(c => ({
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
        })) : [];

        setConflicts(mappedConflicts);
      } catch (err) {
        console.error('Error loading conflicts:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadConflicts();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <PageLoader message="Loading compliance conflicts..." />;
  }

  return (
    <>
      {/* Top Banner Alert (Only visible when conflicts exist) */}
      {conflicts.length > 0 && (
        <div className="banner banner-danger" style={{ marginBottom: '20px' }}>
          <div className="banner-icon" style={{ fontSize: '20px' }}>⚠</div>
          <div className="banner-body">
            <div className="banner-title" style={{ color: 'var(--text-danger)', fontSize: '13.5px', fontWeight: 'bold' }}>
              {conflicts.length} Compliance Conflicts Detected
            </div>
            <div className="banner-text" style={{ color: 'var(--text-secondary)' }}>
              Conflicting requirements identified between active compliance frameworks. Review each conflict and apply the recommended resolution parameters or escalate.
            </div>
          </div>
        </div>
      )}

      {actionErr && <div className="banner banner-danger" style={{ marginBottom: '16px' }}>{actionErr}</div>}
      {actionMsg && <div className="banner banner-success" style={{ marginBottom: '16px' }}>{actionMsg}</div>}

      {/* Conflicts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {conflicts.length > 0 ? (
          conflicts.map((c) => (
            <div className="conflict-card" key={c.id}>
              <div className="conflict-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '16px', color: 'var(--text-danger)' }}>⚠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.id} — {c.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Status: <strong style={{ color: 'var(--text-danger)' }}>{c.status}</strong>
                  </div>
                </div>
                <Badge text={c.partialStatus.includes('Non-compliant') ? 'Partial Compliance' : 'Review Required'} color="amber" />
              </div>

              <div className="conflict-body">
                {/* Conflict Columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{c.policy1}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{c.req1}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{c.policy2}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{c.req2}</div>
                  </div>
                </div>

                {/* Status Notice */}
                <div style={{ background: 'rgba(245, 158, 11, 0.04)', border: '1px solid var(--border-warning)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-warning)', lineHeight: 1.5 }}>
                  <strong>Current Status Impact:</strong> {c.partialStatus}
                </div>

                {/* Explanation */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Conflict Rationale</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.explanation}</div>
                </div>

                {/* Affected Controls */}
                {c.affectedControls.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Impacted Control Identifiers</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {c.affectedControls.map((id) => (
                        <span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => onNavigate('library')} key={id}>{id}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Resolution */}
                <div style={{ background: 'rgba(46, 204, 113, 0.04)', border: '1px solid var(--border-success)', borderRadius: 'var(--r-md)', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>💡 AI Suggested Resolution Strategy</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-success)', lineHeight: 1.6 }}>{c.resolution}</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-success" disabled={c.status === 'Resolved'} onClick={() => applyStatus(c.id, 'Resolved')}>✓ Execute Resolution</button>
                  <button className="btn btn-sm btn-danger" disabled={c.status === 'Under Review'} onClick={() => applyStatus(c.id, 'Under Review')}>↩ Escalate to CISO</button>
                  <button className="btn btn-sm btn-info" onClick={() => onNavigate('gaps')}>View Related Gaps →</button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🛡️</div>
            <div style={{ fontSize: '13.5px', fontWeight: 600 }}>No policy or standard conflicts identified.</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', maxWidth: '340px', margin: '6px auto 0' }}>
              The system automatically scans for conflicting metrics or rules during upload. Your compliance baseline is in alignment.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
