import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { dateBar, moneyField, notice, skeleton, compressImage } from '../ui/components.js';
import { openPhotoViewer, confirmSheet } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { api, photoUrl } from '../api.js';
import { rupees, signedRupees, todayStr } from '../lib/format.js';

// Daily sales tally:  System sales  =  Expenses + Cash + GPay
//
// State lives in one plain object (`form`). Every input writes to it and then
// calls updateTally(), which recomputes the numbers and repaints ONLY the
// tally card — the inputs themselves are never re-created while typing, so the
// keyboard never closes and the cursor never jumps.

export default async function salesScreen(ctx) {
  const date = ctx.params.date || todayStr();
  ctx.setTitle('Daily sales', ctx.branchName);

  mount(ctx.root, dateBar({ date, onChange: (d) => ctx.navigate(`/sales/${d}`) }), skeleton(180), skeleton(220));

  let data;
  try {
    data = await api(`/api/sales/${date}`);
  } catch (err) {
    return mount(ctx.root, dateBar({ date, onChange: (d) => ctx.navigate(`/sales/${d}`) }), notice('bad', 'alert', err.message));
  }

  const r = data.record;
  const canEdit = data.canEdit;
  const form = {
    systemSales: r.systemSales || 0,
    totalCash: r.totalCash || 0,
    totalGpay: r.totalGpay || 0,
    notes: r.notes || '',
    expenses: (r.expenses || []).map((e) => ({ amount: e.amount, note: e.note, photoId: e.photoId || null, legacyPhoto: e.photoUrl || '' })),
  };
  let dirty = false;
  const markDirty = () => { dirty = true; updateTally(); };
  ctx.setGuard(() => dirty && 'You have unsaved changes. Leave without saving?');

  // ---------- Tally card ----------
  const tally = h('section', { class: 'tally', 'aria-live': 'polite', 'aria-label': 'Tally' });
  function updateTally() {
    const totalExpenses = form.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const accounted = totalExpenses + form.totalCash + form.totalGpay;
    const diff = Math.round((accounted - form.systemSales) * 100) / 100;
    const hasData = form.systemSales > 0 || accounted > 0;
    const state = !hasData ? 'idle' : diff === 0 ? 'good' : 'bad';
    tally.dataset.state = state;
    mount(tally,
      h('div', { class: 'tally__head' },
        h('div', { class: 'tally__status' },
          state === 'good' ? [icon('checkCircle'), 'Tallied'] : state === 'bad' ? [icon('alert'), diff > 0 ? 'Excess' : 'Shortage'] : 'Enter today’s figures'
        ),
        state === 'bad' && h('div', { class: 'tally__diff' }, signedRupees(diff))
      ),
      h('dl', { class: 'tally__eq' },
        h('dt', null, 'Expenses'), h('dd', null, rupees(totalExpenses)),
        h('dt', null, 'Cash'), h('dd', null, rupees(form.totalCash)),
        h('dt', null, 'GPay'), h('dd', null, rupees(form.totalGpay)),
        h('dt', { class: 'sum' }, 'Accounted'), h('dd', { class: 'sum' }, rupees(accounted)),
        h('dt', null, 'System sales'), h('dd', null, rupees(form.systemSales))
      )
    );
  }

  // ---------- Expenses ----------
  const expenseList = h('div');
  function drawExpenses() {
    mount(expenseList,
      form.expenses.length
        ? form.expenses.map((e, i) => expenseRow(e, i))
        : h('p', { class: 'muted small', style: { padding: '8px 0' } }, canEdit ? 'No expenses yet. Add milk, ghee, gas, packing…' : 'No expenses.')
    );
  }

  function expenseRow(e, i) {
    const thumb = h('button', { type: 'button', class: 'thumb', 'aria-label': e.photoId ? 'View bill photo' : 'Attach bill photo', disabled: !canEdit && !e.photoId });
    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (ev) => attach(ev.target.files[0]) });

    const paintThumb = async () => {
      thumb.replaceChildren();
      thumb.style.backgroundImage = '';
      if (e.photoId) {
        try { thumb.style.backgroundImage = `url("${await photoUrl(e.photoId)}")`; } catch { thumb.append(icon('alert')); }
      } else {
        thumb.append(icon('camera'));
      }
    };
    thumb.onclick = async () => {
      if (e.photoId) openPhotoViewer(await photoUrl(e.photoId), e.note || 'Bill photo');
      else if (canEdit) fileInput.click();
    };

    async function attach(file) {
      if (!file) return;
      thumb.classList.add('is-uploading');
      try {
        const small = await compressImage(file);
        const fd = new FormData();
        fd.append('photo', small, 'bill.jpg');
        const res = await api('/api/photos', { method: 'POST', body: fd, timeout: 60000 });
        e.photoId = res.id;
        markDirty();
        await paintThumb();
        toast('Photo attached — remember to save', 'good');
      } catch (err) {
        toastError(err);
      } finally {
        thumb.classList.remove('is-uploading');
      }
    }

    paintThumb();
    return h('div', { class: 'expense' },
      h('div', { class: 'expense__inputs' },
        h('div', { class: 'money' }, h('input', {
          class: 'input input--money', inputmode: 'decimal', placeholder: '0', 'aria-label': `Expense ${i + 1} amount`,
          value: e.amount ? String(e.amount) : '', disabled: !canEdit,
          oninput: (ev) => { ev.target.value = ev.target.value.replace(/[^\d.]/g, ''); e.amount = Number(ev.target.value) || 0; markDirty(); },
          onfocus: (ev) => ev.target.select(),
        })),
        h('input', { class: 'input', placeholder: 'What for?', 'aria-label': `Expense ${i + 1} note`, value: e.note || '', maxlength: 120, disabled: !canEdit, oninput: (ev) => { e.note = ev.target.value; dirty = true; } })
      ),
      h('div', { class: 'expense__tools' },
        thumb, fileInput,
        canEdit && h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'Remove expense',
          onclick: async () => {
            if ((e.amount || e.photoId) && !(await confirmSheet({ title: 'Remove expense?', message: `${rupees(e.amount)} ${e.note || ''}`, confirmLabel: 'Remove', danger: true }))) return;
            form.expenses.splice(i, 1); markDirty(); drawExpenses();
          },
        }, icon('trash'))
      ),
      e.legacyPhoto && !e.photoId && h('p', { class: 'small muted', style: { gridColumn: '1 / -1' } }, 'Old photo from the previous app version is no longer available.')
    );
  }

  // ---------- Save ----------
  const saveBtn = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(saveBtn, save) }, icon('check'), data.exists ? 'Update sales' : 'Save sales');
  async function save() {
    try {
      const res = await api(`/api/sales/${date}`, {
        method: 'PUT',
        body: { ...form, expenses: form.expenses.map(({ legacyPhoto, ...e }) => e) },
      });
      dirty = false;
      saveBtn.lastChild.textContent = 'Update sales';
      toast(res.record.isTallied ? 'Saved — tallied!' : `Saved with ${res.record.difference > 0 ? 'excess' : 'shortage'} of ${rupees(Math.abs(res.record.difference))}`, res.record.isTallied ? 'good' : 'info');
    } catch (err) {
      toastError(err);
    }
  }

  drawExpenses();
  updateTally();

  const savedBy = r.lastUpdatedBy?.name && h('p', { class: 'small muted' }, `Last saved by ${r.lastUpdatedBy.name}${r.updatedAt ? ' · ' + new Date(r.updatedAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : ''}`);

  mount(ctx.root,
    dateBar({ date, onChange: (d) => ctx.navigate(`/sales/${d}`) }),
    !canEdit && notice('info', 'lock', `View only. Shop managers can only change today's entry.`),
    tally,
    h('section', { class: 'card stack' },
      moneyField({ label: 'System sales (from billing machine)', value: form.systemSales, disabled: !canEdit, onInput: (v) => { form.systemSales = v; markDirty(); } }),
      h('div', { class: 'grid-2' },
        moneyField({ label: 'Cash', value: form.totalCash, disabled: !canEdit, onInput: (v) => { form.totalCash = v; markDirty(); } }),
        moneyField({ label: 'GPay / UPI', value: form.totalGpay, disabled: !canEdit, onInput: (v) => { form.totalGpay = v; markDirty(); } })
      )
    ),
    h('section', { class: 'card' },
      h('div', { class: 'card__title' }, 'Expenses', canEdit && h('button', { class: 'btn btn--soft btn--sm', onclick: () => { form.expenses.push({ amount: 0, note: '', photoId: null }); drawExpenses(); expenseList.querySelector('.expense:last-child input')?.focus(); } }, icon('plus'), 'Add')),
      expenseList
    ),
    h('section', { class: 'card field' },
      h('label', { for: 'sales-notes' }, 'Notes'),
      h('textarea', { id: 'sales-notes', class: 'textarea', maxlength: 500, disabled: !canEdit, placeholder: 'Anything the owner should know', value: form.notes, oninput: (e) => { form.notes = e.target.value; dirty = true; } })
    ),
    savedBy,
    canEdit && h('div', { class: 'actionbar' }, h('div', null, saveBtn))
  );
}
