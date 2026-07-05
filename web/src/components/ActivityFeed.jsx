import React from 'react';

export default function ActivityFeed({ items }) {
  return (
    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
      {items.map((a, idx) => (
        <div className="activity-item" key={idx}>
          <div className="act-dot" style={{ background: a.color }}></div>
          <div className="act-text">{a.text}</div>
          <div className="act-time">{a.time}</div>
        </div>
      ))}
    </div>
  );
}
