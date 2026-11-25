import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { textField, moneyField, notice, skeleton, empty } from '../ui/components.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { rupees, initials } from '../lib/format.js';

export default async function staffScreen(ctx) {
  ctx.setTitle('Staff', ctx.branchName, { back: '#/more' });
  let showInactive = false;
  const list = h('div');

  async function load() {
    mount(list, skeleton(220));
    try {
      const { staff } = await api(`/api/staff?includeInactive=${showInactive}`);
      draw(staff);
    } catch (err) {
      mount(list, notice('bad', 'alert', err.message));
    }
  }

  function draw(staff) {
    if (!staff.length) return mount(list, empty('users', 'No staff yet.'));
    mount(list, h('section', { class: 'card card--flush' }, h('ul', { class: 'list' }, staff.map((s) =>
      h('li', null, h('button', { class: 'row', onclick: () => edit(s), style: { opacity: s.isActive ? 1 : 0.55 } },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(s.name)),
        h('div', { class: 'row__main' }, h('strong', null, s.name), h('span', null, [s.role, s.phone].filter(Boolean).join(' · '))),
        !s.isActive ? h('span', { class: 'badge badge--muted' }, 'Left') : store.isOwner && h('span', { class: 'num small muted' }, `${rupees(s.dailySalary)}/day`),
        icon('chevronRight')
      ))
    ))));
  }

  function edit(s = null) {
    const f = { name: s?.name || '', role: s?.role || '', phone: s?.phone || '', dailySalary: s?.dailySalary || 0 };
    const save = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(save, async () => {
      if (!f.name.trim()) return toast('Enter a name', 'bad');
      try {
        await api(s ? `/api/staff/${s.id}` : '/api/staff', { method: s ? 'PUT' : 'POST', body: f });
        sheet.close();
        toast(s ? 'Staff updated' : `${f.name} added`, 'good');
        load();
      } catch (err) { toastError(err); }
    }) }, s ? 'Save changes' : 'Add staff');

    const actions = [save];
    if (s?.isActive) actions.push(h('button', { class: 'btn btn--danger btn--block', onclick: async () => {
      if (!(await confirmSheet({ title: `Remove ${s.name}?`, message: 'They will no longer appear in attendance. Old records and salary history stay.', confirmLabel: 'Remove', danger: true }))) return;
      try { await api(`/api/staff/${s.id}`, { method: 'DELETE' }); sheet.close(); toast(`${s.name} removed`); load(); } catch (err) { toastError(err); }
    } }, icon('trash'), 'Remove from staff'));
    if (s && !s.isActive) actions.push(h('button', { class: 'btn btn--soft btn--block', onclick: async () => {
      try { await api(`/api/staff/${s.id}`, { method: 'PUT', body: { isActive: true } }); sheet.close(); toast(`${s.name} is back`, 'good'); load(); } catch (err) { toastError(err); }
    } }, 'Re-join staff'));

    const sheet = openSheet({
      title: s ? s.name : 'New staff member',
      body: h('div', { class: 'stack' },
        textField({ label: 'Name', value: f.name, onInput: (v) => (f.name = v), autocomplete: 'name', maxlength: 80 }),
        textField({ label: 'Work', value: f.role, placeholder: 'Sweet master, counter, packing…', onInput: (v) => (f.role = v), maxlength: 60 }),
        textField({ label: 'Phone', value: f.phone, type: 'tel', inputmode: 'tel', onInput: (v) => (f.phone = v), maxlength: 15 }),
        store.isOwner && moneyField({ label: 'Per-day salary', value: f.dailySalary, onInput: (v) => (f.dailySalary = v), hint: 'Only you (the owner) can see this.' })
      ),
      actions,
    });
  }

  mount(ctx.root,
    h('div', { class: 'hstack hstack--between' },
      h('label', { class: 'hstack small' }, h('input', { type: 'checkbox', onchange: (e) => { showInactive = e.target.checked; load(); } }), 'Show staff who left'),
      h('button', { class: 'btn btn--primary btn--sm', onclick: () => edit() }, icon('plus'), 'Add staff')
    ),
    list
  );
  load();
}
