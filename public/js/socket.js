// Real-time Socket.io Synchronization for Chendurar Sweets & Bakery
const Realtime = (() => {
  let socket = null;

  const init = (onUpdateCallback) => {
    try {
      if (typeof io === 'undefined') {
        console.warn('[Socket] io is not defined, running in offline mode');
        return;
      }

      const serverUrl = (window.API && window.API.getServerUrl)
        ? window.API.getServerUrl()
        : (localStorage.getItem('csb_server_url') || undefined);
      socket = io(serverUrl);

      socket.on('connect', () => {
        console.log('[Socket] Connected to real-time sync server');
        showSyncBadge(true, 'Live Sync Active');
      });

      socket.on('disconnect', () => {
        console.log('[Socket] Disconnected from sync server');
        showSyncBadge(false, 'Sync Disconnected');
      });

      // Realtime event listeners
      socket.on('sales_updated', (payload) => {
        console.log('[Socket] Sales updated:', payload);
        handleIncomingUpdate('Sales Updated', payload.message || 'Sales data updated in real time', payload);
        if (onUpdateCallback) onUpdateCallback('sales', payload);
      });

      socket.on('attendance_updated', (payload) => {
        console.log('[Socket] Attendance updated:', payload);
        handleIncomingUpdate('Attendance Updated', payload.message || 'Staff attendance updated in real time', payload);
        if (onUpdateCallback) onUpdateCallback('attendance', payload);
      });

      socket.on('staff_updated', (payload) => {
        console.log('[Socket] Staff updated:', payload);
        handleIncomingUpdate('Staff Updated', payload.message || 'Staff roster updated in real time', payload);
        if (onUpdateCallback) onUpdateCallback('staff', payload);
      });

      socket.on('audit_logged', (payload) => {
        console.log('[Socket] Audit log received:', payload);
        if (onUpdateCallback) onUpdateCallback('audit', payload);
      });
    } catch (e) {
      console.error('[Socket] Error initializing real-time socket:', e);
    }
  };

  const showSyncBadge = (isConnected, text) => {
    const banner = document.getElementById('realtime-banner');
    const bannerText = document.getElementById('realtime-banner-text');
    if (!banner || !bannerText) return;

    if (isConnected) {
      banner.className = 'bg-emerald-600 text-white text-[11px] font-semibold py-1 px-4 text-center flex items-center justify-center gap-1.5 transition-all';
      bannerText.textContent = text;
      banner.classList.remove('hidden');
      setTimeout(() => {
        banner.classList.add('hidden');
      }, 4000);
    } else {
      banner.className = 'bg-rose-600 text-white text-[11px] font-semibold py-1 px-4 text-center flex items-center justify-center gap-1.5 transition-all';
      bannerText.textContent = text;
      banner.classList.remove('hidden');
    }
  };

  const handleIncomingUpdate = (title, message, payload) => {
    // Show top alert notification
    const alertBox = document.getElementById('global-alert-box');
    const alertIcon = document.getElementById('global-alert-icon');
    const alertTitle = document.getElementById('global-alert-title');
    const alertMsg = document.getElementById('global-alert-msg');

    if (alertBox && alertTitle && alertMsg) {
      alertBox.className = 'mb-3 p-3.5 rounded-2xl shadow-sm border bg-amber-500/15 border-amber-500/30 text-amber-950 transition-all';
      alertIcon.textContent = '🔔';
      alertTitle.textContent = title;
      alertMsg.textContent = message;
      alertBox.classList.remove('hidden');

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        alertBox.classList.add('hidden');
      }, 6000);
    }
  };

  return {
    init,
  };
})();

