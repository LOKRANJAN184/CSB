// App entry point: decides between the login screen and the main app,
// draws the shell (top bar + bottom tabs), and routes between screens.
//
// Routing uses the URL hash, e.g.  #/sales/2026-11-25
// Hash routing works everywhere — in a browser and inside the Android APK —
// without any server configuration.

import { h, mount } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { confirmSheet, closeTopSheet, openSheet } from './ui/sheet.js';
import { toast } from './ui/toast.js';
import { api, setSessionLostHandler, setRouteSignal } from './api.js';
import { store } from './store.js';
import { renderLogin } from './screens/login.js';
import { applyTheme } from './lib/theme.js';
import { onBackButton, exitApp, onResume } from './lib/native.js';
import { checkForUpdate } from './lib/update.js';
import { openUpdateSheet } from './screens/more.js';

// path pattern → { load: () => import(screen), owner?: true, tab, branch?: true }
// Screens are loaded on demand (dynamic import) so start-up stays fast.
const ROUTES = [
  { pattern: /^\/sales(?:\/(?<date>\d{4}-\d{2}-\d{2}))?$/, load: () => import('./screens/sales.js'), tab: 'sales', branch: true },
  { pattern: /^\/attendance(?:\/(?<date>\d{4}-\d{2}-\d{2}))?$/, load: () => import('./screens/attendance.js'), tab: 'attendance', branch: true },
  { pattern: /^\/records(?:\/(?<month>\d{4}-\d{2}))?$/, load: () => import('./screens/records.js'), tab: 'records', branch: true },
  { pattern: /^\/reports$/, load: () => import('./screens/reports.js'), tab: 'reports', owner: true },
  { pattern: /^\/more$/, load: () => import('./screens/more.js'), tab: 'more' },
  { pattern: /^\/staff$/, load: () => import('./screens/staff.js'), tab: 'more', branch: true },
  { pattern: /^\/branches$/, load: () => import('./screens/branches.js'), tab: 'more', owner: true },
  { pattern: /^\/history$/, load: () => import('./screens/history.js'), tab: 'more', owner: true },
  { pattern: /^\/security$/, load: () => import('./screens/security.js'), tab: 'more', owner: true },
];

const TABS = [
  { id: 'sales', href: '#/sales', icon: 'receipt', label: 'Sales' },
  { id: 'attendance', href: '#/attendance', icon: 'users', label: 'Attendance' },
  { id: 'records', href: '#/records', icon: 'calendar', label: 'Records' },
  { id: 'reports', href: '#/reports', icon: 'chart', label: 'Reports', owner: true },
  { id: 'more', href: '#/more', icon: 'menu', label: 'More' },
];

const app = document.getElementById('app');
let cleanupLogin = null;
let guard = null;            // returns a message if the current screen has unsaved changes
let currentPath = null;
let ignoreNextHash = false;
let renderId = 0;
let routeAbort = null;
let navigating = false;     // a "leave without saving?" question is open
let sessionTimer;

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
const els = {};
function buildShell() {
  els.back = h('a', { class: 'icon-btn', 'aria-label': 'Back', hidden: true }, icon('chevronLeft'));
  els.menuBtn = h('a', { class: 'icon-btn', href: '#/more', 'aria-label': 'Menu' }, icon('hamburger'));
  els.title = h('h2');
  els.subtitle = h('p');
  els.branch = h('button', { class: 'branch-switch', hidden: true, onclick: openBranchPicker });
  els.banners = h('div');
  els.content = h('main', { class: 'content', id: 'main' });
  els.tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' });

  const brand = h('div', { class: 'topbar__brand' },
    h('img', { class: 'topbar__peacock', src: 'images/header-peacock.png', alt: '', width: 58, height: 44 }),
    h('span', { class: 'topbar__name' }, 'Chendurar'),
    h('span', { class: 'topbar__sub' }, 'Sweets & Bakery')
  );

  mount(app, h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar__left' }, els.back, els.menuBtn),
      brand,
      h('div', { class: 'topbar__right' }, els.branch)
    ),
    h('div', { class: 'pagebar' }, els.title, els.subtitle),
    els.banners,
    els.content,
    els.tabbar
  ));
  drawTabs();
  drawOfflineBanner();
}

