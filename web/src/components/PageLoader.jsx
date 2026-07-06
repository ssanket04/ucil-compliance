import React from 'react';

export default function PageLoader({ message = 'Loading compliance details...' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 32px',
      minHeight: '200px',
      color: 'var(--text-secondary)',
      textAlign: 'center'
    }}>
      <div className="pulse-glow" style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'var(--accent-gold)',
        boxShadow: '0 0 16px var(--accent-gold)',
        marginBottom: '16px',
        animation: 'pulse 2s infinite ease-in-out'
      }} />
      <div style={{
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '0.02em',
        color: 'var(--text-primary)'
      }}>
        {message}
      </div>
    </div>
  );
}
