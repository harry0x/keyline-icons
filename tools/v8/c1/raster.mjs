// Raster and notch geometry for the C1 build, lifted from the option panel's
// composition lens (21 Sep 2026). Was: geometry for the composition options: a 0.1 raster of the 24 canvas with an
// exact distance transform (clearances), the house corner notch as a rounded
// box, and a trim of the base's centre line against that notch. Previews only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { polys, bbox, ROOT } from './kit.mjs';
import { parse, at, segsToD } from '../cut.mjs';
import { star as starPath } from '../star.mjs';

export { starPath };
export const RES = 0.1, N = 240;
const cellC = (i) => (i + 0.5) * RES;

// ---------- raster ----------
export const blank = () => new Uint8Array(N * N);
export function fillD(d, evenodd = false, m = blank()) {
  const edges = [];
  for (const q of polys(d, 32)) for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    if (a[1] !== b[1]) edges.push([a, b]);
  }
  for (let y = 0; y < N; y++) {
    const yc = cellC(y), xs = [];
    for (const [a, b] of edges) if ((a[1] > yc) !== (b[1] > yc)) xs.push([a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), b[1] > a[1] ? 1 : -1]);
    xs.sort((p, q) => p[0] - q[0]);
    let w = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      w = evenodd ? w ^ 1 : w + xs[k][1];
      if (w !== 0) {
        const x0 = Math.max(0, Math.ceil(xs[k][0] / RES - 0.5)), x1 = Math.min(N - 1, Math.floor(xs[k + 1][0] / RES - 0.5));
        for (let x = x0; x <= x1; x++) m[y * N + x] = 1;
      }
    }
  }
  return m;
}
function disc(m, c, r) {
  const x0 = Math.max(0, Math.floor((c[0] - r) / RES)), x1 = Math.min(N - 1, Math.ceil((c[0] + r) / RES));
  const y0 = Math.max(0, Math.floor((c[1] - r) / RES)), y1 = Math.min(N - 1, Math.ceil((c[1] + r) / RES));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = cellC(x) - c[0], py = cellC(y) - c[1]; if (px * px + py * py <= r * r) m[y * N + x] = 1; }
}
function bar(m, a, b, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-12) return;
  const L = Math.sqrt(L2);
  const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r) / RES)), x1 = Math.min(N - 1, Math.ceil((Math.max(a[0], b[0]) + r) / RES));
  const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r) / RES)), y1 = Math.min(N - 1, Math.ceil((Math.max(a[1], b[1]) + r) / RES));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = cellC(x) - a[0], py = cellC(y) - a[1], u = (px * dx + py * dy) / L2;
    if (u < 0 || u > 1) continue;
    if (Math.abs(px * dy - py * dx) / L <= r) m[y * N + x] = 1;
  }
}
/** Painted ink of a 2-wide round stroke along d. */
export function strokeD(d, m = blank(), half = 1) {
  for (const q of polys(d, 32)) for (let i = 0; i < q.length; i++) { disc(m, q[i], half); if (i + 1 < q.length) bar(m, q[i], q[i + 1], half); }
  return m;
}
export function inRR(p, rr, g = 0) {
  if (rr.kind === 'circle') return (p[0] - rr.c[0]) ** 2 + (p[1] - rr.c[1]) ** 2 <= (rr.r + g) ** 2 + 1e-9;
  const x0 = rr.x0 - g, y0 = rr.y0 - g, x1 = rr.x1 + g, y1 = rr.y1 + g, r = rr.r + g;
  if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return false;
  const cx = Math.min(Math.max(p[0], x0 + r), x1 - r), cy = Math.min(Math.max(p[1], y0 + r), y1 - r);
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r + 1e-9;
}
export function rrMask(rrs, g = 0, m = blank()) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const p = [cellC(x), cellC(y)]; if (rrs.some((rr) => inRR(p, rr, g))) m[y * N + x] = 1; }
  return m;
}
export const or = (...ms) => { const o = blank(); for (const m of ms) for (let i = 0; i < o.length; i++) o[i] |= m[i]; return o; };
export const andNot = (a, b) => { const o = blank(); for (let i = 0; i < o.length; i++) o[i] = a[i] && !b[i] ? 1 : 0; return o; };
export const not = (a) => { const o = blank(); for (let i = 0; i < o.length; i++) o[i] = a[i] ? 0 : 1; return o; };
export const count = (m) => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c; };

