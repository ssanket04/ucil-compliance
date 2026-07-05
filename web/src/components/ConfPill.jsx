import React from 'react';

export default function ConfPill({ value }) {
  const cls = value >= 0.85 ? 'conf-hi' : value >= 0.50 ? 'conf-mid' : 'conf-lo';
  const formatted = typeof value === 'number' ? `${Math.round(value * 100)}%` : value;
  
  return (
    <span className={`conf-pill ${cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '9px', opacity: 0.6 }}>AI</span>
      <span>{formatted}</span>
    </span>
  );
}
