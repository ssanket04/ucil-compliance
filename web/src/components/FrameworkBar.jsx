import React from 'react';
import StatusBadge from './StatusBadge';

export function FrameworkBar({ name, satisfied, partial, missing, status }) {
  return (
    <div className="fw-row">
      <div className="fw-name">{name}</div>
      <div className="split-bar" style={{ flex: 1, borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
        <div className="split-satisfied" style={{ width: `${satisfied}%` }}></div>
        <div className="split-partial" style={{ width: `${partial}%` }}></div>
        <div className="split-unsatisfied" style={{ width: `${missing}%`, background: 'var(--bg-secondary)' }}></div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '120px', textAlign: 'right', flexShrink: 0 }}>
        {satisfied}% full · {partial}% partial
      </div>
      <div className="fw-status-col"><StatusBadge status={status} /></div>
    </div>
  );
}

export function PartialBar({ name, satisfied, partial, missing }) {
  return (
    <div className="fw-row">
      <div className="fw-name">{name}</div>
      <div className="split-bar" style={{ flex: 1, borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
        <div className="split-satisfied" style={{ width: `${satisfied}%` }}></div>
        <div className="split-partial" style={{ width: `${partial}%` }}></div>
        <div className="split-unsatisfied" style={{ width: `${missing}%`, background: 'var(--bg-secondary)' }}></div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '100px', textAlign: 'right', flexShrink: 0 }}>
        {satisfied}% full · {partial}% partial
      </div>
    </div>
  );
}
