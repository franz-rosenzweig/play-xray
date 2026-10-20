// Cast: every speaking part ranked by lines.
import { h, fmt, pct, sceneTag } from './util.js';

const SMALL = 10;

export function renderCast(root, play) {
  const named = play.ranked;
  const groups = play.chars.filter((c) => c.g).sort((a, b) => b.lines - a.lines);
  const big = named.filter((c) => c.lines >= SMALL);
  const small = named.filter((c) => c.lines < SMALL);
  const top = named[0]?.lines || 1;

  const lead = named[0];
  const two = named.slice(0, 2).reduce((n, c) => n + c.lines, 0);
  root.append(h('p.summary', null,
    h(`strong.t${lead.color}`, { text: lead.n }), ` speaks ${pct(lead.lines / play.total)} of the lines. `,
    `The two biggest parts together have ${pct(two / play.total)}, and ${small.length ? `${small.length} parts have fewer than ${SMALL} lines.` : 'every part has at least ten lines.'}`));

  const table = h('table.cast');
  table.append(h('thead', null, h('tr', null,
    h('th.num', { scope: 'col', text: '#' }),
    h('th', { scope: 'col', text: 'Part' }),
    h('th.linescol', { scope: 'col', text: 'Lines' }),
    h('th.num', { scope: 'col', text: 'Share' }),
    h('th.num.wide', { scope: 'col', text: 'Speeches' }),
    h('th.wide', { scope: 'col', text: 'Longest speech' }),
    h('th.wide', { scope: 'col', text: 'First' }),
    h('th.wide', { scope: 'col', text: 'Last' }),
  )));
  const body = h('tbody');
  big.forEach((c, i) => body.append(row(c, i + 1)));
  table.append(body);

  let more = null;
  if (small.length) {
    const extra = h('tbody.smallparts', { hidden: true });
    small.forEach((c, i) => extra.append(row(c, big.length + i + 1)));
    table.append(extra);
    more = h('button.btn.ghost', { type: 'button', 'aria-expanded': 'false', onclick: () => {
      extra.hidden = !extra.hidden;
      more.setAttribute('aria-expanded', String(!extra.hidden));
      more.textContent = extra.hidden ? `Show the ${small.length} small parts` : 'Hide the small parts';
    } }, `Show the ${small.length} small parts`);
  }
  root.append(h('div.tablewrap', null, table));
  if (more) root.append(h('p.center', null, more));

  if (groups.length) {
    root.append(h('p.groups', null, h('span.pencil', { text: 'Speaking together: ' }),
      groups.map((g, i) => [i ? ', ' : '', `${g.n} (${fmt(g.lines)} line${g.lines === 1 ? '' : 's'})`])));
  }

  function row(c, rank) {
    const first = play.scenes[c.first];
    const last = play.scenes[c.last];
    const lg = c.longest;
    const lgScene = play.scenes[lg.scene];
    const longest = h('a.pill', { href: `#/${play.id}/${lgScene.k}/s${lg.bi}`, title: `Read it (${sceneName2(lgScene)})` },
      `${fmt(lg.n)} line${lg.n === 1 ? '' : 's'}`, h('span.where', { text: ` in ${sceneTag(lgScene)}` }));
    const sub = h('div.sub', null,
      `${fmt(c.speeches)} speeches, longest `, h('a', { href: `#/${play.id}/${lgScene.k}/s${lg.bi}`, text: `${lg.n}` }),
      h('br'), `${sceneTag(first)} to ${sceneTag(last)}`);
    return h('tr', null,
      h('td.num.rank', { text: rank }),
      h('th.part', { scope: 'row' },
        h('a.partname', { href: `#/${play.id}/stage/${c.i}` }, h(`span.dot.k${c.color}`, { 'aria-hidden': 'true' }), h('span', { text: c.n })),
        sub),
      h('td.linescol', null, h('div.lc', null, h('div.bar', null,
        h(`span.fill.k${c.color}`, { style: { width: `${(c.lines / top) * 100}%` } })),
        h('span.n', { text: fmt(c.lines) }))),
      h('td.num', { text: pct(c.lines / play.total, c.lines / play.total < 0.01 ? 1 : 0) }),
      h('td.num.wide', { text: fmt(c.speeches) }),
      h('td.wide', null, longest),
      h('td.wide', null, h('a', { href: `#/${play.id}/${first.k}`, text: sceneTag(first) })),
      h('td.wide', null, h('a', { href: `#/${play.id}/${last.k}`, text: sceneTag(last) })),
    );
  }
}

function sceneName2(sc) {
  return sc.a === 99 ? 'the Epilogue' : sc.s === 0 || sc.a === 0 ? sc.t : `Act ${sc.a}, Scene ${sc.s}`;
}
