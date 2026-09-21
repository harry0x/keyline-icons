/**
 * Re-seat a cluster so the whole drawing centres.
 *
 * The shipped set holds compounds to exact symmetry — `lint.mjs` CENTERING
 * wants opposing paddings equal within 0.05, and across 884 names only
 * `banknote-minus`, `banknote-2-minus` and `fingerprint-pattern` warn. So a
 * modifier's seat is not free: it is chosen so the union of base and modifier
 * still centres.
 *
 * Solved rather than searched. The union's edge per axis is min/max of base
 * and cluster, so it is a scan over one number per star, on the half unit,
 * nearest to no move at all. The cut can only pull the base's box IN, never
 * out, so this is an upper bound and the rebuild is what confirms it.
 *
 * Seats come from `build.mjs`'s own tables, never from reading a drawing back:
 * `list`'s bullets and `shopping-cart`'s wheels are filled paths too, and
 * reverse-engineering read them as stars — the cart then wanted its whole
 * cluster moved a unit to fix a skew that was the wheels'.
 *
 *   node tools/v8/recentre.mjs [--his] [--json]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, HIS } from './build.mjs';
import { inkOfPaths } from './measure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABLE = process.argv.includes('--his') ? HIS : ICONS;

/** The shipped base's painted ink, with this compound's `drop` applied. */
function baseInk(spec) {
  if (spec.baseD) return inkOfPaths(spec.baseD.map((d) => ({ d, stroked: true })));
  const svg = readFileSync(join(ROOT, 'raw', spec.base, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0])
    .map((tag) => ({ d: (tag.match(/ d="([^"]+)"/) || [])[1], stroked: / stroke="(?!none)/.test(tag), evenodd: /evenodd/.test(tag) }))
    .filter((_, i) => !(spec.drop || []).includes(i));
  return inkOfPaths(paths);
}
const starBox = (stars) => stars.reduce((b, [x, y, R]) =>
  [Math.min(b[0], x - R), Math.min(b[1], y - R), Math.max(b[2], x + R), Math.max(b[3], y + R)],
  [1e9, 1e9, -1e9, -1e9]);

export function solve(base, stars, { step = 0.5, reach = 3 } = {}) {
  const grid = [];
  for (let t = -reach; t <= reach + 1e-9; t += step) grid.push(+t.toFixed(2));
  const seats = [];
  const walk = (i, offs) => {
    if (i === stars.length) {
      let b = [...base];
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
  return seats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = {};
  const lines = [];
  for (const [name, spec] of Object.entries(TABLE)) {
    const b = baseInk(spec);
    const sb = starBox(spec.stars);
    const now = [Math.min(b[0], sb[0]), Math.min(b[1], sb[1]), Math.max(b[2], sb[2]), Math.max(b[3], sb[3])];
    const off = [+((now[0] + now[2]) / 2 - 12).toFixed(3), +((now[1] + now[3]) / 2 - 12).toFixed(3)];
    if (Math.abs(off[0]) <= 0.026 && Math.abs(off[1]) <= 0.026) { table[name] = 'keep'; continue; }
    const seats = solve(b, spec.stars);
    if (!seats.length) { table[name] = 'NONE'; lines.push(`${name.padEnd(26)} off ${off}  NO SEAT CENTRES`); continue; }
    table[name] = spec.stars.map(([x, y, R], k) => [x + seats[0].offs[k][0], y + seats[0].offs[k][1], R]);
    lines.push(`${name.padEnd(26)} off ${String(off).padEnd(14)} -> ${JSON.stringify(table[name])}`);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(table));
  else {
    for (const l of lines) console.log(l);
    console.log(Object.values(table).filter((v) => v === 'keep').length, 'already centred;', lines.length, 'to move');
  }
}