/** Exact Euclidean distance (units) from each cell centre to the nearest set cell. */
export function edt(m) {
  const INF = 1e12, f = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) f[i] = m[i] ? 0 : INF;
  const d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1), g = new Float64Array(N);
  const pass = (get, set) => {
    for (let q = 0; q < N; q++) g[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    const S = (q, p) => ((g[q] + q * q) - (g[p] + p * p)) / (2 * q - 2 * p);
    for (let q = 1; q < N; q++) {
      let s = S(q, v[k]);
      while (s <= z[k]) { k--; s = S(q, v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < N; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + g[p]; }
    for (let q = 0; q < N; q++) set(q, d[q]);
  };
  for (let x = 0; x < N; x++) pass((q) => f[q * N + x], (q, val) => { f[q * N + x] = val; });
  for (let y = 0; y < N; y++) pass((q) => f[y * N + q], (q, val) => { f[y * N + q] = val; });
  const out = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) out[i] = Math.sqrt(f[i]) * RES;
  return out;
}

// ---------- stars ----------
const OFFS = new Map();
function offsets(R) {
  if (!OFFS.has(R)) {
    const m = fillD(starPath([12, 12], R)), o = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) o.push([x - 120, y - 120]);
    OFFS.set(R, o);
  }
  return OFFS.get(R);
}
/** Cells of a star centred on the half-unit grid. */
export function starCells(c, R) {
  const sx = Math.round(c[0] * 10), sy = Math.round(c[1] * 10);
  return offsets(R).map(([x, y]) => [x + sx, y + sy]);
}
export function starMask(list, m = blank()) {
  for (const s of list) for (const [x, y] of starCells(s.c, s.R)) if (x >= 0 && y >= 0 && x < N && y < N) m[y * N + x] = 1;
  return m;
}
/** Least distance from a star's ink to the set cells of D's mask (-1 if it leaves the raster). */
export function clearance(D, c, R) {
  let min = Infinity;
  for (const [x, y] of starCells(c, R)) { if (x < 0 || y < 0 || x >= N || y >= N) return -1; min = Math.min(min, D[y * N + x]); }
  return min - RES; // centre-to-centre of cells, less one cell: painted air
}
export const inCanvas = (c, R, lo = 1, hi = 23) => c[0] - R >= lo - 1e-9 && c[1] - R >= lo - 1e-9 && c[0] + R <= hi + 1e-9 && c[1] + R <= hi + 1e-9;

// ---------- the corner notch ----------
/** House corner-sign notch: the signs' box grown by 2, run out past every side
 *  that already reaches the body's edge, inner corners on radius 3. */
/** The round badge notch (bell-dot's): 2 clear of the star's tips. */
export const circleFor = (s, gap = 2) => ({ kind: 'circle', c: [...s.c], r: s.R + gap });
export function notchFor(stars, plateBox, gap = 2, r = 3) {
  const b = stars.reduce((a, s) => [Math.min(a[0], s.c[0] - s.R), Math.min(a[1], s.c[1] - s.R), Math.max(a[2], s.c[0] + s.R), Math.max(a[3], s.c[1] + s.R)], [1e9, 1e9, -1e9, -1e9]);
  const g = [b[0] - gap, b[1] - gap, b[2] + gap, b[3] + gap];
  return {
    x0: g[0] <= plateBox[0] + 0.01 ? -8 : g[0], y0: g[1] <= plateBox[1] + 0.01 ? -8 : g[1],
    x1: g[2] >= plateBox[2] - 0.01 ? 32 : g[2], y1: g[3] >= plateBox[3] - 0.01 ? 32 : g[3], r,
  };
}
export const rrSvg = (rr, fill = 'black', g = 0) => rr.kind === 'circle' ? `<circle cx="${rr.c[0]}" cy="${rr.c[1]}" r="${rr.r + g}" fill="${fill}"/>` : `<rect x="${rr.x0 - g}" y="${rr.y0 - g}" width="${rr.x1 - rr.x0 + 2 * g}" height="${rr.y1 - rr.y0 + 2 * g}" rx="${rr.r + g}" fill="${fill}"/>`;