let activeTabId = '';
function drawTabs(activeTab = activeTabId) {
  activeTabId = activeTab;
  mount(els.tabbar, TABS.filter((t) => !t.owner || store.isOwner).map((t) =>
    h('a', { class: 'tab', href: t.href, 'aria-current': t.id === activeTab ? 'page' : null },
      icon(t.icon), t.label,
      t.id === 'more' && store.pendingDevices > 0 && h('span', { class: 'tab__badge', 'aria-label': `${store.pendingDevices} device requests` }, store.pendingDevices)
    )
  ));
}

function openBranchPicker() {
  const sheet = openSheet({
    title: 'Switch branch',
    body: h('div', { class: 'card card--flush' }, h('ul', { class: 'list' }, store.branches.map((b) =>
      h('li', null, h('button', { class: 'row', onclick: () => { sheet.close(); store.selectBranch(b.id); route(true); } },
        icon('store'), h('div', { class: 'row__main' }, h('strong', null, b.name), b.address && h('span', null, b.address)),
        b.id === store.branch?.id && icon('check')))
    ))),
  });
}

function drawOfflineBanner() {
  const draw = () => mount(els.banners, !navigator.onLine && h('div', { class: 'banner banner--offline', role: 'status' }, icon('wifiOff'), 'No internet — changes cannot be saved until you are back online.'), els.update);
  addEventListener('online', draw);
  addEventListener('offline', draw);
  draw();
}

