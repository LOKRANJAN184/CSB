import re

with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Restore clean app.js if needed or patch it cleanly
# Let's write the theme and update functions directly
theme_and_update_block = """
  // --- THEME (DARK / LIGHT MODE) ---
  const initTheme = () => {
    const savedTheme = localStorage.getItem('csb_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    applyTheme(isDark);
  };

  const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains('dark');
    applyTheme(isDark);
    localStorage.setItem('csb_theme', isDark ? 'dark' : 'light');
    showToast(isDark ? 'Dark mode activated' : 'Light mode activated', 'info');
  };

  const applyTheme = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    updateThemeToggleIcon(isDark);
  };

  const updateThemeToggleIcon = (isDark = document.documentElement.classList.contains('dark')) => {
    const iconContainer = document.getElementById('theme-toggle-icon');
    if (!iconContainer) return;
    if (window.renderIcon) {
      iconContainer.innerHTML = isDark
        ? renderIcon('sun', 'w-4 h-4 text-amber-300')
        : renderIcon('moon', 'w-4 h-4 text-amber-100');
    }
  };

  // --- IN-APP UPDATES & VERSION ---
  const APP_VERSION = '1.1.0';
  let latestUpdateInfo = null;

  const initAppUpdates = () => {
    const verEl = document.getElementById('settings-current-version');
    if (verEl) verEl.textContent = 'v' + APP_VERSION;

    const repoInput = document.getElementById('settings-github-repo');
    if (repoInput) {
      repoInput.value = localStorage.getItem('csb_github_repo') || '';
    }

    setTimeout(() => {
      checkForUpdates(false);
    }, 2000);
  };

  const saveGithubRepoSetting = () => {
    const repoInput = document.getElementById('settings-github-repo');
    if (!repoInput) return;
    const repo = repoInput.value.trim();
    if (repo) {
      localStorage.setItem('csb_github_repo', repo);
      showToast('GitHub repository set to: ' + repo, 'success');
      checkForUpdates(true);
    } else {
      localStorage.removeItem('csb_github_repo');
      showToast('GitHub repository cleared. Checking server directly.', 'info');
    }
  };

  const compareVersions = (v1, v2) => {
    const clean1 = (v1 || '').replace(/^v/, '').split('.').map(Number);
    const clean2 = (v2 || '').replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
      const num1 = clean1[i] || 0;
      const num2 = clean2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  };

  const checkForUpdates = async (manual = false) => {
    try {
      const badge = document.getElementById('settings-update-badge');
      if (badge && manual) badge.textContent = 'Checking...';

      let latestVersion = APP_VERSION;
      let downloadUrl = '/Chendurar-Bakery.apk';
      let releaseNotes = '';

      const customRepo = localStorage.getItem('csb_github_repo');
      if (customRepo && customRepo.includes('/')) {
        try {
          const ghRes = await fetch('https://api.github.com/repos/' + customRepo + '/releases/latest', {
            headers: { Accept: 'application/vnd.github.v3+json' }
          });
          if (ghRes.ok) {
            const release = await ghRes.json();
            if (release && release.tag_name) {
              latestVersion = release.tag_name.replace(/^v/, '');
              releaseNotes = release.body || '';
              const apkAsset = (release.assets || []).find(a => a.name.endsWith('.apk'));
              if (apkAsset && apkAsset.browser_download_url) {
                downloadUrl = apkAsset.browser_download_url;
              }
            }
          }
        } catch (ghErr) {
          console.warn('[Updates] GitHub Releases query failed, falling back to server:', ghErr);
        }
      }

      if (compareVersions(latestVersion, APP_VERSION) <= 0) {
        try {
          const srvRes = await API.getAppVersion();
          if (srvRes && srvRes.version) {
            if (compareVersions(srvRes.version, latestVersion) > 0) {
              latestVersion = srvRes.version;
              downloadUrl = srvRes.downloadUrl || downloadUrl;
              releaseNotes = srvRes.releaseNotes || releaseNotes;
            }
          }
        } catch (_) {}
      }

      latestUpdateInfo = {
        version: latestVersion,
        downloadUrl,
        releaseNotes
      };

      const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;

      if (badge) {
        if (hasUpdate) {
          badge.textContent = 'New: v' + latestVersion;
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40 animate-pulse';
        } else {
          badge.textContent = 'Up to Date';
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
        }
      }

      const banner = document.getElementById('app-update-banner');
      if (hasUpdate) {
        const titleEl = document.getElementById('app-update-title');
        const verEl = document.getElementById('app-update-version');
        if (titleEl) titleEl.textContent = 'New Update Available! (v' + latestVersion + ')';
        if (verEl) verEl.textContent = releaseNotes ? releaseNotes.slice(0, 60) + '...' : 'Tap Update Now to install version ' + latestVersion;
        if (banner) banner.classList.remove('hidden');
        if (manual) showToast('Update available: v' + latestVersion, 'info');
      } else {
        if (banner) banner.classList.add('hidden');
        if (manual) showToast('App is up to date (v' + APP_VERSION + ')', 'success');
      }
    } catch (err) {
      console.error('[Updates] Error checking for updates:', err);
      if (manual) showToast('Could not check for updates. Please try again later.', 'error');
    }
  };

  const downloadLatestApk = () => {
    const url = (latestUpdateInfo && latestUpdateInfo.downloadUrl) || '/Chendurar-Bakery.apk';
    showToast('Starting update download...', 'info');
    const link = document.createElement('a');
    link.href = url.startsWith('http') ? url : (API.getServerUrl() + url);
    link.download = 'Chendurar-Bakery.apk';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
"""

# Let's inspect where the broken lines are around line 71
lines = text.splitlines()
# Find where the broken block starts and ends
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if '// --- THEME (DARK / LIGHT MODE) ---' in line:
        start_idx = i
    if start_idx is not None and 'const loadBranches = async () => {' in line:
        end_idx = i
        break

if start_idx is not None and end_idx is not None:
    # Replace broken block
    new_lines = lines[:start_idx] + [theme_and_update_block] + lines[end_idx:]
    text = '\n'.join(new_lines)
else:
    # If not found, insert before loadBranches
    target = 'const loadBranches = async () => {'
    text = text.replace(target, theme_and_update_block + '\n  ' + target, 1)

with open('/home/ranjan/CSB PROJECT/public/js/app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('Patched app.js successfully')

