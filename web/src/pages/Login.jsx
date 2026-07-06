import React, { useState } from 'react';
import { login, signUpUser } from '../supabaseClient';

export default function Login({ onLoginSuccess }) {
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Compliance Lead');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSignUpMode) {
        await signUpUser(email, password, fullName, role);
        try {
          const user = await login(email, password);
          if (user) {
            onLoginSuccess(user);
          }
        } catch (loginErr) {
          // If the project requires email confirmation, auto-login fails here.
          if (/confirm/i.test(loginErr.message || '')) {
            setIsSignUpMode(false);
            setErrorMsg('Account created. Please confirm your email address, then sign in.');
            setLoading(false);
            return;
          }
          throw loginErr;
        }
      } else {
        const user = await login(email, password);
        if (user) {
          onLoginSuccess(user);
        }
      }
    } catch (error) {
      setErrorMsg(error.message || 'An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const toggleMode = (e) => {
    e.preventDefault();
    setIsSignUpMode(!isSignUpMode);
    setErrorMsg('');
  };

  return (
    <div style={{
      margin: 0,
      padding: 0,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0A0A0C',
      backgroundImage: 'radial-gradient(circle at 50% 10%, rgba(201, 168, 76, 0.08) 0%, transparent 60%)',
      fontFamily: 'var(--font)'
    }}>
      <div className="card" style={{
        borderRadius: '16px',
        width: '100%',
        maxWidth: '440px',
        padding: '48px 40px',
        margin: '20px',
        background: 'rgba(18, 18, 23, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(201, 168, 76, 0.15)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div className="login-logo" style={{
            fontSize: '36px',
            marginBottom: '16px',
            filter: 'drop-shadow(0 0 12px var(--accent-gold-glow))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '14px',
            background: 'rgba(201, 168, 76, 0.1)',
            border: '1px solid var(--border-gold)',
            color: 'var(--accent-gold-lt)'
          }}>
            🛡️
          </div>
          <div className="login-title" style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.02em',
            marginBottom: '8px'
          }}>
            {isSignUpMode ? 'Create Account' : 'Welcome Back'}
          </div>
          <div className="login-subtitle" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Unified Control Intelligence Layer
          </div>
        </div>

        {errorMsg && (
          <div className="banner banner-danger" style={{
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '20px',
            borderLeft: '3px solid var(--text-danger)'
          }}>
            <div className="banner-body">{errorMsg}</div>
          </div>
        )}

        <form onSubmit={handleLoginSubmit}>
          {isSignUpMode && (
            <>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Full Name</label>
                <input
                  type="text"
                  placeholder="First Last"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '13px',
                    border: '1.5px solid var(--border-s)',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-s)'}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>User Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    height: '46px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    border: '1.5px solid var(--border-s)',
                    borderRadius: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0 16px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  <option value="Compliance Lead">Compliance Lead</option>
                  <option value="Control Owner">Control Owner</option>
                  <option value="Domain Head">Domain Head</option>
                  <option value="CISO">CISO</option>
                  <option value="Auditor">Auditor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Email Address</label>
            <input
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '13px',
                border: '1.5px solid var(--border-s)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-s)'}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '13px',
                border: '1.5px solid var(--border-s)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-s)'}
            />
          </div>

          {!isSignUpMode && (
            <div className="remember-forgot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', fontSize: '12px' }}>
              <label className="remember-me" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--accent-gold)' }} />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-password" style={{ color: 'var(--accent-gold-lt)', fontWeight: 600 }}>Forgot password?</a>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '14px',
              fontWeight: '700',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '8px',
              height: '48px',
              fontFamily: 'var(--font)'
            }}
          >
            {loading ? (
              isSignUpMode ? 'Creating account...' : 'Signing in...'
            ) : (
              isSignUpMode ? 'Create Account' : 'Sign In'
            )}
          </button>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
            <a href="#" onClick={toggleMode} style={{ color: 'var(--accent-gold-lt)', fontWeight: 700 }}>
              {isSignUpMode ? 'Sign In' : 'Create one'}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
