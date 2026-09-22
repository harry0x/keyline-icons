// wand: a magician's wand, a rod 5 wide on the free diagonal (bottom left to top right),
// r=1 corners, one band 0.3 of the way down from the tip (his call, 22 Sep: the second band
// at the handle end was extra, and the tip band came down from 0.2). 5, not 4:
// at 4 the rod's long sides lie on the other set's wand-sparkles rod (4.24 wide on the
// same diagonal; 58% of our outline within a quarter unit), at 5 it is 2%. Drawn upright about
// (12,12) and turned 45 degrees; the rod's length is solved per treatment so the ink
// lands on 2..22 in both corners (drawing-a-new-icon.md, a rotated drawing).
//   node wand.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const K = 0.5522847498;
const C = [12, 12], S = Math.SQRT1_2;
const rot = ([x, y]) => { const dx = x - C[0], dy = y - C[1]; return [C[0] + dx * S - dy * S, C[1] + dx * S + dy * S]; };
const f = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const P = (p) => { const q = rot(p); return `${f(q[0])} ${f(q[1])}`; };
/** A polygon with a radius per vertex (0 = sharp), upright, as a closed path turned 45 degrees. */
function poly(vs) {
  const n = vs.length; let d = '';
  const pts = [];
  for (let i = 0; i < n; i++) {
    const [V, r] = vs[i], A = vs[(i + n - 1) % n][0], B = vs[(i + 1) % n][0];
    if (!r) { pts.push({ T1: V, T2: V, r: 0 }); continue; }
    const u = norm([A[0] - V[0], A[1] - V[1]]), w = norm([B[0] - V[0], B[1] - V[1]]);
    const alpha = Math.acos(u[0] * w[0] + u[1] * w[1]), t = r / Math.tan(alpha / 2), k = (4 / 3) * Math.tan((Math.PI - alpha) / 4) * r;
    const T1 = [V[0] + u[0] * t, V[1] + u[1] * t], T2 = [V[0] + w[0] * t, V[1] + w[1] * t];
    pts.push({ T1, T2, C1: [T1[0] - u[0] * k, T1[1] - u[1] * k], C2: [T2[0] - w[0] * k, T2[1] - w[1] * k], r });
  }
  d = `M${P(pts[0].T2)}`;
  for (let i = 1; i <= n; i++) { const p = pts[i % n]; d += `L${P(p.T1)}`; if (p.r) d += `C${P(p.C1)} ${P(p.C2)} ${P(p.T2)}`; }
  return d + 'Z';
}
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l]; };
const line = (a, b) => `M${P(a)}L${P(b)}`;
/**
 * One treatment. L: rod length (path), r: corner radius, band at L/4 from the top.
 * Returns the layers of every style, upright coordinates turned as they are written.
 */
