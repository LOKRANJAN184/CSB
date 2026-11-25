import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { textField, notice, skeleton } from '../ui/components.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { fmtDateTime } from '../lib/format.js';

// Owner: branches, their shop-manager login, and the one approved device per branch.

export default async function branchesScreen(ctx) {
  ctx.setTitle('Branches & devices', 'Owner only', { back: '#/more' });
  const out = h('div', { class: 'stack' });
  mount(ctx.root, out);

  async function load() {
    mount(out, skeleton(200), skeleton(200));
    try {
      const { branches } = await api('/api/branches/manage');
      store.setPendingDevices(branches.filter((b) => b.manager?.pendingDevice).length);
      mount(out, ...branches.map(branchCard), h('button', { class: 'btn btn--secondary btn--block', onclick: () => editBranch() }, icon('plus'), 'Add branch'));
    } catch (err) {
      mount(out, notice('bad', 'alert', err.message));
    }
  }

  const act = (branchId, action, deviceId, msg) => async (e) => {
    if (msg && !(await confirmSheet({ title: msg.title, message: msg.text, confirmLabel: msg.label, danger: msg.danger }))) return;
    await busy(e.currentTarget, async () => {
      try {
        const r = await api(`/api/devices/${branchId}/${action}`, { method: 'POST', body: { deviceId } });
        toast(r.message, 'good');
        load();
      } catch (err) { toastError(err); }
    });
  };

  function branchCard(b) {
    const m = b.manager;
    const pending = m?.pendingDevice;
    const approved = m?.approvedDevice;
    return h('section', { class: 'card stack', style: { opacity: b.isActive ? 1 : 0.6 } },
      h('div', { class: 'card__title', style: { marginBottom: 0 } },
        h('div', null, h('div', null, b.name), h('div', { class: 'small muted', style: { fontWeight: 400 } }, [b.code, b.address].filter(Boolean).join(' · '))),
        h('button', { class: 'icon-btn', 'aria-label': `Edit ${b.name}`, onclick: () => editBranch(b) }, icon('edit'))
      ),
      !b.isActive && h('span', { class: 'badge badge--muted' }, 'Inactive'),

      pending && notice('warn', 'phone',
        h('strong', null, `"${pending.deviceName}" wants access`),
        h('p', { class: 'small' }, `Requested ${fmtDateTime(pending.requestedAt)}. ${approved ? 'Approving it replaces the current device.' : ''}`),
        h('div', { class: 'hstack wrap', style: { marginTop: '8px' } },
          h('button', { class: 'btn btn--primary btn--sm', onclick: act(b.id, 'approve', pending.deviceId) }, icon('check'), 'Approve'),
          h('button', { class: 'btn btn--secondary btn--sm', onclick: act(b.id, 'reject', pending.deviceId) }, 'Reject'),
          h('button', { class: 'btn btn--danger btn--sm', onclick: act(b.id, 'block', pending.deviceId, { title: 'Block this device?', text: 'It will never be able to request access again unless you unblock it.', label: 'Block', danger: true }) }, 'Block')
        )
      ),

      h('div', { class: 'stack', style: { gap: '4px' } },
        h('span', { class: 'small muted' }, 'Approved shop device'),
        approved
          ? h('div', { class: 'hstack hstack--between' },
              h('div', null, h('strong', null, approved.deviceName), h('div', { class: 'small muted' }, `Last used ${approved.lastActiveAt ? fmtDateTime(approved.lastActiveAt) : '—'}`)),
              h('button', { class: 'btn btn--ghost btn--sm', onclick: act(b.id, 'remove', approved.deviceId, { title: 'Remove approved device?', text: 'The manager will be logged out on that phone and need approval again.', label: 'Remove', danger: true }) }, 'Remove'))
          : h('span', null, m ? 'None yet — the manager logs in once, then you approve it here.' : '—')
      ),

      m?.blockedDevices?.length > 0 && h('details', null,
        h('summary', { class: 'small muted' }, `${m.blockedDevices.length} blocked device(s)`),
        h('ul', { class: 'list' }, m.blockedDevices.map((d) => h('li', { class: 'hstack hstack--between', style: { padding: '6px 0' } },
          h('span', null, d.deviceName), h('button', { class: 'btn btn--ghost btn--sm', onclick: act(b.id, 'unblock', d.deviceId) }, 'Unblock'))))
      ),

      m?.lockedUntil && notice('bad', 'lock', 'Manager login is locked for a few minutes after too many wrong PINs. Setting a new PIN unlocks it.'),
      h('button', { class: 'btn btn--soft btn--block', onclick: () => setManagerPin(b) }, icon('key'), m ? 'Set new manager PIN' : 'Create manager login')
    );
  }

  function setManagerPin(b) {
    let pin = '';
    const save = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(save, async () => {
      if (!/^\d{4,6}$/.test(pin)) return toast('PIN must be 4–6 digits', 'bad');
      try { await api(`/api/branches/${b.id}/manager`, { method: 'PUT', body: { pin } }); sheet.close(); toast('Manager PIN saved. Tell the manager the new PIN.', 'good'); load(); }
      catch (err) { toastError(err); }
    }) }, 'Save PIN');
    const sheet = openSheet({
      title: `Manager PIN · ${b.name}`,
      body: textField({ label: 'New PIN (4–6 digits)', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', onInput: (v) => (pin = v) }),
      actions: [save],
    });
  }

  function editBranch(b = null) {
    const f = { name: b?.name || '', code: b?.code || '', address: b?.address || '', phone: b?.phone || '' };
    const save = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(save, async () => {
      try {
        await api(b ? `/api/branches/${b.id}` : '/api/branches', { method: b ? 'PUT' : 'POST', body: f });
        const { branches } = await api('/api/branches');
        store.setBranches(branches);
        sheet.close(); toast('Branch saved', 'good'); load();
      } catch (err) { toastError(err); }
    }) }, b ? 'Save' : 'Create branch');
    const actions = [save];
    if (b) actions.push(h('button', { class: 'btn btn--secondary btn--block', onclick: async () => {
      try {
        await api(`/api/branches/${b.id}`, { method: 'PUT', body: { ...f, isActive: !b.isActive } });
        const { branches } = await api('/api/branches'); store.setBranches(branches);
        sheet.close(); load();
      } catch (err) { toastError(err); }
    } }, b.isActive ? 'Deactivate branch' : 'Activate branch'));
    const sheet = openSheet({
      title: b ? 'Edit branch' : 'New branch',
      body: h('div', { class: 'stack' },
        textField({ label: 'Name', value: f.name, onInput: (v) => (f.name = v) }),
        !b && textField({ label: 'Short code', value: f.code, placeholder: 'e.g. MADURAI', onInput: (v) => (f.code = v) }),
        textField({ label: 'Address', value: f.address, onInput: (v) => (f.address = v) }),
        textField({ label: 'Phone', value: f.phone, type: 'tel', onInput: (v) => (f.phone = v) })
      ),
      actions,
    });
  }

  load();
}
