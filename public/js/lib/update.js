// In-app updates.
//
// 1. You run `npm run release` on your computer (see LEARN.md). That bumps the
//    version, pushes a git tag, and GitHub Actions builds a signed APK and
//    publishes it as a GitHub Release.
// 2. Every time this app opens, it asks the server "what's the latest
//    version?" (/api/app/latest — the server asks GitHub for us).
// 3. If the latest version is newer than the installed one, we show a banner.
//    Tapping it opens the APK link in the phone's browser, which downloads it;
//    Android then asks "Do you want to install this update?".
import { api } from '../api.js';
import { APP_VERSION } from '../version.js';
import { isNative, nativeVersion, openExternal } from './native.js';

/** Compare "2.10.0" vs "2.9.3" → positive if a > b. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export async function installedVersion() {
  return (await nativeVersion()) || APP_VERSION;
}

/** Returns { current, latest, hasUpdate } — never throws. */
export async function checkForUpdate({ fresh = false } = {}) {
  const current = await installedVersion();
  try {
    const { latest } = await api(`/api/app/latest${fresh ? '?fresh=1' : ''}`);
    const hasUpdate = Boolean(isNative() && latest?.apkUrl && compareVersions(latest.version, current) > 0);
    return { current, latest, hasUpdate };
  } catch (err) {
    return { current, latest: null, hasUpdate: false, error: err.message };
  }
}

export const downloadUpdate = (latest) => openExternal(latest.apkUrl);
