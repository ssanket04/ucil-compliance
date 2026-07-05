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
      <div className="banner banner-info">
        <div className="banner-icon">📊</div>
        <div className="banner-body" style={{ flex: 1 }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-info)', lineHeight: 1 }}>1 → 5.2×</div>
          <div style={{ fontSize: '12px', color: 'var(--text-info)', marginTop: '4px' }}>On average, implementing 1 canonical control satisfies 5.2 framework requirements. Click any row to see its exact multiplier and all satisfied frameworks.</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-info)' }}>4,128 total mappings</div>
          <div style={{ fontSize: '11px', color: 'var(--text-info)' }}>from 1,204 canonical controls</div>
        </div>
      </div>

      <div className="grid-4">
        <MetricCard label="Total mappings" value="4,128" delta="↑ 340 this week" deltaType="good" />
        <MetricCard label="Auto-approved" value="3,876" delta="93.9% of all mappings" deltaType="good" />
        <MetricCard label="Avg. frameworks / control" value="5.2×" delta="Test once, satisfy 5" deltaType="good" />
        <MetricCard label="Conflicts flagged" value="19" delta="Require SME review" deltaType="warn" />
      </div>

      {selectedMapping && (
        <div className="map-detail-box" id="map-detail-box">
          <div className="map-detail-title">{selectedMapping.id} — {selectedMapping.name}</div>
          <div className="map-detail-body">
            <strong>Canonical requirement:</strong> {selectedMapping.canon}<br />
            <strong>Framework clauses:</strong> ISO {selectedMapping.iso} · NIST {selectedMapping.nist} · RBI {selectedMapping.rbi} · SOX {selectedMapping.sox}<br />
            <strong>AI confidence:</strong> {selectedMapping.conf} &nbsp;|&nbsp; <strong>Impact multiplier:</strong> satisfies {selectedMapping.satisfies}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Cross-framework mapping — click a row to see full detail</div>
        <div className="table-wrap">
          <table className="data-table" style={{ tableLayout: 'fixed', minWidth: '780px' }}>
            <thead>
              <tr>
                <th style={{ width: '85px' }}>Control ID</th>
                <th style={{ width: '140px' }}>Control name</th>
                <th style={{ width: '170px' }}>Canonical requirement</th>
                <th style={{ width: '85px' }}>ISO 27001</th>
                <th style={{ width: '72px' }}>NIST CSF</th>
                <th style={{ width: '65px' }}>RBI CSF</th>
                <th style={{ width: '60px' }}>SOX</th>
                <th style={{ width: '66px' }}>Confidence</th>
                <th style={{ width: '72px' }}>Multiplier</th>
              </tr>
            </thead>
            <tbody>
              {DATA.mappings.map((m) => (
                <tr key={m.id} className="clickable" style={selectedId === m.id ? { background: 'var(--bg-info)' } : {}} onClick={() => setSelectedId(m.id)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{m.id}</td>
                  <td style={{ fontSize: '12px', fontWeight: 600 }}>{m.name}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{m.canon}</td>
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
