import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { textField, notice, skeleton } from '../ui/components.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { api } from '../api.js';
import { maskPhone } from '../lib/format.js';

// Owner: the phone numbers allowed to log in as owner, each with its own PIN.

export default async function securityScreen(ctx) {
  ctx.setTitle('Owner login PINs', 'Owner only', { back: '#/more' });
  const out = h('div', { class: 'stack' });
  mount(ctx.root, notice('info', 'shield', 'Each owner phone has its own PIN. Use PINs that are not birthdays or 1234.'), out);

  async function load() {
    mount(out, skeleton(160));
    try {
      const { phones, current } = await api('/api/auth/owner-phones');
      mount(out,
        h('section', { class: 'card card--flush' }, h('ul', { class: 'list' }, phones.map((p) =>
          h('li', null, h('div', { class: 'row' }, icon('phone'),
            h('div', { class: 'row__main' }, h('strong', { class: 'num' }, maskPhone(p)), h('span', null, p === current ? 'This phone (logged in now)' : 'Owner login')),
            h('button', { class: 'btn btn--soft btn--sm', onclick: () => setPin(p) }, 'Change PIN'),
            p !== current && h('button', { class: 'icon-btn', 'aria-label': 'Remove phone', onclick: () => remove(p) }, icon('trash'))
          ))
        ))),
        h('button', { class: 'btn btn--secondary btn--block', onclick: () => setPin(null) }, icon('plus'), 'Add owner phone')
      );
    } catch (err) { mount(out, notice('bad', 'alert', err.message)); }
  }

  function setPin(phone) {
    const f = { phone: phone || '', pin: '', confirm: '' };
    const save = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(save, async () => {
      if (!/^\d{10}$/.test(f.phone)) return toast('Enter a 10-digit phone number', 'bad');
      if (!/^\d{4,6}$/.test(f.pin)) return toast('PIN must be 4–6 digits', 'bad');
      if (f.pin !== f.confirm) return toast('The two PINs do not match', 'bad');
      try { await api(`/api/auth/owner-phones/${f.phone}`, { method: 'PUT', body: { pin: f.pin } }); sheet.close(); toast('PIN saved', 'good'); load(); }
      catch (err) { toastError(err); }
    }) }, 'Save');
    const sheet = openSheet({
      title: phone ? `New PIN for ${maskPhone(phone)}` : 'Add owner phone',
      body: h('div', { class: 'stack' },
        !phone && textField({ label: 'Mobile number', type: 'tel', inputmode: 'numeric', maxlength: 10, onInput: (v) => (f.phone = v.replace(/\D/g, '')) }),
        textField({ label: 'New PIN', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', onInput: (v) => (f.pin = v) }),
        textField({ label: 'Type the PIN again', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', onInput: (v) => (f.confirm = v) })
      ),
      actions: [save],
    });
  }

  async function remove(phone) {
    if (!(await confirmSheet({ title: 'Remove this phone?', message: `${maskPhone(phone)} will no longer be able to log in as owner.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await api(`/api/auth/owner-phones/${phone}`, { method: 'DELETE' }); toast('Removed'); load(); } catch (err) { toastError(err); }
  }

  load();
}
