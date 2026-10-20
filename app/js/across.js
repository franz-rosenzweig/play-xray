// Across all plays: the 37 side by side, and the longest roles in Shakespeare.
import { h, fmt, pct, pref, setPref } from './util.js';
import { genreInk, GENRES } from './data.js';
import { seg } from './chart.js';

const SORTS = [
  ['year', 'Year'],
  ['lines', 'Length'],
  ['parts', 'Parts'],
  ['share', 'Biggest part'],
];

export function renderAcross(root, index) {
  const st = { sort: pref('across', 'year') };
  const plays = index.plays.map((p) => ({ ...p, share: p.top.l / p.lines }));
  const maxLines = Math.max(...plays.map((p) => p.lines));
  const maxParts = Math.max(...plays.map((p) => p.parts));

  const longest = plays.reduce((a, b) => (b.lines > a.lines ? b : a));
  const shortest = plays.reduce((a, b) => (b.lines < a.lines ? b : a));
  const crowded = plays.reduce((a, b) => (b.parts > a.parts ? b : a));
  const solo = plays.reduce((a, b) => (b.share > a.share ? b : a));

  root.append(
    h('header.playhead', null,
      h('nav.crumbs', null, h('a', { href: '#/', text: 'The shelf' }), ' / ', h('span', { text: 'All 37' })),
      h('h1.playtitle', { text: 'All 37 plays, side by side' }),
      h('p.playmeta', { text: `${fmt(plays.reduce((n, p) => n + p.lines, 0))} lines in all, as printed in the Moby edition` })),
  );
  const sheet = h('section.sheet');
  root.append(sheet);

  sheet.append(h('div.facts', null,
    fact('Longest', longest.short, `${fmt(longest.lines)} lines`, longest.id),
    fact('Shortest', shortest.short, `${fmt(shortest.lines)} lines`, shortest.id),
    fact('Most speaking parts', crowded.short, `${crowded.parts} parts`, crowded.id),
    fact('Most one person’s play', solo.short, `${solo.top.n}, ${pct(solo.share)}`, solo.id)));

  const controls = h('div.controls');
  const table = h('div.compare', { role: 'table', 'aria-label': 'The plays compared' });
  sheet.append(h('h2.sectionhead', { text: 'The plays compared' }), controls, table,
    h('div.genrekey', null, GENRES.map((g) => h(`span.gk.ink-${g.ink}`, null, h('span.gsw', { 'aria-hidden': 'true' }), g.plural))));

  function draw() {
    controls.replaceChildren(seg('Sort by', SORTS, st.sort, (v) => { st.sort = v; setPref('across', v); draw(); }));
    const sorted = plays.slice().sort((a, b) => (st.sort === 'year' ? a.year - b.year || a.title.localeCompare(b.title)
      : st.sort === 'lines' ? b.lines - a.lines : st.sort === 'parts' ? b.parts - a.parts : b.share - a.share));
    table.replaceChildren(
      h('div.crow.chead', { role: 'row' },
        h('span.cplay', { role: 'columnheader', text: 'Play' }),
        h('span', { role: 'columnheader', text: 'Length (lines)' }),
        h('span', { role: 'columnheader', text: 'Speaking parts' }),
        h('span', { role: 'columnheader', text: 'Biggest part’s share' })),
      ...sorted.map((p) => h(`a.crow.ink-${genreInk(p.genre)}`, { href: `#/${p.id}`, role: 'row' },
        h('span.cplay', { role: 'cell' }, h('span.gsw', { 'aria-hidden': 'true' }), h('span.ct', { text: p.short }), h('span.cy', { text: ` ${p.year}` })),
        h('span.cbar', { role: 'cell' }, h('span.track', null, h('span.fill', { style: { width: `${(p.lines / maxLines) * 100}%` } })), h('span.cv', { text: fmt(p.lines) })),
        h('span.cbar', { role: 'cell' }, h('span.track', null, h('span.fill', { style: { width: `${(p.parts / maxParts) * 100}%` } })), h('span.cv', { text: p.parts })),
        h('span.cbar', { role: 'cell' }, h('span.track', null, h('span.fill.red', { style: { width: `${Math.min(100, (p.share * 100) / 0.4)}%` } })), h('span.cv', null, h('span.cn', { text: `${p.top.n} ` }), pct(p.share))),
      )),
    );
  }
  draw();

  const roles = index.roles.slice(0, 20);
  const maxRole = roles[0].l;
  const byId = new Map(plays.map((p) => [p.id, p]));
  sheet.append(h('h2.sectionhead', { text: 'The 20 longest roles in Shakespeare' }),
    h('ol.roles', null, roles.map((r, i) => {
      const p = byId.get(r.play);
      return h('li', null, h(`a.role.ink-${genreInk(p.genre)}`, { href: `#/${r.play}/cast` },
        h('span.rk', { text: i + 1 }),
        h('span.rn', null, h('span.rname', { text: r.n }), h('span.rplay', { text: p.short })),
        h('span.track', null, h('span.fill', { style: { width: `${(r.l / maxRole) * 100}%` } })),
        h('span.rl', { text: fmt(r.l) })));
    })),
    h('p.note', { text: 'Lines as printed in this edition, so prose and short lines count the same as full verse lines. Other editions will differ a little.' }));
  return null;
}

function fact(label, play, value, id) {
  return h('a.fact', { href: `#/${id}` }, h('span.fl', { text: label }), h('span.fp', { text: play }), h('span.fv', { text: value }));
}
