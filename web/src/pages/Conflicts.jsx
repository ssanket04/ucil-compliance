import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchConflicts } from '../supabaseClient';
import Badge from '../components/Badge';

export default function Conflicts({ onNavigate }) {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConflicts() {
      try {
        const conflictsRaw = await fetchConflicts();
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
        })) : DATA.conflicts;

        setConflicts(mappedConflicts);
      } catch (err) {
        console.error('Error loading conflicts:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConflicts();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading conflicts...</div>;
  }

  return (
    <>
      {/* Top Banner Alert */}
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

      {/* Conflicts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {conflicts.map((c) => (
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
                <button className="btn btn-sm btn-success">✓ Execute Resolution</button>
                <button className="btn btn-sm btn-danger">↩ Escalate to CISO</button>
                <button className="btn btn-sm btn-info" onClick={() => onNavigate('gaps')}>View Related Gaps →</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
