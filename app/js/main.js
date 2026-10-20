// Play X-Ray: the router and the frame around every screen.
import { h, fmt, hideTip, pref, setPref } from './util.js';
import { loadIndex, loadPlay } from './data.js';
import { renderShelf } from './shelf.js';
import { renderChart } from './chart.js';
import { renderCast } from './cast.js';
import { renderRibbons } from './ribbons.js';
import { renderStage } from './stage.js';
import { renderReader } from './reader.js';
import { renderAcross } from './across.js';

const app = document.getElementById('app');
const VIEWS = [
  { key: 'chart', label: 'Scene chart', render: renderChart },
  { key: 'cast', label: 'Cast', render: renderCast },
  { key: 'ribbons', label: 'Ribbons', render: renderRibbons },
  { key: 'stage', label: 'Shared stage', render: renderStage },
  { key: 'read', label: 'Read' },
];
const SCENE = /^(\d+\.\d+b?|ep)$/;

let cleanup = null;
let lastKey = '';

/** "#/hamlet/3.1/s12" -> {id: 'hamlet', view: 'read', scene: '3.1', speech: 12} */
export function parseHash(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { view: 'shelf' };
  if (parts[0] === 'all') return { view: 'across' };
  const [id, second, third] = parts;
  if (!second) return { id, view: 'chart' };
  if (SCENE.test(second)) {
    const sp = third && /^s(\d+)$/.exec(third);
    return { id, view: 'read', scene: second, speech: sp ? Number(sp[1]) : null };
  }
  if (second === 'read') return { id, view: 'read', scene: null };
  return { id, view: VIEWS.some((v) => v.key === second) ? second : 'chart', arg: third };
}

export const link = (id, rest = '') => `#/${id}${rest ? `/${rest}` : ''}`;

async function route() {
  hideTip();
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const r = parseHash();
  const key = `${r.id || ''}/${r.view}/${r.scene || ''}`;
  const freshPage = key !== lastKey;
  lastKey = key;
  document.body.dataset.view = r.view;
  try {
    if (r.view === 'shelf') {
      setTitle('Play X-Ray');
      const index = await loadIndex();
      cleanup = renderShelf(swap(), index);
    } else if (r.view === 'across') {
      setTitle('All 37 plays · Play X-Ray');
      const index = await loadIndex();
      cleanup = renderAcross(swap(), index);
    } else {
      const index = await loadIndex();
      const meta = index.plays.find((p) => p.id === r.id);
      if (!meta) return notFound();
      const loading = setTimeout(() => app.classList.add('loading'), 150);
      const play = await loadPlay(r.id);
      clearTimeout(loading);
      app.classList.remove('loading');
      setTitle(`${play.title} · Play X-Ray`);
      const page = swap();
      page.append(playHeader(play, r.view));
      const sheet = h('section.sheet', { id: 'sheet' });
      page.append(sheet);
      if (r.view === 'read') {
        const sc = r.scene ? play.byId.get(r.scene) : play.scenes[0];
        if (!sc) return notFound();
        cleanup = renderReader(sheet, play, sc, r.speech);
        setTitle(`${play.short} ${sc.k === 'ep' ? 'Epilogue' : sc.k} · Play X-Ray`);
      } else {
        cleanup = VIEWS.find((v) => v.key === r.view).render(sheet, play, r.arg);
      }
    }
  } catch (e) {
    console.warn(e);
    app.classList.remove('loading');
    swap().append(h('div.empty', null,
      h('p', { text: 'That page didn’t load.' }),
      h('p.small', { text: navigator.onLine === false ? 'You seem to be offline.' : 'Try again in a moment.' }),
      h('p', null, h('a.btn', { href: '#/' , text: 'Back to the shelf' }))));
  }
  if (freshPage && r.speech == null) window.scrollTo({ top: 0, behavior: 'instant' });
}

function swap() {
  const page = h('div.page');
  app.replaceChildren(page);
  return page;
}

function setTitle(t) {
  document.title = t;
}

function notFound() {
  const page = swap();
  page.append(h('div.empty', null,
    h('p', { text: 'There’s no play at that address.' }),
    h('p', null, h('a.btn', { href: '#/', text: 'Back to the shelf' }))));
}

function playHeader(play, view) {
  const head = h('header.playhead');
  head.append(
    h('nav.crumbs', { 'aria-label': 'Back' }, h('a', { href: '#/', text: 'The shelf' }), ' / ',
      h('span', { text: play.genre === 'History' ? 'Histories' : `${play.genre === 'Comedy' ? 'Comedies'
        : play.genre === 'Tragedy' ? 'Tragedies' : 'Romances'}` })),
    h('h1.playtitle', { text: play.title }),
    h('p.playmeta', null,
      h('span.nb', { text: `c. ${play.year}` }), h('span.sep', { text: ' · ' }),
      h('span.nb', { text: `${fmt(play.total)} lines` }), h('span.sep', { text: ' · ' }),
      h('span.nb', { text: `${play.scenes.length} scenes` }), h('span.sep', { text: ' · ' }),
      h('span.nb', { text: `${play.chars.filter((c) => !c.g).length} speaking parts` })),
  );
  const tabs = h('nav.tabs', { 'aria-label': 'Views of this play' });
  for (const v of VIEWS) {
    const active = v.key === view;
    const href = v.key === 'read' ? link(play.id, pref(`last:${play.id}`, play.scenes[0].k)) : link(play.id, v.key);
    tabs.append(h(`a.tab${active ? '.on' : ''}`, { href, 'aria-current': active ? 'page' : null }, tabIcon(v.key), h('span', { text: v.label })));
  }
  head.append(tabs);
  return head;
}

function tabIcon(key) {
  const paths = {
    chart: 'M3 5h4v3H3zM8 5h2v3H8zM11 9h6v3h-6zM3 13h7v3H3zM14 13h3v3h-3z',
    cast: 'M3 5h14v2H3zM3 9h10v2H3zM3 13h6v2H3z',
    ribbons: 'M2 13c4-6 7 2 11-3s4-1 5-2v4c-2 1-3-1-5 2s-7-2-11 3z',
    stage: 'M3 3h4v4H3zM8 3h4v4H8zM3 8h4v4H3zM13 8h4v4h-4zM8 13h4v4H8z',
    read: 'M3 4h6c1 0 1 1 1 1v11s0-1-1-1H3zM17 4h-6c-1 0-1 1-1 1v11s0-1 1-1h6z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[key]);
  svg.append(path);
  return svg;
}

// ---- theme: follows the system; the button picks paper or film by hand

function applyTheme() {
  const t = pref('theme', null);
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const btn = document.getElementById('theme');
  if (btn) {
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Switch to paper' : 'Switch to film';
    btn.querySelector('.label').textContent = dark ? 'Paper' : 'Film';
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1418' : '#f3ecdc');
}

document.getElementById('theme')?.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setPref('theme', next === system ? null : next);
  applyTheme();
  window.dispatchEvent(new Event('themechange'));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
applyTheme();

window.addEventListener('hashchange', route);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
route();

// For the test walk: a way to wait for a screen to finish drawing.
window.__xray = { parseHash, ready: () => !app.classList.contains('loading') && !!app.querySelector('.page') };
