import React, { useState } from 'react';
import { DATA } from '../data';
import MetricCard from '../components/MetricCard';
import ConfPill from '../components/ConfPill';
import Badge from '../components/Badge';

export default function Mapping({ controlId }) {
  const [selectedId, setSelectedId] = useState(controlId || null);

  const selectedMapping = DATA.mappings.find(m => m.id === selectedId);

  return (
    <>
      {/* Banner info */}
      <div className="card" style={{ background: 'rgba(59, 124, 244, 0.02)', border: '1px solid var(--border-info)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'var(--font-heading)', color: 'var(--text-info)', lineHeight: 1 }}>1 → 5.2×</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Average Efficiency Multiplier</div>
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              On average, implementing <strong>1 canonical control</strong> satisfies <strong>5.2 separate framework requirements</strong>.
              Click any control row below to review mapping rules and details.
            </div>
          </div>

          <div style={{ textAlign: 'right', marginRight: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-info)' }}>4,128 mappings</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>from 1,204 canonical controls</div>
          </div>
        </div>
      </div>

      {/* Grid Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <MetricCard label="Total mappings" value="4,128" delta="↑ 340 this week" deltaType="good" />
        <MetricCard label="Auto-approved" value="3,876" delta="93.9% of inventory" deltaType="good" />
        <MetricCard label="Avg. framework ratio" value="5.2×" delta="Test once, satisfy 5" deltaType="good" />
        <MetricCard label="Conflicts flagged" value="19" delta="Requires SME review" deltaType="warn" />
      </div>

      {/* Selected Details */}
      {selectedMapping && (
        <div className="card" id="map-detail-box" style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-gold)', marginBottom: '16px' }}>
          <div className="card-title" style={{ color: 'var(--accent-gold-lt)' }}>Detail: {selectedMapping.id} — {selectedMapping.name}</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '6px' }}><strong style={{ color: 'var(--text-primary)' }}>Canonical requirement:</strong> {selectedMapping.canon}</div>
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Mapped clauses:</strong>&nbsp;
              <span className="badge badge-gray">ISO {selectedMapping.iso}</span>&nbsp;
              <span className="badge badge-gray">NIST {selectedMapping.nist}</span>&nbsp;
              <span className="badge badge-gray">RBI {selectedMapping.rbi}</span>&nbsp;
              <span className="badge badge-gray">SOX {selectedMapping.sox}</span>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>AI Confidence:</strong> <ConfPill value={selectedMapping.conf} />
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <strong style={{ color: 'var(--text-primary)' }}>Efficiency Multiplier:</strong> satisfies {selectedMapping.satisfies} frameworks
            </div>
          </div>
        </div>
      )}

      {/* Cross-framework Mapping Table */}
      <div className="card">
        <div className="card-title">Cross-Framework Mapping Registry</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Control ID</th>
                <th style={{ width: '160px' }}>Control Title</th>
                <th>Canonical Requirement</th>
                <th style={{ width: '90px' }}>ISO 27001</th>
                <th style={{ width: '80px' }}>NIST CSF</th>
                <th style={{ width: '80px' }}>RBI CSF</th>
                <th style={{ width: '70px' }}>SOX</th>
                <th style={{ width: '80px' }}>Confidence</th>
                <th style={{ width: '80px' }}>Multiplier</th>
              </tr>
            </thead>
            <tbody>
              {DATA.mappings.map((m) => (
                <tr key={m.id} className="clickable" style={selectedId === m.id ? { background: 'rgba(255, 255, 255, 0.03)' } : {}} onClick={() => setSelectedId(m.id)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--accent-gold-lt)', fontWeight: 'bold' }}>{m.id}</td>
                  <td style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{m.canon}</td>
                  <td style={{ fontSize: '11px' }}>{m.iso}</td>
                  <td style={{ fontSize: '11px' }}>{m.nist}</td>
                  <td style={{ fontSize: '11px' }}>{m.rbi}</td>
                  <td style={{ fontSize: '11px' }}>{m.sox}</td>
                  <td><ConfPill value={m.conf} /></td>
                  <td><Badge text={`${m.mult}×`} color={m.multColor} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
