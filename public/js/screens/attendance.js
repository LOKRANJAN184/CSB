import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { dateBar, segmented, notice, skeleton, empty } from '../ui/components.js';
import { toast, toastError } from '../ui/toast.js';
import { api } from '../api.js';
import { todayStr, to12h, to24h, initials } from '../lib/format.js';

const STATUS = [['Present', 'Present'], ['Half-day', 'Half day'], ['Absent', 'Absent']];

export default async function attendanceScreen(ctx) {
  const date = ctx.params.date || todayStr();
  ctx.setTitle('Attendance', ctx.branchName);
  const bar = () => dateBar({ date, onChange: (d) => ctx.navigate(`/attendance/${d}`) });
  mount(ctx.root, bar(), skeleton(80), skeleton(160), skeleton(160));

  let data;
  try {
    data = await api(`/api/attendance/${date}`);
  } catch (err) {
    return mount(ctx.root, bar(), notice('bad', 'alert', err.message));
  }

  const rows = data.records.map((r) => ({ ...r }));
  const canEdit = data.canEdit;
  let dirty = false;
  ctx.setGuard(() => dirty && 'Attendance is not saved. Leave without saving?');

  if (!rows.length) {
    return mount(ctx.root, bar(), empty('users', 'No staff in this branch yet.', h('a', { class: 'btn btn--primary', href: '#/staff' }, icon('plus'), 'Add staff')));
  }

  const counts = h('div', { class: 'counts', 'aria-live': 'polite' });
  const drawCounts = () => {
    const c = (s) => rows.filter((r) => r.status === s).length;
    mount(counts,
      h('div', { class: 'count' }, h('strong', { class: 'good' }, c('Present')), h('span', null, 'Present')),
      h('div', { class: 'count' }, h('strong', { style: { color: 'var(--warn)' } }, c('Half-day')), h('span', null, 'Half day')),
      h('div', { class: 'count' }, h('strong', { class: 'bad' }, c('Absent')), h('span', null, 'Absent'))
    );
  };

  const list = h('div', { class: 'stack' });
  const drawList = () => mount(list, rows.map(staffCard));

  function staffCard(r) {
    const card = h('article', { class: 'card staff-card', dataset: { status: r.status } });
    const time = (field, label) => h('div', { class: 'field' },
      h('label', null, label),
      h('input', {
        class: 'input num', type: 'time', value: to24h(r[field]), disabled: !canEdit, 'aria-label': `${r.staffName} ${label}`,
        onchange: (e) => { r[field] = to12h(e.target.value) || r[field]; dirty = true; },
      })
    );
    mount(card,
      h('div', { class: 'staff-card__head' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(r.staffName)), h('strong', null, r.staffName)),
      segmented({
        label: `${r.staffName} attendance`, className: 'segmented--status', options: STATUS, value: r.status, disabled: !canEdit,
        onChange: (v) => { r.status = v; card.dataset.status = v; dirty = true; drawCounts(); },
      }),
      h('div', { class: 'times' }, time('inTime', 'In time'), time('outTime', 'Out time'))
    );
    return card;
  }

  const saveBtn = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(saveBtn, save) }, icon('check'), data.exists ? 'Update attendance' : 'Save attendance');
  async function save() {
    try {
      await api(`/api/attendance/${date}`, { method: 'PUT', body: { records: rows } });
      dirty = false;
      saveBtn.lastChild.textContent = 'Update attendance';
      toast('Attendance saved', 'good');
    } catch (err) {
      toastError(err);
    }
  }

  drawCounts();
  drawList();
  mount(ctx.root,
    bar(),
    !canEdit && notice('info', 'lock', `View only. Shop managers can only change today's attendance.`),
    !data.exists && canEdit && notice('warn', 'info', 'Not saved yet for this day. Everyone starts as Present — change anyone who is absent, then Save.'),
    counts,
    canEdit && h('div', { class: 'hstack hstack--between' },
      h('button', { class: 'btn btn--soft btn--sm', onclick: () => { rows.forEach((r) => (r.status = 'Present')); dirty = true; drawList(); drawCounts(); } }, icon('check'), 'Mark all present'),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#/staff' }, 'Manage staff')
    ),
    list,
    canEdit && h('div', { class: 'actionbar' }, h('div', null, saveBtn))
  );
}
