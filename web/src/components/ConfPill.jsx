import React from 'react';

export default function ConfPill({ value }) {
  const cls = value >= 0.85 ? 'conf-hi' : value >= 0.65 ? 'conf-mid' : 'conf-lo';
  const formatted = typeof value === 'number' ? value.toFixed(2) : value;
  return <span className={`conf-pill ${cls}`}>{formatted}</span>;
}
