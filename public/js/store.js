// The logged-in session and a few preferences, kept in memory and mirrored to
// localStorage so the app stays logged in after it is closed and reopened.

const KEY = 'csb.session';
const listeners = new Set();

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};

export const store = {
  session: load(), // { token, expiresAt, user, branch }
  branches: [],    // active branches (owner can switch between them)
  pendingDevices: 0,

  get user() { return this.session?.user || null; },
  get isOwner() { return this.user?.role === 'owner'; },

  /** The branch the app is currently showing. Managers are fixed to theirs. */
  get branch() {
    if (!this.session) return null;
    if (!this.isOwner) return this.session.branch;
    const id = localStorage.getItem('csb.ownerBranch');
    return this.branches.find((b) => b.id === id) || this.branches[0] || null;
  },

  setSession(session) {
    this.session = session;
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
    emit();
  },

  setBranches(list) {
    this.branches = list;
    try { localStorage.setItem('csb.branches', JSON.stringify(list)); } catch {}
    emit();
  },

  cachedBranches() {
    try { return JSON.parse(localStorage.getItem('csb.branches')) || []; } catch { return []; }
  },

  selectBranch(id) {
    localStorage.setItem('csb.ownerBranch', id);
    emit();
  },

  setPendingDevices(n) {
    if (n !== this.pendingDevices) { this.pendingDevices = n; emit(); }
  },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function emit() { listeners.forEach((fn) => fn(store)); }

/** A random id generated once per installation, used for the device lock. */
export function deviceId() {
  let id = localStorage.getItem('csb.deviceId') || localStorage.getItem('csb_device_id'); // keep the old id so approved devices stay approved
  if (!id) {
    id = 'dev_' + crypto.randomUUID();
  }
  localStorage.setItem('csb.deviceId', id);
  return id;
}

export function deviceName() {
  const ua = navigator.userAgent;
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '');
  if (model && model !== 'K') return model;
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Shop device';
}
