// Loaders and point tests for the C1 build of the AI sparkle batch, lifted
// from the option panel's kit (21 Sep 2026). Names are the FIGMA set names;
// refOf() maps them to his files in refs/, baseOf() to the shipped base.
//
//   load(name) -> { name, baseName, stroke (his file), strokes [d], stars [{d,c,R}] biggest
//   first, detail [d], base: { two, duo, fill } shipped regular layers [{d,muted,stroked,evenodd}] }
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, at } from '../cut.mjs';
import { star as starD } from '../star.mjs';
import { cut as recutD } from '../c2/cutter.mjs';

export const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
// his drawings: refs/ by default; C1_REFS points at a copy when refs/ has moved on
export const REFS = process.env.C1_REFS || join(ROOT, 'refs');
const REF = { 'list-sparkles': 'list-sparkles-1', 'search-2-sparkles': 'search-s-sparkles' };
export const refOf = (name) => REF[name] || name;
// his refresh-cw-sparkles is drawn on the shipped refresh-ccw, point for point
const BASE = { 'refresh-cw-sparkles': 'refresh-ccw' };
export const baseOf = (name) => BASE[name] || name.replace(/-sparkles$/, '');


const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const layer = (t) => ({
  d: (t.match(/ d="([^"]+)"/) || [])[1],
  muted: /(?:fill|stroke)-opacity="0\.4"/.test(t),
  stroked: / stroke="(?!none)/.test(t),
  evenodd: /evenodd/.test(t),
});
export function bbox(d) {
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const s of parse(d)) {
    const pts = [s.start];
    for (const g of s.segs) for (let i = 1; i <= 24; i++) pts.push(at(g, i / 24));
    for (const p of pts) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
  }
  return b;
}
const baseLayers = (base, style) => {
  const f = join(ROOT, 'raw', base, `Container=regular, Style=${style}, Corners=regular.svg`);
  return existsSync(f) ? tags(readFileSync(f, 'utf8')).map(layer) : [];
};

/**
 * His calls on his own drawings (21 Sep 2026), applied as they load so every
 * rebuild starts from them. Paddings: an icon off centre by a whole unit moves
 * whole (all); one off by a single unit moves one part: a star (star: its
 * centre, the move) or the body under fixed stars (strokes). mic's star moved
 * left, so its capsule is re-cut to his own gap (1.88) round the star's new
 * seat (replace, on his text). Each finds its target or does nothing, so a copy
 * of refs/ that already carries a change is left alone by it.
 */
