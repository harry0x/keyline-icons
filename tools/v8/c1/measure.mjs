/**
 * How far the C1 notch departs from his own cut, per icon: for every place his
 * stroke was cut, how much further the notch trims it (0 means the box lands
 * exactly where he stopped, as on app-window), plus his stroke against the
 * shipped base both ways (his-only ink means he redrew part of the base;
 * base-only ink means he cut shorter than the notch).
 *
 *   node tools/v8/c1/measure.mjs <plans.json> [names...]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load, ROOT, baseOf, polys } from './kit.mjs';
import { trimTo } from './raster.mjs';
const [plansFile, ...only] = process.argv.slice(2);
const plans = JSON.parse(readFileSync(plansFile, 'utf8'));
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const baseStrokes = (b) => tags(readFileSync(join(ROOT, 'raw', b, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8')).filter((t) => / stroke="(?!none)/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]);
const pts = (d) => polys(d, 32).flat();
const oneWay = (P, Q) => P.reduce((m, p) => Math.max(m, Q.reduce((n, q) => Math.min(n, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity)), 0);
const length = (d) => polys(d, 64).reduce((a, q) => a + q.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0);
for (const n of (only.length ? only : Object.keys(plans).sort())) {
  const L = plans[n]; if (!L || L.noPlate) continue;
  const ic = load(n);
  const his = ic.strokes.join(''), hisT = ic.strokes.map((d) => trimTo(d, L.notches).d).filter(Boolean).join('');
  const lost = length(his) - length(hisT); // stroke the notch takes beyond his cut
  const base = baseStrokes(baseOf(n)).join(''), baseT = baseStrokes(baseOf(n)).map((d) => trimTo(d, L.notches).d).filter(Boolean).join('');
  const hisOnly = oneWay(pts(hisT), pts(baseT)), baseOnly = oneWay(pts(baseT), pts(hisT));
  const moves = L.stars.filter((s) => s.from).map((s) => `${s.role}${s.R} ${Math.hypot(s.c[0] - s.from[0], s.c[1] - s.from[1]).toFixed(1)}${s.fallback ? ' (' + s.fallback + ')' : ''}`);
  const stuck = L.stars.some((s) => s.stuck);
  console.log(n.replace('-sparkles', '').padEnd(18), `notch takes ${lost.toFixed(2).padStart(5)} more stroke`, `| his-only ${hisOnly.toFixed(2).padStart(5)} base-only ${baseOnly.toFixed(2).padStart(5)}`, '|', moves.join(', ') || '-', stuck ? '| NO SEAT' : '');
}
