import React from 'react';

export default function MetricCard({ label, value, delta, deltaType, onClick }) {
  const dc = deltaType === 'good' ? 'text-success' : deltaType === 'warn' ? 'text-warning' : 'text-danger';
  return (
    <div className={`metric-card ${onClick ? '' : 'non-clickable'}`} onClick={onClick}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {delta && <div className={`metric-delta ${dc}`}>{delta}</div>}
    </div>
  );
}