const ADJUST = {
  'bell-sparkles': { all: [-1, 0] },
  'calculator-sparkles': { all: [-1, 0] },
  'film-sparkles': { all: [1, -1], restar: [[[13, 7], [13, 7], 1.5]] }, // stars 1.91 apart
  'hand-pointer-sparkles': { all: [1, 0], restar: [[[4, 7], [3.5, 7], 1.5]] }, // the finger tip, 1.55
  'laptop-sparkles': { all: [0, 1] },
  'list-sparkles': { all: [0, 1] },                 // its dots leave a half unit either way
  'user-sparkles': { star: [[4, 4], [-1, 0]] },     // his arrow: the small star out to the edge
  'table-sparkles': { strokes: [0, 1] },
  'scan-text-sparkles': { strokes: [-1, 0] },
  // 22 Sep, his rules applied to his own drawings (tools/v8/c2/diag.mjs): a small star that
  // came under 2 painted units of a shape it must not cut shrinks half a size (restar:
  // [centre, new centre, new R]); a line he cut short of 2 is cut on (recut, the c2 cutter,
  // ends on the grid); a crumb under 1.5 goes (keep)
  'image-sparkles': { restar: [[[8, 8], [8, 7.5], 1.5]] },             // the ridge, 1.73
  'audio-lines-sparkles': { recut: true },                             // the tall bar, 1.48
  'send-horizontal-sparkles': { star: [[11, 19], [0.5, 0]] },          // the lower wing, 1.72: the star steps off it
  'zap-sparkles': { recut: true },                                     // the bolt, 1.89
  'brain-sparkles': { keep: 1.5 },                                     // a 1.16 crumb of fold
  'mic-sparkles': {
    replace: [['M9 8V11.5', 'M9 7.262V11.5'], ['C11.2316 2 10.5308 2.28885 10 2.76389', 'C10.968 2 10.0084 2.5305 9.4595 3.4044']],
    star: [[5, 5], [-1, 0]],
  },
};
function adjust(name, svg) {
  const a = ADJUST[name];
  if (!a) return svg;
  let s = svg;
  for (const [from, to] of a.replace || []) s = s.replace(from, to);
  const onTags = (test, fn) => s.replace(/<path[^>]*>/g, (t) => (test(t) ? t.replace(/ d="([^"]+)"/, (m, d) => ` d="${fn(d)}"`) : t));
  const stroked = (t) => / stroke="(?!none)/.test(t);
  if (a.all) s = onTags(() => true, (d) => translate(d, a.all));
  if (a.strokes) s = onTags(stroked, (d) => translate(d, a.strokes));
  if (a.restar) for (const [c, c2, R] of a.restar) {
    s = onTags((t) => !stroked(t), (d) => d.match(/M[^M]*/g).map((sp) => {
      const b = bbox(sp);
      return Math.hypot((b[0] + b[2]) / 2 - c[0], (b[1] + b[3]) / 2 - c[1]) < 0.3 ? starD(c2, R) : sp;
    }).join(''));
  }
  if (a.star) {
    const [c, v] = a.star;
    s = onTags((t) => !stroked(t), (d) => d.match(/M[^M]*/g).map((sp) => {
      const b = bbox(sp);
      return Math.hypot((b[0] + b[2]) / 2 - c[0], (b[1] + b[3]) / 2 - c[1]) < 0.3 ? translate(sp, v) : sp;
    }).join(''));
  }
  return s;
}

export function load(name) {
  const entry = { name, base: baseOf(name) };
  const stroke = adjust(name, readFileSync(join(REFS, `${refOf(name)}.svg`), 'utf8'));
  const ls = tags(stroke).map(layer);
  const strokes = ls.filter((l) => l.stroked).map((l) => l.d);
  const stars = [], detail = [];
  for (const l of ls.filter((l) => !l.stroked)) {
    for (const sp of l.d.match(/M[^M]*/g)) {
      const b = bbox(sp), w = b[2] - b[0], h = b[3] - b[1];
      const isStar = Math.abs(w - h) < 0.02 && [3, 4, 5, 6, 7, 8, 9, 10].some((v) => Math.abs(w - v) < 0.02) && parse(sp)[0].segs.length >= 12;
      if (isStar) stars.push({ d: sp, c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], R: w / 2 });
      else detail.push(sp);
    }
  }
  stars.sort((a, b) => b.R - a.R);
  const a = ADJUST[name] || {};
  let out = strokes;
  if (a.recut) { const d = recutD(strokes.join(''), stars.map((s) => ({ c: s.c, R: s.R })), { box: null, air: 2, keep: 1.5 }).d; out = d ? [d] : []; }
  if (a.keep) out = out.map((d) => (d.match(/M[^M]*/g) || []).filter((sp) => polys(sp, 32).reduce((t, q) => t + q.slice(1).reduce((u, p, i) => u + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0) >= a.keep).join('')).filter(Boolean);
  return {
    name, baseName: entry.base, stroke, strokes: out, stars, detail,
    base: { two: baseLayers(entry.base, 'two-tone'), duo: baseLayers(entry.base, 'duotone'), fill: baseLayers(entry.base, 'fill') },
  };
}

let n = 0;
export const uid = (p = 'm') => `${p}${++n}`;
export const svg = (inner, px = 40) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
export const mask = (id, cut) =>
  `<mask id="${id}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><rect x="-2" y="-2" width="28" height="28" fill="white"/>${cut}</mask>`;
export const starGrow = (s, g) => `<path d="${s.d}" fill="black" stroke="black" stroke-width="${2 * g}" stroke-linejoin="round"/>`;
export const strokePath = (d, op = 1) => `<path d="${d}" stroke="black" stroke-opacity="${op}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
export const fillPath = (d, op = 1, evenodd = false) => `<path d="${d}" fill="black" fill-opacity="${op}"${evenodd ? ' fill-rule="evenodd"' : ''}/>`;


/** Sampled polygons of a path (every subpath), for point tests. */
export function polys(d, per = 24) {
  return parse(d).map((s) => { const q = [s.start]; for (const g of s.segs) { const k = g.t === 'L' ? 1 : per; for (let i = 1; i <= k; i++) q.push(at(g, i / k)); } return q; });
}
/** Nonzero (or evenodd) point-in-path. */
export function contains(d, p, evenodd = false) {
  let w = 0, c = 0;
  for (const q of polys(d)) for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const x = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (x > p[0]) { w += b[1] > a[1] ? 1 : -1; c++; }
    }
  }
  return evenodd ? c % 2 === 1 : w !== 0;
}
/**
 * Where a star sits against a plate: 'inside' (the star grown by g is all on
 * the plate, so it can be plain detail), 'outside' (no part of the star on the
 * plate) or 'edge' (it crosses or comes within g of the plate's edge).
 */
export function starClass(star, plateD, g = 2) {
  const outline = polys(star.d, 8).flat();
  const onPlate = outline.map((p) => contains(plateD, p));
  if (!onPlate.some(Boolean)) {
    // could still be within g of the plate: test the grown ring
    const ring = outline.flatMap((p) => Array.from({ length: 12 }, (_, k) => [p[0] + g * Math.cos((k * Math.PI) / 6), p[1] + g * Math.sin((k * Math.PI) / 6)]));
    return ring.some((p) => contains(plateD, p)) ? 'edge' : 'outside';
  }
  const ring = outline.flatMap((p) => Array.from({ length: 12 }, (_, k) => [p[0] + g * Math.cos((k * Math.PI) / 6), p[1] + g * Math.sin((k * Math.PI) / 6)]));
  return ring.every((p) => contains(plateD, p)) ? 'inside' : 'edge';
}
export const plateOf = (layers) => layers.filter((l) => l.muted && !l.stroked).map((l) => l.d).join('');

const fmt4 = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
/** H and V spelled as L, so a translation touches every coordinate pair. */
export function expandHV(d) {
  let out = '', cur = [0, 0], start = [0, 0];
  for (const m of d.matchAll(/([MLCHVZ])([^MLCHVZ]*)/gi)) {
    const c = m[1].toUpperCase(), n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
    if (c === 'H') { for (const x of n) { cur = [x, cur[1]]; out += `L${fmt4(cur[0])} ${fmt4(cur[1])}`; } }
    else if (c === 'V') { for (const y of n) { cur = [cur[0], y]; out += `L${fmt4(cur[0])} ${fmt4(cur[1])}`; } }
    else { out += c + m[2]; if (n.length >= 2) cur = [n[n.length - 2], n[n.length - 1]]; if (c === 'M') start = cur; if (c === 'Z') cur = start; }
  }
  return out;
}
export const translate = (d, v) => (v && (v[0] || v[1]) ? expandHV(d).replace(/(-?\d*\.?\d+(?:e-?\d+)?)[ ,](-?\d*\.?\d+(?:e-?\d+)?)/g, (m, x, y) => `${fmt4(+x + v[0])} ${fmt4(+y + v[1])}`) : d);
