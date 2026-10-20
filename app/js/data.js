// Loading the JSON and working out everything the screens need from it, once per play.

let indexPromise;
const plays = new Map();

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export function loadIndex() {
  indexPromise ||= getJSON('data/index.json').catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

export function loadPlay(id) {
  if (!plays.has(id)) {
    plays.set(id, getJSON(`data/${encodeURIComponent(id)}.json`).then(derive)
      .catch((e) => { plays.delete(id); throw e; }));
  }
  return plays.get(id);
}

// A speech is [who, lines, text] or [who, lines, text, 1] when it carries on after a stage direction;
// who is a character index, or a list of them when several speak together.
export const speakers = (item) => (Array.isArray(item[0]) ? item[0] : [item[0]]);
export const lineCount = (item) => item[1];
export const speechText = (item) => item[2];
export const carriesOn = (item) => item[3] === 1;

/**
 * Adds to the raw play:
 *   scene.i, scene.start (first line number in the play), scene.by (Map char -> lines),
 *   scene.in (Set of everyone on stage: speaking or silent), scene.units (whole speeches)
 *   char.i, .lines, .speeches, .longest {n, scene, bi}, .first, .last, .scenes (count), .color
 *   play.segments: [startLine, lines, [chars]] in play order, for the ribbons
 */
function derive(p) {
  // The file keeps scenes inside their acts; the screens mostly want one list.
  p.scenes = p.acts.flatMap((act) => act.scenes.map((sc) => Object.assign(sc, { a: act.a })));
  for (const [i, c] of p.chars.entries()) {
    Object.assign(c, { i, lines: 0, speeches: 0, longest: null, first: -1, last: -1, scenes: 0, inScenes: 0 });
  }
  p.segments = [];
  let at = 0;
  for (const [si, sc] of p.scenes.entries()) {
    sc.i = si;
    sc.start = at;
    sc.by = new Map();
    sc.units = [];
    let unit = null;
    for (const [bi, item] of sc.b.entries()) {
      if (typeof item === 'string') continue;
      const cs = speakers(item);
      const n = lineCount(item);
      for (const c of cs) sc.by.set(c, (sc.by.get(c) || 0) + n);
      p.segments.push([at, n, cs]);
      at += n;
      if (carriesOn(item) && unit && unit.cs.join() === cs.join()) {
        unit.n += n;
      } else {
        unit = { cs, n, bi, scene: si };
        sc.units.push(unit);
      }
    }
    sc.in = new Set([...sc.by.keys(), ...(sc.on || [])]);
    for (const [c, n] of sc.by) {
      const ch = p.chars[c];
      ch.lines += n;
      ch.scenes += 1;
      if (ch.first < 0) ch.first = si;
      ch.last = si;
    }
    for (const c of sc.in) p.chars[c].inScenes += 1;
    for (const u of sc.units) {
      for (const c of u.cs) {
        const ch = p.chars[c];
        ch.speeches += 1;
        if (!ch.longest || u.n > ch.longest.n) ch.longest = { n: u.n, scene: si, bi: u.bi };
      }
    }
  }
  p.total = at;

  // Colours: the ten biggest named parts get an ink each; everyone else is pencil grey.
  const ranked = p.chars.filter((c) => !c.g).sort((a, b) => b.lines - a.lines);
  for (const c of p.chars) c.color = 'g';
  ranked.slice(0, 10).forEach((c, i) => { c.color = i; });
  p.ranked = ranked;
  p.byId = new Map(p.scenes.map((sc) => [sc.k, sc]));
  return p;
}

/** Scenes two characters are both on stage in (speaking or silent). */
export function shared(p, a, b) {
  let n = 0;
  for (const sc of p.scenes) if (sc.in.has(a) && sc.in.has(b)) n += 1;
  return n;
}

/** Genre display names and their ink. */
export const GENRES = [
  { key: 'Comedy', plural: 'Comedies', ink: 'comedy' },
  { key: 'History', plural: 'Histories', ink: 'history' },
  { key: 'Tragedy', plural: 'Tragedies', ink: 'tragedy' },
  { key: 'Romance', plural: 'Romances', ink: 'romance' },
];
export const genreInk = (g) => (GENRES.find((x) => x.key === g) || GENRES[0]).ink;
