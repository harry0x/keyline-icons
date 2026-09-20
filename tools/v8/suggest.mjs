/**
 * Candidate seats for one more sparkle: clear of the base's ink by 2 and clear
 * of the stars already placed by 2. Prints the best few per corner so a cluster
 * can be composed the way his are — a big one on a corner, a small one across
 * the drawing from it.
 *
 *   node tools/v8/suggest.mjs <base> <R> [x,y,r ...]
 */
import { baseMask, starMask, distance, gap } from './place.mjs';
const RES = 0.05, N = Math.round(24 / RES);
const [name, Rs, ...fixed] = process.argv.slice(2);
const R = +Rs;
const held = fixed.map((s) => s.split(',').map(Number));
const m = baseMask(name);
const D = distance(m);
const Dh = held.length ? distance(starMask(held)) : null;
const out = [];
for (let cy = 1 + R; cy <= 23 - R; cy += 0.5) for (let cx = 1 + R; cx <= 23 - R; cx += 0.5) {
  const s = starMask([[cx, cy, R]]);
  let ok = true, min = Infinity;
  for (let i = 0; i < N * N && ok; i++) if (s[i]) {
    if (m[i]) { ok = false; break; }
    if (Dh) { if (Dh[i] === 0) { ok = false; break; } min = Math.min(min, Dh[i]); }
    min = Math.min(min, D[i]);
  }
  if (ok && min >= 2) out.push([cx, cy, min]);
}
const corners = { tr: (p) => p[0] - p[1], tl: (p) => -p[0] - p[1], br: (p) => p[0] + p[1], bl: (p) => -p[0] + p[1], mid: (p) => -Math.hypot(p[0] - 12, p[1] - 12) };
console.log(name, `R${R}`, 'seats', out.length);
for (const [k, f] of Object.entries(corners)) {
  const best = out.length ? out.reduce((a, b) => (f(b) > f(a) ? b : a)) : null;
  process.stdout.write(`  ${k} ${best ? `(${best[0]},${best[1]}) gap ${best[2].toFixed(2)}` : '--'}\n`);
}
