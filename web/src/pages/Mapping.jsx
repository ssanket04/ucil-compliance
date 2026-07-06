import React, { useState } from 'react';
import MetricCard from '../components/MetricCard';
import ConfPill from '../components/ConfPill';
import Badge from '../components/Badge';

export default function Mapping({ controlId }) {
  const [selectedId, setSelectedId] = useState(controlId || null);

  const selectedMapping = null;

  return (
    <>
      {/* Banner info */}
      <div className="card" style={{ background: 'rgba(59, 124, 244, 0.02)', border: '1px solid var(--border-info)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'var(--font-heading)', color: 'var(--text-info)', lineHeight: 1 }}>1 → 1.0×</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Average Efficiency Multiplier</div>
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Average ratio of canonical controls to satisfied requirements. Ingest frameworks to view mappings.
            </div>
          </div>

          <div style={{ textAlign: 'right', marginRight: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-info)' }}>0 mappings</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>from 0 canonical controls</div>
          </div>
        </div>
      </div>

      {/* Grid Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <MetricCard label="Total mappings" value="0" delta="↑ 0 this week" deltaType="good" />
        <MetricCard label="Auto-approved" value="0" delta="0% of inventory" deltaType="good" />
        <MetricCard label="Avg. framework ratio" value="1.0×" delta="Test once, satisfy 1" deltaType="good" />
        <MetricCard label="Conflicts flagged" value="0" delta="Requires SME review" deltaType="good" />
      </div>

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
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                  No framework mappings registered. Ingest standard frameworks to populate.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
