import React, { useState, useEffect, Component } from 'react';
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
import Conflicts from './pages/Conflicts';
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
  conflicts: 'Conflicts & Overlaps',
  notifications: 'System Notifications',
};

// SVG icons to replace old emoji indicators
const Icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  evidence: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  queue: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  ingest: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  gaps: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  regulatory: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  domainhead: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 22h20M4 22V10l8-6 8 6v12M8 22v-6h8v6" />
    </svg>
  ),
  conflicts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  ),
  notifications: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
};


// ── React Error Boundary — prevents blank white screen on unhandled exceptions ──
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('PageErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            An unexpected error occurred on this page.
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '20px', fontFamily: 'var(--font-mono)' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState({});
  const [queueCount, setQueueCount] = useState(0);

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
        background: '#0A0A0C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font)'
      }}>
        {/* Pulsing visual element for premium feel */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, var(--accent-gold) 0%, #8B6B22 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 30px rgba(201, 168, 76, 0.25)',
          animation: 'pulse 2s infinite ease-in-out'
        }}>
          <span style={{ fontSize: '28px', color: '#0A0A0C', fontWeight: 'bold' }}>U</span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>Loading Control Intelligence…</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Connecting to secure compliance environment</div>
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
    const page = (() => {
      switch (currentPage) {
        case 'dashboard':    return <Dashboard onNavigate={handleNavigate} />;
        case 'library':      return <Library onNavigate={handleNavigate} />;
        case 'evidence':     return <Evidence controlId={pageParams.controlId} />;
        case 'queue':        return <Queue onQueueCountChange={(cnt) => setQueueCount(cnt)} onNavigate={handleNavigate} />;
        case 'ingest':       return <Ingest />;
        case 'gaps':         return <Gaps />;
        case 'regulatory':   return <Regulatory />;
        case 'domainhead':   return <DomainHead onNavigate={handleNavigate} />;
        case 'conflicts':    return <Conflicts onNavigate={handleNavigate} />;
        case 'notifications':return <Notifications onNavigate={handleNavigate} />;
        default:             return <Dashboard onNavigate={handleNavigate} />;
      }
    })();
    return <PageErrorBoundary>{page}</PageErrorBoundary>;
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-name">UCIL</div>
          <div className="brand-sub">Unified Control Layer</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-group-label">Overview</div>
            <button className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavigate('dashboard')}>
              <span className="nav-icon">{Icons.dashboard}</span>
              <span>Dashboard</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Core Modules</div>
            <button className={`nav-item ${currentPage === 'library' ? 'active' : ''}`} onClick={() => handleNavigate('library')}>
              <span className="nav-icon">{Icons.library}</span>
              <span>Unified Library</span>
            </button>
            <button className={`nav-item ${currentPage === 'evidence' ? 'active' : ''}`} onClick={() => handleNavigate('evidence')}>
              <span className="nav-icon">{Icons.evidence}</span>
              <span>Evidence Management</span>
            </button>
            <button className={`nav-item ${currentPage === 'queue' ? 'active' : ''}`} onClick={() => handleNavigate('queue')}>
              <span className="nav-icon">{Icons.queue}</span>
              <span>SME Review Queue</span>
              {queueCount > 0 && <span className="nav-badge" id="badge-queue">{queueCount}</span>}
            </button>
            <button className={`nav-item ${currentPage === 'ingest' ? 'active' : ''}`} onClick={() => handleNavigate('ingest')}>
              <span className="nav-icon">{Icons.ingest}</span>
              <span>Data Ingestion</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Reports</div>
            <button className={`nav-item ${currentPage === 'gaps' ? 'active' : ''}`} onClick={() => handleNavigate('gaps')}>
              <span className="nav-icon">{Icons.gaps}</span>
              <span>Gap Analysis</span>
            </button>
            <button className={`nav-item ${currentPage === 'regulatory' ? 'active' : ''}`} onClick={() => handleNavigate('regulatory')}>
              <span className="nav-icon">{Icons.regulatory}</span>
              <span>Reg. Change Impact</span>
            </button>
            <button className={`nav-item ${currentPage === 'domainhead' ? 'active' : ''}`} onClick={() => handleNavigate('domainhead')}>
              <span className="nav-icon">{Icons.domainhead}</span>
              <span>Domain Head View</span>
            </button>
            <button className={`nav-item ${currentPage === 'conflicts' ? 'active' : ''}`} onClick={() => handleNavigate('conflicts')}>
              <span className="nav-icon">{Icons.conflicts}</span>
              <span>Conflicts & Overlaps</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-group-label">System</div>
            <button className={`nav-item ${currentPage === 'notifications' ? 'active' : ''}`} onClick={() => handleNavigate('notifications')}>
              <span className="nav-icon">{Icons.notifications}</span>
              <span>Notifications</span>
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
          <button className="btn btn-sm" onClick={handleLogoutClick} style={{ width: '100%', marginTop: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--text-danger)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>
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