// ---------- trimming a centre line to a notch ----------
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function splitC(P, t) {
  const [p0, p1, p2, p3] = P;
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
  return [[p0, a, d, f], [f, e, c, p3]];
}
function slice(g, u0, u1) {
  if (g.t === 'L') return { t: 'L', p0: at(g, u0), p1: at(g, u1) };
  let P = [g.p0, g.c1, g.c2, g.p1];
  if (u1 < 1) P = splitC(P, u1)[0];
  if (u0 > 0) P = splitC(P, u0 / u1)[1];
  return { t: 'C', p0: P[0], c1: P[1], c2: P[2], p1: P[3] };
}
const segLen = (s) => { let L = 0, p = at(s, 0); for (let i = 1; i <= 16; i++) { const q = at(s, i / 16); L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } return L; };
const tangent = (s, u) => { const e = 1e-4, a = at(s, Math.max(0, u - e)), b = at(s, Math.min(1, u + e)); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };

/**
 * d with every stretch of centre line that enters a notch grown by 1 removed, so
 * the round cap lands on the notch edge (app-window-plus). Runs under 2 go.
 * Returns { d, ends: [{ p, t }] } where t points from the kept run into the cut.
 */
export function trimTo(d, notches, keep = 2, grow = 1) {
  if (!notches.length) return { d, ends: [] };
  const dead = (p) => notches.some((rr) => inRR(p, rr, grow));
  const runs = [], ends = [];
  for (const sp of parse(d)) {
    const pieces = [];
    for (const g of sp.segs) {
      const ts = [], steps = 200;
      for (let i = 0; i < steps; i++) {
        let a = i / steps, b = (i + 1) / steps;
        if (dead(at(g, a)) !== dead(at(g, b))) {
          for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (dead(at(g, a)) !== dead(at(g, m))) b = m; else a = m; }
          ts.push((a + b) / 2);
        }
      }
      let u0 = 0;
      for (const u of ts) { pieces.push(slice(g, u0, u)); u0 = u; }
      pieces.push(slice(g, u0, 1));
    }
    const live = pieces.map((s) => !dead(at(s, 0.5)));
    let order = pieces.map((_, i) => i);
    if (sp.closed && live[0] && live[live.length - 1]) {
      const k = live.lastIndexOf(false);
      if (k >= 0) order = [...order.slice(k + 1), ...order.slice(0, k + 1)];
    }
    let run = [];
    const flush = (cutAfter) => {
      if (!run.length) return;
      const L = run.reduce((a, s) => a + segLen(s), 0);
      if (L >= keep) {
        runs.push(run);
        const first = run[0], last = run[run.length - 1];
        if (run.cutBefore) { const t = tangent(first, 0); ends.push({ p: first.p0, t: [-t[0], -t[1]] }); }
        if (cutAfter) ends.push({ p: last.p1, t: tangent(last, 1) });
      }
      run = [];
    };
    let prevDead = sp.closed ? !live[order[order.length - 1]] : false;
    for (const i of order) {
      if (live[i]) { if (!run.length) run.cutBefore = prevDead; run.push(pieces[i]); prevDead = false; }
      else { flush(true); prevDead = true; }
    }
    flush(false);
  }
  return { d: runs.map(segsToD).join(''), ends };
}

// ---------- the shipped base ----------
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
export function baseStroke(base) {
  const svg = readFileSync(join(ROOT, 'raw', base, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8');
  return tags(svg).map((t) => ({ d: (t.match(/ d="([^"]+)"/) || [])[1], stroked: / stroke="(?!none)/.test(t), evenodd: /evenodd/.test(t) }));
}
/** Drop subpaths whose box matches (image's sun, which his drawing replaces). */
export function dropBoxes(d, boxes) {
  if (!boxes || !boxes.length) return d;
  const subs = d.match(/M[^M]*/g) || [];
  return subs.filter((sp) => { const b = bbox(sp); return !boxes.some((q) => q.every((v, i) => Math.abs(v - b[i]) < 0.06)); }).join('');
}
export const and2 = (a, b) => { const o = blank(); for (let i = 0; i < o.length; i++) o[i] = a[i] && b[i] ? 1 : 0; return o; };
