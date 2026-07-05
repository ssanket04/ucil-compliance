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
        const user = await login(email, password);
        if (user) {
          onLoginSuccess(user);
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
      background: '#2e2e38',
      fontFamily: 'var(--font)'
    }}>
      <div className="login-container" style={{
        background: 'var(--bg-primary)',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '100%',
        maxWidth: '420px',
        padding: '48px 40px',
        margin: '20px'
      }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div className="login-logo" style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
          <div className="login-title" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {isSignUpMode ? 'Create Account' : 'Welcome Back'}
          </div>
          <div className="login-subtitle" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Unified Control Intelligence Layer
          </div>
        </div>

        {errorMsg && (
          <div className="error-message show" style={{
            background: 'var(--bg-danger)',
            border: '1px solid var(--border-danger)',
            color: 'var(--text-danger)',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '20px'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLoginSubmit}>
          {isSignUpMode && (
            <>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="First Last"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: '1.5px solid var(--border-s)',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>User Role</label>
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
                    padding: '0 16px'
                  }}
                >
                  <option value="Compliance Lead">Compliance Lead</option>
                  <option value="Control Owner">Control Owner</option>
                  <option value="Domain Head">Domain Head</option>
                  <option value="CISO">CISO</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '1.5px solid var(--border-s)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '1.5px solid var(--border-s)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {!isSignUpMode && (
            <div className="remember-forgot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', fontSize: '13px' }}>
              <label className="remember-me" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-password" style={{ color: '#ffe600', textDecoration: 'none', fontWeight: 500 }}>Forgot password?</a>
            </div>
          )}

          <button
            type="submit"
            className="btn-login"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#2e2e38',
              background: '#ffe600',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '8px'
            }}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                {isSignUpMode ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              isSignUpMode ? 'Sign Up' : 'Sign In'
            )}
          </button>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
            <a href="#" onClick={toggleMode} style={{ color: '#ffe600', textDecoration: 'none', fontWeight: 600 }}>
              {isSignUpMode ? 'Sign In' : 'Create one'}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
