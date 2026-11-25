// Where the API lives.
// - In a web browser the app is served BY the API server, so we use the same origin.
// - Inside the Android app the files are bundled in the APK (origin https://localhost),
//   so we must call the live server explicitly.
import { isNative } from './lib/native.js';

export const PRODUCTION_API = 'https://csb-three.vercel.app';

export function apiBase() {
  const override = safeGet('csb.serverUrl');
  if (override) return override.replace(/\/+$/, '');
  return isNative() ? PRODUCTION_API : '';
}

export function setApiBase(url) {
  if (url) localStorage.setItem('csb.serverUrl', url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem('csb.serverUrl');
}

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
