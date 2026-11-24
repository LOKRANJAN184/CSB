// Chendurar Sweets & Bakery - Mobile Application Master Controller
const app = (() => {
  // Application State
  const state = {
    currentUser: null,
    currentTab: 'sales',
    salesDate: getTodayString(),
    attendanceDate: getTodayString(),
    currentMonth: getTodayString().slice(0, 7),
    salesData: null,
    attendanceData: null,
    staffList: [],
    branches: [],
    pendingExpensePhotoIndex: null,
    pinInput: '',
    selectedLoginRole: 'owner',
    historyFilter: 'ALL',
    lightboxRotation: 0,
    activeClockStaffIndex: null,
    activeClockField: 'inTime',
    activeClockHour: '08',
    activeClockMinute: '00',
    activeClockAmPm: 'AM',
    pendingDeviceData: null,
    settingsDeviceBranchId: null,
    allBranches: [],
  };

  // Helper to load and sync branches
  

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
    const loginIconContainer = document.getElementById('login-theme-toggle-icon');
    if (window.renderIcon) {
      const headerIconHtml = isDark
        ? renderIcon('sun', 'w-4 h-4 text-amber-300')
        : renderIcon('moon', 'w-4 h-4 text-amber-100');
      const loginIconHtml = isDark
        ? renderIcon('sun', 'w-4 h-4 text-amber-400')
        : renderIcon('moon', 'w-4 h-4 text-slate-700');

      if (iconContainer) iconContainer.innerHTML = headerIconHtml;
      if (loginIconContainer) loginIconContainer.innerHTML = loginIconHtml;
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

  // Default cached branches for instantaneous (0ms) offline/instant dropdown display
  const DEFAULT_BRANCHES = [
    { _id: '6b046d292c795acbdf27182e', name: 'Samayanallur Branch', code: 'MAIN' },
    { _id: '6b046d292c795acbdf271832', name: 'Vadipatti Branch', code: 'VADIPATTI' }
  ];

  const getCachedBranches = () => {
    try {
      const cached = localStorage.getItem('csb_cached_branches');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_BRANCHES;
  };

  const initBranchDropdownImmediate = () => {
    const branches = getCachedBranches();
    state.branches = branches;

    const loginSelect = document.getElementById('login-branch-select');
    if (loginSelect) {
      let savedBranchId = API.getBranchId() || branches[0]._id;
      loginSelect.innerHTML = branches.map(b => `<option value="${b._id}" ${b._id === savedBranchId ? 'selected' : ''}>${b.name}</option>`).join('');
      loginSelect.value = savedBranchId;
      if (!API.getBranchId()) {
        API.setBranchId(savedBranchId);
        const match = branches.find(b => b._id === savedBranchId);
        if (match) API.setBranchName(match.name);
      }
    }

    const srvInfo = document.getElementById('login-server-info');
    if (srvInfo) {
      srvInfo.textContent = 'Server: ' + API.getServerUrl().replace(/^https?:\/\//, '');
    }

    updateHeaderBranchUI();
  };

  const loadBranches = async () => {
    // 1. Populate immediately (0ms) so user never sees "Loading branches..."
    initBranchDropdownImmediate();

    try {
      // 2. Fetch fresh branches in background with 3-second timeout
      const res = await API.getBranches();
      if (res && res.success && Array.isArray(res.branches) && res.branches.length > 0) {
        state.branches = res.branches;
        localStorage.setItem('csb_cached_branches', JSON.stringify(res.branches));

        const loginSelect = document.getElementById('login-branch-select');
        if (loginSelect) {
          let currentVal = loginSelect.value || API.getBranchId();
          if (!currentVal || !res.branches.some(b => b._id === currentVal)) {
            currentVal = res.branches[0]._id;
            API.setBranchId(currentVal);
            API.setBranchName(res.branches[0].name);
          }
          loginSelect.innerHTML = res.branches.map(b => `<option value="${b._id}" ${b._id === currentVal ? 'selected' : ''}>${b.name}</option>`).join('');
          loginSelect.value = currentVal;
        }

        updateHeaderBranchUI();
      }
    } catch (err) {
      console.warn('[Branches] Network refresh skipped, using cached branches:', err.message);
    }
  };

  const promptServerUrl = () => {
    const current = API.getServerUrl();
    const input = prompt('Enter Bakery Server URL (e.g. http://11.12.22.235:5000 or your custom domain):', current);
    if (input !== null) {
      const cleanUrl = input.trim();
      if (cleanUrl) {
        API.setServerUrl(cleanUrl);
        showToast('Server URL updated to: ' + cleanUrl, 'info');
      } else {
        API.removeServerUrl();
        showToast('Reset server URL to default', 'info');
      }
      const srvInfo = document.getElementById('login-server-info');
      if (srvInfo) srvInfo.textContent = 'Server: ' + API.getServerUrl().replace(/^https?:\/\//, '');
      loadBranches();
    }
  };

  const updateHeaderBranchUI = () => {
    const branchName = API.getBranchName() || (state.branches[0] ? state.branches[0].name : 'Samayanallur Branch');
    const headerName = document.getElementById('header-branch-name');
    if (headerName) headerName.textContent = branchName;
  };

  const onLoginBranchChange = (branchId) => {
    API.setBranchId(branchId);
    const b = state.branches.find(x => x._id === branchId);
    if (b) API.setBranchName(b.name);
    updateHeaderBranchUI();
  };

  const onHeaderBranchSwitch = async (newBranchId) => {
    API.setBranchId(newBranchId);
    const b = state.branches.find(x => x._id === newBranchId);
    if (b) API.setBranchName(b.name);
    updateHeaderBranchUI();
    showToast(`Switched to ${b ? b.name : 'Branch'}`, 'info');
    await loadStaffList();
    if (state.currentTab === 'sales') await loadDailySales(state.salesDate);
    else if (state.currentTab === 'attendance') await loadDailyAttendance(state.attendanceDate);
    else if (state.currentTab === 'records') await loadPastDateRecord(document.getElementById('past-date-picker')?.value || state.salesDate);
    else if (state.currentTab === 'reports') await loadMonthlyReports(state.currentMonth);
    else if (state.currentTab === 'history') await loadAuditHistory();
    else if (state.currentTab === 'staff') await loadStaffDirectory();
    else if (state.currentTab === 'settings') await loadOwnerSettings();
  };

  // Helper to parse 12-hour AM/PM string into parts
  const parseTime12h = (timeStr, defaultTime = '08:00 AM') => {
    const raw = (timeStr || defaultTime).trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) {
      return { time12: '08:00', hour: '08', minute: '00', ampm: 'AM', full: '08:00 AM' };
    }
    const h = match[1].padStart(2, '0');
    const m = match[2];
    const ampm = (match[3] || 'AM').toUpperCase();
    return {
      time12: `${h}:${m}`,
      hour: h,
      minute: m,
      ampm: ampm,
      full: `${h}:${m} ${ampm}`,
    };
  };

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // --- SESSION AUTO-LOGOUT CONFIGURATION (Manager: 1 hour, Owner: 5 hours) ---
  const MANAGER_SESSION_DURATION_MS = 60 * 60 * 1000;      // 1 hour = 3,600,000 ms
  const OWNER_SESSION_DURATION_MS   = 5 * 60 * 60 * 1000;  // 5 hours = 18,000,000 ms
  let userSessionTimer = null;

  const clearUserSessionTimer = () => {
    if (userSessionTimer) {
      clearTimeout(userSessionTimer);
      userSessionTimer = null;
    }
  };

  const clearSessionStorage = () => {
    clearUserSessionTimer();
    localStorage.removeItem('csb_login_time');
    localStorage.removeItem('csb_login_role');
    localStorage.removeItem('csb_manager_login_time');
    localStorage.removeItem('csb_owner_login_time');
    API.removeToken();
    API.removeUser();
    state.currentUser = null;
  };

  const handleSessionAutoLogout = (role = 'manager', showModal = true, customMessage = null) => {
    clearSessionStorage();
    updateUserUI();

    const isOwner = role === 'owner';
    const hours = isOwner ? 5 : 1;
    const defaultMsg = isOwner
      ? 'Owner session expired after 5 hours. Automatically logged out. Please log in again. / உரிமையாளர் அமர்வு 5 மணிநேரம் முடிந்ததால் தானாக வெளியேற்றப்பட்டது.'
      : 'Manager session expired after 1 hour. Automatically logged out. Please log in again. / மேலாளர் அமர்வு 1 மணிநேரம் முடிந்ததால் தானாக வெளியேற்றப்பட்டது.';
    const msg = customMessage || defaultMsg;
    showToast(msg, 'warning', 6000);

    if (showModal) {
      showAuthModal();
      setLoginRole(isOwner ? 'owner' : 'manager');
      const errEl = document.getElementById('pin-error-msg');
      if (errEl) {
        errEl.textContent = `Session expired after ${hours} hour${hours > 1 ? 's' : ''}. Please enter credentials again.`;
        errEl.classList.remove('hidden');
      }
    }
  };

  const startSessionTimer = (role, durationMs) => {
    clearUserSessionTimer();
    const timeoutMs = Math.max(1000, durationMs);
    const isOwner = role === 'owner';
    const hours = isOwner ? 5 : 1;
    console.log(`[Session] ${role.toUpperCase()} auto-logout scheduled in ${Math.round(timeoutMs / 1000)}s (${hours}h limit)`);
    userSessionTimer = setTimeout(() => {
      console.log(`[Session] ${hours} hour(s) elapsed for ${role.toUpperCase()}. Logging out automatically.`);
      handleSessionAutoLogout(role, true);
    }, timeoutMs);
  };

  const setupUserSession = (user, isFreshLogin = false) => {
    if (!user) {
      clearSessionStorage();
      return false;
    }

    const role = user.role || 'manager';
    const maxDuration = role === 'owner' ? OWNER_SESSION_DURATION_MS : MANAGER_SESSION_DURATION_MS;
    const storageKey = role === 'owner' ? 'csb_owner_login_time' : 'csb_manager_login_time';
    const now = Date.now();

    if (isFreshLogin) {
      localStorage.setItem('csb_login_time', now.toString());
      localStorage.setItem('csb_login_role', role);
      localStorage.setItem(storageKey, now.toString());
      startSessionTimer(role, maxDuration);
      return true;
    }

    // Checking saved session on init / reload
    const storedTime = parseInt(localStorage.getItem(storageKey) || localStorage.getItem('csb_login_time') || '0', 10);
    if (!storedTime) {
      // If legacy session or missing timestamp, initialize fresh limit
      localStorage.setItem('csb_login_time', now.toString());
      localStorage.setItem('csb_login_role', role);
      localStorage.setItem(storageKey, now.toString());
      startSessionTimer(role, maxDuration);
      return true;
    }

    const elapsed = now - storedTime;
    if (elapsed >= maxDuration) {
      // Session has expired!
      handleSessionAutoLogout(role, true);
      return false;
    }

    startSessionTimer(role, maxDuration - elapsed);
    return true;
  };

  const logout = () => {
    clearSessionStorage();
    updateUserUI();
    showLoginGate();
    setLoginRole('manager');
  };

  // --- INITIALIZATION ---
  const init = async () => {
    // Load theme & update checker
    await initTheme();
    initAppUpdates();
    initBranchDropdownImmediate();
    loadBranches();

    // Set default dates
    const today = getTodayString();
    state.salesDate = today;
    state.attendanceDate = today;
    state.currentMonth = today.slice(0, 7);

    const pastPicker = document.getElementById('past-date-picker');
    if (pastPicker) pastPicker.value = today;

    const repMonthPicker = document.getElementById('report-month-picker');
    if (repMonthPicker) repMonthPicker.value = state.currentMonth;

    // PRESENT LOGIN SCREEN FIRST ON OPEN
    showLoginGate();

    const savedUser = API.getUser();
    const lastRole = (savedUser && savedUser.role) || localStorage.getItem('csb_login_role') || 'manager';
    setLoginRole(lastRole);

    // Initialize Socket.io real-time updates
    Realtime.init(handleRealtimeSync);

    // Setup photo file listener
    const photoInput = document.getElementById('global-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', handlePhotoFileSelected);
    }

    // Listen for session expired events
    window.addEventListener('csb:session_expired', (e) => {
      const role = (state.currentUser && state.currentUser.role) || localStorage.getItem('csb_login_role') || 'manager';
      handleSessionAutoLogout(role, true, (e.detail && e.detail.message) || null);
    });

    // Listen for device blocked events
    window.addEventListener('csb:device_blocked', (e) => {
      clearSessionStorage();
      updateUserUI();
      showLoginGate();
      handleDeviceLockError(e.detail || {
        code: 'DEVICE_BLOCKED',
        message: 'Access allowed only from the shop device'
      });
    });
  };

  // --- REALTIME SYNC HANDLER ---
  const handleRealtimeSync = (module, payload) => {
    if (module === 'sales' && payload.date === state.salesDate) {
      console.log('[Realtime] Refreshing sales for active date:', state.salesDate);
      loadDailySales(state.salesDate, false);
    } else if (module === 'attendance' && payload.date === state.attendanceDate) {
      console.log('[Realtime] Refreshing attendance for active date:', state.attendanceDate);
      loadDailyAttendance(state.attendanceDate, false);
    } else if (module === 'staff') {
      loadStaffList();
      if (state.currentTab === 'attendance') loadDailyAttendance(state.attendanceDate, false);
    } else if (module === 'audit' && state.currentTab === 'history') {
      loadAuditHistory();
    } else if (module === 'device_request') {
      if (state.currentUser && state.currentUser.role === 'owner') {
        const banner = document.getElementById('device-request-banner');
        const badge = document.getElementById('badge-settings-pending');
        if (banner) {
          banner.classList.remove('hidden');
          const txt = document.getElementById('device-request-banner-text');
          if (txt) txt.textContent = `Approval request: ${payload.deviceName}`;
        }
        if (badge) badge.classList.remove('hidden');
        showToast(`Device approval request from Shop Manager (${payload.deviceName})`, 'warning');
        if (state.currentTab === 'settings') loadOwnerSettings(false);
      }
    } else if (module === 'device_approved') {
      if (payload.deviceId === API.getDeviceId()) {
        const lockCard = document.getElementById('auth-device-lock-card');
        if (lockCard) lockCard.classList.add('hidden');
        showToast('Device approved by Owner! Enter PIN to login.', 'success');
        showAuthModal();
        setLoginRole('manager');
      }
      if (state.currentUser && state.currentUser.role === 'owner') {
        const banner = document.getElementById('device-request-banner');
        const badge = document.getElementById('badge-settings-pending');
        if (banner) banner.classList.add('hidden');
        if (badge) badge.classList.add('hidden');
        if (state.currentTab === 'settings') loadOwnerSettings(false);
      }
    } else if (module === 'device_rejected' || module === 'device_removed') {
      if (state.currentUser && state.currentUser.role === 'owner') {
        if (state.currentTab === 'settings') loadOwnerSettings(false);
      } else if (state.currentUser && state.currentUser.role === 'manager') {
        showToast('Approved shop device was updated or removed by Owner.', 'warning');
      }
    } else if (module === 'device_blocked') {
      if (payload.deviceId === API.getDeviceId()) {
        API.removeToken();
        API.removeUser();
        state.currentUser = null;
        updateUserUI();
        showToast('This device has been blocked by the Owner.', 'error');
        handleDeviceLockError({
          code: 'DEVICE_BLOCKED',
          message: 'This device has been blocked by the Owner. Access denied.',
        });
      }
      if (state.currentUser && state.currentUser.role === 'owner') {
        if (state.currentTab === 'settings') loadOwnerSettings(false);
        if (state.currentTab === 'history') loadAuditHistory();
      }
    } else if (module === 'device_unblocked') {
      if (state.currentUser && state.currentUser.role === 'owner') {
        if (state.currentTab === 'settings') loadOwnerSettings(false);
        if (state.currentTab === 'history') loadAuditHistory();
      }
    } else if (module === 'security_alert') {
      if (state.currentUser && state.currentUser.role === 'owner') {
        showToast(`Blocked attempt from unauthorized device: ${payload.deviceName}`, 'warning');
        if (state.currentTab === 'settings') loadOwnerSettings(false);
        if (state.currentTab === 'history') loadAuditHistory();
      }
    }
  };

  // --- USER & AUTH ---
  const updateUserUI = () => {
    const user = state.currentUser;
    const nameEl = document.getElementById('header-user-name');
    const iconEl = document.getElementById('header-role-icon');
    const calIndicator = document.getElementById('calendar-role-indicator');

    if (!user) {
      if (nameEl) nameEl.textContent = 'Login';
      if (iconEl) iconEl.innerHTML = window.renderIcon ? renderIcon('manager', 'w-3.5 h-3.5') : '';
      return;
    }

    const isOwner = user.role === 'owner';
    if (nameEl) nameEl.textContent = isOwner ? 'Owner' : 'Manager';
    if (iconEl) iconEl.innerHTML = window.renderIcon ? renderIcon(isOwner ? 'owner' : 'manager', 'w-3.5 h-3.5') : '';

    // Configure Bottom Navigation visibility based on role
    const repTab = document.getElementById('nav-tab-reports');
    const histTab = document.getElementById('nav-tab-history');
    const staffTab = document.getElementById('nav-tab-staff');
    const settingsTab = document.getElementById('nav-tab-settings');
    const mainNav = document.getElementById('main-bottom-nav');

    if (isOwner) {
      if (repTab) repTab.classList.remove('hidden');
      if (histTab) histTab.classList.remove('hidden');
      if (staffTab) staffTab.classList.remove('hidden');
      if (settingsTab) settingsTab.classList.remove('hidden');
      if (mainNav) {
        mainNav.className = 'max-w-md mx-auto text-center py-1.5 px-0.5 nav-grid-owner';
      }
      checkPendingDeviceForOwner();
    } else {
      // SHOP MANAGER: Reports, History & Settings are TOTALLY removed!
      if (repTab) repTab.classList.add('hidden');
      if (histTab) histTab.classList.add('hidden');
      if (settingsTab) settingsTab.classList.add('hidden');
      if (staffTab) staffTab.classList.remove('hidden');
      if (mainNav) {
        mainNav.className = 'max-w-md mx-auto text-center py-1.5 px-1 nav-grid-manager';
      }

      // If Manager was on reports, history, settings, or custom history reports, switch to sales
      if (state.currentTab === 'reports' || state.currentTab === 'history' || state.currentTab === 'settings' || state.currentTab === 'sales-history' || state.currentTab === 'attendance-history') {
        switchTab('sales');
      }
    }

    if (calIndicator) {
      calIndicator.textContent = isOwner ? 'Owner (Edit Any Date)' : 'Manager (Edit Today Only)';
      calIndicator.className = isOwner
        ? 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900'
        : 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-900';
    }

    // Refresh permissions on current view
    applyEditPermissions();

    // Update branch indicator & switcher
    updateHeaderBranchUI();
  };

  const showLoginGate = () => {
    const loginGate = document.getElementById('view-login-gate');
    const appShell = document.getElementById('view-app-shell');
    if (loginGate) loginGate.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');

    state.pinInput = '';
    renderPinDots();
    const mobileInput = document.getElementById('input-owner-mobile');
    if (mobileInput && !mobileInput.value) {
      mobileInput.value = localStorage.getItem('csb_owner_mobile') || '';
    }
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.classList.add('hidden');
  };

  const hideLoginGate = () => {
    const loginGate = document.getElementById('view-login-gate');
    const appShell = document.getElementById('view-app-shell');
    if (loginGate) loginGate.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');
  };

  const showAuthModal = showLoginGate;
  const closeAuthModal = hideLoginGate;

  const setLoginRole = (role) => {
    state.selectedLoginRole = role;
    state.pinInput = '';
    renderPinDots();

    const btnOwner = document.getElementById('btn-login-role-owner');
    const btnMgr = document.getElementById('btn-login-role-manager');
    const lockCard = document.getElementById('auth-device-lock-card');
    const mobileBox = document.getElementById('owner-mobile-input-box');
    const mobileInput = document.getElementById('input-owner-mobile');
    const pinLabel = document.getElementById('pin-prompt-label');

    if (role === 'owner') {
      if (btnOwner) btnOwner.className = 'py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-white dark:bg-slate-700 text-amber-800 dark:text-amber-300 shadow-sm';
      if (btnMgr) btnMgr.className = 'py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300';
      if (lockCard) lockCard.classList.add('hidden');
      if (mobileBox) mobileBox.classList.remove('hidden');
      if (pinLabel) pinLabel.textContent = 'Enter 4-Digit Owner PIN';
      if (mobileInput && !mobileInput.value) {
        mobileInput.value = localStorage.getItem('csb_owner_mobile') || '';
      }
    } else {
      if (btnMgr) btnMgr.className = 'py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-white dark:bg-slate-700 text-amber-800 dark:text-amber-300 shadow-sm';
      if (btnOwner) btnOwner.className = 'py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300';
      if (mobileBox) mobileBox.classList.add('hidden');
      if (pinLabel) pinLabel.textContent = 'Enter 4-Digit Manager PIN';
    }
  };

  const handleDeviceLockError = (err) => {
    const isDeviceError = (err && (err.code === 'DEVICE_NOT_APPROVED' || err.code === 'DEVICE_BLOCKED')) ||
      (err && err.message && (
        err.message.includes('not approved') || 
        err.message.includes('shop device') || 
        err.message.includes('device approval')
      ));

    if (isDeviceError) {
      showAuthModal();
      setLoginRole('manager');

      const lockCard = document.getElementById('auth-device-lock-card');
      const lockTitle = document.getElementById('auth-device-lock-title');
      const lockMsg = document.getElementById('auth-device-lock-msg');
      const devNameEl = document.getElementById('auth-lock-device-name');
      const reqTimeEl = document.getElementById('auth-lock-request-time');

      if (lockCard) lockCard.classList.remove('hidden');

      const isBlocked = err.code === 'DEVICE_BLOCKED' || (err.message && err.message.includes('only from the shop device'));
      if (lockTitle) {
        lockTitle.textContent = isBlocked
          ? 'Access allowed only from the shop device'
          : 'This device is not approved. Waiting for Owner approval';
      }
      if (lockMsg) {
        lockMsg.textContent = isBlocked
          ? 'Access is allowed only from the registered shop device approved by the Owner. This attempt has been logged in Audit History.'
          : (err.message || 'Waiting for Owner approval. A request has been sent to the Owner with your device name and time.');
      }
      if (devNameEl) devNameEl.textContent = API.getDeviceName();
      if (reqTimeEl) reqTimeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      showToast(err.message || 'Device not approved', 'error');
      return true;
    }
    return false;
  };

  const selectOwnerPhone = (phone) => {
    const input = document.getElementById('input-owner-mobile');
    if (input) {
      input.value = phone;
    }
    localStorage.setItem('csb_owner_mobile', phone);
    state.pinInput = '';
    renderPinDots();
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.classList.add('hidden');
  };

  const quickLogin = async (role) => {
    try {
      let pin = '8734';
      let phone = null;
      if (role === 'owner') {
        const ownerPhonePins = {
          '9976885361': '7688',
          '9025351545': '5351',
          '9842329813': '2329',
          '9043979813': '4397',
        };
        const mobileInput = document.getElementById('input-owner-mobile');
        phone = (mobileInput && mobileInput.value ? mobileInput.value : (localStorage.getItem('csb_owner_mobile') || '9025351545')).trim().replace(/\D/g, '').slice(-10);
        pin = ownerPhonePins[phone] || '5351';
      }
      const branchSelect = document.getElementById('login-branch-select');
      const selectedBranchId = (branchSelect && branchSelect.value) || API.getBranchId();

      const res = await API.loginWithPin(role, pin, phone, selectedBranchId);
      API.setToken(res.token);
      API.setUser(res.user);
      if (res.branch) {
        API.setBranchId(res.branch.id || res.branch._id);
        API.setBranchName(res.branch.name);
      }
      state.currentUser = res.user;
      setupUserSession(res.user, true);
      updateUserUI();
      closeAuthModal();
      switchTab('sales');
      showToast(`Logged in as ${res.user.name}`, 'success');
      await loadStaffList();
      await loadDailySales(state.salesDate);
      await loadDailyAttendance(state.attendanceDate);
    } catch (err) {
      if (!handleDeviceLockError(err)) {
        showToast(err.message, 'error');
      }
    }
  };

  const appendPinDigit = async (digit) => {
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.classList.add('hidden');

    if (state.pinInput.length < 4) {
      state.pinInput += digit;
      renderPinDots();

      if (state.pinInput.length === 4) {
        // Auto submit PIN
        try {
          let phone = null;
          if (state.selectedLoginRole === 'owner') {
            const mobileEl = document.getElementById('input-owner-mobile');
            phone = (mobileEl ? mobileEl.value : '').trim().replace(/\D/g, '').slice(-10);
            if (!phone || phone.length < 10) {
              if (errEl) {
                errEl.textContent = 'Please enter 10-digit registered mobile number';
                errEl.classList.remove('hidden');
              }
              showToast('Please enter your 10-digit registered mobile number', 'error');
              if (mobileEl) mobileEl.focus();
              state.pinInput = '';
              renderPinDots();
              return;
            }
            localStorage.setItem('csb_owner_mobile', phone);
          }

          const branchSelect = document.getElementById('login-branch-select');
          const selectedBranchId = (branchSelect && branchSelect.value) || API.getBranchId();

          const res = await API.loginWithPin(state.selectedLoginRole, state.pinInput, phone, selectedBranchId);
          API.setToken(res.token);
          API.setUser(res.user);
          if (res.branch) {
            API.setBranchId(res.branch.id || res.branch._id);
            API.setBranchName(res.branch.name);
          }
          state.currentUser = res.user;
          setupUserSession(res.user, true);
          state.pinInput = '';
          renderPinDots();
          updateUserUI();
          closeAuthModal();
          switchTab('sales');
          showToast(`Welcome, ${res.user.name}!`, 'success');
          await loadStaffList();
          await loadDailySales(state.salesDate);
          await loadDailyAttendance(state.attendanceDate);
        } catch (err) {
          if (!handleDeviceLockError(err)) {
            if (errEl) {
              errEl.textContent = err.message || 'Invalid credentials. Please try again.';
              errEl.classList.remove('hidden');
            }
          }
          state.pinInput = '';
          renderPinDots();
        }
      }
    }
  };

  const backspacePin = () => {
    state.pinInput = state.pinInput.slice(0, -1);
    renderPinDots();
  };

  const clearPin = () => {
    state.pinInput = '';
    renderPinDots();
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.classList.add('hidden');
  };

  const renderPinDots = () => {
    for (let i = 1; i <= 4; i++) {
      const dot = document.getElementById(`pin-dot-${i}`);
      if (dot) {
        if (i <= state.pinInput.length) {
          dot.className = 'w-4 h-4 rounded-full border-2 border-amber-600 bg-amber-600 transition-all scale-110';
        } else {
          dot.className = 'w-4 h-4 rounded-full border-2 border-slate-300 bg-white transition-all';
        }
      }
    }
  };

  const togglePasswordLogin = () => {
    const box = document.getElementById('password-login-box');
    box.classList.toggle('hidden');
  };

  const submitPasswordLogin = async () => {
    const u = document.getElementById('pwd-username').value.trim();
    const p = document.getElementById('pwd-password').value;
    const phoneEl = document.getElementById('pwd-phone');
    const phone = phoneEl ? phoneEl.value.trim().replace(/\D/g, '').slice(-10) : '';

    if (!u || !p) {
      showToast('Enter username and password', 'error');
      return;
    }
    try {
      const branchSelect = document.getElementById('login-branch-select');
      const selectedBranchId = (branchSelect && branchSelect.value) || API.getBranchId();

      const res = await API.loginWithPassword(u, p, phone, selectedBranchId);
      API.setToken(res.token);
      API.setUser(res.user);
      if (res.branch) {
        API.setBranchId(res.branch.id || res.branch._id);
        API.setBranchName(res.branch.name);
      }
      state.currentUser = res.user;
      setupUserSession(res.user, true);
      updateUserUI();
      closeAuthModal();
      switchTab('sales');
      showToast(`Welcome, ${res.user.name}!`, 'success');
      await loadStaffList();
      await loadDailySales(state.salesDate);
      await loadDailyAttendance(state.attendanceDate);
    } catch (err) {
      if (!handleDeviceLockError(err)) {
        showToast(err.message, 'error');
      }
    }
  };

  // --- NAVIGATION TABS ---
  const switchTab = (tabName) => {
    const isOwner = state.currentUser && state.currentUser.role === 'owner';

    // Disallow Reports, History, Settings, Sales History, and Attendance History for Manager
    if ((tabName === 'reports' || tabName === 'history' || tabName === 'settings' || tabName === 'sales-history' || tabName === 'attendance-history') && !isOwner) {
      showToast('This section is restricted to Owner only.', 'error');
      tabName = 'sales';
    }

    state.currentTab = tabName;

    // Hide all screens
    document.querySelectorAll('.screen-view').forEach((s) => s.classList.add('hidden'));

    // Highlight active nav tab
    document.querySelectorAll('.nav-tab').forEach((t) => {
      if (t.dataset.tab === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    // Show target screen
    const target = document.getElementById(`screen-${tabName}`);
    if (target) target.classList.remove('hidden');

    // Trigger tab-specific loaders
    if (tabName === 'sales') {
      loadDailySales(state.salesDate);
    } else if (tabName === 'attendance') {
      loadDailyAttendance(state.attendanceDate);
    } else if (tabName === 'records') {
      loadPastDateRecord(document.getElementById('past-date-picker').value || state.salesDate);
    } else if (tabName === 'reports') {
      loadMonthlyReports(state.currentMonth);
    } else if (tabName === 'sales-history') {
      initSalesHistoryScreen();
    } else if (tabName === 'attendance-history') {
      initAttendanceHistoryScreen();
    } else if (tabName === 'history') {
      loadAuditHistory();
    } else if (tabName === 'staff') {
      loadStaffDirectory();
    } else if (tabName === 'settings') {
      loadOwnerSettings();
    }
  };

  // --- PERMISSION CHECK & ENFORCEMENT ---
  const isEditableDate = (dateStr) => {
    if (!state.currentUser) return false;
    if (state.currentUser.role === 'owner') return true; // Owner can edit ANY date
    // Manager can only edit TODAY
    return dateStr === getTodayString();
  };

  const applyEditPermissions = () => {
    const canEdit = isEditableDate(state.salesDate);
    const notice = document.getElementById('sales-readonly-notice');
    const saveBtn = document.getElementById('btn-save-sales');
    const addExpBtn = document.getElementById('btn-add-expense');

    if (canEdit) {
      if (notice) notice.classList.add('hidden');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      if (addExpBtn) addExpBtn.classList.remove('hidden');
    } else {
      if (notice) notice.classList.remove('hidden');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (addExpBtn) addExpBtn.classList.add('hidden');
    }

    // Toggle input disabled states
    const inputs = ['input-system-sales', 'input-total-cash', 'input-total-gpay', 'input-total-expenses', 'input-expense-note', 'input-sales-notes'];
    inputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !canEdit;
    });

    const attachBtn = document.getElementById('btn-attach-bill-photo');
    if (attachBtn) {
      attachBtn.disabled = !canEdit;
      attachBtn.classList.toggle('opacity-50', !canEdit);
      attachBtn.classList.toggle('cursor-not-allowed', !canEdit);
    }
  };

  // --- DAILY SALES ENTRY SCREEN ---
  const shiftSalesDate = (offsetDays) => {
    const [y, m, d] = state.salesDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + offsetDays);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    state.salesDate = `${year}-${month}-${day}`;
    loadDailySales(state.salesDate);
  };

  const loadDailySales = async (dateStr, showLoadingToast = false) => {
    state.salesDate = dateStr;

    // Update Header Date Display
    const dateEl = document.getElementById('sales-display-date');
    const dayEl = document.getElementById('sales-day-name');
    const todayBadge = document.getElementById('sales-today-badge');

    if (dateEl) dateEl.textContent = dateStr;
    if (dayEl) dayEl.textContent = formatDateFriendly(dateStr);
    if (todayBadge) {
      todayBadge.classList.toggle('hidden', dateStr !== getTodayString());
    }

    try {
      const res = await API.getDailySales(dateStr);
      state.salesData = res.data;

      // Populate Inputs (Cash, GPay, Expense all as identical columns)
      document.getElementById('input-system-sales').value = res.data.systemSales || '';
      document.getElementById('input-total-cash').value = res.data.totalCash || '';
      document.getElementById('input-total-gpay').value = res.data.totalGpay || '';

      let totalExp = res.data.totalExpenses || 0;
      if (!totalExp && res.data.expenses && res.data.expenses.length > 0) {
        totalExp = res.data.expenses.reduce((a, c) => a + (Number(c.amount) || 0), 0);
      }
      document.getElementById('input-total-expenses').value = totalExp || '';

      // Populate Single Expense Photo and Note
      let photoUrl = res.data.expensePhotoUrl || '';
      let photoFilename = res.data.expensePhotoFilename || '';
      let expNote = res.data.expenseNote || '';

      if (!photoUrl && res.data.expenses && res.data.expenses.length > 0) {
        const withPhoto = res.data.expenses.find((e) => e.photoUrl);
        if (withPhoto) {
          photoUrl = withPhoto.photoUrl;
          photoFilename = withPhoto.photoFilename;
        }
        expNote = res.data.expenses[0].note || '';
      }

      state.expensePhotoUrl = photoUrl;
      state.expensePhotoFilename = photoFilename;
      state.expenseNote = expNote;

      const noteInput = document.getElementById('input-expense-note');
      if (noteInput) noteInput.value = expNote;

      document.getElementById('input-sales-notes').value = res.data.notes || '';

      // Render Single Expense Photo UI
      renderExpensePhotoUI();

      // Calculate Live Tally
      recalculateSalesTally();

      // Apply Edit Restrictions
      applyEditPermissions();

      if (showLoadingToast) {
        showToast(`Loaded sales for ${dateStr}`, 'info');
      }
    } catch (err) {
      showToast('Error loading daily sales: ' + err.message, 'error');
    }
  };

  // --- SINGLE EXPENSE BILL PHOTO CONTROLLER ---
  const renderExpensePhotoUI = () => {
    const statusEl = document.getElementById('expense-photo-status');
    const actionContainer = document.getElementById('expense-photo-action-container');
    const previewBox = document.getElementById('expense-photo-preview-box');
    const imgEl = document.getElementById('expense-photo-img');
    const canEdit = isEditableDate(state.salesDate);

    const hasPhoto = Boolean(state.expensePhotoUrl);

    if (hasPhoto) {
      if (statusEl) statusEl.textContent = 'Bill photo attached';
      if (previewBox) {
        previewBox.classList.remove('hidden');
        if (imgEl) imgEl.src = state.expensePhotoUrl;
      }
      if (actionContainer) actionContainer.innerHTML = '';
    } else {
      if (statusEl) statusEl.textContent = 'No bill photo attached';
      if (previewBox) {
        previewBox.classList.add('hidden');
        if (imgEl) imgEl.src = '';
      }
      if (actionContainer) {
        actionContainer.innerHTML = `
          <button
            type="button"
            id="btn-attach-bill-photo"
            ${!canEdit ? 'disabled' : ''}
            onclick="app.triggerExpensePhotoUpload()"
            class="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <span class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> <span>Attach Bill</span></span>
          </button>
        `;
      }
    }
  };

  const triggerExpensePhotoUpload = () => {
    if (!isEditableDate(state.salesDate)) {
      showToast('Past date is view-only for Manager', 'error');
      return;
    }
    const input = document.getElementById('global-photo-input');
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const handlePhotoFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Compressing & uploading bill photo...', 'info');

    try {
      const res = await API.uploadPhoto(file);
      state.expensePhotoUrl = res.photoUrl;
      state.expensePhotoFilename = res.photoFilename;
      renderExpensePhotoUI();
      showToast('Bill photo attached successfully!', 'success');
    } catch (err) {
      showToast('Photo upload failed: ' + err.message, 'error');
    }
  };

  const removeExpensePhoto = async () => {
    if (!isEditableDate(state.salesDate)) {
      showToast('Past date is view-only for Manager', 'error');
      return;
    }
    if (state.expensePhotoFilename) {
      try {
        await API.deletePhoto(state.salesDate, state.expensePhotoFilename);
      } catch (e) {
        console.warn('Failed to delete on server:', e);
      }
    }
    state.expensePhotoUrl = '';
    state.expensePhotoFilename = '';
    renderExpensePhotoUI();
    showToast('Bill photo removed', 'info');
  };

  const openExpensePhotoLightbox = () => {
    if (state.expensePhotoUrl) {
      openLightbox(state.expensePhotoUrl, 'Expense Bill Photo');
    }
  };

  // --- REAL-TIME SALES TALLY CALCULATION ---
  const recalculateSalesTally = () => {
    const sysVal = Number(document.getElementById('input-system-sales').value) || 0;
    const cashVal = Number(document.getElementById('input-total-cash').value) || 0;
    const gpayVal = Number(document.getElementById('input-total-gpay').value) || 0;
    const expVal = Number(document.getElementById('input-total-expenses').value) || 0;

    const totalAccounted = Math.round((expVal + cashVal + gpayVal) * 100) / 100;
    const difference = Math.round((totalAccounted - sysVal) * 100) / 100;
    const isMatched = (difference === 0);

    // Update Tally Card Elements
    const tallyCard = document.getElementById('tally-card');
    const tallyTitle = document.getElementById('tally-title');
    const tallyBadge = document.getElementById('tally-badge');
    const sysValEl = document.getElementById('tally-sys-val');
    const accValEl = document.getElementById('tally-accounted-val');
    const diffLabelEl = document.getElementById('tally-diff-label');
    const diffValEl = document.getElementById('tally-diff-val');
    const warningBanner = document.getElementById('tally-warning-banner');
    const warningText = document.getElementById('tally-warning-text');

    if (sysValEl) sysValEl.textContent = `₹${sysVal.toLocaleString('en-IN')}`;
    if (accValEl) accValEl.textContent = `₹${totalAccounted.toLocaleString('en-IN')} (Cash ₹${cashVal} + GPay ₹${gpayVal} + Exp ₹${expVal})`;

    if (isMatched) {
      // Balanced Perfectly
      tallyCard.className = 'rounded-2xl p-4 shadow-sm border bg-emerald-500/10 border-emerald-500/30 transition-all';
      tallyTitle.innerHTML = '<span>Sales Tally Status</span>';
      tallyBadge.className = 'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-emerald-600 text-white';
      tallyBadge.textContent = 'MATCHED';
      diffLabelEl.textContent = 'Difference:';
      diffValEl.textContent = '₹0 (Balanced)';
      diffValEl.className = 'font-display font-extrabold text-base text-emerald-700';
      if (warningBanner) warningBanner.classList.add('hidden');
    } else {
      // Tally Discrepancy (Excess or Shortage)
      const isExcess = difference > 0;
      tallyCard.className = 'rounded-2xl p-4 shadow-sm border bg-rose-500/10 border-rose-500/30 transition-all';
      tallyTitle.innerHTML = '<span>Sales Tally Status</span>';
      tallyBadge.className = 'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-rose-600 text-white animate-pulse';
      tallyBadge.textContent = 'MISMATCH';
      diffLabelEl.textContent = `Difference (${isExcess ? 'Excess' : 'Shortage'}):`;
      diffValEl.textContent = `${isExcess ? '+' : ''}₹${Math.abs(difference).toLocaleString('en-IN')}`;
      diffValEl.className = 'font-display font-extrabold text-base text-rose-700';

      if (warningBanner) {
        warningBanner.classList.remove('hidden');
        warningText.innerHTML = `<strong>Tally Mismatch of ₹${Math.abs(difference)} (${isExcess ? 'Cash/GPay/Exp higher than system' : 'System sales higher than cash/GPay/Exp'})</strong>. The entry can still be saved and is flagged clearly for Owner and Manager.`;
      }
    }
  };

  // --- SAVE SALES ENTRY ---
  const saveDailySales = async () => {
    if (!isEditableDate(state.salesDate)) {
      showToast('Permission denied: Past dates are view-only for Manager.', 'error');
      return;
    }

    const sysVal = Number(document.getElementById('input-system-sales').value) || 0;
    const cashVal = Number(document.getElementById('input-total-cash').value) || 0;
    const gpayVal = Number(document.getElementById('input-total-gpay').value) || 0;
    const expVal = Number(document.getElementById('input-total-expenses').value) || 0;
    const notesVal = document.getElementById('input-sales-notes').value;
    const expenseNoteVal = (document.getElementById('input-expense-note') ? document.getElementById('input-expense-note').value : '') || '';

    const payload = {
      date: state.salesDate,
      systemSales: sysVal,
      totalExpenses: expVal,
      expenses: [
        {
          amount: expVal,
          note: expenseNoteVal || 'Shop Expenses',
          photoUrl: state.expensePhotoUrl || '',
          photoFilename: state.expensePhotoFilename || '',
        }
      ],
      expensePhotoUrl: state.expensePhotoUrl || '',
      expensePhotoFilename: state.expensePhotoFilename || '',
      expenseNote: expenseNoteVal,
      totalCash: cashVal,
      totalGpay: gpayVal,
      notes: notesVal,
    };

    const saveBtn = document.getElementById('btn-save-sales');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> <span>Saving Sales Entry...</span>';

    try {
      const res = await API.saveDailySales(payload);
      state.salesData = res.data;
      showToast(res.message, res.data.isTallied ? 'success' : 'warning');
      recalculateSalesTally();
    } catch (err) {
      showToast('Failed to save sales: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
  };

  // --- STAFF ATTENDANCE SCREEN ---
  const shiftAttendanceDate = (offsetDays) => {
    const [y, m, d] = state.attendanceDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + offsetDays);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    state.attendanceDate = `${year}-${month}-${day}`;
    loadDailyAttendance(state.attendanceDate);
  };

  const loadDailyAttendance = async (dateStr, showToastMsg = false) => {
    state.attendanceDate = dateStr;

    const dateEl = document.getElementById('attendance-display-date');
    const dayEl = document.getElementById('attendance-day-name');
    const todayBadge = document.getElementById('attendance-today-badge');

    if (dateEl) dateEl.textContent = dateStr;
    if (dayEl) dayEl.textContent = formatDateFriendly(dateStr);
    if (todayBadge) {
      todayBadge.classList.toggle('hidden', dateStr !== getTodayString());
    }

    try {
      const res = await API.getAttendance(dateStr);
      state.attendanceData = res.data;
      renderAttendanceCards(res.data.records || []);
      updateAttendanceSummaryCounts();

      // Check edit permissions
      const canEdit = isEditableDate(dateStr);
      const saveBtn = document.getElementById('btn-save-attendance');
      if (saveBtn) {
        saveBtn.disabled = !canEdit;
        saveBtn.classList.toggle('opacity-50', !canEdit);
      }

      if (showToastMsg) showToast(`Loaded attendance for ${dateStr}`, 'info');
    } catch (err) {
      showToast('Error loading attendance: ' + err.message, 'error');
    }
  };

  const renderAttendanceCards = (records) => {
    const container = document.getElementById('attendance-cards-list');
    if (!container) return;
    container.innerHTML = '';

    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-xs text-slate-400 bg-white rounded-2xl border border-dashed">
          No staff members found. Add staff to mark attendance.
        </div>
      `;
      return;
    }

    const canEdit = isEditableDate(state.attendanceDate);

    records.forEach((rec, idx) => {
      const inTimeObj = parseTime12h(rec.inTime, '08:00 AM');
      const outTimeObj = parseTime12h(rec.outTime, '09:00 PM');
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl p-4 shadow-sm border border-amber-100 space-y-3';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-display font-bold text-sm text-slate-800">${rec.staffName}</h4>
            <span class="text-[11px] text-slate-500 font-medium">Daily Attendance Record</span>
          </div>
          <span class="status-indicator text-xs font-bold px-2.5 py-0.5 rounded-full ${
            rec.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
            rec.status === 'Half-day' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
          }" id="att-badge-${idx}">
            ${rec.status}
          </span>
        </div>

        <!-- 3-Way Segmented Buttons (Large Touch Target) -->
        <div class="grid grid-cols-3 gap-2">
          <button
            type="button"
            ${!canEdit ? 'disabled' : ''}
            onclick="app.setStaffAttendanceStatus(${idx}, 'Present')"
            class="att-btn att-btn-present ${rec.status === 'Present' ? 'selected' : ''}"
            id="att-btn-p-${idx}"
          >
            Present
          </button>
          <button
            type="button"
            ${!canEdit ? 'disabled' : ''}
            onclick="app.setStaffAttendanceStatus(${idx}, 'Half-day')"
            class="att-btn att-btn-half ${rec.status === 'Half-day' ? 'selected' : ''}"
            id="att-btn-h-${idx}"
          >
            Half-day
          </button>
          <button
            type="button"
            ${!canEdit ? 'disabled' : ''}
            onclick="app.setStaffAttendanceStatus(${idx}, 'Absent')"
            class="att-btn att-btn-absent ${rec.status === 'Absent' ? 'selected' : ''}"
            id="att-btn-a-${idx}"
          >
            Absent
          </button>
        </div>

        <!-- In-Time and Out-Time Controls with Touch Clock & 1-Tap AM / PM -->
        <div class="grid grid-cols-2 gap-2 pt-1 text-xs">
          <!-- In-Time Block -->
          <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/90 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <span>In-Time</span>
              </span>
              ${canEdit ? `
                <button
                  type="button"
                  onclick="app.setAttendanceTimeToNow(${idx}, 'inTime')"
                  class="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 active:scale-95 px-2 py-0.5 rounded-md transition"
                  title="Set to Current Time"
                >
                  ⏱️ Now
                </button>
              ` : ''}
            </div>

            <div class="flex items-center gap-1.5">
              <!-- Touch Clock Button -->
              <button
                type="button"
                ${!canEdit ? 'disabled' : ''}
                onclick="app.openClockPicker(${idx}, 'inTime')"
                class="flex-1 py-2 px-1.5 bg-white border border-slate-200 hover:border-amber-400 active:bg-amber-50 rounded-xl font-display font-extrabold text-sm text-slate-800 flex items-center justify-center gap-1 shadow-xs transition"
                title="Tap to select clock timing"
              >
                
                <span>${inTimeObj.time12}</span>
              </button>

              <!-- AM / PM Segmented Toggle Buttons -->
              <div class="flex rounded-xl p-0.5 bg-slate-200/90 border border-slate-300/60 text-[10px] font-extrabold">
                <button
                  type="button"
                  ${!canEdit ? 'disabled' : ''}
                  onclick="app.toggleStaffAmPm(${idx}, 'inTime', 'AM')"
                  class="px-2 py-1.5 rounded-lg transition ${inTimeObj.ampm === 'AM' ? 'bg-amber-600 text-white font-black shadow-xs' : 'text-slate-600 hover:text-slate-800'}"
                >
                  AM
                </button>
                <button
                  type="button"
                  ${!canEdit ? 'disabled' : ''}
                  onclick="app.toggleStaffAmPm(${idx}, 'inTime', 'PM')"
                  class="px-2 py-1.5 rounded-lg transition ${inTimeObj.ampm === 'PM' ? 'bg-amber-800 text-white font-black shadow-xs' : 'text-slate-600 hover:text-slate-800'}"
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          <!-- Out-Time Block -->
          <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/90 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <span>Out-Time</span>
              </span>
              ${canEdit ? `
                <button
                  type="button"
                  onclick="app.setAttendanceTimeToNow(${idx}, 'outTime')"
                  class="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 active:scale-95 px-2 py-0.5 rounded-md transition"
                  title="Set to Current Time"
                >
                  ⏱️ Now
                </button>
              ` : ''}
            </div>

            <div class="flex items-center gap-1.5">
              <!-- Touch Clock Button -->
              <button
                type="button"
                ${!canEdit ? 'disabled' : ''}
                onclick="app.openClockPicker(${idx}, 'outTime')"
                class="flex-1 py-2 px-1.5 bg-white border border-slate-200 hover:border-amber-400 active:bg-amber-50 rounded-xl font-display font-extrabold text-sm text-slate-800 flex items-center justify-center gap-1 shadow-xs transition"
                title="Tap to select clock timing"
              >
                
                <span>${outTimeObj.time12}</span>
              </button>

              <!-- AM / PM Segmented Toggle Buttons -->
              <div class="flex rounded-xl p-0.5 bg-slate-200/90 border border-slate-300/60 text-[10px] font-extrabold">
                <button
                  type="button"
                  ${!canEdit ? 'disabled' : ''}
                  onclick="app.toggleStaffAmPm(${idx}, 'outTime', 'AM')"
                  class="px-2 py-1.5 rounded-lg transition ${outTimeObj.ampm === 'AM' ? 'bg-amber-600 text-white font-black shadow-xs' : 'text-slate-600 hover:text-slate-800'}"
                >
                  AM
                </button>
                <button
                  type="button"
                  ${!canEdit ? 'disabled' : ''}
                  onclick="app.toggleStaffAmPm(${idx}, 'outTime', 'PM')"
                  class="px-2 py-1.5 rounded-lg transition ${outTimeObj.ampm === 'PM' ? 'bg-amber-800 text-white font-black shadow-xs' : 'text-slate-600 hover:text-slate-800'}"
                >
                  PM
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  };

  const setStaffAttendanceStatus = (index, status) => {
    if (state.attendanceData && state.attendanceData.records[index]) {
      state.attendanceData.records[index].status = status;

      // Update button visual styles immediately
      ['p', 'h', 'a'].forEach((key) => {
        const btn = document.getElementById(`att-btn-${key}-${index}`);
        if (btn) btn.classList.remove('selected');
      });

      const activeKey = status === 'Present' ? 'p' : status === 'Half-day' ? 'h' : 'a';
      const activeBtn = document.getElementById(`att-btn-${activeKey}-${index}`);
      if (activeBtn) activeBtn.classList.add('selected');

      const badge = document.getElementById(`att-badge-${index}`);
      if (badge) {
        badge.textContent = status;
        badge.className = `status-indicator text-xs font-bold px-2.5 py-0.5 rounded-full ${
          status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
          status === 'Half-day' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
        }`;
      }

      updateAttendanceSummaryCounts();
    }
  };

  const setAttendanceTimeToNow = (index, field) => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const timeStr = `${String(formattedHours).padStart(2, '0')}:${minutes} ${ampm}`;

    if (state.attendanceData && state.attendanceData.records[index]) {
      state.attendanceData.records[index][field] = timeStr;
      renderAttendanceCards(state.attendanceData.records);
    }
  };

  // --- TOUCH CLOCK MODAL CONTROLLER ---
  const openClockPicker = (staffIndex, field) => {
    if (!isEditableDate(state.attendanceDate)) {
      showToast('Past date is view-only for Manager', 'error');
      return;
    }

    const rec = state.attendanceData.records[staffIndex];
    if (!rec) return;

    state.activeClockStaffIndex = staffIndex;
    state.activeClockField = field;

    const parsed = parseTime12h(rec[field], field === 'inTime' ? '08:00 AM' : '09:00 PM');
    state.activeClockHour = parsed.hour;
    state.activeClockMinute = parsed.minute;
    state.activeClockAmPm = parsed.ampm;

    const subTitle = document.getElementById('clock-modal-subtitle');
    if (subTitle) {
      subTitle.textContent = `${field === 'inTime' ? 'In-Time (வருகை நேரம்)' : 'Out-Time (புறப்படும் நேரம்)'} for ${rec.staffName}`;
    }

    renderClockModalDisplay();
    document.getElementById('modal-clock-picker').classList.remove('hidden');
  };

  const closeClockPicker = () => {
    const modal = document.getElementById('modal-clock-picker');
    if (modal) modal.classList.add('hidden');
  };

  const selectClockHour = (hour) => {
    state.activeClockHour = hour;
    renderClockModalDisplay();
  };

  const selectClockMinute = (minute) => {
    state.activeClockMinute = minute;
    renderClockModalDisplay();
  };

  const selectClockAmPm = (ampm) => {
    state.activeClockAmPm = ampm;
    renderClockModalDisplay();
  };

  const setClockPreset = (hour, minute, ampm) => {
    state.activeClockHour = hour;
    state.activeClockMinute = minute;
    state.activeClockAmPm = ampm;
    renderClockModalDisplay();
  };

  const renderClockModalDisplay = () => {
    const hEl = document.getElementById('clock-disp-hour');
    const mEl = document.getElementById('clock-disp-minute');
    const apEl = document.getElementById('clock-disp-ampm');
    const hHint = document.getElementById('clock-hour-hint');
    const mHint = document.getElementById('clock-minute-hint');
    const btnAm = document.getElementById('clock-btn-am');
    const btnPm = document.getElementById('clock-btn-pm');

    if (hEl) hEl.textContent = state.activeClockHour;
    if (mEl) mEl.textContent = state.activeClockMinute;
    if (apEl) apEl.textContent = state.activeClockAmPm;
    if (hHint) hHint.textContent = `Hour: ${state.activeClockHour}`;
    if (mHint) mHint.textContent = `Minute: ${state.activeClockMinute}`;

    if (btnAm && btnPm) {
      if (state.activeClockAmPm === 'AM') {
        btnAm.className = 'py-2.5 rounded-xl font-display font-extrabold text-xs transition shadow-xs bg-amber-600 text-white';
        btnPm.className = 'py-2.5 rounded-xl font-display font-extrabold text-xs transition text-slate-600 bg-white border border-slate-200';
      } else {
        btnPm.className = 'py-2.5 rounded-xl font-display font-extrabold text-xs transition shadow-xs bg-amber-800 text-white';
        btnAm.className = 'py-2.5 rounded-xl font-display font-extrabold text-xs transition text-slate-600 bg-white border border-slate-200';
      }
    }

    // Highlight selected hour button
    document.querySelectorAll('.clock-hour-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.hour === state.activeClockHour);
    });

    // Highlight selected minute button
    document.querySelectorAll('.clock-min-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.min === state.activeClockMinute);
    });
  };

  const confirmClockTime = () => {
    const idx = state.activeClockStaffIndex;
    const field = state.activeClockField;
    if (idx !== null && field && state.attendanceData && state.attendanceData.records[idx]) {
      const timeStr = `${state.activeClockHour}:${state.activeClockMinute} ${state.activeClockAmPm}`;
      state.attendanceData.records[idx][field] = timeStr;
      renderAttendanceCards(state.attendanceData.records);
    }
    closeClockPicker();
  };

  const toggleStaffAmPm = (idx, field, targetAmPm) => {
    if (!isEditableDate(state.attendanceDate)) {
      showToast('Past date is view-only for Manager', 'error');
      return;
    }
    if (state.attendanceData && state.attendanceData.records[idx]) {
      const current = parseTime12h(state.attendanceData.records[idx][field]);
      const newTime = `${current.hour}:${current.minute} ${targetAmPm}`;
      state.attendanceData.records[idx][field] = newTime;
      renderAttendanceCards(state.attendanceData.records);
    }
  };

  const updateStaffAttendanceTime = (index, field, value) => {
    if (state.attendanceData && state.attendanceData.records[index]) {
      state.attendanceData.records[index][field] = value;
    }
  };

  const markAllAttendancePresent = () => {
    if (!isEditableDate(state.attendanceDate)) {
      showToast('Past date is view-only for Manager', 'error');
      return;
    }
    if (state.attendanceData && state.attendanceData.records) {
      state.attendanceData.records.forEach((r) => {
        r.status = 'Present';
      });
      renderAttendanceCards(state.attendanceData.records);
      updateAttendanceSummaryCounts();
      showToast('All staff marked Present', 'info');
    }
  };

  const updateAttendanceSummaryCounts = () => {
    if (!state.attendanceData || !state.attendanceData.records) return;
    let p = 0, h = 0, a = 0;
    state.attendanceData.records.forEach((r) => {
      if (r.status === 'Present') p++;
      else if (r.status === 'Half-day') h++;
      else if (r.status === 'Absent') a++;
    });

    const elP = document.getElementById('att-count-present');
    const elH = document.getElementById('att-count-half');
    const elA = document.getElementById('att-count-absent');

    if (elP) elP.textContent = `${p} Present`;
    if (elH) elH.textContent = `${h} Half`;
    if (elA) elA.textContent = `${a} Absent`;
  };

  const saveAttendance = async () => {
    if (!isEditableDate(state.attendanceDate)) {
      showToast('Permission denied: Past dates are view-only for Manager.', 'error');
      return;
    }

    if (!state.attendanceData || !state.attendanceData.records) {
      showToast('No attendance records to save', 'error');
      return;
    }

    const saveBtn = document.getElementById('btn-save-attendance');
    const orig = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> <span>Saving Attendance...</span>';

    try {
      const res = await API.saveAttendance({
        date: state.attendanceDate,
        records: state.attendanceData.records,
      });
      showToast(res.message, 'success');
    } catch (err) {
      showToast('Failed to save attendance: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = orig;
    }
  };

  // --- PAST RECORDS SCREEN & CALENDAR ---
  const setPastDateToToday = () => {
    const today = getTodayString();
    const picker = document.getElementById('past-date-picker');
    if (picker) picker.value = today;
    loadPastDateRecord(today);
  };

  const loadPastDateRecord = async (dateStr) => {
    if (!dateStr) return;
    const container = document.getElementById('past-record-details');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-8 text-xs text-slate-500 font-semibold">
        <span class="inline-block animate-spin text-lg mb-1">⏳</span><br>Loading records for ${dateStr}...
      </div>
    `;

    try {
      const [salesRes, attRes] = await Promise.all([
        API.getDailySales(dateStr),
        API.getAttendance(dateStr),
      ]);

      const sales = salesRes.data;
      const att = attRes.data;
      const isOwner = state.currentUser && state.currentUser.role === 'owner';
      const isToday = (dateStr === getTodayString());
      const canEdit = isOwner || isToday;

      container.innerHTML = `
        <!-- Action Header -->
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 flex items-center justify-between">
          <div>
            <h4 class="font-display font-extrabold text-base text-slate-800">${formatDateFriendly(dateStr)}</h4>
            <span class="text-[11px] text-slate-500">${isToday ? 'Today\'s Live Record' : 'Past Historical Record'}</span>
          </div>
          ${canEdit ? `
            <button
              onclick="app.editPastDateDirectly('${dateStr}')"
              class="px-3.5 py-2 bg-amber-600 active:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <span>Edit This Date</span>
            </button>
          ` : `
            <span class="text-xs font-bold px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl">
              View Only
            </span>
          `}
        </div>

        <!-- Sales Breakdown Card -->
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 space-y-3">
          <div class="flex items-center justify-between">
            <h5 class="font-display font-bold text-sm text-slate-800">Sales & Tally Summary</h5>
            <span class="text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
              sales.isTallied ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }">
              ${sales.isTallied ? 'TALLY MATCHED' : `MISMATCH (Diff: ₹${sales.difference})`}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-2.5 bg-slate-50 rounded-xl">
              <span class="text-slate-400 font-bold block text-[10px] uppercase">System Sales</span>
              <span class="font-display font-bold text-base text-slate-800">₹${(sales.systemSales || 0).toLocaleString('en-IN')}</span>
            </div>
            <div class="p-2.5 bg-rose-50/60 rounded-xl">
              <span class="text-rose-500 font-bold block text-[10px] uppercase">Total Expenses</span>
              <span class="font-display font-bold text-base text-rose-800">₹${(sales.totalExpenses || 0).toLocaleString('en-IN')}</span>
            </div>
            <div class="p-2.5 bg-emerald-50/60 rounded-xl">
              <span class="text-emerald-600 font-bold block text-[10px] uppercase">Cash</span>
              <span class="font-display font-bold text-base text-emerald-800">₹${(sales.totalCash || 0).toLocaleString('en-IN')}</span>
            </div>
            <div class="p-2.5 bg-blue-50/60 rounded-xl">
              <span class="text-blue-600 font-bold block text-[10px] uppercase">GPay</span>
              <span class="font-display font-bold text-base text-blue-800">₹${(sales.totalGpay || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>

          ${sales.notes ? `
            <div class="p-2 bg-amber-50/50 rounded-xl text-xs text-amber-900 border border-amber-200/50">
              <span class="font-bold">Closing Note:</span> ${sales.notes}
            </div>
          ` : ''}
        </div>

        <!-- Expenses & Bill Photo Card -->
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 space-y-3">
          <div class="flex items-center justify-between">
            <h5 class="font-display font-bold text-sm text-slate-800">Expenses</h5>
            <span class="font-display font-extrabold text-base text-rose-700">₹${(sales.totalExpenses || 0).toLocaleString('en-IN')}</span>
          </div>

          ${(sales.expenseNote || (sales.expenses && sales.expenses[0] && sales.expenses[0].note && sales.expenses[0].note !== 'General Expense' && sales.expenses[0].note !== 'Shop Expenses')) ? `
            <div class="p-2.5 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200/60">
              <span class="font-bold text-slate-500 block text-[10px] uppercase">Expense Note / விவரம்</span>
              <span class="font-medium">${sales.expenseNote || sales.expenses[0].note}</span>
            </div>
          ` : ''}

          ${(sales.expensePhotoUrl || (sales.expenses && sales.expenses.find(e => e.photoUrl))) ? `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
              <div class="flex items-center gap-2.5">
                <img
                  src="${sales.expensePhotoUrl || (sales.expenses.find(e => e.photoUrl) ? sales.expenses.find(e => e.photoUrl).photoUrl : '')}"
                  alt="Bill"
                  class="w-12 h-12 object-cover rounded-xl border-2 border-amber-500 shadow-xs cursor-pointer"
                  onclick="app.openLightbox('${sales.expensePhotoUrl || (sales.expenses.find(e => e.photoUrl) ? sales.expenses.find(e => e.photoUrl).photoUrl : '')}', 'Bill Photo')"
                >
                <div>
                  <span class="font-bold text-slate-800 block">Bill Photo Attached</span>
                  <span class="text-[10px] text-slate-500 font-medium">Tap image to zoom / inspect</span>
                </div>
              </div>
              <button
                type="button"
                onclick="app.openLightbox('${sales.expensePhotoUrl || (sales.expenses.find(e => e.photoUrl) ? sales.expenses.find(e => e.photoUrl).photoUrl : '')}', 'Bill Photo')"
                class="px-3 py-1.5 bg-amber-100 active:bg-amber-200 text-amber-900 rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition"
              >
                <span>View Bill</span>
              </button>
            </div>
          ` : `
            <p class="text-xs text-slate-400 py-1">No bill photo attached for this date.</p>
          `}
        </div>

        <!-- Attendance Summary Card -->
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 space-y-3">
          <h5 class="font-display font-bold text-sm text-slate-800">Staff Attendance (${att.records ? att.records.length : 0})</h5>
          
          ${!att.records || att.records.length === 0 ? `
            <p class="text-xs text-slate-400 py-2">No attendance recorded for this date.</p>
          ` : `
            <div class="space-y-1.5">
              ${att.records.map((r) => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs">
                  <span class="font-bold text-slate-800">${r.staffName}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-slate-500">${r.inTime} - ${r.outTime}</span>
                    <span class="font-bold px-2 py-0.5 rounded-full text-[10px] ${
                      r.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                      r.status === 'Half-day' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }">${r.status}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs">
          Error loading record: ${err.message}
        </div>
      `;
    }
  };

  const editPastDateDirectly = (dateStr) => {
    state.salesDate = dateStr;
    state.attendanceDate = dateStr;
    switchTab('sales');
  };

  // --- MONTHLY REPORTS SCREEN ---
  const loadMonthlyReports = async (monthStr) => {
    if (!monthStr) return;
    state.currentMonth = monthStr;

    try {
      const res = await API.getMonthlyReports(monthStr);
      const sales = res.sales;
      const att = res.attendance;

      // Update Sales Totals
      document.getElementById('rep-total-sys').textContent = `₹${(sales.totalSystemSales || 0).toLocaleString('en-IN')}`;
      document.getElementById('rep-total-exp').textContent = `₹${(sales.totalExpenses || 0).toLocaleString('en-IN')}`;
      document.getElementById('rep-total-cash').textContent = `₹${(sales.totalCash || 0).toLocaleString('en-IN')}`;
      document.getElementById('rep-total-gpay').textContent = `₹${(sales.totalGpay || 0).toLocaleString('en-IN')}`;

      document.getElementById('rep-matched-days').textContent = `${sales.matchedDaysCount} Days Matched`;
      document.getElementById('rep-mismatch-days').textContent = `${sales.mismatchDaysCount} Days Discrepancy`;

      // Update Total Staff Monthly Salary Payout
      const totalPayoutEl = document.getElementById('report-total-payout-val');
      if (totalPayoutEl) {
        totalPayoutEl.textContent = `₹${(att.totalStaffSalaryPayout || 0).toLocaleString('en-IN')}`;
      }

      // Render Staff Attendance Summary & Salary Calculation (Owner only)
      const container = document.getElementById('report-staff-salary-list');
      if (!container) return;
      container.innerHTML = '';

      if (!att.staffSummary || att.staffSummary.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-xs text-slate-400">No staff attendance recorded in ${monthStr}.</div>
        `;
        return;
      }

      att.staffSummary.forEach((staff) => {
        const item = document.createElement('div');
        item.className = 'p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs shadow-sm';
        item.innerHTML = `
          <div class="flex items-center justify-between">
            <div>
              <span class="font-display font-bold text-slate-900 text-sm">${staff.name}</span>
              <span class="text-[11px] text-slate-500 font-semibold block">${staff.role} • Per Day Salary: ₹${staff.dailySalary || 0}/day</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] font-extrabold uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded block">Month Salary</span>
              <span class="font-display font-extrabold text-base text-emerald-700">₹${(staff.calculatedMonthSalary || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1 border-t border-slate-200/60 text-[11px] font-semibold text-slate-600">
            <span class="text-emerald-700">Present: ${staff.daysPresent}</span>
            <span>•</span>
            <span class="text-amber-700">Half: ${staff.halfDays}</span>
            <span>•</span>
            <span class="text-rose-700">Absent: ${staff.absences}</span>
            <span class="ml-auto text-slate-800 font-bold">Payable: ${staff.effectiveDays} days</span>
          </div>

          <div class="p-2 bg-white rounded-xl text-[11px] text-slate-600 font-medium border border-slate-200/50 flex items-center justify-between">
            <span class="text-slate-400 font-semibold text-[10px] uppercase">Calculation:</span>
            <span class="font-mono text-slate-700 font-bold">${staff.calculationFormula || `${staff.effectiveDays} days × ₹${staff.dailySalary}`}</span>
          </div>
        `;
        container.appendChild(item);
      });
    } catch (err) {
      showToast('Error loading reports: ' + err.message, 'error');
    }
  };

  // --- SALES & ATTENDANCE HISTORY REPORTS (OWNER ONLY) ---

  const openSalesHistoryScreen = () => {
    switchTab('sales-history');
  };

  const openAttendanceHistoryScreen = () => {
    switchTab('attendance-history');
  };

  const getShiftedDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const initSalesHistoryScreen = () => {
    const fromInput = document.getElementById('sales-hist-from');
    const toInput = document.getElementById('sales-hist-to');
    const today = getTodayString();
    if (!fromInput.value || !toInput.value) {
      toInput.value = today;
      fromInput.value = getShiftedDateStr(6); // default Last 7 days
    }

    // Populate branch selector
    const branchSel = document.getElementById('sales-hist-branch');
    if (branchSel && state.branches && state.branches.length > 0) {
      const isOwner = state.currentUser && state.currentUser.role === 'owner';
      let options = '';
      if (isOwner) {
        options += '<option value="all">Consolidated: All Branches</option>';
      }
      options += state.branches.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
      branchSel.innerHTML = options;
      branchSel.value = API.getBranchId() || state.branches[0]._id;
    }

    loadSalesHistory();
  };

  const onSalesHistBranchChange = () => {
    loadSalesHistory();
  };

  const setSalesHistRange = (preset) => {
    const today = getTodayString();
    const toInput = document.getElementById('sales-hist-to');
    const fromInput = document.getElementById('sales-hist-from');
    toInput.value = today;

    if (preset === 'today') {
      fromInput.value = today;
    } else if (preset === 'last7') {
      fromInput.value = getShiftedDateStr(6);
    } else if (preset === 'last15') {
      fromInput.value = getShiftedDateStr(14);
    } else if (preset === 'last30') {
      fromInput.value = getShiftedDateStr(29);
    }

    loadSalesHistory();
  };

  const validateDateRangeUI = (from, to, errorBoxId, errorTextId) => {
    const errorBox = document.getElementById(errorBoxId);
    const errorText = document.getElementById(errorTextId);

    const showError = (msg) => {
      if (errorText) errorText.textContent = msg;
      if (errorBox) errorBox.classList.remove('hidden');
      showToast(msg, 'error');
      return false;
    };

    if (!from || !to) {
      return showError('Please select both From and To dates.');
    }
    const dFrom = new Date(from);
    const dTo = new Date(to);
    if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime())) {
      return showError('Invalid date range.');
    }
    if (dTo < dFrom) {
      return showError('From date must be earlier than or equal to To date.');
    }

    const diffDays = Math.round((dTo - dFrom) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      return showError('Please select a period of 1 month or less.');
    }

    if (errorBox) errorBox.classList.add('hidden');
    return true;
  };

  const loadSalesHistory = async () => {
    const fromInput = document.getElementById('sales-hist-from');
    const toInput = document.getElementById('sales-hist-to');
    if (!fromInput || !toInput) return;

    const from = fromInput.value;
    const to = toInput.value;

    if (!validateDateRangeUI(from, to, 'sales-hist-error', 'sales-hist-error-text')) {
      const resContainer = document.getElementById('sales-hist-results');
      if (resContainer) resContainer.classList.add('hidden');
      return;
    }

    const branchSel = document.getElementById('sales-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    try {
      const res = await API.getSalesHistory(from, to, branchId);
      renderSalesHistoryUI(res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const renderSalesHistoryUI = (data) => {
    const resultsContainer = document.getElementById('sales-hist-results');
    if (!resultsContainer) return;
    resultsContainer.classList.remove('hidden');

    const singleCard = document.getElementById('sales-hist-single-card');
    const allBranchesCard = document.getElementById('sales-hist-all-branches-card');

    if (data.isAllBranches) {
      // Hide single branch table, show All Branches comparison table
      if (singleCard) singleCard.classList.add('hidden');
      if (allBranchesCard) allBranchesCard.classList.remove('hidden');

      const grand = data.grandTotal || {};
      document.getElementById('sales-hist-kpi-sys').textContent = `₹${(grand.systemSales || 0).toLocaleString('en-IN')}`;
      document.getElementById('sales-hist-kpi-exp').textContent = `₹${(grand.expenses || 0).toLocaleString('en-IN')}`;
      document.getElementById('sales-hist-kpi-cash').textContent = `₹${(grand.totalCash || 0).toLocaleString('en-IN')}`;
      document.getElementById('sales-hist-kpi-gpay').textContent = `₹${(grand.totalGpay || 0).toLocaleString('en-IN')}`;

      const banner = document.getElementById('sales-hist-tally-banner');
      const statusText = document.getElementById('sales-hist-tally-status');
      const statsText = document.getElementById('sales-hist-tally-stats');

      const diff = grand.difference || 0;
      if (diff === 0) {
        if (banner) banner.className = 'rounded-xl p-3 text-xs font-bold flex items-center justify-between border bg-emerald-50 border-emerald-200 text-emerald-800';
        if (statusText) statusText.textContent = 'All Branches Tally: Perfect Match (₹0 Difference)';
        if (statsText) statsText.textContent = `${grand.matchedDays || 0} matched days`;
      } else {
        if (banner) banner.className = 'rounded-xl p-3 text-xs font-bold flex items-center justify-between border bg-rose-50 border-rose-200 text-rose-800';
        const sign = diff > 0 ? '+' : '';
        if (statusText) statusText.textContent = `All Branches Tally Discrepancy: ${sign}₹${diff.toLocaleString('en-IN')}`;
        if (statsText) statsText.textContent = `${grand.mismatchDays || 0} mismatch days`;
      }

      // Populate All Branches table body
      const tbody = document.getElementById('sales-hist-all-table-body');
      if (tbody) {
        tbody.innerHTML = '';
        (data.branchSummaries || []).forEach(b => {
          const t = b.totals || {};
          const rowDiff = t.difference || 0;
          const isMismatch = Math.abs(rowDiff) > 0.01;
          const sign = rowDiff > 0 ? '+' : '';
          const diffBadge = isMismatch
            ? `<span class="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">${sign}₹${rowDiff.toLocaleString('en-IN')}</span>`
            : `<span class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">₹0</span>`;

          const tr = document.createElement('tr');
          tr.className = 'hover:bg-emerald-50/50 transition';
          tr.innerHTML = `
            <td class="py-2 px-2.5 font-bold text-slate-900">${b.branchName}</td>
            <td class="py-2 px-2 text-right font-semibold">₹${(t.systemSales || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-rose-600 font-semibold">₹${(t.expenses || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-emerald-700 font-semibold">₹${(t.totalCash || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-blue-700 font-semibold">₹${(t.totalGpay || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2.5 text-right">${diffBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      // Populate Grand Totals row
      const tfoot = document.getElementById('sales-hist-all-table-foot');
      if (tfoot) {
        const netSign = (grand.difference || 0) > 0 ? '+' : '';
        tfoot.innerHTML = `
          <tr>
            <td class="py-2.5 px-2.5 uppercase font-bold text-emerald-950">Grand Total</td>
            <td class="py-2.5 px-2 text-right font-bold">₹${(grand.systemSales || 0).toLocaleString('en-IN')}</td>
            <td class="py-2.5 px-2 text-right text-rose-700 font-bold">₹${(grand.expenses || 0).toLocaleString('en-IN')}</td>
            <td class="py-2.5 px-2 text-right text-emerald-800 font-bold">₹${(grand.totalCash || 0).toLocaleString('en-IN')}</td>
            <td class="py-2.5 px-2 text-right text-blue-800 font-bold">₹${(grand.totalGpay || 0).toLocaleString('en-IN')}</td>
            <td class="py-2.5 px-2.5 text-right font-bold ${grand.difference === 0 ? 'text-emerald-900' : 'text-rose-700'}">
              ${grand.difference === 0 ? '₹0' : `${netSign}₹${grand.difference.toLocaleString('en-IN')}`}
            </td>
          </tr>
        `;
      }
      return;
    }

    // Single Branch Rendering
    if (singleCard) singleCard.classList.remove('hidden');
    if (allBranchesCard) allBranchesCard.classList.add('hidden');

    const totals = data.totals || {};
    document.getElementById('sales-hist-kpi-sys').textContent = `₹${(totals.systemSales || 0).toLocaleString('en-IN')}`;
    document.getElementById('sales-hist-kpi-exp').textContent = `₹${(totals.expenses || 0).toLocaleString('en-IN')}`;
    document.getElementById('sales-hist-kpi-cash').textContent = `₹${(totals.totalCash || 0).toLocaleString('en-IN')}`;
    document.getElementById('sales-hist-kpi-gpay').textContent = `₹${(totals.totalGpay || 0).toLocaleString('en-IN')}`;

    const banner = document.getElementById('sales-hist-tally-banner');
    const statusText = document.getElementById('sales-hist-tally-status');
    const statsText = document.getElementById('sales-hist-tally-stats');

    const diff = totals.difference || 0;
    if (diff === 0) {
      if (banner) banner.className = 'rounded-xl p-3 text-xs font-bold flex items-center justify-between border bg-emerald-50 border-emerald-200 text-emerald-800';
      if (statusText) statusText.textContent = `${data.branchName || ''} Tally: Perfect Match (₹0 Difference)`;
      if (statsText) statsText.textContent = `${totals.matchedDays || 0} of ${data.count} days matched`;
    } else {
      if (banner) banner.className = 'rounded-xl p-3 text-xs font-bold flex items-center justify-between border bg-rose-50 border-rose-200 text-rose-800';
      const sign = diff > 0 ? '+' : '';
      if (statusText) statusText.textContent = `${data.branchName || ''} Tally: Discrepancy of ${sign}₹${diff.toLocaleString('en-IN')}`;
      if (statsText) statsText.textContent = `${totals.mismatchDays || 0} day(s) mismatch`;
    }

    const countEl = document.getElementById('sales-hist-record-count');
    if (countEl) countEl.textContent = `${data.count} Day${data.count !== 1 ? 's' : ''} (${data.branchName || ''})`;

    const tbody = document.getElementById('sales-hist-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (!data.records || data.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">No sales records in this period for ${data.branchName || 'this branch'}.</td></tr>`;
      } else {
        data.records.forEach((rec) => {
          const tr = document.createElement('tr');
          const rowDiff = Math.round(((rec.totalAccounted || 0) - (rec.systemSales || 0)) * 100) / 100;
          const isMismatch = !rec.isTallied || Math.abs(rowDiff) > 0.01;

          if (isMismatch) {
            tr.className = 'bg-rose-50/70 font-medium text-rose-950 hover:bg-rose-100/60 transition';
          } else {
            tr.className = 'hover:bg-amber-50/40 transition text-slate-700';
          }

          const sign = rowDiff > 0 ? '+' : '';
          const diffDisplay = isMismatch
            ? `<span class="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">${sign}₹${rowDiff.toLocaleString('en-IN')}</span>`
            : `<span class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">₹0</span>`;

          tr.innerHTML = `
            <td class="py-2 px-2.5 font-bold text-slate-900">${rec.date}</td>
            <td class="py-2 px-2 text-right font-semibold">₹${(rec.systemSales || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-rose-600 font-semibold">₹${(rec.totalExpenses || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-emerald-700 font-semibold">₹${(rec.totalCash || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2 text-right text-blue-700 font-semibold">₹${(rec.totalGpay || 0).toLocaleString('en-IN')}</td>
            <td class="py-2 px-2.5 text-right">${diffDisplay}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    const tfoot = document.getElementById('sales-hist-table-foot');
    if (tfoot) {
      const netSign = (totals.difference || 0) > 0 ? '+' : '';
      tfoot.innerHTML = `
        <tr>
          <td class="py-2.5 px-2.5 uppercase font-bold text-amber-900">Totals</td>
          <td class="py-2.5 px-2 text-right font-bold">₹${(totals.systemSales || 0).toLocaleString('en-IN')}</td>
          <td class="py-2.5 px-2 text-right text-rose-700 font-bold">₹${(totals.expenses || 0).toLocaleString('en-IN')}</td>
          <td class="py-2.5 px-2 text-right text-emerald-800 font-bold">₹${(totals.totalCash || 0).toLocaleString('en-IN')}</td>
          <td class="py-2.5 px-2 text-right text-blue-800 font-bold">₹${(totals.totalGpay || 0).toLocaleString('en-IN')}</td>
          <td class="py-2.5 px-2.5 text-right font-bold ${totals.difference === 0 ? 'text-emerald-800' : 'text-rose-700'}">
            ${totals.difference === 0 ? '₹0' : `${netSign}₹${totals.difference.toLocaleString('en-IN')}`}
          </td>
        </tr>
      `;
    }
  };

  const downloadSalesHistoryPDF = async () => {
    const from = document.getElementById('sales-hist-from').value;
    const to = document.getElementById('sales-hist-to').value;
    if (!validateDateRangeUI(from, to, 'sales-hist-error', 'sales-hist-error-text')) return;

    const branchSel = document.getElementById('sales-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    try {
      showToast('Generating Sales History PDF...', 'info');
      const blob = await API.downloadReportPDF(`/api/reports/sales-history/pdf?from=${from}&to=${to}&branchId=${branchId}`);
      const filename = `Chendurar_Sales_History_${from}_to_${to}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Sales History PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download Sales History PDF', 'error');
    }
  };

  const shareSalesHistoryPDF = async () => {
    const from = document.getElementById('sales-hist-from').value;
    const to = document.getElementById('sales-hist-to').value;
    if (!validateDateRangeUI(from, to, 'sales-hist-error', 'sales-hist-error-text')) return;

    const branchSel = document.getElementById('sales-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    try {
      showToast('Preparing PDF for sharing...', 'info');
      const blob = await API.downloadReportPDF(`/api/reports/sales-history/pdf?from=${from}&to=${to}&branchId=${branchId}`);
      const filename = `Chendurar_Sales_History_${from}_to_${to}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Chendurar Sweets & Bakery - Sales History',
          text: `Sales History Report from ${from} to ${to}`,
        });
        showToast('Shared successfully!', 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('PDF downloaded! You can now send it via WhatsApp.', 'info');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to share PDF', 'error');
      }
    }
  };

  // --- ATTENDANCE HISTORY LOGIC ---

  const initAttendanceHistoryScreen = () => {
    const fromInput = document.getElementById('att-hist-from');
    const toInput = document.getElementById('att-hist-to');
    const today = getTodayString();
    if (!fromInput.value || !toInput.value) {
      toInput.value = today;
      fromInput.value = getShiftedDateStr(6);
    }

    // Populate branch selector
    const branchSel = document.getElementById('att-hist-branch');
    if (branchSel && state.branches && state.branches.length > 0) {
      branchSel.innerHTML = state.branches.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
      branchSel.value = API.getBranchId() || state.branches[0]._id;
    }

    const filterSelect = document.getElementById('att-hist-staff-filter');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Staff Members</option>';
      (state.staffList || []).forEach((staff) => {
        const opt = document.createElement('option');
        opt.value = staff._id;
        opt.textContent = `${staff.name} (${staff.role})`;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = currentVal;
    }

    loadAttendanceHistory();
  };

  const onAttHistBranchChange = async () => {
    const branchSel = document.getElementById('att-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();
    try {
      // Reload staff for selected branch
      const res = await API.getStaffList(false, branchId);
      const filterSelect = document.getElementById('att-hist-staff-filter');
      if (filterSelect && res.staff) {
        filterSelect.innerHTML = '<option value="">All Staff Members</option>';
        res.staff.forEach((staff) => {
          const opt = document.createElement('option');
          opt.value = staff._id;
          opt.textContent = `${staff.name} (${staff.role})`;
          filterSelect.appendChild(opt);
        });
      }
    } catch (_) {}
    loadAttendanceHistory();
  };

  const setAttHistRange = (preset) => {
    const today = getTodayString();
    const toInput = document.getElementById('att-hist-to');
    const fromInput = document.getElementById('att-hist-from');
    toInput.value = today;

    if (preset === 'today') {
      fromInput.value = today;
    } else if (preset === 'last7') {
      fromInput.value = getShiftedDateStr(6);
    } else if (preset === 'last15') {
      fromInput.value = getShiftedDateStr(14);
    } else if (preset === 'last30') {
      fromInput.value = getShiftedDateStr(29);
    }

    loadAttendanceHistory();
  };

  const loadAttendanceHistory = async () => {
    const fromInput = document.getElementById('att-hist-from');
    const toInput = document.getElementById('att-hist-to');
    const filterSelect = document.getElementById('att-hist-staff-filter');
    if (!fromInput || !toInput) return;

    const from = fromInput.value;
    const to = toInput.value;
    const staffId = filterSelect ? filterSelect.value : '';

    if (!validateDateRangeUI(from, to, 'att-hist-error', 'att-hist-error-text')) {
      const resContainer = document.getElementById('att-hist-results');
      if (resContainer) resContainer.classList.add('hidden');
      return;
    }

    const branchSel = document.getElementById('att-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    try {
      const res = await API.getAttendanceHistory(from, to, staffId, branchId);
      renderAttendanceHistoryUI(res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const renderAttendanceHistoryUI = (data) => {
    const resultsContainer = document.getElementById('att-hist-results');
    if (!resultsContainer) return;
    resultsContainer.classList.remove('hidden');

    // Summary cards
    const summaryContainer = document.getElementById('att-hist-summary-list');
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
      if (!data.staffSummaries || data.staffSummaries.length === 0) {
        summaryContainer.innerHTML = `<div class="text-center py-3 text-xs text-slate-400">No staff summaries available.</div>`;
      } else {
        data.staffSummaries.forEach((sum) => {
          const item = document.createElement('div');
          item.className = 'p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs';
          const effective = sum.present + (sum.halfDay * 0.5);
          item.innerHTML = `
            <div>
              <h5 class="font-display font-bold text-slate-900 text-xs">${sum.name}</h5>
              <span class="text-[10px] text-slate-500 font-semibold">${sum.role}</span>
            </div>
            <div class="flex items-center gap-2 text-right">
              <span class="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">${sum.present}P</span>
              <span class="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">${sum.halfDay}H</span>
              <span class="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">${sum.absent}A</span>
              <span class="text-slate-800 font-extrabold text-[11px] bg-slate-200 px-2 py-0.5 rounded">Total: ${effective}d</span>
            </div>
          `;
          summaryContainer.appendChild(item);
        });
      }
    }

    // Table Records
    const countEl = document.getElementById('att-hist-record-count');
    if (countEl) countEl.textContent = `${data.count} Record${data.count !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('att-hist-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (!data.records || data.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">No attendance records found for this period.</td></tr>`;
      } else {
        data.records.forEach((rec) => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-blue-50/40 transition text-slate-700';

          let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
          if (rec.status === 'Half-day') badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
          if (rec.status === 'Absent') badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';

          tr.innerHTML = `
            <td class="py-2 px-2.5 font-bold text-slate-900">${rec.date}</td>
            <td class="py-2 px-2 font-semibold text-slate-800">${rec.staffName}</td>
            <td class="py-2 px-2 text-center text-slate-600 font-mono text-[10px]">${rec.inTime || '-'}</td>
            <td class="py-2 px-2 text-center text-slate-600 font-mono text-[10px]">${rec.outTime || '-'}</td>
            <td class="py-2 px-2.5 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeClass}">
                ${rec.status}
              </span>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  };

  const downloadAttendanceHistoryPDF = async () => {
    const from = document.getElementById('att-hist-from').value;
    const to = document.getElementById('att-hist-to').value;
    const staffId = document.getElementById('att-hist-staff-filter').value;
    const branchSel = document.getElementById('att-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    if (!validateDateRangeUI(from, to, 'att-hist-error', 'att-hist-error-text')) return;

    try {
      showToast('Generating Attendance History PDF...', 'info');
      const blob = await API.downloadReportPDF(`/api/reports/attendance-history/pdf?from=${from}&to=${to}&branchId=${branchId}${staffId ? '&staffId=' + staffId : ''}`);
      const filename = `Chendurar_Attendance_History_${from}_to_${to}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Attendance History PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download Attendance History PDF', 'error');
    }
  };

  const shareAttendanceHistoryPDF = async () => {
    const from = document.getElementById('att-hist-from').value;
    const to = document.getElementById('att-hist-to').value;
    const staffId = document.getElementById('att-hist-staff-filter').value;
    const branchSel = document.getElementById('att-hist-branch');
    const branchId = branchSel ? branchSel.value : API.getBranchId();

    if (!validateDateRangeUI(from, to, 'att-hist-error', 'att-hist-error-text')) return;

    try {
      showToast('Preparing Attendance PDF for sharing...', 'info');
      const blob = await API.downloadReportPDF(`/api/reports/attendance-history/pdf?from=${from}&to=${to}&branchId=${branchId}${staffId ? '&staffId=' + staffId : ''}`);
      const filename = `Chendurar_Attendance_History_${from}_to_${to}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Chendurar Sweets & Bakery - Attendance History',
          text: `Attendance History Report from ${from} to ${to}`,
        });
        showToast('Shared successfully!', 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('PDF downloaded! You can now send it via WhatsApp.', 'info');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to share PDF', 'error');
      }
    }
  };

  // --- AUDIT HISTORY SCREEN (OWNER ONLY) ---
  const filterHistory = (module) => {
    state.historyFilter = module;
    document.querySelectorAll('.hist-filter-btn').forEach((b) => {
      if (b.dataset.module === module) {
        b.className = 'hist-filter-btn px-3 py-1 rounded-lg bg-amber-600 text-white font-bold';
      } else {
        b.className = 'hist-filter-btn px-3 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium';
      }
    });
    loadAuditHistory();
  };

  const loadAuditHistory = async () => {
    if (!state.currentUser || state.currentUser.role !== 'owner') {
      showToast('Audit history is restricted to Owner only.', 'error');
      return;
    }

    const container = document.getElementById('history-logs-container');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-6 text-xs text-slate-500 font-semibold">
        <span class="inline-block animate-spin text-lg mb-1">⏳</span><br>Loading audit trail...
      </div>
    `;

    try {
      const isOwner = state.currentUser && state.currentUser.role === 'owner';
      const params = {};
      if (state.historyFilter && state.historyFilter !== 'ALL') {
        params.module = state.historyFilter;
      }

      const res = await API.getHistory(params);
      const logs = res.logs || [];

      if (logs.length === 0) {
        container.innerHTML = `
          <div class="text-center py-8 text-xs text-slate-400 bg-white rounded-2xl border border-dashed">
            No audit logs found for this filter.
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      logs.forEach((log) => {
        const item = document.createElement('div');
        item.className = 'bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200/80 space-y-1.5 text-xs';
        
        const isPhotoAction = log.action.startsWith('PHOTO_');
        const roleIcon = log.performedBy.role === 'owner' ? 'Owner' : 'Manager';

        item.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800 flex items-center gap-1">
              <span>${roleIcon}</span>
              <span>${log.performedBy.name}</span>
            </span>
            <span class="text-[10px] text-slate-400 font-medium">
              ${new Date(log.timestamp).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div class="flex items-center gap-1.5 text-[11px]">
            <span class="px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
              log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
              log.action === 'UPDATE' ? 'bg-amber-100 text-amber-800' :
              log.action === 'DELETE' ? 'bg-rose-100 text-rose-800' :
              'bg-blue-100 text-blue-800'
            }">${log.action}</span>
            <span class="text-slate-600 font-semibold">${log.module} • ${log.recordDate || 'General'}</span>
            <span class="ml-auto text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1">
              ${log.branchName || 'Samayanallur Branch'}
            </span>
          </div>

          <p class="text-slate-800 font-medium text-xs leading-relaxed">
            ${log.description}
          </p>

          ${(log.oldValue || log.newValue) ? `
            <div class="p-2 bg-slate-50 rounded-xl text-[11px] font-mono space-y-0.5 border border-slate-200/50">
              ${log.oldValue ? `<div class="text-rose-700 line-through">Old: ${String(log.oldValue)}</div>` : ''}
              ${log.newValue ? `<div class="text-emerald-700">New: ${String(log.newValue)}</div>` : ''}
            </div>
          ` : ''}
          ${(() => {
            if (!isOwner) return '';

            const match = (log.newValue && String(log.newValue).match(/(.+?)\s*\((dev_[^)]+)\)/)) ||
                          (log.oldValue && String(log.oldValue).match(/(.+?)\s*\((dev_[^)]+)\)/));
            if (match) {
              const devName = match[1].trim();
              const devId = match[2].trim();
              return `
                <div class="pt-2 flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onclick="app.approveDeviceFromLog('${devId}', '${devName.replace(/'/g, "\\'")}')"
                    class="py-1.5 px-3 bg-emerald-600 active:bg-emerald-700 text-white font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1.5 transition"
                  >
                    <span>Allow Access</span>
                  </button>
                  <button
                    type="button"
                    onclick="app.blockDeviceFromLog('${devId}', '${devName.replace(/'/g, "\\'")}')"
                    class="py-1.5 px-3 bg-rose-600 active:bg-rose-700 text-white font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1.5 transition"
                  >
                    <span>Block Device</span>
                  </button>
                  <button
                    type="button"
                    onclick="app.switchTab('settings')"
                    class="py-1.5 px-3 bg-slate-100 active:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition"
                  >
                    <span>Device Settings</span>
                  </button>
                </div>
              `;
            }

            // If it's a Manager Login or action card
            if (log.performedBy && log.performedBy.role === 'manager') {
              return `
                <div class="pt-2 flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onclick="app.blockApprovedDevice()"
                    class="py-1.5 px-3 bg-rose-600 active:bg-rose-700 text-white font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1.5 transition"
                  >
                    <span>Block Shop Device</span>
                  </button>
                  <button
                    type="button"
                    onclick="app.switchTab('settings')"
                    class="py-1.5 px-3 bg-slate-100 active:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition"
                  >
                    <span>Device Settings</span>
                  </button>
                </div>
              `;
            }

            return '';
          })()}
        `;
        container.appendChild(item);
      });
    } catch (err) {
      container.innerHTML = `
        <div class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs">
          ${err.message}
        </div>
      `;
    }
  };

  // --- STAFF DIRECTORY SCREEN ---
  const loadStaffList = async () => {
    try {
      const res = await API.getStaffList();
      state.staffList = res.staff || [];
    } catch (e) {
      console.warn('Error fetching staff:', e);
    }
  };

  const loadStaffDirectory = async () => {
    await loadStaffList();
    const container = document.getElementById('staff-directory-list');
    if (!container) return;
    container.innerHTML = '';

    if (state.staffList.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-xs text-slate-400 bg-white rounded-2xl border border-dashed">
          No staff members registered. Tap 'Add Staff' above.
        </div>
      `;
      return;
    }

    const isOwner = state.currentUser && state.currentUser.role === 'owner';

    state.staffList.forEach((staff) => {
      const item = document.createElement('div');
      item.className = 'bg-white rounded-2xl p-4 shadow-sm border border-amber-100 flex items-center justify-between';
      item.innerHTML = `
        <div>
          <h4 class="font-display font-bold text-sm text-slate-800">${staff.name}</h4>
          <p class="text-xs text-slate-500">${staff.role}${isOwner ? ` • Per Day Salary: ₹${staff.dailySalary || staff.wageRate || 0}/day` : ''}</p>
          ${staff.phone ? `<p class="text-[11px] text-slate-400 font-medium">${staff.phone}</p>` : ''}
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="app.openEditStaffModal('${staff._id}')" class="p-2 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold active:bg-amber-100 flex items-center justify-center" title="Edit">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="app.removeStaff('${staff._id}', '${staff.name}')" class="p-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold active:bg-rose-100 flex items-center justify-center" title="Delete">
            <svg class="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
      container.appendChild(item);
    });
  };

  const openAddStaffModal = () => {
    const isOwner = state.currentUser && state.currentUser.role === 'owner';
    const wageSec = document.getElementById('staff-form-wage-section');
    if (wageSec) wageSec.classList.toggle('hidden', !isOwner);

    document.getElementById('staff-modal-title').textContent = 'Add New Staff Member';
    document.getElementById('staff-form-id').value = '';
    document.getElementById('staff-form-name').value = '';
    document.getElementById('staff-form-role').value = '';
    document.getElementById('staff-form-phone').value = '';
    document.getElementById('staff-form-wage-type').value = 'daily';
    document.getElementById('staff-form-wage-rate').value = '600';
    document.getElementById('modal-staff').classList.remove('hidden');
  };

  const openEditStaffModal = (id) => {
    const s = state.staffList.find(x => x._id === id);
    if (!s) return;
    const isOwner = state.currentUser && state.currentUser.role === 'owner';
    const wageSec = document.getElementById('staff-form-wage-section');
    if (wageSec) wageSec.classList.toggle('hidden', !isOwner);

    document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
    document.getElementById('staff-form-id').value = s._id;
    document.getElementById('staff-form-name').value = s.name;
    document.getElementById('staff-form-role').value = s.role;
    document.getElementById('staff-form-phone').value = s.phone || '';
    document.getElementById('staff-form-wage-type').value = 'daily';
    document.getElementById('staff-form-wage-rate').value = s.dailySalary || s.wageRate || 500;
    document.getElementById('modal-staff').classList.remove('hidden');
  };

  const closeStaffModal = () => {
    document.getElementById('modal-staff').classList.add('hidden');
  };

  const submitStaffForm = async () => {
    const id = document.getElementById('staff-form-id').value;
    const name = document.getElementById('staff-form-name').value.trim();
    const role = document.getElementById('staff-form-role').value.trim();
    const phone = document.getElementById('staff-form-phone').value.trim();

    if (!name) {
      showToast('Staff name is required', 'error');
      return;
    }

    const isOwner = state.currentUser && state.currentUser.role === 'owner';
    const payload = {
      name,
      role,
      phone,
    };

    // Owner alone can set or update per day salary
    if (isOwner) {
      const perDaySalary = Number(document.getElementById('staff-form-wage-rate').value) || 0;
      payload.dailySalary = perDaySalary;
      payload.wageRate = perDaySalary;
      payload.wageType = 'daily';
    }

    try {
      if (id) {
        await API.updateStaff(id, payload);
        showToast(`Updated profile for ${name}`, 'success');
      } else {
        await API.addStaff(payload);
        showToast(`Added staff member ${name}${isOwner ? ` with ₹${payload.dailySalary}/day` : ''}`, 'success');
      }
      closeStaffModal();
      await loadStaffList();
      if (state.currentTab === 'staff') loadStaffDirectory();
      if (state.currentTab === 'attendance') loadDailyAttendance(state.attendanceDate);
    } catch (err) {
      showToast('Failed to save staff: ' + err.message, 'error');
    }
  };

  const removeStaff = async (id, name) => {
    if (!confirm(`Are you sure you want to remove staff member "${name}"?`)) return;
    try {
      await API.deleteStaff(id);
      showToast(`Removed staff member ${name}`, 'info');
      await loadStaffList();
      if (state.currentTab === 'staff') loadStaffDirectory();
      if (state.currentTab === 'attendance') loadDailyAttendance(state.attendanceDate);
    } catch (err) {
      showToast('Failed to remove staff: ' + err.message, 'error');
    }
  };

  // --- PHOTO LIGHTBOX ---
  const openLightbox = (url, caption) => {
    state.lightboxRotation = 0;
    const modal = document.getElementById('modal-photo-lightbox');
    const img = document.getElementById('lightbox-img');
    const capEl = document.getElementById('lightbox-caption');
    const dlLink = document.getElementById('lightbox-download-link');

    if (img) {
      img.src = url;
      img.style.transform = 'rotate(0deg)';
    }
    if (capEl) capEl.textContent = caption || 'Expense Bill Receipt';
    if (dlLink) dlLink.href = url;
    if (modal) modal.classList.remove('hidden');
  };

  const rotateLightboxImg = () => {
    state.lightboxRotation = (state.lightboxRotation + 90) % 360;
    const img = document.getElementById('lightbox-img');
    if (img) {
      img.style.transform = `rotate(${state.lightboxRotation}deg)`;
    }
  };

  const closeLightbox = () => {
    const modal = document.getElementById('modal-photo-lightbox');
    if (modal) modal.classList.add('hidden');
  };

  // --- TOAST NOTIFICATIONS ---
  const showToast = (message, type = 'info') => {
    const alertBox = document.getElementById('global-alert-box');
    const alertIcon = document.getElementById('global-alert-icon');
    const alertTitle = document.getElementById('global-alert-title');
    const alertMsg = document.getElementById('global-alert-msg');

    if (!alertBox) return;

    if (type === 'success') {
      alertBox.className = 'mb-3 p-3.5 rounded-2xl shadow-sm border bg-emerald-500/15 border-emerald-500/30 text-emerald-950 transition-all';
      alertIcon.innerHTML = window.renderIcon ? renderIcon('check', 'w-6 h-6 text-emerald-500') : '';
      alertTitle.textContent = 'Success';
    } else if (type === 'warning') {
      alertBox.className = 'mb-3 p-3.5 rounded-2xl shadow-sm border bg-amber-500/20 border-amber-500/40 text-amber-950 transition-all';
      alertIcon.innerHTML = window.renderIcon ? renderIcon('alert', 'w-6 h-6 text-amber-500') : '';
      alertTitle.textContent = 'Notice / Flagged';
    } else if (type === 'error') {
      alertBox.className = 'mb-3 p-3.5 rounded-2xl shadow-sm border bg-rose-500/15 border-rose-500/30 text-rose-950 transition-all';
      alertIcon.innerHTML = window.renderIcon ? renderIcon('close', 'w-6 h-6 text-rose-500') : '';
      alertTitle.textContent = 'Error';
    } else {
      alertBox.className = 'mb-3 p-3.5 rounded-2xl shadow-sm border bg-blue-500/15 border-blue-500/30 text-blue-950 transition-all';
      alertIcon.textContent = 'ℹ️';
      alertTitle.textContent = 'Information';
    }

    alertMsg.textContent = message;
    alertBox.classList.remove('hidden');

    setTimeout(() => {
      alertBox.classList.add('hidden');
    }, 5000);
  };

  // --- OWNER SETTINGS & SHOP DEVICE MANAGEMENT ---
  const checkPendingDeviceForOwner = async () => {
    if (!state.currentUser || state.currentUser.role !== 'owner') {
      const banner = document.getElementById('device-request-banner');
      if (banner) banner.classList.add('hidden');
      return;
    }
    try {
      const data = await API.getDeviceStatus();
      const banner = document.getElementById('device-request-banner');
      const bannerText = document.getElementById('device-request-banner-text');
      const badge = document.getElementById('badge-settings-pending');

      if (data.pendingDevice && data.pendingDevice.deviceId) {
        if (banner) banner.classList.remove('hidden');
        if (bannerText) {
          bannerText.textContent = `Shop Manager requests approval: ${data.pendingDevice.deviceName || 'Device'}`;
        }
        if (badge) badge.classList.remove('hidden');
      } else {
        if (banner) banner.classList.add('hidden');
        if (badge) badge.classList.add('hidden');
      }
    } catch (e) {
      console.warn('Check pending device failed:', e);
    }
  };

  const checkDeviceApprovalStatus = async () => {
    try {
      showToast('Checking device approval status...', 'info');
      const data = await API.getDeviceStatus();
      const myDeviceId = API.getDeviceId();

      if (data.approvedDevice && data.approvedDevice.deviceId === myDeviceId) {
        showToast('Your device is approved! Enter PIN to login.', 'success');
        const lockCard = document.getElementById('auth-device-lock-card');
        if (lockCard) lockCard.classList.add('hidden');
        setLoginRole('manager');
      } else if (data.pendingDevice && data.pendingDevice.deviceId === myDeviceId) {
        showToast('⏳ Waiting for Owner approval. Please ask the Owner to approve your device.', 'warning');
      } else {
        showToast('This device is not approved. Access allowed only from shop device.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Status check failed', 'error');
    }
  };

  // --- OWNER SETTINGS & BRANCH MANAGEMENT ---
  const renderSettingsBranchesList = (branches) => {
    const listEl = document.getElementById('settings-branches-list');
    if (!listEl) return;

    if (!branches || branches.length === 0) {
      listEl.innerHTML = `
        <div class="p-4 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
          No branches configured. Click "Add Branch" to create one.
        </div>
      `;
      return;
    }

    listEl.innerHTML = branches.map((b) => {
      const mgrName = b.manager ? b.manager.name : 'Not Assigned';
      const mgrUser = b.manager ? b.manager.username : ('manager_' + b.code.toLowerCase());
      const statusBadge = b.isActive !== false
        ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>'
        : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">Disabled</span>';

      return `
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3 text-xs">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-extrabold text-sm text-slate-900">${b.name}</span>
                <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">${b.code}</span>
                ${statusBadge}
              </div>
              ${b.address ? `<p class="text-slate-500 text-[11px] mt-1">${b.address}</p>` : ''}
              ${b.phone ? `<p class="text-slate-500 text-[11px] font-medium">${b.phone}</p>` : ''}
            </div>
          </div>

          <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200/60 flex items-center justify-between text-[11px]">
            <div class="space-y-0.5">
              <span class="text-slate-500 font-medium text-[10px] uppercase">Shop Manager Account</span>
              <div class="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                <span>Manager: ${mgrUser}</span>
                <span class="font-normal text-slate-500">(${mgrName})</span>
              </div>
            </div>
            <button
              type="button"
              onclick="app.openResetManagerModal('${b._id}')"
              class="px-2.5 py-1.5 bg-amber-50 active:bg-amber-100 border border-amber-300 text-amber-900 font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-xs transition"
            >
              <span>Reset PIN</span>
            </button>
          </div>

          <div class="flex gap-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              onclick="app.openEditBranchModal('${b._id}')"
              class="flex-1 py-2 bg-slate-100 active:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition"
            >
              <span>Edit Branch</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  const populateSettingsDeviceBranchSelect = (branches) => {
    const sel = document.getElementById('settings-device-branch-select');
    if (!sel) return;

    const currentTarget = state.settingsDeviceBranchId || API.getBranchId() || (branches[0] ? branches[0]._id : '');
    state.settingsDeviceBranchId = currentTarget;

    sel.innerHTML = branches.map((b) => {
      const selected = b._id === currentTarget ? 'selected' : '';
      return `<option value="${b._id}" ${selected}>${b.name} (${b.code})</option>`;
    }).join('');
  };

  const onSettingsDeviceBranchChange = async (branchId) => {
    state.settingsDeviceBranchId = branchId;
    await loadOwnerSettings(false);
  };

  const openAddBranchModal = () => {
    document.getElementById('branch-form-id').value = '';
    document.getElementById('branch-form-title').textContent = 'Add New Branch';
    document.getElementById('branch-form-name').value = '';
    document.getElementById('branch-form-code').value = '';
    document.getElementById('branch-form-address').value = '';
    document.getElementById('branch-form-phone').value = '';
    const pinEl = document.getElementById('branch-form-manager-pin');
    if (pinEl) pinEl.value = '8734';
    const mgrBox = document.getElementById('branch-form-manager-box');
    if (mgrBox) mgrBox.classList.remove('hidden');
    document.getElementById('branch-form-active').checked = true;
    document.getElementById('modal-branch-form').classList.remove('hidden');
  };

  const openEditBranchModal = (branchId) => {
    const b = (state.allBranches || []).find((x) => x._id === branchId);
    if (!b) return;

    document.getElementById('branch-form-id').value = b._id;
    document.getElementById('branch-form-title').textContent = 'Edit Branch';
    document.getElementById('branch-form-name').value = b.name || '';
    document.getElementById('branch-form-code').value = b.code || '';
    document.getElementById('branch-form-address').value = b.address || '';
    document.getElementById('branch-form-phone').value = b.phone || '';
    const mgrBox = document.getElementById('branch-form-manager-box');
    if (mgrBox) mgrBox.classList.add('hidden'); // Manager account edited separately
    document.getElementById('branch-form-active').checked = b.isActive !== false;
    document.getElementById('modal-branch-form').classList.remove('hidden');
  };

  const closeBranchModal = () => {
    const m = document.getElementById('modal-branch-form');
    if (m) m.classList.add('hidden');
  };

  const saveBranchForm = async () => {
    const id = document.getElementById('branch-form-id').value.trim();
    const name = document.getElementById('branch-form-name').value.trim();
    const code = document.getElementById('branch-form-code').value.trim().toUpperCase();
    const address = document.getElementById('branch-form-address').value.trim();
    const phone = document.getElementById('branch-form-phone').value.trim();
    const isActive = document.getElementById('branch-form-active').checked;

    if (!name) {
      showToast('Please enter a branch name.', 'error');
      return;
    }
    if (!code) {
      showToast('Please enter a branch code (e.g. BRANCH4).', 'error');
      return;
    }

    try {
      if (!id) {
        // Create new branch
        const managerPin = document.getElementById('branch-form-manager-pin')?.value.trim() || '8734';
        if (!/^\d{4,6}$/.test(managerPin)) {
          showToast('Shop Manager PIN must be 4 to 6 digits.', 'error');
          return;
        }

        const res = await API.createBranch({
          name,
          code,
          address,
          phone,
          managerPin,
          isActive,
        });
        showToast(res.message || 'Branch created successfully!', 'success');
      } else {
        // Update existing branch
        const res = await API.updateBranch(id, {
          name,
          code,
          address,
          phone,
          isActive,
        });
        showToast(res.message || 'Branch updated successfully!', 'success');
      }

      closeBranchModal();
      await loadBranches();
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to save branch.', 'error');
    }
  };

  const openResetManagerModal = (branchId) => {
    const b = (state.allBranches || []).find((x) => x._id === branchId);
    if (!b) return;

    document.getElementById('bm-branch-id').value = b._id;
    document.getElementById('bm-branch-name-disp').textContent = b.name;
    document.getElementById('bm-username-disp').textContent = b.manager?.username || ('manager_' + b.code.toLowerCase());
    document.getElementById('bm-new-pin').value = '';
    document.getElementById('bm-new-password').value = '';
    document.getElementById('modal-branch-manager').classList.remove('hidden');
  };

  const closeBranchManagerModal = () => {
    const m = document.getElementById('modal-branch-manager');
    if (m) m.classList.add('hidden');
  };

  const submitResetBranchManager = async () => {
    const branchId = document.getElementById('bm-branch-id').value.trim();
    const newPin = document.getElementById('bm-new-pin').value.trim();
    const newPassword = document.getElementById('bm-new-password').value.trim();

    if (!newPin && !newPassword) {
      showToast('Please enter a new PIN or Password.', 'error');
      return;
    }

    if (newPin && !/^\d{4,6}$/.test(newPin)) {
      showToast('PIN must be 4 to 6 digits.', 'error');
      return;
    }

    try {
      const data = {};
      if (newPin) data.pin = newPin;
      if (newPassword) data.password = newPassword;

      const res = await API.resetBranchManager(branchId, data);
      showToast(res.message || 'Shop Manager credentials updated successfully!', 'success');
      closeBranchManagerModal();
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to update manager credentials.', 'error');
    }
  };

  const loadOwnerSettings = async (showSuccessToast = false) => {
    if (!state.currentUser || state.currentUser.role !== 'owner') return;

    try {
      // 0. Load Branches for Branch Management
      try {
        const branchesRes = await API.getAllBranches();
        if (branchesRes && branchesRes.success && Array.isArray(branchesRes.branches)) {
          state.allBranches = branchesRes.branches;
          renderSettingsBranchesList(state.allBranches);
          populateSettingsDeviceBranchSelect(state.allBranches);
        }
      } catch (bErr) {
        console.error('[Settings] Error loading branches:', bErr);
      }

      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId() || (state.allBranches[0] && state.allBranches[0]._id) || '';
      const data = await API.getDeviceStatus(targetBranchId);

      // 1. Pending Device Request Card
      const pendingCard = document.getElementById('settings-pending-card');
      const banner = document.getElementById('device-request-banner');
      const bannerText = document.getElementById('device-request-banner-text');
      const badge = document.getElementById('badge-settings-pending');

      if (data.pendingDevice && data.pendingDevice.deviceId) {
        if (pendingCard) {
          pendingCard.classList.remove('hidden');
          const devName = document.getElementById('pending-dev-name');
          const devId = document.getElementById('pending-dev-id');
          const devDate = document.getElementById('pending-dev-date');
          const devTime = document.getElementById('pending-dev-time');

          if (devName) devName.textContent = data.pendingDevice.deviceName || 'Unknown Device';
          if (devId) devId.textContent = data.pendingDevice.deviceId;
          if (devDate) {
            devDate.textContent = data.pendingDevice.requestedAt
              ? new Date(data.pendingDevice.requestedAt).toLocaleString()
              : 'Just now';
          }
          if (devTime) {
            devTime.textContent = data.pendingDevice.requestedAt
              ? new Date(data.pendingDevice.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
              : 'Pending';
          }
        }
        if (banner && bannerText) {
          banner.classList.remove('hidden');
          bannerText.textContent = `Shop Manager requests approval: ${data.pendingDevice.deviceName || 'Device'}`;
        }
        if (badge) badge.classList.remove('hidden');
      } else {
        if (pendingCard) pendingCard.classList.add('hidden');
        if (banner) banner.classList.add('hidden');
        if (badge) badge.classList.add('hidden');
      }

      // 2. Approved Device Details
      const detailsBox = document.getElementById('approved-device-details-box');
      const approvedBadge = document.getElementById('approved-dev-badge');
      const removeBtn = document.getElementById('btn-remove-approved-dev');
      const blockApprovedBtn = document.getElementById('btn-block-approved-dev');

      if (data.approvedDevice && data.approvedDevice.deviceId) {
        if (approvedBadge) {
          approvedBadge.textContent = 'ACTIVE';
          approvedBadge.className = 'text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800';
        }
        if (removeBtn) removeBtn.classList.remove('hidden');
        if (blockApprovedBtn) blockApprovedBtn.classList.remove('hidden');

        const isCurrentThisDevice = data.isCurrentDeviceApproved;
        if (detailsBox) {
          detailsBox.innerHTML = `
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Device Name:</span>
                <span class="font-extrabold text-slate-900 flex items-center gap-1.5">
                  ${data.approvedDevice.deviceName || 'Shop Tablet/Phone'}
                  ${isCurrentThisDevice ? '<span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">This Device</span>' : ''}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Device ID:</span>
                <span class="font-mono text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">${data.approvedDevice.deviceId}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Approved On:</span>
                <span class="text-slate-700 font-medium">${data.approvedDevice.approvedAt ? new Date(data.approvedDevice.approvedAt).toLocaleString() : 'N/A'}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Last Active:</span>
                <span class="text-slate-700 font-medium">${data.approvedDevice.lastActiveAt ? new Date(data.approvedDevice.lastActiveAt).toLocaleString() : 'Just now'}</span>
              </div>
            </div>
          `;
        }
      } else {
        if (approvedBadge) {
          approvedBadge.textContent = 'NONE';
          approvedBadge.className = 'text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-rose-100 text-rose-800';
        }
        if (removeBtn) removeBtn.classList.add('hidden');
        if (blockApprovedBtn) blockApprovedBtn.classList.add('hidden');
        if (detailsBox) {
          detailsBox.innerHTML = `
            <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-xl text-center text-slate-600 text-xs">
              <p class="font-bold text-rose-800">No shop device is currently approved.</p>
              <p class="text-[11px] mt-0.5 text-slate-500">Shop Manager will be prompted to request approval upon login.</p>
            </div>
          `;
        }
      }

      // 3. Blocked Devices
      const blockedCountEl = document.getElementById('blocked-devs-count');
      const blockedListEl = document.getElementById('settings-blocked-devices-list');
      const blockedDevs = data.blockedDevices || [];

      if (blockedCountEl) {
        blockedCountEl.textContent = `${blockedDevs.length} Blocked`;
      }

      if (blockedListEl) {
        if (blockedDevs.length > 0) {
          blockedListEl.innerHTML = blockedDevs.map((dev) => {
            const time = dev.blockedAt ? new Date(dev.blockedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently';
            return `
              <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div class="space-y-0.5 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-extrabold text-slate-900">${dev.deviceName || 'Blocked Device'}</span>
                    <span class="font-mono text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">${dev.deviceId}</span>
                  </div>
                  <div class="text-[11px] text-slate-500">
                    Blocked: ${time} • ${dev.reason || 'Blocked by Owner'}
                  </div>
                </div>
                <button
                  type="button"
                  onclick="app.unblockDevice('${dev.deviceId}')"
                  class="shrink-0 py-1.5 px-3 bg-white border border-slate-300 hover:border-slate-400 active:bg-slate-100 text-slate-700 font-bold text-[11px] rounded-lg transition flex items-center gap-1 shadow-xs"
                >
                  <span>Unblock</span>
                </button>
              </div>
            `;
          }).join('');
        } else {
          blockedListEl.innerHTML = `
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
              No blocked devices.
            </div>
          `;
        }
      }

      // 4. Security Logs (Blocked attempts)
      const logsBox = document.getElementById('settings-security-logs');
      if (logsBox) {
        if (data.securityLogs && data.securityLogs.length > 0) {
          logsBox.innerHTML = data.securityLogs.map((log) => {
            const isBlocked = log.action === 'BLOCKED_ATTEMPT' || log.action === 'UNAUTHORIZED_ATTEMPT';
            const badgeClass = isBlocked
              ? 'bg-rose-100 text-rose-800 border-rose-200'
              : 'bg-amber-100 text-amber-800 border-amber-200';
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            const date = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
            const match = (log.newValue && String(log.newValue).match(/(.+?)\s*\((dev_[^)]+)\)/)) ||
                          (log.oldValue && String(log.oldValue).match(/(.+?)\s*\((dev_[^)]+)\)/));
            const devId = match ? match[2].trim() : '';
            const devName = match ? match[1].trim() : (log.deviceName || 'Device');

            return `
              <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between text-xs gap-2">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[10px] font-black px-1.5 py-0.5 rounded border ${badgeClass}">
                      ${log.action.replace('_', ' ')}
                    </span>
                    <span class="font-bold text-slate-800 truncate">${devName}</span>
                    ${devId ? `<span class="font-mono text-[9px] text-slate-500 bg-white border border-slate-200 px-1 rounded">${devId}</span>` : ''}
                  </div>
                  <div class="text-[11px] text-slate-500">
                    ${log.details || log.description || 'Manager access attempt'}
                  </div>
                  ${devId ? `
                    <div class="pt-1 flex items-center gap-1.5">
                      <button type="button" onclick="app.approveDeviceFromLog('${devId}', '${devName.replace(/'/g, "\\'")}')" class="py-1 px-2.5 bg-emerald-600 active:bg-emerald-700 text-white font-bold text-[10px] rounded-lg shadow-xs flex items-center gap-1 transition">
                        <span>Allow</span>
                      </button>
                      <button type="button" onclick="app.blockDeviceFromLog('${devId}', '${devName.replace(/'/g, "\\'")}')" class="py-1 px-2.5 bg-rose-600 active:bg-rose-700 text-white font-bold text-[10px] rounded-lg shadow-xs flex items-center gap-1 transition">
                        <span>Block</span>
                      </button>
                    </div>
                  ` : ''}
                </div>
                <div class="text-right text-[10px] text-slate-400 font-medium shrink-0">
                  <div>${time}</div>
                  <div>${date}</div>
                </div>
              </div>
            `;
          }).join('');
        } else {
          logsBox.innerHTML = `
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
              No unauthorized or blocked attempts recorded.
            </div>
          `;
        }
      }

      if (showSuccessToast) {
        showToast('Device status refreshed', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Failed to load device status', 'error');
    }
  };

  const approvePendingDevice = async () => {
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.approveDevice(undefined, undefined, targetBranchId);
      showToast(res.message || 'Device approved! Shop Manager can now access from this device.', 'success');
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to approve device', 'error');
    }
  };

  const rejectPendingDevice = async () => {
    if (!confirm('Are you sure you want to reject this device request?')) return;
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.rejectDevice(undefined, targetBranchId);
      showToast(res.message || 'Device request rejected', 'info');
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to reject device', 'error');
    }
  };

  const blockPendingDevice = async () => {
    if (!confirm('Are you sure you want to block this device? It will not be allowed to request access again.')) return;
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const pendingDevName = document.getElementById('pending-dev-name')?.textContent || 'Pending Device';
      const pendingDevId = document.getElementById('pending-dev-id')?.textContent || '';
      const res = await API.blockDevice(pendingDevId, pendingDevName, 'Blocked from Pending Requests', targetBranchId);
      showToast(res.message || 'Device has been blocked.', 'info');
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to block device', 'error');
    }
  };

  const removeApprovedDevice = async () => {
    if (!confirm('Are you sure you want to remove the approved shop device? The Shop Manager will be locked out until a new device is approved.')) {
      return;
    }
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.removeDevice(targetBranchId);
      showToast(res.message || 'Approved device removed. Shop Manager is now locked out.', 'warning');
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to remove device', 'error');
    }
  };

  const blockApprovedDevice = async () => {
    if (!confirm('Are you sure you want to block the current shop device? The Manager will be immediately locked out.')) return;
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.blockDevice('', '', 'Approved device blocked by Owner', targetBranchId);
      showToast(res.message || 'Shop device blocked.', 'warning');
      await loadOwnerSettings(false);
      if (state.currentTab === 'history') {
        await loadAuditHistory();
      }
    } catch (err) {
      showToast(err.message || 'Failed to block device', 'error');
    }
  };

  const approveDeviceFromLog = async (deviceId, deviceName) => {
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.approveDevice(deviceId, deviceName, targetBranchId);
      showToast(res.message || `Device "${deviceName}" approved successfully! Manager can now access.`, 'success');
      await loadAuditHistory();
      checkPendingDeviceForOwner();
    } catch (err) {
      showToast(err.message || 'Approval failed', 'error');
    }
  };

  const blockDeviceFromLog = async (deviceId, deviceName) => {
    if (!confirm(`Are you sure you want to block "${deviceName}"?`)) return;
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.blockDevice(deviceId, deviceName, 'Blocked from security logs', targetBranchId);
      showToast(res.message || `Device "${deviceName}" has been blocked.`, 'warning');
      await loadAuditHistory();
      if (state.currentTab === 'settings') {
        await loadOwnerSettings(false);
      }
    } catch (err) {
      showToast(err.message || 'Failed to block device', 'error');
    }
  };

  const unblockDevice = async (deviceId) => {
    try {
      const targetBranchId = state.settingsDeviceBranchId || API.getBranchId();
      const res = await API.unblockDevice(deviceId, targetBranchId);
      showToast(res.message || 'Device unblocked successfully.', 'success');
      await loadOwnerSettings(false);
    } catch (err) {
      showToast(err.message || 'Failed to unblock device', 'error');
    }
  };

  // Expose public API
  return {
    init,
    logout,
    switchTab,
    toggleTheme,
    checkForUpdates,
    downloadLatestApk,
    saveGithubRepoSetting,
    showLoginGate,
    hideLoginGate,
    showAuthModal,
    closeAuthModal,
    setLoginRole,
    quickLogin,
    appendPinDigit,
    backspacePin,
    clearPin,
    togglePasswordLogin,
    submitPasswordLogin,
    shiftSalesDate,
    recalculateSalesTally,
    triggerExpensePhotoUpload,
    triggerPhotoUpload: triggerExpensePhotoUpload,
    removeExpensePhoto,
    openExpensePhotoLightbox,
    saveDailySales,
    shiftAttendanceDate,
    setStaffAttendanceStatus,
    setAttendanceTimeToNow,
    openClockPicker,
    closeClockPicker,
    selectClockHour,
    selectClockMinute,
    selectClockAmPm,
    setClockPreset,
    confirmClockTime,
    toggleStaffAmPm,
    updateStaffAttendanceTime,
    markAllAttendancePresent,
    saveAttendance,
    loadPastDateRecord,
    setPastDateToToday,
    editPastDateDirectly,
    loadMonthlyReports,
    openSalesHistoryScreen,
    openAttendanceHistoryScreen,
    setSalesHistRange,
    loadSalesHistory,
    downloadSalesHistoryPDF,
    shareSalesHistoryPDF,
    setAttHistRange,
    loadAttendanceHistory,
    downloadAttendanceHistoryPDF,
    shareAttendanceHistoryPDF,
    filterHistory,
    openAddStaffModal,
    openEditStaffModal,
    closeStaffModal,
    submitStaffForm,
    removeStaff,
    openLightbox,
    rotateLightboxImg,
    closeLightbox,
    loadOwnerSettings,
    approvePendingDevice,
    rejectPendingDevice,
    blockPendingDevice,
    removeApprovedDevice,
    blockApprovedDevice,
    checkDeviceApprovalStatus,
    approveDeviceFromLog,
    blockDeviceFromLog,
    unblockDevice,
    onLoginBranchChange,
    onHeaderBranchSwitch,
    onSalesHistBranchChange,
    onAttHistBranchChange,
    onSettingsDeviceBranchChange,
    openAddBranchModal,
    openEditBranchModal,
    closeBranchModal,
    saveBranchForm,
    openResetManagerModal,
    closeBranchManagerModal,
    submitResetBranchManager,
    promptServerUrl,
  };
})();

// Initialize app when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