function build(L, r, W = WIDTH, bands = BANDS) {
  const x0 = 12 - W / 2, x1 = 12 + W / 2, y0 = 12 - L / 2, y1 = 12 + L / 2, yb = y0 + L * bands[0];
  const rod = poly([[[x0, y0], r], [[x1, y0], r], [[x1, y1], r], [[x0, y1], r]]);
  const band = bands.map((b) => line([x0, y0 + L * b], [x1, y0 + L * b])).join('');
  // the outer contour: the rod's ink edge (offset 1; a sharp corner's round join paints r=1)
  const R = r + 1;
  const outer = poly([[[x0 - 1, y0 - 1], R], [[x1 + 1, y0 - 1], R], [[x1 + 1, y1 + 1], R], [[x0 - 1, y1 + 1], R]]);
  // the rod between the bands' centre lines, to the outer contour: black in duotone over the
  // grey plate, the tips staying grey (pen's split, the rod the solid mass)
  const ys = bands.map((b) => y0 + L * b);
  // one band: the rod runs on to its end; two: it stops at the second band
  const bodyEnd = ys.length > 1 ? [[[x1 + 1, ys[1]], 0], [[x0 - 1, ys[1]], 0]] : [[[x1 + 1, y1 + 1], R], [[x0 - 1, y1 + 1], R]];
  const body = poly([[[x0 - 1, ys[0]], 0], [[x1 + 1, ys[0]], 0], ...bodyEnd]);
  // fill: each band's ink knocked out across the rod
  const cuts = [y0 - 1, ...ys.flatMap((y) => [y - 1, y + 1]), y1 + 1];
  const pieces = [];
  for (let i = 0; i < cuts.length; i += 2) {
    const top = cuts[i], bot = cuts[i + 1], rt = i === 0 ? R : 0, rb = i + 2 === cuts.length ? R : 0;
    pieces.push(poly([[[x0 - 1, top], rt], [[x1 + 1, top], rt], [[x1 + 1, bot], rb], [[x0 - 1, bot], rb]]));
  }
  return { rod, band, outer, body, tip: pieces[0], rest: pieces.slice(1).join('') };
}
export let WIDTH = +(process.env.W || 5), BANDS = (process.env.BANDS || '0.3').split(',').map(Number);
const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
const st = (d, sharp) => `<path d="${d}" stroke="black" stroke-width="2" stroke-linecap="${sharp ? 'butt' : 'round'}" stroke-linejoin="round"/>\n`;
const fl = (d, op = 1) => `<path d="${d}" fill="black"${op < 1 ? ` fill-opacity="${op}"` : ''}/>\n`;
export function files() {
  // regular: the r=1 corner's arc meets the box on its bisector: 12 + (L/2) S + 2 = 22
  // corner circle centre sits (W/2 - r) across and (L/2 - r) along: 12 + ((W/2 - 1) + (L/2 - 1)) S + 1 + 1 = 22
  const Lr = 2 * (8 / S - (WIDTH / 2 - 1) + 1);
  // sharp: the vertex's round join paints 1 past it: 12 + (2 + L/2) S + 1 = 22
  const Ls = 2 * (9 / S - WIDTH / 2);
  const out = {};
  for (const [c, L, r] of [['regular', Lr, 1], ['sharp', Ls, 0]]) {
    const g = build(L, r), sharp = c === 'sharp';
    const strokes = g.rod + g.band;
    out[`Container=regular, Style=stroke, Corners=${c}.svg`] = HEAD + st(strokes, sharp) + '</svg>\n';
    out[`Container=regular, Style=two-tone, Corners=${c}.svg`] = HEAD + fl(g.outer, 0.4) + st(strokes, sharp) + '</svg>\n';
    out[`Container=regular, Style=duotone, Corners=${c}.svg`] = HEAD + fl(g.outer, 0.4) + fl(g.body) + '</svg>\n';
    out[`Container=regular, Style=fill, Corners=${c}.svg`] = HEAD + fl(g.tip + g.rest) + '</svg>\n';
  }
  return { out, Lr, Ls };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = join(process.argv[2], 'raw', 'wand'); mkdirSync(dir, { recursive: true });
  const { out, Lr, Ls } = files();
  for (const [n, s] of Object.entries(out)) writeFileSync(join(dir, n), s);
  console.log('rod length regular', Lr.toFixed(4), 'sharp', Ls.toFixed(4));
}

// wand-sparkles: the wand as drawn, his star (tools/v8/star.mjs) in each empty half.
// Lead R4 top left on (6,6), second R2.5 bottom right on (17.5,17.5): each clears the
// rod's ink (half-width 3.5) by 2 along the diagonal, nothing is cut. Two-tone and
// duotone are the sparkle rule: the object black, the lead black, the second grey;
// fill is the stroke drawing (as the rest of the batch).
import { star } from '../star.mjs';
import { sharpStar } from '../halo.mjs';
export const STARS = [[6, 6, 4], [17.5, 17.5, 2.5]];
export function sparkles(base) {
  const out = {};
  for (const c of ['regular', 'sharp']) {
    const svg = base[`Container=regular, Style=stroke, Corners=${c}.svg`];
    const strokeTag = svg.match(/<path[^>]*\/>/)[0];
    const s = STARS.map(([x, y, R]) => (c === 'sharp' ? sharpStar([x, y], R) : star([x, y], R)));
    const stroke = HEAD + strokeTag + '\n' + fl(s.join('')) + '</svg>\n';
    const toned = HEAD + strokeTag + '\n' + fl(s[0]) + fl(s[1], 0.4) + '</svg>\n';
    for (const [st2, body] of [['stroke', stroke], ['two-tone', toned], ['duotone', toned], ['fill', stroke]]) out[`Container=regular, Style=${st2}, Corners=${c}.svg`] = body;
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = join(process.argv[2], 'raw', 'wand-sparkles'); mkdirSync(dir, { recursive: true });
  for (const [n, s] of Object.entries(sparkles(files().out))) writeFileSync(join(dir, n), s);
}
