import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { notice, skeleton } from '../ui/components.js';
import { openSheet } from '../ui/sheet.js';
import { api } from '../api.js';
import { todayStr, addMonths, fmtMonth, fmtDate, rupees, signedRupees, monthEnd } from '../lib/format.js';

// Month calendar: each day shows whether sales were entered (green = tallied,
// red = difference) and whether attendance was marked (gold dot).

export default async function recordsScreen(ctx) {
  const today = todayStr();
  const month = ctx.params.month || today.slice(0, 7);
  ctx.setTitle('Records', ctx.branchName);

  const header = h('div', { class: 'datebar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => ctx.navigate(`/records/${addMonths(month, -1)}`) }, icon('chevronLeft')),
    h('div', { class: 'datebar__label' }, h('strong', null, fmtMonth(month))),
    h('button', { class: 'icon-btn', 'aria-label': 'Next month', disabled: month >= today.slice(0, 7), onclick: () => ctx.navigate(`/records/${addMonths(month, 1)}`) }, icon('chevronRight'))
  );
  mount(ctx.root, header, skeleton(340));

  let days;
  try {
    ({ days } = await api(`/api/reports/calendar?month=${month}`));
  } catch (err) {
    return mount(ctx.root, header, notice('bad', 'alert', err.message));
  }

  // Build the grid. Weeks start on Monday.
  const first = new Date(month + '-01T12:00:00Z');
  const lead = (first.getUTCDay() + 6) % 7;
  const last = Number(monthEnd(month).slice(8));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div'));
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const info = days[date] || {};
    const future = date > today;
    cells.push(h('button', {
      class: `cal__day ${date === today ? 'is-today' : ''}`,
      dataset: { sales: info.sales ? (info.tallied ? 'good' : 'bad') : '' },
      disabled: future,
      'aria-label': `${fmtDate(date, { day: 'numeric', month: 'long' })}${info.sales ? (info.tallied ? ', tallied' : ', difference') : ''}${info.attendance ? ', attendance marked' : ''}`,
      onclick: () => openDay(date, info),
    },
      h('span', null, d),
      h('span', { class: 'dots' },
        info.sales && h('i', { class: `dot ${info.tallied ? 'dot--good' : 'dot--bad'}` }),
        info.attendance && h('i', { class: 'dot dot--att' })
      )
    ));
  }

  const values = Object.values(days).filter((d) => d.sales);
  const mismatches = values.filter((d) => !d.tallied).length;

  mount(ctx.root,
    header,
    h('section', { class: 'card stack' },
      h('div', { class: 'cal' }, ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('div', { class: 'cal__dow', 'aria-hidden': 'true' }, d)), ...cells),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'dot dot--good' }), 'Tallied'),
        h('span', null, h('i', { class: 'dot dot--bad' }), 'Difference'),
        h('span', null, h('i', { class: 'dot dot--att' }), 'Attendance')
      )
    ),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('span', null, 'Days entered'), h('strong', null, values.length)),
      h('div', { class: 'kpi' }, h('span', null, 'With difference'), h('strong', { class: mismatches ? 'bad' : 'good' }, mismatches))
    )
  );

  function openDay(date, info) {
    const sheet = openSheet({
      title: fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
      body: h('div', { class: 'stack' },
        info.sales
          ? h('div', { class: 'kpis' },
              h('div', { class: 'kpi' }, h('span', null, 'System sales'), h('strong', null, rupees(info.systemSales))),
              h('div', { class: 'kpi' }, h('span', null, 'Result'), h('strong', { class: info.tallied ? 'good' : 'bad' }, info.tallied ? 'Tallied' : signedRupees(info.difference))))
          : h('p', { class: 'muted' }, 'No sales entered for this day.'),
        h('p', { class: 'muted small' }, info.attendance ? 'Attendance was marked.' : 'Attendance was not marked.')
      ),
      actions: [
        h('button', { class: 'btn btn--primary btn--block', onclick: () => { sheet.close(); ctx.navigate(`/sales/${date}`); } }, icon('receipt'), 'Open sales'),
        h('button', { class: 'btn btn--secondary btn--block', onclick: () => { sheet.close(); ctx.navigate(`/attendance/${date}`); } }, icon('users'), 'Open attendance'),
      ],
    });
  }
}
