/**
 * Does every two-tone plate edge sit under its stroke? The plate is the stroke's
 * outer contour, so away from a notch its edge must lie within 1 of a stroke's
 * centre line. Reports, per name and corner, how much plate edge runs bare
 * (plate showing past the end of a line) and where.
 *
 *   node tools/v8/c1/plateedge.mjs <buildDir> [names...]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { polys } from './kit.mjs';
const [dir, ...only] = process.argv.slice(2);
const plans = JSON.parse(readFileSync(join(dir, 'plans.json'), 'utf8'));
const dense = (d, step = 0.1) => polys(d, 48).flatMap((q) => q.slice(1).flatMap((b, i) => { const a = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }));
const onNotch = (p, rr, sharp) => {
  if (rr.kind === 'circle') return Math.abs(Math.hypot(p[0] - rr.c[0], p[1] - rr.c[1]) - rr.r) < 0.08;
  const r = sharp ? 0 : rr.r, inX = p[0] >= rr.x0 - 0.08 && p[0] <= rr.x1 + 0.08, inY = p[1] >= rr.y0 - 0.08 && p[1] <= rr.y1 + 0.08;
  if (!inX || !inY) return false;
  const cx = Math.min(Math.max(p[0], rr.x0 + r), rr.x1 - r), cy = Math.min(Math.max(p[1], rr.y0 + r), rr.y1 - r);
  return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) < 0.08 || (r === 0 && (Math.abs(p[0] - rr.x0) < 0.08 || Math.abs(p[1] - rr.y0) < 0.08 || Math.abs(p[0] - rr.x1) < 0.08 || Math.abs(p[1] - rr.y1) < 0.08));
};
const names = only.length ? only : readdirSync(join(dir, 'raw')).sort();
for (const n of names) {
  const out = [];
  for (const c of ['regular', 'sharp']) {
    const f = join(dir, 'raw', n, `Container=regular, Style=two-tone, Corners=${c}.svg`);
    if (!existsSync(f)) continue;
    const svg = readFileSync(f, 'utf8');
    const plate = [...svg.matchAll(/<path[^>]* d="([^"]+)"[^>]*fill-opacity="0.4"/g)].map((m) => m[1]).join('');
    const strokes = [...svg.matchAll(/<path d="([^"]+)" stroke="black"/g)].map((m) => m[1]).join('');
    if (!plate) continue;
    const S = dense(strokes, 0.1);
    const bare = dense(plate, 0.1).filter((p) => !(plans[n]?.notches || []).some((rr) => onNotch(p, rr, c === 'sharp')) && !S.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1.12));
    if (bare.length > 3) out.push(`${c} ${(bare.length * 0.1).toFixed(1)} bare near ${bare[Math.floor(bare.length / 2)].map((v) => v.toFixed(1))}`);
  }
  console.log(n.replace('-sparkles', '').padEnd(18), out.join(' | ') || 'ok');
}
