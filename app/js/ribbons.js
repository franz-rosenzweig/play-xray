// Ribbons: the play as one band from start to finish, split into who is speaking along the way.
import { h, s, pct, roman, sceneTag, sceneName, pref, setPref, showTip, hideTip, pointer } from './util.js';
import { seg } from './chart.js';

export function renderRibbons(root, play) {
  const st = { detail: pref('detail', 'broad') };
  const controls = h('div.controls');
  const box = h('div.ribbonbox');
  const legend = h('div.rlegend');
  root.append(controls, box, legend);

  const top = play.ranked.slice(0, 8);
  const order = top.slice().sort((a, b) => a.first - b.first || b.lines - a.lines);
  const rowsOf = new Map(order.map((c, i) => [c.i, i]));
  const R = order.length + 1; // + everyone else
  const total = play.total;

  // Per-line weights for each ribbon.
  const perLine = Array.from({ length: R }, () => new Float32Array(total));
  for (const [start, n, cs] of play.segments) {
    const w = 1 / cs.length;
    for (const c of cs) {
      const r = rowsOf.has(c) ? rowsOf.get(c) : R - 1;
      const arr = perLine[r];
      for (let k = start; k < start + n; k += 1) arr[k] += w;
    }
  }

  function draw() {
    controls.replaceChildren(seg('Detail', [['broad', 'Broad strokes'], ['close', 'Close up']], st.detail, (v) => {
      st.detail = v; setPref('detail', v); draw();
    }));
    const phone = matchMedia('(max-width: 640px)').matches;
    const W = Math.max(300, box.clientWidth);
    const TOP = 30;
    const BAND = phone ? 300 : 400;
    const BOTTOM = 30;
    const H = TOP + BAND + BOTTOM;
    const K = Math.min(360, Math.floor(W / 3));
    const sigma = Math.max(12, total / (st.detail === 'close' ? 140 : 55));
    const reach = Math.ceil(sigma * 3);
    const kernel = new Float32Array(reach * 2 + 1);
    for (let d = -reach; d <= reach; d += 1) kernel[d + reach] = Math.exp(-(d * d) / (2 * sigma * sigma));

    // Shares at K points along the play.
    const xAt = (line) => (line / total) * W;
    const pos = Array.from({ length: K }, (_, i) => ((i + 0.5) / K) * total);
    const share = Array.from({ length: R }, () => new Float32Array(K));
    for (let i = 0; i < K; i += 1) {
      const centre = Math.round(pos[i]);
      let sum = 0;
      const vals = new Float32Array(R);
      for (let d = -reach; d <= reach; d += 1) {
        const k = centre + d;
        if (k < 0 || k >= total) continue;
        const g = kernel[d + reach];
        for (let r = 0; r < R; r += 1) vals[r] += perLine[r][k] * g;
      }
      for (let r = 0; r < R; r += 1) sum += vals[r];
      for (let r = 0; r < R; r += 1) share[r][i] = sum ? vals[r] / sum : 0;
    }

    // Stack: everyone else at the bottom, then the main parts in order of entrance.
    const stackOrder = [R - 1, ...order.map((_, i) => i)];
    const lower = Array.from({ length: R }, () => new Float32Array(K));
    const upper = Array.from({ length: R }, () => new Float32Array(K));
    for (let i = 0; i < K; i += 1) {
      let acc = 0;
      for (const r of stackOrder) {
        lower[r][i] = acc;
        acc += share[r][i];
        upper[r][i] = acc;
      }
    }
    const yOf = (v) => TOP + BAND - v * BAND;
    const xs = pos.map((p) => xAt(p));
    xs[0] = 0;
    xs[K - 1] = W;

    const svg = s('svg.ribbons', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `Ribbons for ${play.title}: who carries each stretch of the play` });

    // Scene ticks and act rules.
    const marks = s('g');
    play.scenes.forEach((sc, i) => {
      const x = xAt(sc.start);
      const newAct = !i || sc.a !== play.scenes[i - 1].a;
      if (i) marks.append(s(newAct ? 'line.actrule' : 'line.scenetick', { x1: x, x2: x, y1: newAct ? 6 : TOP + BAND + 2, y2: TOP + BAND + (newAct ? 10 : 8) }));
      const w = (sc.n / total) * W;
      if (w > 16) marks.append(s('text.scenenum', { x: x + w / 2, y: TOP + BAND + 22, 'text-anchor': 'middle' },
        sc.a === 99 ? 'E' : sc.s === 0 ? (sc.t === 'Chorus' ? 'C' : 'P') : String(sc.s)));
    });
    const span = (act) => {
      const scs = play.scenes.filter((sc) => sc.a === act.a);
      return [xAt(scs[0].start), xAt(scs[scs.length - 1].start + scs[scs.length - 1].n)];
    };
    const roomy = play.acts.every((act) => act.a === 0 || act.a === 99 || span(act)[1] - span(act)[0] > 60);
    for (const act of play.acts) {
      const [x0, x1] = span(act);
      const label = act.a === 0 ? 'Ind.' : act.a === 99 ? 'Ep.' : (roomy ? `Act ${roman(act.a)}` : roman(act.a));
      if (x1 - x0 > 18) marks.append(s('text.acttext', { x: (x0 + x1) / 2, y: 20, 'text-anchor': 'middle' }, label));
    }

    const band = s('g.band');
    for (const r of stackOrder) {
      let d = `M${xs[0].toFixed(1)} ${yOf(upper[r][0]).toFixed(1)}`;
      for (let i = 1; i < K; i += 1) d += `L${xs[i].toFixed(1)} ${yOf(upper[r][i]).toFixed(1)}`;
      for (let i = K - 1; i >= 0; i -= 1) d += `L${xs[i].toFixed(1)} ${yOf(lower[r][i]).toFixed(1)}`;
      const ch = r < R - 1 ? order[r] : null;
      band.append(s(`path.ribbon.k${ch ? ch.color : 'g'}${ch ? '' : '.others'}`, { d: `${d}Z` }));
    }
    // Each name goes where its ribbon stays thick for the whole width of the word.
    const step = W / K;
    for (let r = 0; r < R; r += 1) {
      const name = r < R - 1 ? order[r].n : 'everyone else';
      for (const fs of phone ? [14, 12] : [16, 14, 12]) {
        const half = Math.ceil((name.length * fs * 0.26 + 4) / step);
        let best = 0;
        let at = null;
        for (let i = half; i < K - half; i += 1) {
          let lo = 0;
          let hi = 1;
          for (let j = i - half; j <= i + half; j += 1) {
            lo = Math.max(lo, lower[r][j]);
            hi = Math.min(hi, upper[r][j]);
          }
          if ((hi - lo) * BAND > best) { best = (hi - lo) * BAND; at = { i, lo, hi }; }
        }
        if (at && best >= fs + 5) {
          band.append(s(`text.rlabel${r < R - 1 ? '' : '.others'}`, { x: xs[at.i], y: yOf((at.lo + at.hi) / 2) + fs * 0.34, 'text-anchor': 'middle', 'font-size': fs }, name));
          break;
        }
      }
    }

    const cursor = s('line.cursor', { x1: 0, x2: 0, y1: TOP - 4, y2: TOP + BAND + 4, visibility: 'hidden' });
    svg.append(marks, band, cursor);
    box.replaceChildren(svg);

    let lastType = 'mouse';
    function at(e) {
      const rect = svg.getBoundingClientRect();
      const p = pointer(e);
      const x = Math.max(0, Math.min(W - 0.01, p.x - rect.left));
      const line = Math.floor((x / W) * total);
      const sc = play.scenes.find((c) => line >= c.start && line < c.start + c.n) || play.scenes[play.scenes.length - 1];
      const i = Math.min(K - 1, Math.floor((x / W) * K));
      return { x, sc, i, p };
    }
    function show({ x, sc, i, p }, pinned) {
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
      cursor.setAttribute('visibility', 'visible');
      const here = order.map((c, r) => ({ c, v: share[r][i] })).concat([{ c: null, v: share[R - 1][i] }])
        .filter((o) => o.v >= 0.04).sort((a, b) => b.v - a.v).slice(0, 4);
      const parts = [h('div.tiphead', { text: `${sceneName(sc)}` })];
      if (sc.loc) parts.push(h('div.tiploc', { text: sc.loc }));
      parts.push(h('div.tiplist', null, here.map((o) => h('div', null,
        o.c ? h(`span.t${o.c.color}`, { text: o.c.n }) : h('span.pencil', { text: 'everyone else' }), ` ${pct(o.v)}`))));
      if (pinned) parts.push(h('a.tiplink', { href: `#/${play.id}/${sc.k}` }, `Read ${sceneTag(sc)} →`));
      showTip(parts, p.x, p.y, { pinned });
    }
    svg.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; });
    svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(at(e), false); });
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { cursor.setAttribute('visibility', 'hidden'); hideTip(); }
    });
    svg.addEventListener('click', (e) => {
      const a = at(e);
      if (lastType === 'mouse') { location.hash = `#/${play.id}/${a.sc.k}`; return; }
      show(a, true);
    });

    legend.replaceChildren(...order.slice().sort((a, b) => b.lines - a.lines).map((c) =>
      h('span.chip', null, h(`span.dot.k${c.color}`, { 'aria-hidden': 'true' }), h('span', { text: c.n }), h('span.pct', { text: pct(c.lines / total) }))),
    h('span.chip', null, h('span.dot.kg', { 'aria-hidden': 'true' }), h('span', { text: 'everyone else' }),
      h('span.pct', { text: pct(1 - order.reduce((n, c) => n + c.lines, 0) / total) })),
    h('p.note', { text: 'Each ribbon’s thickness is that part’s share of the lines being spoken around that point in the play.' }));
  }

  const onDoc = (e) => { if (!e.target.closest('.ribbons') && !e.target.closest('.tip')) hideTip(); };
  document.addEventListener('pointerdown', onDoc);
  draw();
  let lastW = box.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(box.clientWidth - lastW) > 2) { lastW = box.clientWidth; draw(); } });
  ro.observe(box);
  return () => { ro.disconnect(); document.removeEventListener('pointerdown', onDoc); hideTip(); };
}
