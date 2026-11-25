import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { segmented, notice, skeleton, empty } from '../ui/components.js';
import { toastError } from '../ui/toast.js';
import { api } from '../api.js';
import { apiBase } from '../config.js';
import { store } from '../store.js';
import { openExternal } from '../lib/native.js';
import { todayStr, addDays, addMonths, monthStart, monthEnd, fmtMonth, fmtDate, rupees, signedRupees } from '../lib/format.js';

// Owner-only reports. Three views share one screen:
//   Month       — totals + day list + staff salary for a calendar month
//   Sales       — any date range, one branch or all branches, PDF
//   Attendance  — any date range, per-staff days and salary, PDF

const state = { view: 'month', branch: null, month: todayStr().slice(0, 7), from: monthStart(todayStr()), to: todayStr(), staffId: '' };

export default async function reportsScreen(ctx) {
  ctx.setTitle('Reports', 'Owner only');
  state.branch ||= store.branch?.id;
  const out = h('div', { class: 'stack' });

  const branchSelect = (allowAll) => {
    if (!allowAll && state.branch === 'all') state.branch = store.branch?.id;
    return h('select', { class: 'select', 'aria-label': 'Branch', onchange: (e) => { state.branch = e.target.value; state.staffId = ''; draw(); } },
      allowAll && h('option', { value: 'all', selected: state.branch === 'all' }, 'All branches'),
      store.branches.map((b) => h('option', { value: b.id, selected: b.id === state.branch }, b.name))
    );
  };

  mount(ctx.root,
    segmented({ label: 'Report type', options: [['month', 'Month'], ['sales', 'Sales'], ['attendance', 'Attendance']], value: state.view, onChange: (v) => { state.view = v; draw(); } }),
    out
  );

  function draw() {
    if (state.view === 'month') return drawMonth();
    if (state.view === 'sales') return drawSalesRange();
    return drawAttendanceRange();
  }

  // ---------------- Month ----------------
  async function drawMonth() {
    const m = state.month;
    const head = h('div', { class: 'stack' },
      branchSelect(true),
      h('div', { class: 'datebar' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => { state.month = addMonths(m, -1); draw(); } }, icon('chevronLeft')),
        h('div', { class: 'datebar__label' }, h('strong', null, fmtMonth(m))),
        h('button', { class: 'icon-btn', 'aria-label': 'Next month', disabled: m >= todayStr().slice(0, 7), onclick: () => { state.month = addMonths(m, 1); draw(); } }, icon('chevronRight'))
      )
    );
    mount(out, head, skeleton(160), skeleton(240));
    let d;
    try { d = await api(`/api/reports/monthly?month=${m}`, { branchId: state.branch }); } catch (err) { return mount(out, head, notice('bad', 'alert', err.message)); }
    if (state.view !== 'month' || state.month !== m) return; // user moved on while loading

    const t = d.totals;
    mount(out, head,
      kpis(t),
      d.byBranch.length > 1
        ? branchTable(d.byBranch)
        : dayTable(d.byBranch[0]?.daily || []),
      d.attendance && salaryCard(d.attendance)
    );
  }

  // ---------------- Sales range ----------------
  async function drawSalesRange() {
    const head = h('div', { class: 'stack' }, branchSelect(true), rangePicker(), pdfButton('sales'));
    mount(out, head, skeleton(200));
    let d;
    try { d = await api(`/api/reports/sales?from=${state.from}&to=${state.to}`, { branchId: state.branch }); } catch (err) { return mount(out, head, notice('bad', 'alert', err.message)); }
    if (state.view !== 'sales') return;
    mount(out, head, kpis(d.totals),
      d.allBranches ? branchTable(d.byBranch) : dayTable(d.byBranch[0]?.records || [], true));
  }

  // ---------------- Attendance range ----------------
  async function drawAttendanceRange() {
    const staffSel = h('select', { class: 'select', 'aria-label': 'Staff member', onchange: (e) => { state.staffId = e.target.value; draw(); } }, h('option', { value: '' }, 'All staff'));
    const head = h('div', { class: 'stack' }, branchSelect(false), rangePicker(), staffSel, pdfButton('attendance'));
    mount(out, head, skeleton(200));
    let d;
    try {
      const [rep, staff] = await Promise.all([
        api(`/api/reports/attendance?from=${state.from}&to=${state.to}${state.staffId ? `&staffId=${state.staffId}` : ''}`, { branchId: state.branch }),
        api('/api/staff?includeInactive=true', { branchId: state.branch }),
      ]);
      d = rep;
      staffSel.append(...staff.staff.map((s) => h('option', { value: s.id, selected: s.id === state.staffId }, s.name + (s.isActive ? '' : ' (left)'))));
    } catch (err) { return mount(out, head, notice('bad', 'alert', err.message)); }
    if (state.view !== 'attendance') return;
    mount(out, head, salaryCard(d));
  }

  // ---------------- Pieces ----------------
  function rangePicker() {
    const t = todayStr();
    const presets = [
      ['This month', monthStart(t), t],
      ['Last 7 days', addDays(t, -6), t],
      ['Last month', monthStart(addMonths(t.slice(0, 7), -1) + '-01'), monthEnd(addMonths(t.slice(0, 7), -1))],
    ];
    const dateInput = (key, label) => h('div', { class: 'field' }, h('label', null, label),
      h('input', { class: 'input', type: 'date', value: state[key], max: t, onchange: (e) => { if (e.target.value) { state[key] = e.target.value; draw(); } } }));
    return h('div', { class: 'stack' },
      h('div', { class: 'chips' }, presets.map(([label, f, to]) =>
        h('button', { class: 'chip', 'aria-pressed': String(state.from === f && state.to === to), onclick: () => { state.from = f; state.to = to; draw(); } }, label))),
      h('div', { class: 'grid-2' }, dateInput('from', 'From'), dateInput('to', 'To'))
    );
  }

  function pdfButton(kind) {
    const btn = h('button', { class: 'btn btn--secondary btn--block', onclick: () => busy(btn, async () => {
      try {
        const { token } = await api('/api/reports/download-token', { method: 'POST' });
        const base = apiBase() || location.origin;
        const q = new URLSearchParams({ from: state.from, to: state.to, branchId: state.branch, dl: token });
        if (kind === 'attendance' && state.staffId) q.set('staffId', state.staffId);
        await openExternal(`${base}/api/reports/${kind}.pdf?${q}`);
      } catch (err) { toastError(err); }
    }) }, icon('download'), 'Download PDF');
    return btn;
  }

  function kpis(t) {
    return h('div', { class: 'kpis' },
      h('div', { class: 'kpi kpi--wide' }, h('span', null, 'System sales'), h('strong', null, rupees(t.systemSales))),
      h('div', { class: 'kpi' }, h('span', null, 'Cash'), h('strong', null, rupees(t.cash))),
      h('div', { class: 'kpi' }, h('span', null, 'GPay'), h('strong', null, rupees(t.gpay))),
      h('div', { class: 'kpi' }, h('span', null, 'Expenses'), h('strong', null, rupees(t.expenses))),
      h('div', { class: 'kpi' }, h('span', null, 'Net difference'), h('strong', { class: t.difference === 0 ? 'good' : 'bad' }, t.difference === 0 ? '₹0' : signedRupees(t.difference))),
      h('div', { class: 'kpi kpi--wide' }, h('span', null, 'Tallied days'), h('strong', { class: t.mismatchDays ? 'bad' : 'good' }, `${t.talliedDays} of ${t.days}`, t.mismatchDays ? ` · ${t.mismatchDays} with difference` : ''))
    );
  }

  function dayTable(rows, full = false) {
    if (!rows.length) return h('section', { class: 'card' }, empty('receipt', 'No sales entered in this period.'));
    return h('section', { class: 'card' },
      h('div', { class: 'card__title' }, 'Day by day'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', { class: 'r' }, 'System'), full && h('th', { class: 'r' }, 'Expenses'), h('th', { class: 'r' }, 'Result'))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', null, h('a', { href: `#/sales/${r.date}`, style: { color: 'inherit' } }, fmtDate(r.date, { day: 'numeric', month: 'short', weekday: 'short' }))),
          h('td', { class: 'r' }, rupees(r.systemSales)),
          full && h('td', { class: 'r' }, rupees(r.totalExpenses)),
          h('td', { class: `r ${r.isTallied ? 'good' : 'bad'}` }, r.isTallied ? 'Tallied' : signedRupees(r.difference))
        )))
      ))
    );
  }

  function branchTable(list) {
    return h('section', { class: 'card' },
      h('div', { class: 'card__title' }, 'By branch'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Branch'), h('th', { class: 'r' }, 'Days'), h('th', { class: 'r' }, 'System'), h('th', { class: 'r' }, 'Difference'))),
        h('tbody', null, list.map((b) => h('tr', null,
          h('td', null, b.branchName), h('td', { class: 'r' }, b.totals.days), h('td', { class: 'r' }, rupees(b.totals.systemSales)),
          h('td', { class: `r ${b.totals.difference === 0 ? 'good' : 'bad'}` }, b.totals.difference === 0 ? '₹0' : signedRupees(b.totals.difference))
        )))
      ))
    );
  }

  function salaryCard(a) {
    if (!a.summary.length) return h('section', { class: 'card' }, empty('users', 'No attendance in this period.'));
    return h('section', { class: 'card' },
      h('div', { class: 'card__title' }, 'Staff salary', h('span', { class: 'badge badge--muted' }, `${a.daysRecorded} days marked`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Staff'), h('th', { class: 'r', title: 'Present / Half / Absent' }, 'P / H / A'), h('th', { class: 'r' }, 'Days × rate'), h('th', { class: 'r' }, 'Salary'))),
        h('tbody', null, a.summary.map((p) => h('tr', null,
          h('td', null, p.name),
          h('td', { class: 'r' }, `${p.present} / ${p.halfDay} / ${p.absent}`),
          h('td', { class: 'r muted' }, `${p.payableDays} × ${rupees(p.dailySalary)}`),
          h('td', { class: 'r' }, h('strong', null, rupees(p.salary)))
        ))),
        h('tfoot', null, h('tr', null, h('td', { colspan: 3 }, 'Total'), h('td', { class: 'r' }, rupees(a.totalSalary))))
      )),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Half day counts as 0.5 day. Set per-day salary in More → Staff.')
    );
  }

  draw();
}
