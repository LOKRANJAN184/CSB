import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { notice, skeleton, empty } from '../ui/components.js';
import { api } from '../api.js';
import { fmtDateTime, fmtDate } from '../lib/format.js';

const MODULES = [['all', 'All'], ['Sales', 'Sales'], ['Expenses', 'Expenses'], ['Attendance', 'Attendance'], ['Staff', 'Staff'], ['Security', 'Security'], ['Reports', 'Reports']];

export default async function historyScreen(ctx) {
  ctx.setTitle('Edit history', 'All branches', { back: '#/more' });
  let module = 'all';
  let page = 1;
  const listEl = h('ul', { class: 'list' });
  const more = h('button', { class: 'btn btn--secondary btn--block', hidden: true, onclick: () => busy(more, () => load(page + 1)) }, 'Load more');
  const chips = h('div', { class: 'chips' });
  const status = h('div');

  const drawChips = () => mount(chips, MODULES.map(([v, label]) => h('button', { class: 'chip', 'aria-pressed': String(v === module), onclick: () => { module = v; drawChips(); load(1); } }, label)));

  async function load(p) {
    if (p === 1) { listEl.replaceChildren(); mount(status, skeleton(300)); }
    try {
      const res = await api(`/api/history?module=${module}&page=${p}`, { branchId: 'all' });
      page = p;
      status.replaceChildren();
      if (p === 1 && !res.logs.length) mount(status, empty('history', 'Nothing recorded yet.'));
      listEl.append(...res.logs.map(entry));
      more.hidden = !res.hasMore;
    } catch (err) {
      mount(status, notice('bad', 'alert', err.message));
    }
  }

  const tone = (a) => (/DELETE|BLOCK|REJECT/.test(a) ? 'bad' : /CREATE|APPROVE|LOGIN/.test(a) ? 'good' : 'muted');

  function entry(l) {
    const changed = l.oldValue != null && l.newValue != null && l.oldValue !== '' ;
    return h('li', { class: 'log' },
      h('div', { class: 'log__top' },
        h('span', { class: `badge badge--${tone(l.action)}` }, l.module),
        h('strong', { class: 'small' }, l.performedBy?.name || 'System'),
        h('time', { datetime: l.timestamp }, fmtDateTime(l.timestamp))
      ),
      h('p', null, l.description || `${l.action} ${l.fieldName}`),
      changed && h('p', { class: 'log__change' }, h('del', null, String(l.oldValue)), ' → ', h('ins', null, String(l.newValue))),
      (l.branchName || l.recordDate) && h('p', { class: 'small muted' }, [l.branchName, l.recordDate && `for ${fmtDate(l.recordDate, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · '))
    );
  }

  drawChips();
  mount(ctx.root, chips, h('section', { class: 'card card--flush' }, listEl, status), more);
  load(1);
}
