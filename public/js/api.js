// Every call to the server goes through this file.
// It adds the login token, the branch and device headers, turns errors into
// friendly messages, and logs you out automatically when the session expires.
import { apiBase } from './config.js';
import { store, deviceId } from './store.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', data = {} } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => (onSessionLost = fn);

/**
 * @param {string} path  e.g. '/api/sales/2026-11-25'
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {object|FormData} [opts.body]
 * @param {string} [opts.branchId]  override the current branch (e.g. 'all')
 * @param {boolean} [opts.blob]  return a Blob instead of JSON
 */
export async function api(path, { method = 'GET', body, branchId, blob = false, timeout = 20000 } = {}) {
  const headers = { 'X-Device-Id': deviceId() };
  const token = store.session?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const branch = branchId || store.branch?.id;
  if (branch) headers['X-Branch-Id'] = branch;

  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(apiBase() + path, { method, headers, body: payload, signal: ctrl.signal });
  } catch (err) {
    throw new ApiError(
      navigator.onLine ? 'Could not reach the server. Please try again.' : 'You are offline. Check the internet connection.',
      { code: 'NETWORK' }
    );
  } finally {
    clearTimeout(timer);
  }

  if (blob && res.ok) return res.blob();

  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }

  if (!res.ok || data.ok === false) {
    const err = new ApiError(data.message || `Server error (${res.status})`, { status: res.status, code: data.code, data });
    // The token is no longer valid → back to the login screen.
    if (token && (res.status === 401 || data.code === 'DEVICE_NOT_APPROVED')) onSessionLost(err);
    throw err;
  }
  return data;
}

/** Load a protected image (bill photo) and return a local object URL for <img src>. */
const photoCache = new Map();
export async function photoUrl(id) {
  if (!photoCache.has(id)) {
    photoCache.set(id, api(`/api/photos/${id}`, { blob: true }).then((b) => URL.createObjectURL(b)).catch((e) => { photoCache.delete(id); throw e; }));
  }
  return photoCache.get(id);
}
