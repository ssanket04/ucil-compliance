import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchRegulatoryChanges, fetchControls } from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';

export default function Regulatory() {
  const [changes, setChanges] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRegulatory() {
      try {
        const [regulatory, allControls] = await Promise.all([
          fetchRegulatoryChanges(),
          fetchControls(),
        ]);

        const controlByUUID = {};
        allControls.forEach(c => { controlByUUID[c.id] = c; });

        const mappedChanges = regulatory.length ? regulatory.map(r => {
          let impactedIds = [];
          if (r.impacted_control_ids && r.impacted_control_ids.length > 0) {
            impactedIds = r.impacted_control_ids.map(uid => controlByUUID[uid]).filter(Boolean);
          }
          const actualImpactedCount = impactedIds.length;
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

        setChanges(mappedChanges);
        if (mappedChanges.length > 0) {
          setSelectedId(mappedChanges[0].id);
        }
      } catch (err) {
        console.error('Error loading regulatory changes:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRegulatory();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading regulatory updates...</div>;
  }

  const selected = changes.find(c => c.id === selectedId) || null;

  return (
    <>
      {/* Regulatory Change Log Card */}
      <div className="card">
        <div className="card-title">Regulatory Change Log</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Circular ID & Title</th>
                <th style={{ width: '15%' }}>Issued Date</th>
                <th style={{ width: '20%' }}>Impacted Entities</th>
                <th style={{ width: '20%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setSelectedId(r.id)} style={selectedId === r.id ? { background: 'rgba(255, 255, 255, 0.03)' } : {}}>
                  <td>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.title}</div>
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.date}</td>
                  <td style={{ fontSize: '12px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-gold-lt)' }}>{r.impactedControls} controls</span>
                    {r.gaps > 0 && <span style={{ color: 'var(--text-danger)', marginLeft: '6px' }}>({r.gaps} gaps)</span>}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-info" onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}>
                      View Impact Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Circular Details */}
      {selected && (
        <div id="regulatory-detail" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="bento-grid">
            {/* Impacted Controls */}
            <div className="col-6">
              <div className="card" style={{ height: '100%', marginBottom: 0 }}>
                <div className="card-title">Impacted Controls Inventory</div>
                <div className="card-subtitle">Active controls affected by circular {selected.id} ({selected.impactedIds.length} controls)</div>
                
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                  {selected.impactedIds.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selected.impactedIds.map((c, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--accent-gold-lt)', fontWeight: 'bold' }}>{c.control_code}</div>
                          <div style={{ fontSize: '12px', fontWeight: 500, flex: 1, color: 'var(--text-primary)' }}>{c.name}</div>
                          <StatusBadge status={c.status} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '20px 0', textAlign: 'center' }}>No active controls mapped to this update.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Unmatched Clauses (Gaps) */}
            <div className="col-6">
              <div className="card" style={{ height: '100%', marginBottom: 0 }}>
                <div className="card-title">Unmapped Circular Clauses</div>
                <div className="card-subtitle">Clauses extracted from circular that have no matching controls</div>
                
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                  {selected.unmatched.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selected.unmatched.map((u, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)' }}>
                          <div style={{ flexShrink: 0 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{u.unifiedId || u.ref || '—'}</div>
                            {u.ref && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{u.ref}</div>}
                          </div>
                          <div style={{ fontSize: '12px', flex: 1, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            {u.desc || u.description || '—'}
                          </div>
                          <Badge text="No Mapping" color="red" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '20px 0', textAlign: 'center' }}>No unmapped regulatory requirements found. All mapped.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
