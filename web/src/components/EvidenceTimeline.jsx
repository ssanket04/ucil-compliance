import React from 'react';

export default function EvidenceTimeline({ items }) {
  const dots = { info: 'dot-info', warning: 'dot-warning', success: 'dot-success', danger: 'dot-danger' };
  return (
    <div className="ev-timeline">
      {items.map((t, index) => (
        <div className="ev-timeline-item" key={index}>
          <div className={`ev-tl-dot ${dots[t.type] || ''}`}></div>
          <div className="ev-tl-body">
            <div className="ev-tl-title">{t.action}</div>
            <div className="ev-tl-time">{t.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
