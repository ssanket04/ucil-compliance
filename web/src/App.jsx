import React, { useState, useEffect } from 'react';
import { getCurrentSession, logout, subscribeToMetrics } from './supabaseClient';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Evidence from './pages/Evidence';
import Queue from './pages/Queue';
import Ingest from './pages/Ingest';
import Gaps from './pages/Gaps';
import Regulatory from './pages/Regulatory';
import DomainHead from './pages/DomainHead';
import Notifications from './pages/Notifications';

const PAGE_TITLES = {
  dashboard: 'Executive Dashboard',
  library: 'Unified Control Library',
  evidence: 'Evidence Management',
  queue: 'SME Review Queue',
  ingest: 'Data Ingestion',
  gaps: 'Gap Analysis',
  regulatory: 'Regulatory Change Impact',
  domainhead: 'Domain Head View',
  notifications: 'Notifications Trigger Control',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState({});
  const [queueCount, setQueueCount] = useState(6);

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await getCurrentSession();
        if (user) {
          setCurrentUser(user);
        }
      } catch (err) {
        console.error('Session verification error:', err);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const subscription = subscribeToMetrics((newMetrics) => {
      if (newMetrics && typeof newMetrics.in_progress_sme === 'number') {
        setQueueCount(newMetrics.in_progress_sme);
      }
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [currentUser]);

  const handleNavigate = (page, params = {}) => {
    setCurrentPage(page);
    setPageParams(params);
  };

  const handleLogoutClick = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setCurrentPage('dashboard');
      setPageParams({});
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        flexDirection: 'column',
        gap: '12px',
        fontFamily: 'var(--font)'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Loading Control Intelligence…</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Connecting to database…</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  const userInitials = currentUser.full_name
    ? currentUser.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'US';

  const renderActivePage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'library':
        return <Library onNavigate={handleNavigate} />;
      case 'evidence':
        return <Evidence controlId={pageParams.controlId} />;
      case 'queue':
        return <Queue onQueueCountChange={(cnt) => setQueueCount(cnt)} />;
      case 'ingest':
        return <Ingest />;
      case 'gaps':
        return <Gaps />;
      case 'regulatory':
        return <Regulatory />;
      case 'domainhead':
        return <DomainHead onNavigate={handleNavigate} />;
      case 'notifications':
        return <Notifications onNavigate={handleNavigate} />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-name">Control Intelligence</div>
          <div className="brand-sub">Unified Control Layer</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-group-label">Overview</div>
            <button className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavigate('dashboard')}>
              <span className="nav-icon">◈</span><span>Dashboard</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Core Modules</div>
            <button className={`nav-item ${currentPage === 'library' ? 'active' : ''}`} onClick={() => handleNavigate('library')}>
              <span className="nav-icon">▦</span><span>Unified Library</span>
            </button>
            <button className={`nav-item ${currentPage === 'evidence' ? 'active' : ''}`} onClick={() => handleNavigate('evidence')}>
              <span className="nav-icon">📁</span><span>Evidence Management</span>
            </button>
            <button className={`nav-item ${currentPage === 'queue' ? 'active' : ''}`} onClick={() => handleNavigate('queue')}>
              <span className="nav-icon">✓</span><span>SME Review Queue</span>
              {queueCount > 0 && <span className="nav-badge" id="badge-queue">{queueCount}</span>}
            </button>
            <button className={`nav-item ${currentPage === 'ingest' ? 'active' : ''}`} onClick={() => handleNavigate('ingest')}>
              <span className="nav-icon">⬇</span><span>Data Ingestion</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Reports</div>
            <button className={`nav-item ${currentPage === 'gaps' ? 'active' : ''}`} onClick={() => handleNavigate('gaps')}>
              <span className="nav-icon">△</span><span>Gap Analysis</span>
            </button>
            <button className={`nav-item ${currentPage === 'regulatory' ? 'active' : ''}`} onClick={() => handleNavigate('regulatory')}>
              <span className="nav-icon">⚡</span><span>Reg. Change Impact</span>
            </button>
            <button className={`nav-item ${currentPage === 'domainhead' ? 'active' : ''}`} onClick={() => handleNavigate('domainhead')}>
              <span className="nav-icon">🏛</span><span>Domain Head View</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">System</div>
            <button className={`nav-item ${currentPage === 'notifications' ? 'active' : ''}`} onClick={() => handleNavigate('notifications')}>
              <span className="nav-icon">🔔</span><span>Notifications</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{userInitials}</div>
            <div>
              <div className="user-name">{currentUser.full_name || 'Anonymous'}</div>
              <div className="user-role">{currentUser.role || 'Compliance Staff'}</div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={handleLogoutClick} style={{ width: '100%', marginTop: '12px', background: 'var(--bg-danger)', color: 'var(--text-danger)', border: '1px solid var(--border-danger)', padding: '8px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer' }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{PAGE_TITLES[currentPage] || 'Control Intelligence'}</div>
            <nav className="breadcrumb">
              <span className="crumb-link" onClick={() => handleNavigate('dashboard')}>Dashboard</span>
              {currentPage !== 'dashboard' && (
                <>
                  <span className="sep">/</span>
                  <span className="crumb-active">{PAGE_TITLES[currentPage]}</span>
                </>
              )}
            </nav>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => window.print()}>Export Report</button>
          </div>
        </header>

        <main className="page-content">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}
