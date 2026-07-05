import React from 'react';

export default function ActivityFeed({ items }) {
  return (
    <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
      {items.map((a, idx) => (
        <div className="activity-item" key={idx}>
          <div className="act-dot" style={{ color: a.color, background: 'currentColor' }}></div>
          <div className="act-text">{a.text}</div>
          <div className="act-time">{a.time}</div>
        </div>
      ))}
    </div>
  );
}
