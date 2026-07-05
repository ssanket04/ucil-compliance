import React from 'react';
import StatusBadge from './StatusBadge';

export function FrameworkBar({ name, satisfied, partial, missing, status }) {
  return (
    <div className="fw-row">
      <div className="fw-name">{name}</div>
      <div className="split-bar">
        <div className="split-satisfied" style={{ width: `${satisfied}%` }} title={`Satisfied: ${satisfied}%`}></div>
        <div className="split-partial" style={{ width: `${partial}%` }} title={`Partial: ${partial}%`}></div>
        <div className="split-unsatisfied" style={{ width: `${missing}%` }} title={`Missing: ${missing}%`}></div>
      </div>
      <div className="fw-pct">
        {satisfied}%
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '90px', textAlign: 'right', flexShrink: 0 }}>
        {partial}% partial
      </div>
      <div className="fw-status-col"><StatusBadge status={status} /></div>
    </div>
  );
}

export function PartialBar({ name, satisfied, partial, missing }) {
  return (
    <div className="fw-row">
      <div className="fw-name">{name}</div>
      <div className="split-bar">
        <div className="split-satisfied" style={{ width: `${satisfied}%` }} title={`Satisfied: ${satisfied}%`}></div>
        <div className="split-partial" style={{ width: `${partial}%` }} title={`Partial: ${partial}%`}></div>
        <div className="split-unsatisfied" style={{ width: `${missing}%` }} title={`Missing: ${missing}%`}></div>
      </div>
      <div className="fw-pct">
        {satisfied}%
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '80px', textAlign: 'right', flexShrink: 0 }}>
        {partial}% part
      </div>
    </div>
  );
}
