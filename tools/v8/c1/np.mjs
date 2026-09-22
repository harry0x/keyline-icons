/**
 * The no-plate build of the AI sparkle batch (his call, 21 Sep 2026: "we are
 * going this way. no plates for all, except for the bot-2").
 *
 *   stroke     his drawing, exactly: his lines, his cuts, his stars.
 *   two-tone   the drawing in black with the small star grey (0.4), the split
 *   duotone    the shipped `sparkles` makes (his pick "B", 22 Sep 2026: a grey
 *              body read as a disabled icon). A base whose own two-tone rides
 *              the strokes, or one he flipped, keeps that split under the
 *              stars. The two are the same file, as on his sheet.
 *   fill       the stroke drawing.
 *   sharp      the shipped base's own sharp stroke, shifted onto his drawing,
 *              with his cuts replayed round his stars (build.mjs, no notch);
 *              stars keep their tip fillets and lose the waist ones.
 *
 * Superseded by B, kept because keepsSplit and the flips still read it: which
 * part was detail (black) followed the base's shipped duotone: its black
 * STROKES stay black, its black solids (a page, a screen, a tip) are body and
 * go grey, and a duotone with no grey at all is one body, all grey. His sheet
 * of fourteen corrects it where a black stroke is structure, not content, and
 * TONE below carries those corrections and their reading of the rest: header,
 * display and grid lines, folds, flaps and device chrome are body; keys,
 * beads, the sun, wheels and a laptop's or monitor's base are detail. A base
 * whose tones already ride the strokes (no plate) keeps its own split.
 *
 * A rebuild reproduces what is in Figma: his calls on his drawings (paddings,
 * a moved star, mic's re-cut) are applied as they load (kit.mjs ADJUST), the
 * sharp trim is mended at his corners and over gaps he never cut (heal.mjs),
 * per-name tolerances sit in TOL, and the two he redrew past the base come from
 * tools/v8/c1/hand. bot-2 is built by bot2.mjs.
 *
 *   node tools/v8/c1/np.mjs --out=<dir> [names...]       C1_REFS=<his drawings>
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { load, ROOT, baseOf, polys, contains, bbox, translate } from './kit.mjs';
import { batchNames } from './layout.mjs';
import { build, shiftOf } from './build.mjs';
import { sharpStar } from '../halo.mjs';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const dOf = (t) => t.match(/ d="([^"]+)"/)[1];
const subs = (d) => d.match(/M[^M]*/g) || [];
const centre = (d) => { const b = bbox(d); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
/** Points every 0.1 along a path. */
const P = (d) => polys(d, 24).flatMap((q) => q.slice(1).flatMap((b, i) => { const a = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1)); return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }).concat([q[q.length - 1]]));

/**
 * His corrections, as filters on the base duotone's parts: `strokes` keeps the
 * black stroke subpaths it returns true for (false drops them to grey), `fills`
 * turns black solids that stay detail back to black, `plus` adds a grey stroke
 * of the duotone as detail. Each is read on the base, shifted onto his drawing.
 */
const none = () => false;
const TONE = {
  // his sheet
  'brain-sparkles': { strokes: none },                                   // folds are body
  'calendar-sparkles': { strokes: (d) => { const b = bbox(d); return b[2] - b[0] < 0.5; } }, // rings black, header line grey
  'calculator-sparkles': { strokes: (d) => centre(d)[1] > 10, fills: () => true },          // keys black, display line grey
  // read the same way
  'file-sparkles': { strokes: none },                                    // the fold
  'sticky-note-sparkles': { strokes: none },                             // the fold
  'film-sparkles': { strokes: none },                                    // the frame lines
  'table-sparkles': { strokes: none },                                   // the grid
  'globe-sparkles': { strokes: none },                                   // meridian and equator
  'hand-pointer-sparkles': { strokes: none },                            // knuckles
  'mail-sparkles': { strokes: none },                                    // the flap
  'smartphone-sparkles': { strokes: none },                              // the speaker, chrome as app-window's dots
  'palette-sparkles': { fills: () => true },                             // beads are paint
  'image-sparkles': { strokes: none },                                   // his call: a black ridge under a grey frame reads as a moustache
  'shopping-cart-sparkles': { strokes: none, fills: () => true },        // wheels black, handle is the frame
  // his calls after the sheet
  'search-sparkles': { flip: true },                                     // the lens black, the handle grey
  'search-2-sparkles': { flip: true },
  'monitor-sparkles': { plus: () => true, flip: true },                 // the screen black, the stand grey
};

