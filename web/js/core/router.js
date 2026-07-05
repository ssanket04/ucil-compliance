/* ============================================================
   ROUTER.JS — Async-aware page navigation
   ============================================================ */

const PAGE_TITLES = {
  dashboard:     'Executive Dashboard',
  ingest:        'Data Ingestion',
  library:       'Unified Library',
  queue:         'SME Review Queue',
  evidence:      'Evidence Management',
  gaps:          'Gap Analysis',
  regulatory:    'Regulatory Change Impact',
  domainhead:    'Domain Head View',
  notifications: 'Notifications',
};

const BREADCRUMBS = {
  dashboard:     ['Dashboard'],
  ingest:        ['Dashboard', 'Data Ingestion'],
  library:       ['Dashboard', 'Unified Library'],
  queue:         ['Dashboard', 'SME Review Queue'],
  evidence:      ['Dashboard', 'Evidence Management'],
  gaps:          ['Dashboard', 'Gap Analysis'],
  regulatory:    ['Dashboard', 'Reg. Change Impact'],
  domainhead:    ['Dashboard', 'Domain Head View'],
  notifications: ['Dashboard', 'Notifications'],
};

const PAGE_RENDERERS = {
  dashboard:     renderDashboard,
  ingest:        renderIngest,
  library:       renderLibrary,
  queue:         renderQueue,
  evidence:      renderEvidence,
  gaps:          renderGaps,
  regulatory:    renderRegulatory,
  domainhead:    renderDomainHead,
  notifications: renderNotifications,
};

let currentPage = 'dashboard';
let mappingHighlight = null;

function showPageLoading() {
  document.getElementById('page-content').innerHTML =
    '<div style="padding:40px;text-align:center;color:var(--text-secondary);font-size:13px">Loading…</div>';
}

// Update the sidebar queue badge from a metrics object
function updateQueueBadge(metrics) {
  const b = document.getElementById('badge-queue');
  if (b && metrics && metrics.in_progress_sme != null) {
    b.textContent = metrics.in_progress_sme;
  }
}

async function goTo(pageId, opts) {
  opts = opts || {};
  currentPage = pageId;
  mappingHighlight = opts.controlId || null;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  document.getElementById('page-title').textContent = PAGE_TITLES[pageId] || pageId;

  const crumbs = BREADCRUMBS[pageId] || ['Dashboard'];
  document.getElementById('breadcrumb').innerHTML = crumbs.map((c, i) => {
    if (i < crumbs.length - 1) {
      return `<span class="crumb-link" onclick="goTo('dashboard')">${c}</span><span class="sep">/</span>`;
    }
    return `<span class="crumb-active">${c}</span>`;
  }).join('');

  const renderer = PAGE_RENDERERS[pageId];
  if (!renderer) return;

  showPageLoading();

  try {
    const result = renderer(opts);
    if (result && typeof result.then === 'function') {
      const html = await result;
      document.getElementById('page-content').innerHTML = html;
    } else {
      document.getElementById('page-content').innerHTML = result;
    }
  } catch (err) {
    console.error('Page render error:', err);
    document.getElementById('page-content').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--text-danger);font-size:13px">
        Failed to load page. Check console for details.
      </div>`;
  }

  document.getElementById('page-content').scrollTop = 0;
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.page));
});

/* ── App init ── */
async function initApp() {
  const loading = document.getElementById('app-loading');
  const statusEl = document.getElementById('loading-status');

  try {
    statusEl.textContent = 'Checking authentication…';

    // Check if user is logged in
    const { data: { session } } = await sb.auth.getSession();
    
    if (!session) {
      // Not logged in - redirect to login page
      window.location.href = 'login.html';
      return;
    }

    statusEl.textContent = 'Loading user profile…';

    // Get user profile
    const { data: profile } = await sb.from('users').select('*').eq('id', session.user.id).single();
    if (profile) {
      CURRENT_USER = profile;
      CURRENT_ROLE = profile.role;
      document.getElementById('sidebar-name').textContent   = profile.full_name;
      document.getElementById('sidebar-role').textContent   = profile.role;
      document.getElementById('sidebar-avatar').textContent = profile.avatar_initials || profile.full_name.slice(0,2).toUpperCase();
    }

    statusEl.textContent = 'Loading dashboard data…';

    // Load live metrics to set sidebar badge before first render
    const metrics = await fetchMetrics();
    updateQueueBadge(metrics);

    // Subscribe to metrics changes so badge stays live without page reload
    subscribeToMetrics(updatedMetrics => {
      updateQueueBadge(updatedMetrics);
    });

    await goTo('dashboard');
    loading.style.display = 'none';

  } catch (err) {
    console.error('App init error:', err);
    statusEl.textContent = 'Connection error. Loading with local data…';
    setTimeout(async () => {
      await goTo('dashboard');
      loading.style.display = 'none';
    }, 1500);
  }
}

// Logout function
function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    logout();
  }
}

initApp();
