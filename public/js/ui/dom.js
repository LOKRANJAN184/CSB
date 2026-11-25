// A tiny helper for building DOM elements without innerHTML.
//
//   h('button', { class: 'btn', onclick: save }, 'Save')
//
// Text passed as children is ALWAYS inserted as text, never as HTML, so a
// staff name like "<script>" can never run as code (no XSS).
// The only HTML we ever insert is our own SVG icon strings (see icons.js).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'ref') v(el);
      else if (k === 'value') el.value = v; // property, so it also works for <textarea>
      else if (k in el && typeof v !== 'string') el[k] = v; // e.g. value, checked, disabled
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replace all children of `el`. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Create an element from one of our own trusted SVG strings. */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

/** Show a spinner on a button while an async action runs; prevents double taps. */
export async function busy(button, fn) {
  if (button.classList.contains('is-loading')) return;
  button.classList.add('is-loading');
  button.disabled = true;
  try { return await fn(); }
  finally { button.classList.remove('is-loading'); button.disabled = false; }
}
