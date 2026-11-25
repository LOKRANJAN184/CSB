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
  };
  // ONE expense per day. Older records may have several; show them combined.
  const old = r.expenses || [];
  const expense = {
    amount: old.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    note: old.map((e) => e.note).filter(Boolean).join(', '),
    photoId: old.find((e) => e.photoId)?.photoId || null,
  };
  let dirty = false;
  const markDirty = () => { dirty = true; updateTally(); };
  ctx.setGuard(() => dirty && 'You have unsaved changes. Leave without saving?');

  // ---------- Tally card ----------
  const tally = h('section', { class: 'tally', 'aria-live': 'polite', 'aria-label': 'Tally' });
  function updateTally() {
    const totalExpenses = Number(expense.amount) || 0;
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

  // ---------- Expense (one per day) ----------
  const thumb = h('button', { type: 'button', class: 'thumb', disabled: !canEdit && !expense.photoId });
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (ev) => attach(ev.target.files[0]) });
  const removePhotoBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: removePhoto }, 'Remove photo');

  async function paintThumb() {
    thumb.replaceChildren();
    thumb.style.backgroundImage = '';
    thumb.setAttribute('aria-label', expense.photoId ? 'View bill photo' : 'Attach bill photo');
    removePhotoBtn.hidden = !canEdit || !expense.photoId;
    if (expense.photoId) {
      try { thumb.style.backgroundImage = `url("${await photoUrl(expense.photoId)}")`; } catch { thumb.append(icon('alert')); }
    } else {
      thumb.append(icon('camera'));
    }
  }
  thumb.onclick = async () => {
    if (expense.photoId) openPhotoViewer(await photoUrl(expense.photoId), expense.note || 'Bill photo');
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
      expense.photoId = res.id;
      markDirty();
      await paintThumb();
      toast('Photo attached — remember to save', 'good');
    } catch (err) {
      toastError(err);
    } finally {
      thumb.classList.remove('is-uploading');
      fileInput.value = '';
    }
  }

  async function removePhoto() {
    if (!(await confirmSheet({ title: 'Remove bill photo?', message: 'The photo is deleted when you save.', confirmLabel: 'Remove', danger: true }))) return;
    expense.photoId = null;
    markDirty();
    paintThumb();
  }

  const expenseCard = h('section', { class: 'card stack' },
    moneyField({ label: 'Expense (total for the day)', value: expense.amount, disabled: !canEdit, onInput: (v) => { expense.amount = v; markDirty(); } }),
    h('div', { class: 'field' },
      h('label', { for: 'expense-note' }, 'What was it for?'),
      h('input', { id: 'expense-note', class: 'input', maxlength: 120, placeholder: 'Milk, ghee, gas, packing…', value: expense.note, disabled: !canEdit, oninput: (e) => { expense.note = e.target.value; dirty = true; } })
    ),
    h('div', { class: 'hstack' }, thumb, fileInput,
      h('div', { class: 'row__main' }, h('strong', { class: 'small' }, 'Bill photo'), h('span', { class: 'small muted' }, canEdit ? 'Tap to take or choose a photo' : '')),
      removePhotoBtn)
  );
  paintThumb();

  // ---------- Save ----------
  const saveBtn = h('button', { class: 'btn btn--primary btn--block', onclick: () => busy(saveBtn, save) }, icon('check'), data.exists ? 'Update sales' : 'Save sales');
  async function save() {
    try {
      const res = await api(`/api/sales/${date}`, {
        method: 'PUT',
        body: { ...form, expenses: expense.amount > 0 || expense.photoId ? [{ amount: expense.amount, note: expense.note, photoId: expense.photoId }] : [] },
      });
      dirty = false;
      saveBtn.lastChild.textContent = 'Update sales';
      toast(res.record.isTallied ? 'Saved — tallied!' : `Saved with ${res.record.difference > 0 ? 'excess' : 'shortage'} of ${rupees(Math.abs(res.record.difference))}`, res.record.isTallied ? 'good' : 'info');
    } catch (err) {
      toastError(err);
    }
  }

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
    expenseCard,
    h('section', { class: 'card field' },
      h('label', { for: 'sales-notes' }, 'Notes'),
      h('textarea', { id: 'sales-notes', class: 'textarea', maxlength: 500, disabled: !canEdit, placeholder: 'Anything the owner should know', value: form.notes, oninput: (e) => { form.notes = e.target.value; dirty = true; } })
    ),
    savedBy,
    canEdit && h('div', { class: 'actionbar' }, h('div', null, saveBtn))
  );
}
