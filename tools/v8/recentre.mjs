/**
 * Re-seat a cluster so the whole drawing centres.
 *
 * The shipped set holds compounds to exact symmetry — `lint.mjs` CENTERING
 * wants opposing paddings equal within 0.05, and across 884 names only
 * `banknote-minus`, `banknote-2-minus` and `fingerprint-pattern` warn. So a
 * modifier's seat is not free: it is chosen so the union of base and modifier
 * still centres. Nineteen of the first pass ignored that.
 *
 * Solved rather than searched. The union's left edge is min(base, star) and its
 * right edge max(base, star), so per axis the offset is a scan over a 0.25 grid
 * of one number, and only the survivors are rebuilt through the real cut.
 *
 *   node tools/v8/recentre.mjs <svg dir>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { star } from './star.mjs';
import { trim } from './cut.mjs';
import { inkOfPaths } from './measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2];
const RES = 0.05, N = Math.round(24 / RES);

const parsePaths = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
  d: (tag.match(/ d="([^"]+)"/) || [])[1],
  stroked: / stroke="(?!none)/.test(tag),
}));
const nums = (d) => (d.match(/-?\d*\.?\d+/g) || []).map(Number);
// A control point can lie outside the curve it steers, so a box off the raw
// numbers overstates a curved base by a tenth or so — which is the difference
// between a seat that centres and one that reports 0.094 off. Raster it.
const boxOf = (ds) => inkOfPaths(ds.map((d) => ({ d, stroked: true })));
const hull = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** A star's painted box, which is its own outline: half-extent R about the centre. */
const starBox = (stars) => stars.reduce((b, [x, y, R]) =>
  hull(b, [x - R, y - R, x + R, y + R]), [1e9, 1e9, -1e9, -1e9]);

export function solve(baseInk, stars) {
  // Moving the whole cluster is one degree of freedom and it runs out: `user`
  // needs its big star in by a unit and its small one left where it is, which
  // no common offset gives without landing on a quarter. So each star moves on
  // its own, on the half unit, and the seat nearest to no move at all wins.
  //
  // The cut can only pull the BASE's box in, never out, so this is the upper
  // bound on the union and the rebuild below is what confirms it.
  const STEP = 0.5, REACH = 3;
  const grid = [];
  for (let t = -REACH; t <= REACH + 1e-9; t += STEP) grid.push(+t.toFixed(2));
  const seats = [];
  const walk = (i, offs) => {
    if (i === stars.length) {
      let b = [...baseInk];
      stars.forEach(([x, y, R], k) => {
        const [dx, dy] = offs[k];
        b = [Math.min(b[0], x + dx - R), Math.min(b[1], y + dy - R),
             Math.max(b[2], x + dx + R), Math.max(b[3], y + dy + R)];
      });
      if (b[0] < 0.98 || b[1] < 0.98 || b[2] > 23.02 || b[3] > 23.02) return;
      if (Math.abs((b[0] + b[2]) / 2 - 12) > 0.026) return;
      if (Math.abs((b[1] + b[3]) / 2 - 12) > 0.026) return;
      seats.push({ offs: offs.map((o) => [...o]), cost: offs.reduce((a, o) => a + o[0] * o[0] + o[1] * o[1], 0) });
      return;
    }
    for (const dx of grid) for (const dy of grid) { offs[i] = [dx, dy]; walk(i + 1, offs); }
  };
  walk(0, stars.map(() => [0, 0]));
  seats.sort((a, b) => a.cost - b.cost);
  return seats.map((s) => s.offs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.svg')).sort()) {
    const name = f.replace('.svg', '');
    const svg = readFileSync(join(DIR, f), 'utf8');
    const ps = parsePaths(svg);
    const baseDs = ps.filter((p) => p.stroked).map((p) => p.d);
    const starDs = ps.filter((p) => !p.stroked).map((p) => p.d);
    if (!starDs.length) { rows.push({ name, skip: 'no cluster' }); continue; }
    const stars = starDs.map((d) => { const v = nums(d);
      const xs = v.filter((_, i) => i % 2 === 0), ys = v.filter((_, i) => i % 2 === 1);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2,
        ((Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys))) / 4]; });
    // the UNCUT base is what the seat is solved against; the cut only shrinks it
    const uncut = boxOf(baseDs);
    const now = hull(uncut, starBox(stars));
    const off = [ +((now[0] + now[2]) / 2 - 12).toFixed(3), +((now[1] + now[3]) / 2 - 12).toFixed(3) ];
    if (Math.abs(off[0]) <= 0.026 && Math.abs(off[1]) <= 0.026) { rows.push({ name, ok: true }); continue; }
    const cand = solve(uncut, stars);
    rows.push({ name, off, moves: cand.slice(0, 2), n: cand.length,
      stars: cand.length ? stars.map(([x, y, R], k) => [x + cand[0][k][0], y + cand[0][k][1], R]) : null });
  }
  if (process.argv.includes('--json')) {
    const table = {};
    for (const r of rows) { if (r.skip) continue; table[r.name] = r.ok ? 'keep' : (r.stars || 'NONE'); }
    console.log(JSON.stringify(table));
  } else
  for (const r of rows) {
    if (r.ok) continue;
    if (r.skip) { console.log(r.name.padEnd(28), r.skip); continue; }
    console.log(r.name.padEnd(28), 'off', String(r.off).padEnd(14),
      r.n ? 'move ' + JSON.stringify(r.moves[0]) + '  -> ' + JSON.stringify(r.stars) : 'NO SEAT CENTRES');
  }
  if (!process.argv.includes('--json'))
    console.log(rows.filter((r) => r.ok).length, 'already centred;', rows.filter((r) => !r.ok && !r.skip).length, 'to move');
}
