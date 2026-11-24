import re

with open("public/js/app.js", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update logout and init
old_init_regex = r'const logout = \(\) => \{[\s\S]*?// --- REALTIME SYNC HANDLER ---'

new_init_code = """const logout = () => {
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

  // --- REALTIME SYNC HANDLER ---"""

code = re.sub(old_init_regex, new_init_code, code, count=1)

# 2. Update showAuthModal / closeAuthModal / setLoginRole
old_auth_methods = r'const showAuthModal = \(\) => \{[\s\S]*?const setLoginRole = \(role\) => \{[\s\S]*?const handleDeviceLockError = \(err\) => \{'

new_auth_methods = """const showLoginGate = () => {
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

  const handleDeviceLockError = (err) => {"""

code = re.sub(old_auth_methods, new_auth_methods, code, count=1)

# 3. In return block, expose showLoginGate and hideLoginGate
return_block_match = 'showAuthModal,'
if return_block_match in code and 'showLoginGate,' not in code:
    code = code.replace('showAuthModal,', 'showLoginGate,\n    hideLoginGate,\n    showAuthModal,')

with open("public/js/app.js", "w", encoding="utf-8") as f:
    f.write(code)

print("public/js/app.js successfully patched!")
