import React from 'react';

export default function MetricCard({ label, value, delta, deltaType, onClick }) {
  const dc = deltaType === 'good' ? 'text-success' : deltaType === 'warn' ? 'text-warning' : 'text-danger';
  const deltaArrow = deltaType === 'good' ? '↑' : deltaType === 'bad' ? '↓' : '•';
  
  return (
    <div className={`metric-card ${onClick ? '' : 'non-clickable'}`} onClick={onClick}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {delta && (
        <div className={`metric-delta ${dc}`} style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontWeight: 'bold' }}>{deltaArrow}</span>
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}
