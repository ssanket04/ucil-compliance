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
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading regulatory updates...</div>;
  }

  const selected = changes.find(c => c.id === selectedId) || null;

  return (
    <>
      <div className="card">
        <div className="card-title">Regulatory change log</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Circular / Update</th>
                <th style={{ width: '15%' }}>Issued</th>
                <th style={{ width: '15%' }}>Impacted</th>
                <th style={{ width: '30%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setSelectedId(r.id)} style={selectedId === r.id ? { background: 'var(--bg-secondary)' } : {}}>
                  <td>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.title}</div>
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.date}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {r.impactedControls}{r.gaps > 0 ? ` · ${r.gaps} gaps` : ''}
                  </td>
                  <td>
                    <button className="btn-sm btn-info" onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}>
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div id="regulatory-detail">
          <div className="row">
            <div className="col">
              <div className="card">
                <div className="card-title">Impacted controls</div>
                <div className="card-subtitle">Controls affected by {selected.id} ({selected.impactedIds.length} total)</div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {selected.impactedIds.length ? (
                    selected.impactedIds.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '0.5px solid var(--border-t)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{c.control_code}</div>
                        <div style={{ fontSize: '12px', fontWeight: 500, flex: 1 }}>{c.name}</div>
                        <StatusBadge status={c.status} />
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '10px 0' }}>No impacted controls recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="col">
              <div className="card">
                <div className="card-title">Unmatched controls</div>
                <div className="card-subtitle">New requirements with no existing control mapping</div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {selected.unmatched.length ? (
                    selected.unmatched.map((u, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '0.5px solid var(--border-t)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{u.unifiedId || u.ref || '—'}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>{u.ref || ''}</div>
                        <div style={{ fontSize: '12px', flex: 1 }}>{u.desc || u.description || '—'}</div>
                        <Badge text="No mapping" color="red" />
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '10px 0' }}>No unmatched clauses recorded.</div>
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
