// Shared stage: who is on stage with whom, as a grid, and each character's closest scene partners.
import { h, s, fmt, pref, setPref, showTip, hideTip, pointer } from './util.js';
import { shared } from './data.js';
import { seg } from './chart.js';

export function renderStage(root, play, arg) {
  const st = { size: pref('gridsize', 12) };
  const controls = h('div.controls');
  const layout = h('div.stagelayout');
  const gridBox = h('div.gridbox');
  const side = h('aside.partners', { 'aria-live': 'polite' });
  layout.append(gridBox, side);
  root.append(controls, layout);

  const named = play.ranked;
  let selected = arg != null && play.chars[Number(arg)] ? Number(arg) : named[0].i;

  function draw() {
    controls.replaceChildren(seg('Parts', [[8, 'Top 8'], [12, 'Top 12'], [20, 'Top 20']], st.size, (v) => {
      st.size = v; setPref('gridsize', v); draw();
    }));
    const people = named.slice(0, st.size);
    if (!people.some((c) => c.i === selected) && play.chars[selected] && !play.chars[selected].g) {
      people[people.length - 1] = play.chars[selected];
    }
    const n = people.length;
    const m = people.map((a) => people.map((b) => (a === b ? a.inScenes : shared(play, a.i, b.i))));
    const max = Math.max(1, ...m.flatMap((row, i) => row.filter((_, j) => j !== i)));

    const phone = matchMedia('(max-width: 640px)').matches;
    const LABEL = phone ? 92 : 132;
    const SLANT = phone ? 46 : 70;   // the slanted names stick out past the last column
    const avail = Math.max(260, gridBox.clientWidth) - LABEL - SLANT - 4;
    const CELL = Math.max(18, Math.min(phone ? 34 : 42, Math.floor(avail / n)));
    const TOPL = phone ? 78 : 108;
    const W = LABEL + CELL * n + SLANT;
    const H = TOPL + CELL * n + 2;
    const svg = s('svg.matrix', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `How many scenes each pair of the ${n} biggest parts in ${play.title} share` });

    people.forEach((c, i) => {
      const y = TOPL + i * CELL;
      const row = s(`a.mrow${c.i === selected ? '.sel' : ''}`, { href: `#/${play.id}/stage/${c.i}` },
        s(`text.mname.t${c.color}`, { x: LABEL - 8, y: y + CELL / 2 + 4, 'text-anchor': 'end' }, short(c.n, phone ? 12 : 18)));
      svg.append(row);
      const tx = LABEL + i * CELL + CELL / 2;
      svg.append(s(`text.mname.top.t${c.color}`, { x: 0, y: 0, transform: `translate(${tx + 4},${TOPL - 8}) rotate(-55)` }, short(c.n, phone ? 12 : 16)));
    });
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const x = LABEL + j * CELL;
        const y = TOPL + i * CELL;
        if (i === j) {
          svg.append(s('rect.diag', { x: x + 1.5, y: y + 1.5, width: CELL - 3, height: CELL - 3, rx: 2 }));
          continue;
        }
        const v = m[i][j];
        if (v) svg.append(s('rect.cell', { x: x + 1, y: y + 1, width: CELL - 2, height: CELL - 2, rx: 2, 'fill-opacity': (0.12 + 0.88 * (v / max)).toFixed(3) }));
        else svg.append(s('rect.never', { x: x + CELL / 2 - 1.5, y: y + CELL / 2 - 1.5, width: 3, height: 3 }));
        if (CELL >= 24 && v) svg.append(s(`text.cellnum${v / max > 0.55 ? '.inv' : ''}`, { x: x + CELL / 2, y: y + CELL / 2 + 4, 'text-anchor': 'middle' }, String(v)));
      }
    }
    // Highlight for the selected person.
    const si = people.findIndex((c) => c.i === selected);
    if (si >= 0) {
      svg.append(s('rect.selrow', { x: LABEL, y: TOPL + si * CELL, width: CELL * n, height: CELL }));
      svg.append(s('rect.selrow', { x: LABEL + si * CELL, y: TOPL, width: CELL, height: CELL * n }));
    }
    gridBox.replaceChildren(svg, h('p.note', { text: 'The bolder the square, the more scenes those two share. A dot means they\u2019re never on stage together.' }));

    let lastType = 'mouse';
    const cellAt = (e) => {
      const r = svg.getBoundingClientRect();
      const p = pointer(e);
      const j = Math.floor((p.x - r.left - LABEL) / CELL);
      const i = Math.floor((p.y - r.top - TOPL) / CELL);
      return i >= 0 && j >= 0 && i < n && j < n ? { i, j, p } : null;
    };
    const tipFor = ({ i, j, p }) => {
      const a = people[i];
      const b = people[j];
      if (i === j) {
        showTip([h('div.tiphead', null, h(`span.t${a.color}`, { text: a.n }), `: in ${a.inScenes} of ${play.scenes.length} scenes`)], p.x, p.y);
      } else {
        const v = m[i][j];
        showTip([h('div.tiphead', null, h(`span.t${a.color}`, { text: a.n }), ' and ', h(`span.t${b.color}`, { text: b.n })),
          h('div.tipsub', { text: v ? `on stage together in ${v} scene${v === 1 ? '' : 's'}` : 'never on stage together' })], p.x, p.y);
      }
    };
    svg.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const c = cellAt(e);
      if (c) tipFor(c); else hideTip();
    });
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const c = cellAt(e);
      if (!c) return;
      if (lastType !== 'mouse') tipFor(c);
      else { selected = people[c.i].i; history.replaceState(null, '', `#/${play.id}/stage/${selected}`); draw(); }
    });

    drawSide();
  }

  function drawSide() {
    const me = play.chars[selected];
    const partners = play.chars.filter((c) => c.i !== me.i && !c.g)
      .map((c) => ({ c, n: shared(play, me.i, c.i) })).filter((o) => o.n).sort((a, b) => b.n - a.n || b.c.lines - a.c.lines);
    const never = play.ranked.slice(0, 12).filter((c) => c.i !== me.i && !shared(play, me.i, c.i));
    const most = partners[0]?.n || 1;
    side.replaceChildren(...[
      h('h2.sidehead', null, h(`span.t${me.color}`, { text: me.n })),
      h('p.sidemeta', { text: `${fmt(me.lines)} lines, on stage in ${me.inScenes} of ${play.scenes.length} scenes${me.inScenes > me.scenes ? ` (silent in ${me.inScenes - me.scenes})` : ''}.` }),
      h('h3.minihead', { text: 'Closest scene partners' }),
      partners.length ? h('ol.plist', null, partners.slice(0, 8).map((o) => h('li', null,
        h('a', { href: `#/${play.id}/stage/${o.c.i}` }, h(`span.dot.k${o.c.color}`, { 'aria-hidden': 'true' }), h('span.pn', { text: o.c.n })),
        h('span.pbar', null, h(`span.k${me.color}`, { style: { width: `${(o.n / most) * 100}%` } })),
        h('span.pv', { text: `${o.n}` })))) : h('p.small', { text: 'Always alone on stage.' }),
      never.length ? h('p.never', null, h('span.pencil', { text: 'Never shares the stage with ' }), never.slice(0, 6).map((c, i) => [i ? ', ' : '', h(`span.t${c.color}`, { text: c.n })]), '.') : null,
      h('p.small', null, 'Pick anyone in the grid, or from the ', h('a', { href: `#/${play.id}/cast`, text: 'cast list' }), '.'),
    ].filter(Boolean));
  }

  draw();
  let lastW = gridBox.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(gridBox.clientWidth - lastW) > 2) { lastW = gridBox.clientWidth; draw(); } });
  ro.observe(gridBox);
  return () => { ro.disconnect(); hideTip(); };
}

function short(name, max) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
