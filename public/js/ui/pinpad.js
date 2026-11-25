import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * On-screen PIN keypad (big targets for the shop counter).
 * Physical keyboards work too. Calls onSubmit(pin) when ✓ is pressed.
 */
export function pinPad({ onSubmit, min = 4, max = 6 }) {
  let pin = '';
  const dots = h('div', { class: 'pin-dots', 'aria-live': 'polite', 'aria-label': 'PIN' });
  const ok = h('button', { type: 'button', class: 'key--ok', 'aria-label': 'Log in', onclick: () => submit() }, icon('check'));

  const render = () => {
    dots.replaceChildren(...Array.from({ length: Math.max(min, pin.length) }, (_, i) => h('i', { class: i < pin.length ? 'on' : '' })));
    dots.setAttribute('aria-label', `${pin.length} digits entered`);
    ok.disabled = pin.length < min;
  };
  const press = (d) => { if (pin.length < max) { pin += d; render(); } };
  const back = () => { pin = pin.slice(0, -1); render(); };
  const submit = () => { if (pin.length >= min) onSubmit(pin); };

  const key = (d) => h('button', { type: 'button', onclick: () => press(d) }, d);
  const pad = h('div', { class: 'keypad' },
    ...'123456789'.split('').map(key),
    h('button', { type: 'button', 'aria-label': 'Delete', onclick: back }, icon('backspace')),
    key('0'),
    ok
  );

  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Enter') submit();
  };
  document.addEventListener('keydown', onKey);
  render();

  return {
    el: h('div', { class: 'stack' }, dots, pad),
    clear: () => { pin = ''; render(); },
    shake: () => { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); navigator.vibrate?.(120); },
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
