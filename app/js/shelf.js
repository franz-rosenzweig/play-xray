// The shelf: all 37 plays as prompt books, grouped by genre, with a search box.
import { h, s, fmt, pct } from './util.js';
import { GENRES, genreInk } from './data.js';

export function renderShelf(root, index) {
  const intro = h('header.hero', null,
    h('p.kicker', { text: 'A stage manager’s view of Shakespeare' }),
    h('h1.wordmark', null, 'Play ', h('span.x', { text: 'X' }), '-Ray'),
    h('p.lede', { text: 'See any Shakespeare play at a glance: who’s on stage, who talks most, and how the scenes fall.' }),
  );
  const search = h('input.search', {
    type: 'search', placeholder: 'Find a play or a character', 'aria-label': 'Find a play or a character',
    autocomplete: 'off', spellcheck: 'false',
  });
  const count = h('p.count', { 'aria-live': 'polite' });
  const bar = h('div.shelfbar', null,
    h('label.searchwrap', null, searchIcon(), search),
    h('a.btn.ghost', { href: '#/all' }, 'Compare all 37 ', h('span', { 'aria-hidden': 'true', text: '→' })),
  );
  const shelves = h('div.shelves');
  root.append(intro, bar, count, shelves);

  const cards = new Map();
  for (const g of GENRES) {
    const list = index.plays.filter((p) => p.genre === g.key).sort((a, b) => a.year - b.year);
    const grid = h('div.cards');
    for (const p of list) {
      const card = playCard(p);
      cards.set(p.id, card);
      grid.append(card.el);
    }
    const sec = h(`section.shelf.ink-${g.ink}`, { 'data-genre': g.key },
      h('h2.shelfname', null, h('span', { text: g.plural }), h('small', { text: `${list.length} plays` })),
      grid);
    shelves.append(sec);
  }

  function filter() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const p of index.plays) {
      const c = cards.get(p.id);
      const inTitle = !q || p.title.toLowerCase().includes(q) || p.short.toLowerCase().includes(q);
      const who = !inTitle && q.length > 1 ? p.cast.find((n) => n.toLowerCase().includes(q)) : null;
      const show = inTitle || !!who;
      c.el.hidden = !show;
      c.match.textContent = who ? `with ${who}` : '';
      if (show) shown += 1;
    }
    for (const sec of shelves.children) {
      sec.hidden = ![...sec.querySelectorAll('.card')].some((el) => !el.hidden);
    }
    count.textContent = q ? (shown ? `${shown} of 37` : 'Nothing on the shelf by that name.') : '';
  }
  search.addEventListener('input', filter);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = shelves.querySelector('.card:not([hidden])');
      if (first) location.hash = first.getAttribute('href');
    }
  });
}

function playCard(p) {
  const match = h('span.match');
  const el = h(`a.card.ink-${genreInk(p.genre)}`, { href: `#/${p.id}`, 'aria-label': `${p.title}, about ${p.year}` },
    h('span.cardtab', { 'aria-hidden': 'true' }),
    h('span.cardtitle', { text: p.title }),
    h('span.cardmeta', { text: `c. ${p.year} · ${fmt(p.lines)} lines` }),
    spark(p.spark),
    h('span.cardnote', null, h('span', { text: `${p.top.n} ${pct(p.top.l / p.lines)}` }), match),
  );
  return { el, match };
}

/** Lines per scene as a row of little pencil bars. */
function spark(values) {
  const W = 200;
  const H = 30;
  const max = Math.max(...values);
  const gap = values.length > 30 ? 1 : 2;
  const bw = (W - gap * (values.length - 1)) / values.length;
  const svg = s('svg.spark', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  values.forEach((v, i) => {
    const bh = Math.max(1.5, (v / max) * (H - 2));
    svg.append(s('rect', { x: (i * (bw + gap)).toFixed(2), y: (H - bh).toFixed(2), width: bw.toFixed(2), height: bh.toFixed(2), rx: 0.6 }));
  });
  svg.append(s('line.base', { x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5 }));
  return svg;
}

function searchIcon() {
  return s('svg.ico', { viewBox: '0 0 20 20', 'aria-hidden': 'true' },
    s('circle', { cx: 8.5, cy: 8.5, r: 5.5, fill: 'none', 'stroke-width': 1.8 }),
    s('path', { d: 'M13 13l4.5 4.5', fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
}
