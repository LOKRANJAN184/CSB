import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { segmented, notice } from '../ui/components.js';
import { pinPad } from '../ui/pinpad.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { api } from '../api.js';
import { store, deviceId, deviceName } from '../store.js';
import { apiBase, setApiBase } from '../config.js';

// Login screen. Two modes:
//   Shop Manager → choose branch + PIN (only works on the approved device)
//   Owner        → phone number + the PIN for that phone

export function renderLogin(root, { onLoggedIn, message }) {
  let mode = localStorage.getItem('csb.loginMode') || 'manager';
  let branches = store.cachedBranches();
  let branchId = localStorage.getItem('csb.loginBranch') || branches[0]?.id || '';
  let phone = localStorage.getItem('csb.ownerPhone') || '';
  let pad;
  let retryTimer;
  let lastPin = '';

  const status = h('div', { 'aria-live': 'polite' });
  const body = h('div', { class: 'stack' });
  const card = h('div', { class: 'login__card' },
    segmented({
      label: 'Login as',
      options: [['manager', 'Shop Manager'], ['owner', 'Owner']],
      value: mode,
      onChange: (v) => { mode = v; localStorage.setItem('csb.loginMode', v); status.replaceChildren(); draw(); },
    }),
    body,
    status
  );

  const logo = h('img', { src: 'images/logo.png', alt: 'செந்தூரர் ஸ்வீட்ஸ் & பேக்கரி', width: 200, height: 130 });
  // Hidden developer option: long-press the logo to change the server address.
  let pressTimer;
  logo.addEventListener('pointerdown', () => (pressTimer = setTimeout(openServerSheet, 1200)));
  ['pointerup', 'pointerleave'].forEach((ev) => logo.addEventListener(ev, () => clearTimeout(pressTimer)));

  mount(root, h('main', { class: 'login' },
    h('div', { class: 'login__brand' }, logo, h('h1', null, 'Chendurar Sweets & Bakery')),
    card
  ));

  if (message) status.replaceChildren(notice('warn', 'info', message));

  function draw() {
    pad?.destroy();
    clearInterval(retryTimer);
    pad = pinPad({ onSubmit: submit });

    if (mode === 'manager') {
      const select = h('select', { class: 'select', id: 'login-branch', 'aria-label': 'Branch', onchange: (e) => { branchId = e.target.value; localStorage.setItem('csb.loginBranch', branchId); } },
        branches.length ? branches.map((b) => h('option', { value: b.id, selected: b.id === branchId }, b.name)) : h('option', { value: '' }, 'Loading branches…')
      );
      mount(body, h('div', { class: 'field' }, h('label', { for: 'login-branch' }, 'Branch'), select), pad.el);
    } else {
      const input = h('input', {
        id: 'login-phone', class: 'input num', type: 'tel', inputmode: 'numeric', autocomplete: 'tel', maxlength: 10, placeholder: '10-digit mobile number', value: phone,
        oninput: (e) => { phone = e.target.value.replace(/\D/g, '').slice(0, 10); e.target.value = phone; },
      });
      mount(body, h('div', { class: 'field' }, h('label', { for: 'login-phone' }, 'Mobile number'), input), pad.el);
    }
  }

  async function submit(pin) {
    lastPin = pin;
    status.replaceChildren();
    if (mode === 'owner' && phone.length !== 10) {
      status.replaceChildren(notice('bad', 'alert', 'Enter your 10-digit mobile number.'));
      return;
    }
    if (mode === 'manager' && !branchId) {
      status.replaceChildren(notice('bad', 'alert', 'Choose your branch.'));
      return;
    }
    body.style.opacity = '.6';
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: mode === 'owner'
          ? { mode, phone, pin }
          : { mode, branchId, pin, deviceId: deviceId(), deviceName: deviceName() },
      });
      if (mode === 'owner') localStorage.setItem('csb.ownerPhone', phone);
      pad.destroy();
      clearInterval(retryTimer);
      store.setSession({ token: res.token, expiresAt: res.expiresAt, user: res.user, branch: res.branch });
      onLoggedIn();
    } catch (err) {
      pad.clear();
      if (err.code === 'DEVICE_PENDING') return showPending(err.data);
      pad.shake();
      status.replaceChildren(notice('bad', err.code === 'DEVICE_BLOCKED' ? 'lock' : 'alert', err.message));
    } finally {
      body.style.opacity = '';
    }
  }

  // Correct PIN, but this phone isn't the approved shop device yet.
  function showPending(data) {
    status.replaceChildren(
      notice('warn', 'shield',
        h('strong', null, 'Waiting for owner approval'),
        h('p', { class: 'small' }, `This device ("${data.deviceName}") is not the approved shop device${data.hasApprovedDevice ? ' — another device is already approved' : ''}. Ask the owner to open More → Branches & devices and approve it.`),
        h('button', { class: 'btn btn--sm btn--secondary', style: { marginTop: '8px' }, onclick: (e) => submit(lastPin) }, icon('refresh'), 'Check again')
      )
    );
    // Check automatically every 15 seconds while this screen is open.
    clearInterval(retryTimer);
    retryTimer = setInterval(() => document.visibilityState === 'visible' && submit(lastPin), 15000);
  }

  function openServerSheet() {
    let url = apiBase();
    const sheet = openSheet({
      title: 'Server address',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Only change this for testing. Leave empty to use the live server.'),
        h('input', { class: 'input', type: 'url', value: url, placeholder: 'https://…', oninput: (e) => (url = e.target.value) })
      ),
      actions: [h('button', { class: 'btn btn--primary btn--block', onclick: () => { setApiBase(url); sheet.close(); toast('Server updated', 'good'); loadBranches(); } }, 'Save')],
    });
  }

  async function loadBranches() {
    try {
      const res = await api('/api/branches');
      branches = res.branches;
      store.setBranches(branches);
      if (!branches.some((b) => b.id === branchId)) branchId = branches[0]?.id || '';
      if (mode === 'manager') draw();
    } catch (err) {
      if (!branches.length) status.replaceChildren(notice('bad', 'wifiOff', err.message));
    }
  }

  draw();
  loadBranches();
  return () => { pad?.destroy(); clearInterval(retryTimer); };
}
