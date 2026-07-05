import React from 'react';

export default function AccessIndicator({ role, action }) {
  const icons = { 'Control Owner': '👤', 'Domain Head': '🏛', 'CISO': '🔒' };
  return (
    <div className="access-indicator">
      <span className="ai-icon">{icons[role] || '👤'}</span>
      <span><strong>{action}</strong> enabled for: <strong>{role}</strong></span>
    </div>
  );
}
