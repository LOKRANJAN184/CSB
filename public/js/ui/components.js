// Reusable building blocks shared by several screens.
import { h } from './dom.js';
import { icon } from './icons.js';
import { addDays, relativeDay, fmtDate, todayStr } from '../lib/format.js';

/** ‹ Today, 25 Nov › — with a hidden native date picker under the label. */
export function dateBar({ date, onChange, max = todayStr() }) {
  const input = h('input', { type: 'date', value: date, max, 'aria-label': 'Pick a date', onchange: (e) => e.target.value && onChange(e.target.value) });
  const next = addDays(date, 1);
  return h('div', { class: 'datebar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => onChange(addDays(date, -1)) }, icon('chevronLeft')),
    h('label', { class: `datebar__label ${date === todayStr() ? 'is-today' : ''}` },
      h('strong', null, relativeDay(date)),
      h('span', null, fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })),
      input
    ),
    h('button', { class: 'icon-btn', 'aria-label': 'Next day', disabled: next > max, onclick: () => onChange(next) }, icon('chevronRight'))
  );
}

/** A labelled ₹ input. Calls onInput(number) on every keystroke. */
export function moneyField({ label, value, onInput, disabled, hint, id }) {
  const fid = id || 'f' + Math.random().toString(36).slice(2, 8);
  return h('div', { class: 'field' },
    h('label', { for: fid }, label),
    h('div', { class: 'money' },
      h('input', {
        id: fid, class: 'input input--money', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
        placeholder: '0', value: value ? String(value) : '', disabled,
        oninput: (e) => {
          // allow digits and one dot only
          const clean = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
          if (clean !== e.target.value) e.target.value = clean;
          onInput(Number(clean) || 0);
        },
        onfocus: (e) => e.target.select(),
      })
    ),
    hint && h('span', { class: 'field__hint' }, hint)
  );
}

export function textField({ label, value = '', onInput, type = 'text', placeholder = '', inputmode, maxlength, autocomplete = 'off', required }) {
  const fid = 'f' + Math.random().toString(36).slice(2, 8);
  return h('div', { class: 'field' },
    h('label', { for: fid }, label),
    h('input', { id: fid, class: 'input', type, value, placeholder, inputmode, maxlength, autocomplete, required, oninput: (e) => onInput?.(e.target.value) })
  );
}

/** Radio-group style segmented control. */
export function segmented({ options, value, onChange, label, className = '', disabled }) {
  const wrap = h('div', { class: `segmented ${className}`, role: 'radiogroup', 'aria-label': label });
  const render = (current) => {
    wrap.replaceChildren(...options.map(([v, text]) =>
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(v === current), dataset: { v }, disabled,
        onclick: () => { if (v !== current) { render(v); onChange(v); } },
      }, text)
    ));
  };
  render(value);
  return wrap;
}

export function notice(tone, iconName, ...content) {
  return h('div', { class: `notice notice--${tone}`, role: tone === 'bad' ? 'alert' : null }, icon(iconName), h('div', null, ...content));
}

export function empty(iconName, text, action) {
  return h('div', { class: 'empty' }, icon(iconName), h('p', null, text), action && h('div', { style: { marginTop: '12px' } }, action));
}

export const skeleton = (height = 120) => h('div', { class: 'skeleton', style: { height: height + 'px' }, 'aria-hidden': 'true' });

/** Compress a phone photo in the browser before uploading (saves mobile data). */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
