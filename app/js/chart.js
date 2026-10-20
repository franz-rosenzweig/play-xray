// The scene chart: characters down the side, scenes across (width = length), a mark where someone is on.
import { h, s, fmt, roman, sceneTag, sceneName, pref, setPref, showTip, hideTip, pointer } from './util.js';

const MINS = [0, 10, 25, 50, 100];

export function renderChart(root, play) {
  const st = {
    order: pref('order', 'first'),
    min: pref('min', 0),
    zoom: pref('zoom', 'fit'),
  };

  const controls = h('div.controls');
  const wrap = h('div.chartwrap');
  const legend = chartLegend();
  root.append(controls, wrap, legend);

  function drawControls() {
    controls.replaceChildren(
      seg('Order', [['first', 'First entrance'], ['size', 'Most lines']], st.order, (v) => { st.order = v; setPref('order', v); redraw(); }),
      selectBox('Show', MINS.map((m) => [m, m ? `${m}+ lines` : 'Everyone']), st.min, (v) => { st.min = Number(v); setPref('min', st.min); redraw(); }),
      seg('Width', [['fit', 'Fit'], ['wide', 'Wide']], st.zoom, (v) => { st.zoom = v; setPref('zoom', v); redraw(); }),
    );
  }

  let pinned = null;
  let unpin = () => {};
  function redraw() {
    drawControls();
    pinned = null;
    hideTip();
    draw();
  }

  function draw() {
    const phone = matchMedia('(max-width: 640px)').matches;
    const ROW = phone ? 24 : 22;
    const TAB = 26;
    const HEAD = TAB + 26;
    const NAMEW = phone ? 108 : 176;
    const TOT = phone ? 40 : 52;
    const ACTGAP = 6;

    let rows = play.chars.filter((c) => (st.min ? !c.g && c.lines >= st.min : true));
    rows = st.order === 'size'
      ? rows.slice().sort((a, b) => (b.g ? -1 : 0) - (a.g ? -1 : 0) || b.lines - a.lines)
      : rows.slice().sort((a, b) => a.first - b.first || a.i - b.i);

    const names = h('div.names', { style: { width: `${NAMEW}px` } });
    const scroller = h('div.scroller');
    wrap.replaceChildren(names, scroller);

    // Column geometry: every scene at least MINW wide, the rest shared out by length.
    const avail = Math.max(240, wrap.clientWidth - NAMEW - TOT - 2);
    const scenes = play.scenes;
    const acts = play.acts.length;
    const gaps = (scenes.length - acts) * 1 + (acts - 1) * ACTGAP;
    const MINW = phone ? 4 : 5;
    // An induction or epilogue on its own gets room for its tab.
    const minOf = (sc) => ((sc.a === 0 || sc.a === 99) && play.acts.find((a) => a.a === sc.a).scenes.length === 1 ? 16 : MINW);
    let inner = avail - gaps;
    if (st.zoom === 'wide') inner = Math.max(inner, play.total * (phone ? 0.42 : 0.5));
    const spare = Math.max(0, inner - scenes.reduce((n, sc) => n + minOf(sc), 0));
    const xs = [];
    let x = 0;
    scenes.forEach((sc, i) => {
      if (i) x += sc.a !== scenes[i - 1].a ? ACTGAP : 1;
      const w = minOf(sc) + spare * (sc.n / play.total);
      xs.push({ x, w, sc });
      x += w;
    });
    const plotW = x;
    const W = plotW + TOT;
    const H = HEAD + rows.length * ROW + 6;

    const maxCell = Math.max(...scenes.map((sc) => Math.max(0, ...sc.by.values())));
    const svg = s('svg.chart', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `Scene chart of ${play.title}: ${rows.length} characters across ${scenes.length} scenes` });
    svg.append(s('defs', null,
      s('pattern', { id: 'hatch', patternUnits: 'userSpaceOnUse', width: 4, height: 4, patternTransform: 'rotate(45)' },
        s('line.hatch', { x1: 0.5, y1: 0, x2: 0.5, y2: 4 }))));

    // Ruled lines under every row, like the paper of a prompt book.
    const rules = s('g.rules');
    for (let r = 0; r <= rows.length; r += 1) {
      rules.append(s('line', { x1: 0, x2: plotW, y1: HEAD + r * ROW + 0.5, y2: HEAD + r * ROW + 0.5 }));
    }
    svg.append(rules);

    // Act tabs and scene numbers.
    const head = s('g.head');
    const actW = (act) => {
      const cols = xs.filter((c) => c.sc.a === act.a);
      return cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x;
    };
    const roomy = play.acts.every((act) => act.a === 0 || act.a === 99 || actW(act) > 54);
    const tiny = (w, long, mid, short) => (w > 70 ? long : w > 26 ? mid : short);
    for (const act of play.acts) {
      const cols = xs.filter((c) => c.sc.a === act.a);
      const x0 = cols[0].x;
      const x1 = cols[cols.length - 1].x + cols[cols.length - 1].w;
      const w = x1 - x0;
      const r = Math.min(6, w / 3);
      head.append(s('path.acttab', { d: `M${x0} ${TAB}V${r + 2}Q${x0} 2 ${x0 + r} 2H${x1 - r}Q${x1} 2 ${x1} ${r + 2}V${TAB}` }));
      const label = act.a === 0 ? tiny(w, 'Induction', 'Ind.', 'I') : act.a === 99 ? tiny(w, 'Epilogue', 'Ep.', 'E')
        : roomy ? `Act ${roman(act.a)}` : roman(act.a);
      if (w >= 16) head.append(s('text.acttext', { x: (x0 + x1) / 2, y: TAB - 8, 'text-anchor': 'middle' }, label));
    }
    for (const c of xs) {
      const tag = c.sc.a === 99 ? 'E' : c.sc.s === 0 ? (c.sc.t === 'Chorus' ? 'C' : 'P') : String(c.sc.s);
      const a = s('a.scenelink', { href: `#/${play.id}/${c.sc.k}`, 'aria-label': `Read ${sceneName(c.sc)}` });
      a.append(s('rect.hit', { x: c.x, y: 0, width: c.w, height: HEAD }));
      if (c.w >= 10) a.append(s('text.scenenum', { x: c.x + c.w / 2, y: HEAD - 9, 'text-anchor': 'middle' }, tag));
      else a.append(s('line.scenetick', { x1: c.x + c.w / 2, x2: c.x + c.w / 2, y1: HEAD - 13, y2: HEAD - 9 }));
      head.append(a);
    }
    svg.append(head);

    // Scene and act dividers down the chart.
    const divs = s('g.dividers');
    xs.forEach((c, i) => {
      if (!i) return;
      const newAct = c.sc.a !== xs[i - 1].sc.a;
      const xm = newAct ? c.x - ACTGAP / 2 : c.x - 0.5;
      if (newAct) {
        divs.append(s('line.actrule', { x1: xm - 1, x2: xm - 1, y1: TAB, y2: H - 4 }));
        divs.append(s('line.actrule', { x1: xm + 1, x2: xm + 1, y1: TAB, y2: H - 4 }));
      } else {
        divs.append(s('line.scenerule', { x1: xm, x2: xm, y1: HEAD, y2: H - 6 }));
      }
    });
    svg.append(divs);

    // Highlight bands (under the marks).
    const hlCol = s('rect.hl', { x: 0, y: TAB, width: 0, height: H - TAB, visibility: 'hidden' });
    const hlRow = s('rect.hl', { x: 0, y: 0, width: plotW, height: ROW, visibility: 'hidden' });
    svg.append(hlCol, hlRow);

    // The marks.
    const marks = s('g.marks');
    rows.forEach((ch, r) => {
      const y = HEAD + r * ROW;
      for (const c of xs) {
        const n = c.sc.by.get(ch.i);
        if (n) {
          const op = 0.24 + 0.76 * Math.sqrt(n / maxCell);
          marks.append(s(`rect.mark.k${ch.color}`, { x: c.x + 0.5, y: y + 4, width: Math.max(1, c.w - 1), height: ROW - 8, rx: 1.5, 'fill-opacity': op.toFixed(3) }));
        } else if (c.sc.on && c.sc.in.has(ch.i)) {
          marks.append(s('rect.silent', { x: c.x + 0.5, y: y + 6, width: Math.max(1, c.w - 1), height: ROW - 12, rx: 1 }));
        }
      }
      marks.append(s(`text.total.t${ch.color}`, { x: W - 4, y: y + ROW / 2 + 4, 'text-anchor': 'end' }, fmt(ch.lines)));
    });
    svg.append(marks);
    scroller.append(svg);

    // Names down the side.
    names.append(h('div.namehead', { style: { height: `${HEAD}px` } }, h('span', { text: 'Speaking parts' })));
    rows.forEach((ch, r) => {
      const a = h(`a.rowname${ch.g ? '.group' : ''}`, {
        href: `#/${play.id}/stage/${ch.i}`, style: { height: `${ROW}px` }, title: `${ch.n}: ${fmt(ch.lines)} lines`,
      }, h(`span.dot.k${ch.color}`, { 'aria-hidden': 'true' }), h('span.nm', { text: ch.n }));
      a.addEventListener('pointerenter', () => showRow(r));
      a.addEventListener('pointerleave', clear);
      names.append(a);
    });
    if (!rows.length) names.append(h('p.small', { text: 'Nobody that big here.' }));

    function showRow(r) {
      hlRow.setAttribute('y', HEAD + r * ROW);
      hlRow.setAttribute('visibility', 'visible');
      names.children[r + 1]?.classList.add('hot');
    }
    function clear() {
      if (pinned) return;
      hlCol.setAttribute('visibility', 'hidden');
      hlRow.setAttribute('visibility', 'hidden');
      names.querySelectorAll('.hot').forEach((el) => el.classList.remove('hot'));
      hideTip();
    }

    function hit(e) {
      const rect = svg.getBoundingClientRect();
      const p = pointer(e);
      const px = p.x - rect.left;
      const py = p.y - rect.top;
      const c = xs.find((col) => px >= col.x - 0.5 && px <= col.x + col.w + 0.5);
      const r = py >= HEAD ? Math.floor((py - HEAD) / ROW) : -1;
      return { c, r: r >= 0 && r < rows.length ? r : -1, p };
    }

    function show({ c, r, p }, pinnedTip) {
      names.querySelectorAll('.hot').forEach((el) => el.classList.remove('hot'));
      if (!c) { clear(); return; }
      hlCol.setAttribute('x', c.x - 0.5);
      hlCol.setAttribute('width', c.w + 1);
      hlCol.setAttribute('visibility', 'visible');
      if (r >= 0) showRow(r); else hlRow.setAttribute('visibility', 'hidden');
      const ch = r >= 0 ? rows[r] : null;
      const n = ch ? c.sc.by.get(ch.i) : 0;
      const parts = [];
      if (ch) {
        const what = n ? `${fmt(n)} line${n === 1 ? '' : 's'}` : c.sc.in.has(ch.i) ? 'on stage, silent' : 'not in this scene';
        parts.push(h('div.tiphead', null, h(`span.t${ch.color}`, { text: ch.n }), `, ${sceneTag(c.sc)}: ${what}`));
      } else {
        parts.push(h('div.tiphead', { text: `${sceneName(c.sc)}: ${fmt(c.sc.n)} lines` }));
      }
      if (c.sc.loc) parts.push(h('div.tiploc', { text: c.sc.loc }));
      if (ch) parts.push(h('div.tipsub', { text: `${sceneTag(c.sc)} has ${fmt(c.sc.n)} lines` }));
      if (pinnedTip) parts.push(h('a.tiplink', { href: `#/${play.id}/${c.sc.k}` }, `Read ${sceneTag(c.sc)} →`));
      showTip(parts, p.x, p.y, { pinned: pinnedTip });
    }

    let lastType = 'mouse';
    svg.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; });
    unpin = () => { pinned = null; clear(); };
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || pinned) return;
      show(hit(e), false);
    });
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') clear(); });
    svg.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const at = hit(e);
      if (!at.c) return;
      if (lastType === 'mouse') {
        location.hash = `#/${play.id}/${at.c.sc.k}`;
        return;
      }
      const key = `${at.c.sc.k}:${at.r}`;
      if (pinned === key) { location.hash = `#/${play.id}/${at.c.sc.k}`; return; }
      pinned = null;
      show(at, true);
      pinned = key;
    });
  }

  const onDocTap = (e) => {
    if (pinned && !e.target.closest('.chart') && !e.target.closest('.tip')) unpin();
  };
  document.addEventListener('pointerdown', onDocTap);

  drawControls();
  draw();
  let lastW = wrap.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(wrap.clientWidth - lastW) > 2) { lastW = wrap.clientWidth; draw(); }
  });
  ro.observe(wrap);
  return () => { ro.disconnect(); document.removeEventListener('pointerdown', onDocTap); hideTip(); };
}

function chartLegend() {
  const sw = (op) => s('rect.mark.k0', { x: 0, y: 0, width: 22, height: 12, rx: 1.5, 'fill-opacity': op });
  const key = (label, mark) => h('span.key', null, s('svg', { width: 22, height: 12, 'aria-hidden': 'true' }, mark), label);
  return h('div.legend', null,
    key('a few lines', sw(0.25)), key('a big scene', sw(1)),
    key('on stage, silent', s('rect.silent', { x: 0, y: 2, width: 22, height: 8, rx: 1 })),
    h('span.note', { text: 'Wider column, longer scene. Tap a column to read it.' }),
  );
}

export function seg(label, options, value, onPick) {
  const g = h('div.seg', { role: 'group', 'aria-label': label }, h('span.seglabel', { text: label }));
  for (const [v, text] of options) {
    g.append(h(`button.segbtn${v === value ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, text));
  }
  return g;
}

export function selectBox(label, options, value, onPick) {
  const sel = h('select', { 'aria-label': label, onchange: (e) => onPick(e.target.value) });
  for (const [v, text] of options) sel.append(h('option', { value: v, selected: String(v) === String(value) }, text));
  return h('label.selwrap', null, h('span.seglabel', { text: label }), sel);
}