// Checked when the app starts AND every time it comes back to the foreground.
async function showUpdateBannerIfNeeded() {
  const r = await checkForUpdate();
  if (!r.hasUpdate || !els.banners) return;
  els.update?.remove();
  els.update = h('div', { class: 'banner banner--update' }, icon('download'), `Version ${r.latest.version} is available`,
    h('button', { class: 'btn btn--primary btn--sm', onclick: () => openUpdateSheet(r) }, 'Update'));
  els.banners.append(els.update);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
async function route(force = false) {
  const path = location.hash.replace(/^#/, '') || '/sales';
  if (path === currentPath && !force) return;

  const match = ROUTES.map((r) => ({ r, m: r.pattern.exec(path) })).find((x) => x.m);
  if (!match || (match.r.owner && !store.isOwner)) {
    location.replace('#/sales');
    return;
  }

  currentPath = path;
  guard = null;
  const id = ++renderId;
  const { r, m } = match;

  drawTabs(r.tab);
  els.back.hidden = true;
  els.menuBtn.hidden = false;
  els.branch.hidden = !(store.isOwner && r.branch && store.branches.length > 1);
  els.branch.replaceChildren(store.branch?.name || 'Branch', icon('chevronDown'));
  // Each visit gets a brand-new container. If the previous screen is still
  // loading when you leave, its late result is drawn into its own (now
  // detached) container instead of on top of the new screen.
  const root = h('div', { class: 'screen' });
  els.content.replaceChildren(root);
  window.scrollTo(0, 0);
  // Cancel the old screen's unfinished downloads so rapid taps don't pile up.
  routeAbort?.abort();
  routeAbort = new AbortController();
  setRouteSignal(routeAbort.signal);

  const ctx = {
    root,
    params: m.groups || {},
    branchName: store.branch?.name || '',
    navigate: (to) => go('#' + to.replace(/^#/, '')),
    logout,
    setGuard: (fn) => { if (id === renderId) guard = fn; },
    setTitle: (title, subtitle = '', opts = {}) => {
      if (id !== renderId) return;
      els.title.textContent = title;
      els.subtitle.textContent = subtitle;
      document.title = `${title} · Chendurar`;
      if (opts.back) { els.back.hidden = false; els.back.href = opts.back; els.menuBtn.hidden = true; }
    },
  };

  try {
    const mod = await r.load();
    if (id === renderId) await mod.default(ctx);
  } catch (err) {
    console.error(err);
    if (id === renderId) mount(els.content, h('div', { class: 'notice notice--bad' }, icon('alert'), h('div', null, 'This screen failed to load. ', err.message)));
  }
}

/**
 * All in-app navigation goes through here.
 * - asks "leave without saving?" BEFORE moving (not after)
 * - tapping the tab you're already on does nothing
 * - bottom tabs replace the history entry, so spamming tabs doesn't build a
 *   long back-button trail
 */
async function go(hash, { replace = false } = {}) {
  if (navigating || hash === location.hash) return;
  const msg = guard?.();
  if (msg) {
    navigating = true;
    const leave = await confirmSheet({ title: 'Unsaved changes', message: msg, confirmLabel: 'Leave without saving', danger: true });
    navigating = false;
    if (!leave) return;
  }
  guard = null;
  if (replace) location.replace(hash);
  else location.hash = hash;
}

// Every in-app link (<a href="#/...">) uses go() instead of the browser default.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  go(a.getAttribute('href'), { replace: a.classList.contains('tab') });
});

// The browser/Android back button changes the hash without go(); still protect unsaved work.
addEventListener('hashchange', async () => {
  if (ignoreNextHash) { ignoreNextHash = false; return; }
  const msg = guard?.();
  if (msg) {
    const target = location.hash;
    ignoreNextHash = true;
    history.back(); // undo the navigation while we ask
    const leave = await confirmSheet({ title: 'Unsaved changes', message: msg, confirmLabel: 'Leave without saving', danger: true });
    if (leave) { guard = null; location.hash = target; }
    return;
  }
  if (store.session) route();
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
function showLogin(message) {
  clearTimeout(sessionTimer);
  currentPath = null;
  cleanupLogin?.();
  cleanupLogin = renderLogin(app, { message, onLoggedIn: startApp });
}

function logout(message) {
  store.setSession(null);
  store.setPendingDevices(0);
  showLogin(typeof message === 'string' ? message : undefined);
}

setSessionLostHandler((err) => {
  if (!store.session) return;
  logout(err.code === 'DEVICE_NOT_APPROVED' ? err.message : 'Your session has ended. Please log in again.');
});

async function startApp() {
  cleanupLogin?.();
  cleanupLogin = null;
  const s = store.session;
  if (!s || s.expiresAt < Date.now()) return showLogin(s ? 'Your session has ended. Please log in again.' : undefined);

  // Auto-logout exactly when the token expires.
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => logout('Your session has ended. Please log in again.'), Math.min(s.expiresAt - Date.now(), 2 ** 31 - 1));

  if (store.isOwner) {
    store.branches = store.cachedBranches();
    try { store.setBranches((await api('/api/branches')).branches); } catch { /* use cached list */ }
  }
  buildShell();
  currentPath = null;
  if (!location.hash) location.replace('#/sales');
  route();
  refreshOwnerBadges();
  showUpdateBannerIfNeeded();
}

async function refreshOwnerBadges() {
  if (!store.isOwner) return;
  try {
    const { branches } = await api('/api/branches/manage');
    store.setPendingDevices(branches.filter((b) => b.manager?.pendingDevice).length);
  } catch { /* not critical */ }
}

store.subscribe(() => { if (els.tabbar && store.session) drawTabs(); });

// ---------------------------------------------------------------------------
// Android back button & resume
// ---------------------------------------------------------------------------
onBackButton(() => {
  if (closeTopSheet()) return;
  const path = location.hash.replace(/^#/, '');
  if (!store.session || path === '/sales' || path === '') exitApp();
  else if (['/attendance', '/records', '/reports', '/more'].some((p) => path.startsWith(p))) go('#/sales', { replace: true });
  else history.back();
});

onResume(() => {
  const s = store.session;
  if (s && s.expiresAt < Date.now()) logout('Your session has ended. Please log in again.');
  else if (s) { refreshOwnerBadges(); showUpdateBannerIfNeeded(); }
});

// ---------------------------------------------------------------------------
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
if (store.session) startApp();
else showLogin();
window.__toast = toast; // handy when debugging from the browser console