/** The black parts of a base's regular drawing, shifted onto his: [{d, fill}]. */
function detailOf(name, v) {
  const base = baseOf(name);
  const read = (style) => tags(readFileSync(join(ROOT, 'raw', base, `Container=regular, Style=${style}, Corners=regular.svg`), 'utf8'))
    .map((t) => ({ d: translate(dOf(t), v), stroked: / stroke="(?!none)/.test(t), muted: /opacity="0\.4"/.test(t) }));
  const two = read('two-tone');
  const plated = two.some((l) => !l.stroked && l.muted);
  if (!plated) {
    // the tones ride the strokes (audio-lines, chart-column...): its split, as shipped
    const muted = two.some((l) => l.muted);
    return muted ? two.filter((l) => !l.muted).map((l) => ({ d: l.d, fill: !l.stroked })) : null; // null: one tone, all black
  }
  const duo = read('duotone');
  if (!duo.some((l) => l.muted)) return []; // a one-shape duotone: one body, all grey
  const t = TONE[name] || {};
  const out = [];
  for (const l of duo) {
    if (l.stroked && !l.muted) for (const sp of subs(l.d)) if ((t.strokes || (() => true))(sp)) out.push({ d: sp, fill: false });
    if (l.stroked && l.muted && t.plus) for (const sp of subs(l.d)) if (t.plus(sp)) out.push({ d: sp, fill: false });
    if (!l.stroked && !l.muted && t.fills) for (const sp of subs(l.d)) if (t.fills(sp)) out.push({ d: sp, fill: true });
  }
  return out;
}

/** Split a drawing's strokes and dots into detail (black) and body (grey). */
function split(strokesD, dots, detail) {
  if (detail === null) return { body: [], bodyDots: [], black: subs(strokesD), blackDots: dots };
  const lines = detail.filter((e) => !e.fill).map((e) => P(e.d));
  const solids = detail.filter((e) => e.fill);
  const onLine = (p) => lines.some((L) => L.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.1));
  const black = [], body = [];
  for (const sp of subs(strokesD)) {
    const pts = P(sp);
    const on = pts.filter(onLine).length / pts.length;
    const inSolid = solids.some((e) => pts.filter((p) => contains(e.d, p)).length / pts.length > 0.5);
    (on >= 0.5 || inSolid ? black : body).push(sp);
  }
  const blackDots = [], bodyDots = [];
  for (const dd of dots) {
    const c = centre(dd);
    const hit = solids.some((e) => contains(e.d, c) || P(e.d).some((q) => Math.hypot(c[0] - q[0], c[1] - q[1]) < 0.8)) || lines.some((L) => L.some((q) => Math.hypot(c[0] - q[0], c[1] - q[1]) < 1.1));
    (hit ? blackDots : bodyDots).push(dd);
  }
  return { body, bodyDots, black, blackDots };
}
/**
 * B keeps a base's own split only where it is designed on the strokes: the
 * base's shipped two-tone mutes strokes with no plate (audio-lines,
 * chart-column...), or he flipped it (search, search-2, monitor). Everything
 * else goes black under the stars.
 */
export function keepsSplit(name) {
  if (TONE[name]?.flip) return true;
  const two = tags(readFileSync(join(ROOT, 'raw', baseOf(name), 'Container=regular, Style=two-tone, Corners=regular.svg'), 'utf8'));
  const stroked = (t) => / stroke="(?!none)/.test(t), muted = (t) => /opacity="0\.4"/.test(t);
  return !two.some((t) => !stroked(t) && muted(t)) && two.some(muted);
}
const allBlack = (p) => ({ body: [], bodyDots: [], black: [...p.body, ...p.black], blackDots: [...p.bodyDots, ...p.blackDots] });
/** TONE.flip: his call to swap which part is grey. */
const flipped = (name, p) => (TONE[name]?.flip ? { body: p.black, bodyDots: p.blackDots, black: p.body, blackDots: p.bodyDots } : p);

const st = (d, op, sharp) => (d ? `<path d="${d}" stroke="black"${op < 1 ? ` stroke-opacity="${op}"` : ''} stroke-width="2" stroke-linecap="${sharp ? 'butt' : 'round'}" stroke-linejoin="round"/>\n` : '');
const fl = (d, op = 1) => (d ? `<path d="${d}" fill="black"${op < 1 ? ` fill-opacity="${op}"` : ''}/>\n` : '');
/** `stars` biggest first: the big one stays black, the rest go grey (B). */
function files(parts, stars, sharp) {
  const { body, bodyDots, black, blackDots } = parts;
  const all = [...body, ...black].join(''), dots = [...bodyDots, ...blackDots].join('');
  const stroke = st(all, 1, sharp) + fl(dots) + fl(stars.join(''));
  const toned = st(body.join(''), 0.4, sharp) + fl(bodyDots.join(''), 0.4) + st(black.join(''), 1, sharp) + fl(blackDots.join('')) + fl(stars[0]) + fl(stars.slice(1).join(''), 0.4);
  return { stroke, 'two-tone': toned, duotone: toned, fill: stroke };
}

/** One icon: his drawing for regular, the base's sharp with his cuts for sharp. */
export function npBuild(name, v) {
  const ic = load(name);
  const detail = detailOf(name, v);
  const tone = keepsSplit(name) ? (p) => p : allBlack;
  const out = {}, notes = [];
  // the black star first: the biggest; between equals, the one in the modifier's top right slot
  const lead = [...ic.stars].sort((a, b) => (Math.abs(a.R - b.R) >= 0.25 ? b.R - a.R : (24 - a.c[0] + a.c[1]) - (24 - b.c[0] + b.c[1])));
  // regular: his drawing
  const reg = tone(flipped(name, split(ic.strokes.join(''), ic.detail, detail)));
  const regStars = lead.map((s) => s.d);
  for (const [s, body] of Object.entries(files(reg, regStars, false))) out[`Container=regular, Style=${s}, Corners=regular.svg`] = HEAD + body + '</svg>\n';
  // sharp: the shipped base's sharp stroke with his cuts, no notch, stars where he drew them
  const L = { notches: [], stars: ic.stars.map((s, i) => ({ c: [...s.c], R: s.R, role: 'free', i, d: s.d })) };
  const b = build(name, L, v);
  notes.push(...b.notes);
  const sv = b.out['Container=regular, Style=stroke, Corners=sharp.svg'];
  const ts = tags(sv);
  const sStrokes = ts.filter((t) => / stroke="black"/.test(t)).map(dOf).join('');
  const sFills = ts.filter((t) => !/ stroke="black"/.test(t)).map(dOf);
  const sharpStars = lead.map((s) => sharpStar(s.c, s.R));
  // the base's dots are every filled piece that is not one of his stars
  const isStar = (sp) => { const c = centre(sp), bb = bbox(sp); return ic.stars.some((s) => Math.hypot(c[0] - s.c[0], c[1] - s.c[1]) < 0.3 && Math.abs(bb[2] - bb[0] - 2 * s.R) < 0.3); };
  const sDots = sFills.flatMap(subs).filter((sp) => !isStar(sp));
  const shp = tone(flipped(name, split(sStrokes, sDots, detail)));
  for (const [s, body] of Object.entries(files(shp, sharpStars, true))) out[`Container=regular, Style=${s}, Corners=sharp.svg`] = HEAD + body + '</svg>\n';
  // the two corners must agree on which parts are detail
  const tally = (p) => `${p.black.length}/${p.blackDots.length}`;
  if (tally(reg) !== tally(shp)) notes.push(`tone split differs: regular ${tally(reg)} black, sharp ${tally(shp)}`);
  return { out, notes, split: { black: reg.black.length, body: reg.body.length, blackDots: reg.blackDots.length, bodyDots: reg.bodyDots.length } };
}

/** Per name: mic's capsule sits 0.21 off the base, which is drift, not a cut. */
const TOL = { 'mic-sparkles': { C1_CUTTOL: '0.3', C1_DRIFT: '0.25' } };
/** Names he redrew past a shifted base are built by hand; their finished files live here. */
const HAND = join(ROOT, 'tools/v8/c1/hand');

if (import.meta.url === `file://${process.argv[1]}`) {
  const OUT = arg('out', '/tmp/np');
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const todo = names.length ? names : batchNames().filter((n) => n !== 'bot-2');
  const report = [];
  // no plates here, so a star across two black pieces of the base plate is not this build's problem
  process.env.C1_ALLOW_STRADDLE ??= '1';
  const env0 = { C1_CUTTOL: process.env.C1_CUTTOL, C1_DRIFT: process.env.C1_DRIFT };
  // names reseated on the shipped base by tools/v8/c2 (mic, 22 Sep: his seat cut the capsule open) are built there
  const C2 = JSON.parse(readFileSync(join(ROOT, 'tools/v8/c2/spec.json'), 'utf8'));
  for (const n of todo) {
    if (C2[baseOf(n)]) { report.push(`${n}: built by tools/v8/c2 (spec.json)`); continue; }
    for (const [k, v] of Object.entries({ ...env0, ...TOL[n] })) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    try {
      const sh = shiftOf(n);
      const drift = +(process.env.C1_DRIFT || 0.08);
      const v = sh && sh.drift <= drift ? sh.v : null;
      if (!v && existsSync(join(HAND, n))) {
        const dir = join(OUT, 'raw', n);
        mkdirSync(dir, { recursive: true });
        for (const f of readdirSync(join(HAND, n))) copyFileSync(join(HAND, n, f), join(dir, f));
        report.push(`${n}: HAND (redrawn past the base; copied from tools/v8/c1/hand)`);
        continue;
      }
      if (!v) { report.push(`${n}: REDRAWN (best shift ${sh?.v}: his ink ${sh?.drift.toFixed(2)} off the base)`); continue; }
      const { out, notes, split: sp } = npBuild(n, v);
      const dir = join(OUT, 'raw', n);
      mkdirSync(dir, { recursive: true });
      for (const [f, svg] of Object.entries(out)) writeFileSync(join(dir, f), svg);
      report.push(`${n}: ${v[0] || v[1] ? `shift ${v} · ` : ''}black ${sp.black} lines ${sp.blackDots} dots, grey ${sp.body} lines ${sp.bodyDots} dots${notes.length ? ' · ' + [...new Set(notes)].join(' · ') : ''}`);
    } catch (e) { report.push(`${n}: FAILED ${e.message}`); }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
}
