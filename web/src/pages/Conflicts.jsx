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
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading conflicts...</div>;
  }

  return (
    <>
      <div className="banner banner-danger">
        <div className="banner-icon">⚠</div>
        <div className="banner-body">
          <div className="banner-title" style={{ color: 'var(--text-danger)' }}>
            {conflicts.length} compliance conflicts detected
          </div>
          <div className="banner-text" style={{ color: 'var(--text-danger)' }}>
            Conflicting requirements between frameworks. Review each conflict and apply the suggested resolution or escalate to CISO.
          </div>
        </div>
      </div>

      {conflicts.map((c) => (
        <div className="conflict-card" key={c.id}>
          <div className="conflict-header" style={{ padding: '10px 14px', background: 'var(--bg-danger)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '14px' }}>⚠</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-danger)' }}>{c.id} — {c.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-danger)', marginTop: '2px' }}>Status: <strong>{c.status}</strong></div>
            </div>
            <Badge text={c.partialStatus.includes('Non-compliant') ? 'Partial compliance' : 'Conflict detected'} color="amber" />
          </div>
          <div className="conflict-body" style={{ padding: '12px 14px', background: 'var(--bg-primary)' }}>
            <div className="grid-2" style={{ marginBottom: '14px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>{c.policy1}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{c.req1}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>{c.policy2}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{c.req2}</div>
              </div>
            </div>
            <div style={{ background: 'var(--bg-warning)', border: '0.5px solid var(--border-warning)', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-warning)' }}>
              <strong>Compliance status:</strong> {c.partialStatus}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>CONFLICT EXPLANATION</div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{c.explanation}</div>
            </div>
            {c.affectedControls.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>AFFECTED CONTROLS</div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {c.affectedControls.map((id) => (
                    <span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => onNavigate('library')} key={id}>{id}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ background: 'var(--bg-success)', border: '0.5px solid var(--border-success)', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-success)', marginBottom: '4px' }}>💡 SUGGESTED RESOLUTION</div>
              <div style={{ fontSize: '12px', color: 'var(--text-success)', lineHeight: 1.5 }}>{c.resolution}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn-sm btn-success">Apply resolution</button>
              <button className="btn-sm">Escalate to CISO</button>
              <button className="btn-sm btn-info" onClick={() => onNavigate('gaps')}>View related gaps →</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
