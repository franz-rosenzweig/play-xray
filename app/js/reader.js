// Reader: one scene's text, with a mini chart of who speaks when at the top.
import { h, s, fmt, sceneName, sceneTag, setPref, showTip, hideTip, pointer, reducedMotion } from './util.js';
import { speakers, lineCount, speechText, carriesOn } from './data.js';

export function renderReader(root, play, sc, speech) {
  setPref(`last:${play.id}`, sc.k);
  const i = sc.i;
  const prev = play.scenes[i - 1];
  const next = play.scenes[i + 1];

  const picker = h('select.scenepick', { 'aria-label': 'Go to scene', onchange: (e) => { location.hash = `#/${play.id}/${e.target.value}`; } });
  let group = null;
  for (const x of play.scenes) {
    const actLabel = x.a === 0 ? 'Induction' : x.a === 99 ? 'Epilogue' : `Act ${x.a}`;
    if (!group || group.label !== actLabel) { group = h('optgroup', { label: actLabel }); picker.append(group); }
    const where = x.loc ? ` · ${x.loc.length > 34 ? `${x.loc.slice(0, 33)}…` : x.loc}` : '';
    group.append(h('option', { value: x.k, selected: x === sc }, `${sceneTag(x)}${where}`));
  }

  const nav = (where) => h('nav.scenenav', { 'aria-label': where === 'top' ? 'Scenes' : 'Scenes, bottom' },
    prev ? h('a.btn.ghost.prev', { href: `#/${play.id}/${prev.k}`, rel: 'prev' }, h('span', { 'aria-hidden': 'true', text: '← ' }), sceneTag(prev)) : h('span.btn.ghost.off', { text: 'Start' }),
    where === 'top' ? picker : h('a.btn.ghost', { href: '#sheet', onclick: (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); } }, 'Back to top'),
    next ? h('a.btn.ghost.next', { href: `#/${play.id}/${next.k}`, rel: 'next' }, sceneTag(next), h('span', { 'aria-hidden': 'true', text: ' →' })) : h('span.btn.ghost.off', { text: 'The end' }),
  );

  const people = [...sc.by.entries()].sort((a, b) => b[1] - a[1]);
  const silent = (sc.on || []).map((c) => play.chars[c]);
  const head = h('header.scenehead', null,
    h('p.scenekicker', { text: sceneName(sc) }),
    h('h2.scenetitle', { text: sc.loc || (sc.a === 99 ? 'Epilogue' : sc.t || sceneName(sc)) }),
    h('p.scenemeta', { text: `${fmt(sc.n)} lines · ${people.length} speaking${silent.length ? ` · ${silent.length} silent` : ''}` }),
  );

  const strip = sceneStrip(play, sc);
  const cast = h('ul.incast', { 'aria-label': 'Who is in this scene' },
    people.map(([c, n]) => h('li', null, h(`span.dot.k${play.chars[c].color}`, { 'aria-hidden': 'true' }),
      h(`span.t${play.chars[c].color}`, { text: play.chars[c].n }), h('span.pv', { text: ` ${n}` }))),
    silent.map((c) => h('li.silentname', { title: 'On stage, silent' }, h('span.dot.hatchdot', { 'aria-hidden': 'true' }), h('span', { text: c.n }))));

  const text = h('div.script', { lang: 'en-GB' });
  let lineNo = 0;
  sc.b.forEach((item, bi) => {
    if (typeof item === 'string') {
      text.append(h('p.sd', { text: item }));
      return;
    }
    const cs = speakers(item);
    const names = cs.map((c) => play.chars[c]);
    const block = h(`div.speech${carriesOn(item) ? '.cont' : ''}`, { id: `s${bi}`, 'data-bi': bi });
    if (!carriesOn(item)) {
      block.append(h('div.speaker', null, names.map((c, k) => [k ? (k === names.length - 1 ? ' and ' : ', ') : '', h(`span.t${c.color}`, { text: c.n })])));
    }
    const lines = h('div.lines');
    for (const ln of speechText(item).split('\n')) {
      lineNo += 1;
      const row = h('div.l');
      if (lineNo % 5 === 0) row.append(h('span.ln', { 'aria-hidden': 'true', text: lineNo }));
      row.append(...withAsides(ln));
      lines.append(row);
    }
    block.append(lines);
    text.append(block);
  });

  root.append(nav('top'), head, strip, cast, text, h('p.endmark', { 'aria-hidden': 'true', text: sc === play.scenes[play.scenes.length - 1] ? 'FINIS' : '' }), nav('bottom'));

  // Jump to a speech (from the cast list's "longest speech").
  if (speech != null) {
    const el = root.querySelector(`#s${speech}`);
    if (el) {
      el.classList.add('marked');
      requestAnimationFrame(() => {
        const y = el.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      });
    }
  }

  const keys = (e) => {
    if ((e.target instanceof Element && e.target.closest('input, select, textarea')) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft' && prev) location.hash = `#/${play.id}/${prev.k}`;
    if (e.key === 'ArrowRight' && next) location.hash = `#/${play.id}/${next.k}`;
  };
  document.addEventListener('keydown', keys);
  return () => { document.removeEventListener('keydown', keys); hideTip(); };
}

/** Bracketed directions inside a line ("[Aside]") in italics. */
function withAsides(line) {
  const out = [];
  let rest = line;
  const rx = /\[[^\]]*\]/;
  let m;
  while ((m = rx.exec(rest))) {
    if (m.index) out.push(rest.slice(0, m.index));
    out.push(h('i.aside', { text: m[0] }));
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

/** The scene as one strip: each speech a block as wide as it is long, in the speaker's colour. */
function sceneStrip(play, sc) {
  const box = h('div.strip');
  const W = 1000;
  const H = 34;
  const svg = s('svg.stripsvg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Who speaks when in ${sceneName(sc)}` });
  let x = 0;
  const blocks = [];
  sc.b.forEach((item, bi) => {
    if (typeof item === 'string') return;
    const n = lineCount(item);
    const w = (n / sc.n) * W;
    const cs = speakers(item);
    const ch = play.chars[cs[0]];
    svg.append(s(`rect.k${ch.color}`, { x: x.toFixed(2), y: 3, width: Math.max(0.6, w - 0.4).toFixed(2), height: H - 6, 'fill-opacity': 0.9 }));
    blocks.push({ x0: x, x1: x + w, bi, cs, n });
    x += w;
  });
  box.append(svg);
  let lastType = 'mouse';
  const find = (e) => {
    const r = svg.getBoundingClientRect();
    const p = pointer(e);
    const fx = ((p.x - r.left) / r.width) * W;
    return { b: blocks.find((bl) => fx >= bl.x0 && fx < bl.x1), p };
  };
  const tip = ({ b, p }) => {
    if (!b) { hideTip(); return; }
    showTip([h('div.tiphead', null, b.cs.map((c, k) => [k ? ' and ' : '', h(`span.t${play.chars[c].color}`, { text: play.chars[c].n })]), `: ${b.n} line${b.n === 1 ? '' : 's'}`)], p.x, p.y);
  };
  svg.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; });
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') tip(find(e)); });
  svg.addEventListener('pointerleave', hideTip);
  svg.addEventListener('click', (e) => {
    const f = find(e);
    if (!f.b) return;
    if (lastType !== 'mouse') tip(f);
    const el = document.getElementById(`s${f.b.bi}`);
    if (el) {
      document.querySelectorAll('.speech.marked').forEach((m) => m.classList.remove('marked'));
      el.classList.add('marked');
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  });
  return box;
}
