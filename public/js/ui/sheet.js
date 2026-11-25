import { h } from './dom.js';
import { icon } from './icons.js';

// Bottom sheets built on the native <dialog> element, which gives us focus
// trapping, the Esc key and a backdrop for free.
// Open sheets are tracked so the Android back button can close the top one.
const stack = [];

/**
 * openSheet({ title, body, actions }) → { close, el }
 * `body` is a Node (or array of Nodes). `onClose` runs once when it closes.
 */
export function openSheet({ title, body, actions, onClose }) {
  const dialog = h('dialog', { class: 'sheet', 'aria-label': title },
    h('div', { class: 'sheet__inner' },
      h('div', { class: 'sheet__grip' }),
      h('div', { class: 'sheet__head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('x'))),
      body,
      actions && h('div', { class: 'stack' }, actions)
    )
  );
  // Tap on the dimmed backdrop closes the sheet.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    onClose?.();
    setTimeout(() => dialog.remove(), 300);
  });
  document.body.append(dialog);
  dialog.showModal();
  const close = () => dialog.open && dialog.close();
  const api = { close, el: dialog };
  stack.push(api);
  return api;
}

/** Close the top-most sheet; returns false if none was open. */
export function closeTopSheet() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** A yes/no question. Resolves true or false. */
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      title,
      body: h('p', { class: 'muted' }, message),
      actions: [
        h('button', { class: `btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}`, onclick: () => { answered = true; sheet.close(); resolve(true); } }, confirmLabel),
        h('button', { class: 'btn btn--block btn--secondary', onclick: () => sheet.close() }, 'Cancel'),
      ],
      onClose: () => !answered && resolve(false),
    });
  });
}

/** Full-screen photo viewer with rotate. */
export function openPhotoViewer(src, alt = 'Bill photo') {
  let deg = 0;
  const img = h('img', { src, alt });
  const dialog = h('dialog', { class: 'viewer', 'aria-label': alt },
    img,
    h('div', { class: 'viewer__bar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Rotate', onclick: () => { deg += 90; img.style.rotate = deg + 'deg'; } }, icon('rotate')),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x'))
    )
  );
  const api = { close: () => dialog.open && dialog.close(), el: dialog };
  dialog.addEventListener('close', () => { stack.splice(stack.indexOf(api), 1); dialog.remove(); });
  document.body.append(dialog);
  dialog.showModal();
  stack.push(api);
}
