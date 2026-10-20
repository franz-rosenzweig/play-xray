// Small helpers shared by every screen: building elements, numbers, saved settings, the tooltip.

export const SVGNS = 'http://www.w3.org/2000/svg';

/** h('div.card', {onclick}, child, ...) -> element. Class names after dots, attributes in the object. */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  setAttrs(el, attrs);
  add(el, kids);
  return el;
}

/** Same as h() for SVG elements. */
export function s(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElementNS(SVGNS, name);
  if (classes.length) el.setAttribute('class', classes.join(' '));
  setAttrs(el, attrs);
  add(el, kids);
  return el;
}

function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const fmt = (n) => n.toLocaleString('en-US');
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (n) => ROMAN[n] || String(n);

/** "3.1" -> "Act 3, Scene 1"; prologues, choruses, inductions and epilogues by name. */
export function sceneName(sc) {
  if (sc.a === 99) return 'Epilogue';
  if (sc.a === 0) return sc.t;
  if (sc.s === 0) return `Act ${sc.a}, ${sc.t}`;
  return `Act ${sc.a}, Scene ${sc.s}`;
}

/** The short tag for a scene column: "3.1", "Prol. 2", "Ind.", "Epil." */
export function sceneTag(sc) {
  if (sc.a === 99) return 'Epilogue';
  if (sc.a === 0) return sc.t;
  if (sc.s === 0) return `${sc.t} ${sc.a}`;
  return sc.k;
}

// ---- saved settings: every access guarded, the app works without storage

const KEY = 'play-xray:prefs';
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { prefs = {}; }

export function pref(name, fallback) {
  return name in prefs ? prefs[name] : fallback;
}

export function setPref(name, value) {
  prefs[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage off: keep it for this visit */ }
}

// ---- the tooltip: a slip of paper that follows the pointer

let tip;
export function tooltip() {
  if (!tip) {
    tip = h('div.tip', { role: 'status', 'aria-live': 'polite' });
    document.body.append(tip);
  }
  return tip;
}

export function showTip(content, x, y, { pinned = false } = {}) {
  const t = tooltip();
  t.replaceChildren(...[content].flat());
  t.classList.toggle('pinned', pinned);
  t.style.display = 'block';
  const r = t.getBoundingClientRect();
  const pad = 12;
  let left = x + 14;
  let top = y + 16;
  if (left + r.width > innerWidth - pad) left = Math.max(pad, x - r.width - 14);
  if (top + r.height > innerHeight - pad) top = Math.max(pad, y - r.height - 14);
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

export function hideTip() {
  if (tip) tip.style.display = 'none';
}

/** Pointer position for mouse and touch events alike. */
export function pointer(e) {
  const p = e.touches?.[0] || e.changedTouches?.[0] || e;
  return { x: p.clientX, y: p.clientY };
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Swatch dot in a character's colour. */
export function dot(ch) {
  return h(`span.dot.k${ch.color}`, { 'aria-hidden': 'true' });
}

/** A character's name in their colour. */
export function who(ch, tag = 'span') {
  return h(`${tag}.who.t${ch.color}`, { text: ch.n });
}
