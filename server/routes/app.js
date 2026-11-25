const express = require('express');
const env = require('../config/env');

// In-app updates.
// Every time you push a git tag like "v2.1.0", GitHub Actions builds a new APK
// and attaches it to a GitHub Release (see .github/workflows/release.yml).
// The app calls this endpoint, compares the version with its own, and offers
// the download if a newer one exists.

const router = express.Router();
let cache = { at: 0, data: null };

async function fetchLatestRelease() {
  if (cache.data && Date.now() - cache.at < 5 * 60_000) return cache.data; // GitHub rate-limits us
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'bakery-app-update-check' };
  if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;
  const r = await fetch(`https://api.github.com/repos/${env.githubRepo}/releases/latest`, { headers });
  if (r.status === 404) return null; // no releases yet
  if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
  const rel = await r.json();
  const apk = (rel.assets || []).find((a) => a.name.endsWith('.apk'));
  const data = {
    version: String(rel.tag_name || '').replace(/^v/, ''),
    notes: rel.body || '',
    publishedAt: rel.published_at,
    apkUrl: apk ? apk.browser_download_url : null,
    apkSize: apk ? apk.size : null,
    pageUrl: rel.html_url,
  };
  cache = { at: Date.now(), data };
  return data;
}

// GET /api/app/latest
router.get('/latest', async (req, res) => {
  try {
    res.json({ ok: true, latest: await fetchLatestRelease() });
  } catch (err) {
    res.status(502).json({ ok: false, code: 'UPDATE_CHECK_FAILED', message: 'Could not check for updates right now.' });
  }
});

module.exports = router;
