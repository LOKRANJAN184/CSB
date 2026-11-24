// Client API Connector for Chendurar Sweets & Bakery Backend
const API = (() => {
  const getServerUrl = () => {
    const saved = localStorage.getItem('csb_server_url');
    if (saved) return saved.replace(/\/+$/, '');

    const isNative = window.Capacitor !== undefined ||
                     window.location.protocol === 'file:' ||
                     window.location.origin.includes('capacitor://') ||
                     window.location.origin.includes('ionic://') ||
                     (window.location.origin.includes('localhost') && window.location.port !== '5000');
    if (isNative) {
      return 'http://11.12.22.235:5000';
    }
    return window.location.origin;
  };
  const setServerUrl = (url) => localStorage.setItem('csb_server_url', (url || '').trim().replace(/\/+$/, ''));
  const removeServerUrl = () => localStorage.removeItem('csb_server_url');

  const getToken = () => localStorage.getItem('csb_auth_token');
  const setToken = (token) => localStorage.setItem('csb_auth_token', token);
  const removeToken = () => localStorage.removeItem('csb_auth_token');

  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem('csb_auth_user'));
    } catch (e) {
      return null;
    }
  };
  const setUser = (user) => localStorage.setItem('csb_auth_user', JSON.stringify(user));
  const removeUser = () => localStorage.removeItem('csb_auth_user');

  // Branch Selection Storage
  const getBranchId = () => localStorage.getItem('csb_branch_id') || '';
  const setBranchId = (id) => localStorage.setItem('csb_branch_id', id);
  const removeBranchId = () => localStorage.removeItem('csb_branch_id');

  const getBranchName = () => localStorage.getItem('csb_branch_name') || '';
  const setBranchName = (name) => localStorage.setItem('csb_branch_name', name);
  const removeBranchName = () => localStorage.removeItem('csb_branch_name');

  // Persistent Unique Device Identifier & Device Name
  const getDeviceId = () => {
    let id = localStorage.getItem('csb_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem('csb_device_id', id);
    }
    return id;
  };

  const getDeviceName = () => {
    const custom = localStorage.getItem('csb_device_name');
    if (custom) return custom;

    const ua = navigator.userAgent || '';
    let device = 'Shop Device';
    if (/iPad/.test(ua)) device = 'Apple iPad';
    else if (/iPhone/.test(ua)) device = 'Apple iPhone';
    else if (/Android/.test(ua)) {
      device = /Mobile/.test(ua) ? 'Android Phone' : 'Android Tablet';
    } else if (/Windows/.test(ua)) device = 'Windows PC';
    else if (/Macintosh|Mac OS/.test(ua)) device = 'Mac Device';
    else if (/Linux/.test(ua)) device = 'Linux Device';

    let browser = '';
    if (/Chrome/.test(ua) && !/Chromium|Edge/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox/.test(ua)) browser = 'Firefox';
    else if (/Edge/.test(ua)) browser = 'Edge';

    return browser ? `${device} (${browser})` : device;
  };

  const request = async (endpoint, options = {}) => {
    const token = getToken();
    const headers = options.headers || {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Pass persistent device ID and name on EVERY request
    headers['x-device-id'] = getDeviceId();
    headers['x-device-name'] = getDeviceName();

    const branchId = getBranchId();
    if (branchId) {
      headers['x-branch-id'] = branchId;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Set timeout to prevent hanging when mobile network or Wi-Fi is slow/unreachable
    const timeoutMs = options.timeout || (endpoint === '/api/branches' ? 3000 : 8000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const config = {
      ...options,
      headers,
      signal: controller.signal,
    };

    try {
      const res = await fetch(`${getServerUrl()}${endpoint}`, config);
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && token) {
          removeToken();
          removeUser();
          localStorage.removeItem('csb_manager_login_time');
          localStorage.removeItem('csb_owner_login_time');
          localStorage.removeItem('csb_login_time');
          window.dispatchEvent(new CustomEvent('csb:session_expired', { detail: data }));
        }
        if (res.status === 403 && (data.code === 'DEVICE_BLOCKED' || data.code === 'DEVICE_NOT_APPROVED')) {
          window.dispatchEvent(new CustomEvent('csb:device_blocked', { detail: data }));
        }
        const error = new Error(data.message || `Request failed with status ${res.status}`);
        error.code = data.code;
        error.data = data;
        error.status = res.status;
        throw error;
      }
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Connection timeout (${timeoutMs / 1000}s). Please check your Wi-Fi or server connection.`);
      }
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  };

  /**
   * Client-side Image Compression before uploading
   * Resizes large phone photos (e.g. 8-12MP) to 1200px max and converts to JPEG/WebP
   * Drastically speeds up uploads over 4G mobile networks
   */
  const compressImageFile = (file, maxWidth = 1200, quality = 0.75) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          let { width, height } = img;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxWidth) {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas compression failed'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  return {
    getServerUrl,
    setServerUrl,
    removeServerUrl,
    getToken,
    setToken,
    removeToken,
    getUser,
    setUser,
    removeUser,
    getBranchId,
    setBranchId,
    removeBranchId,
    getBranchName,
    setBranchName,
    removeBranchName,
    compressImageFile,

    // Auth
    loginWithPin: (role, pin, phone, branchId) => request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        role,
        pin,
        phone,
        branchId: branchId || getBranchId(),
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      }),
    }),
    loginWithPassword: (username, password, phone, branchId) => request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        phone,
        branchId: branchId || getBranchId(),
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      }),
    }),
    getMe: () => request('/api/auth/me'),

    // Branch Management
    getBranches: () => request('/api/branches'),
    getAllBranches: () => request('/api/branches/all'),
    createBranch: (data) => request('/api/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    updateBranch: (id, data) => request(`/api/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    resetBranchManager: (id, data) => request(`/api/branches/${id}/manager`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    // Device Management (Owner only & Device Lock)
    getDeviceStatus: (branchId) => request(`/api/devices/status${branchId ? `?branchId=${branchId}` : ''}`),
    approveDevice: (deviceId, deviceName, branchId) => request('/api/devices/approve', {
      method: 'POST',
      body: JSON.stringify({ deviceId, deviceName, branchId }),
    }),
    rejectDevice: (deviceId, branchId) => request('/api/devices/reject', {
      method: 'POST',
      body: JSON.stringify({ deviceId, branchId }),
    }),
    removeDevice: (branchId) => request('/api/devices/remove', {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    }),
    blockDevice: (deviceId, deviceName, reason, branchId) => request('/api/devices/block', {
      method: 'POST',
      body: JSON.stringify({ deviceId, deviceName, reason, branchId }),
    }),
    unblockDevice: (deviceId, branchId) => request('/api/devices/unblock', {
      method: 'POST',
      body: JSON.stringify({ deviceId, branchId }),
    }),
    getDeviceId,
    getDeviceName,

    // Sales
    getDailySales: (date) => request(`/api/sales/${date}`),
    saveDailySales: (salesData) => request('/api/sales', {
      method: 'POST',
      body: JSON.stringify(salesData),
    }),
    uploadPhoto: async (file) => {
      // First compress on client to save mobile data
      const compressedBlob = await compressImageFile(file);
      const formData = new FormData();
      formData.append('photo', compressedBlob, file.name || 'bill.jpg');
      return request('/api/sales/upload-photo', {
        method: 'POST',
        body: formData,
      });
    },
    deletePhoto: (date, photoFilename, expenseIndex) => request('/api/sales/delete-photo', {
      method: 'DELETE',
      body: JSON.stringify({ date, photoFilename, expenseIndex }),
    }),

    // Attendance
    getAttendance: (date) => request(`/api/attendance/${date}`),
    saveAttendance: (attData) => request('/api/attendance', {
      method: 'POST',
      body: JSON.stringify(attData),
    }),

    // Staff
    getStaffList: (includeInactive = false, branchId = '') => request(`/api/staff?includeInactive=${includeInactive}${branchId ? `&branchId=${branchId}` : ''}`),
    addStaff: (staffData) => request('/api/staff', {
      method: 'POST',
      body: JSON.stringify(staffData),
    }),
    updateStaff: (id, staffData) => request(`/api/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(staffData),
    }),
    deleteStaff: (id) => request(`/api/staff/${id}`, {
      method: 'DELETE',
    }),

    // History & Reports
    getHistory: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/history?${q}`);
    },
    getMonthlyReports: (month) => request(`/api/reports/monthly?month=${month}`),
    getCalendarStatus: (month) => request(`/api/reports/calendar-status?month=${month}`),
    getSalesHistory: (from, to, branchId = '') => request(`/api/reports/sales-history?from=${from}&to=${to}${branchId ? '&branchId=' + branchId : ''}`),
    getAttendanceHistory: (from, to, staffId = '', branchId = '') => request(`/api/reports/attendance-history?from=${from}&to=${to}${staffId ? '&staffId=' + staffId : ''}${branchId ? '&branchId=' + branchId : ''}`),
    getAppVersion: () => request('/api/app-version'),
    downloadReportPDF: async (endpoint) => {
      const token = getToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['x-device-id'] = getDeviceId();
      headers['x-device-name'] = getDeviceName();
      const bId = getBranchId();
      if (bId) headers['x-branch-id'] = bId;

      const res = await fetch(`${getServerUrl()}${endpoint}`, { headers });
      if (!res.ok) {
        let errMsg = 'Failed to download PDF';
        try {
          const errData = await res.json();
          errMsg = errData.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      return await res.blob();
    },
  };
})();

