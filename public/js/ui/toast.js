import { h } from './dom.js';
import { icon } from './icons.js';

// Short messages at the top of the screen. role="status" makes screen readers
// announce them without moving focus.
let host;
export function toast(message, tone = 'info', ms = 3200) {
  host ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast toast--${tone}` }, icon(tone === 'good' ? 'checkCircle' : tone === 'bad' ? 'alert' : 'info'), h('span', null, message));
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
export const toastError = (err) => toast(err?.message || 'Something went wrong.', 'bad', 4500);
