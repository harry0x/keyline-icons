// Smallest half-unit star move that clears his rules in both corners, strokes as drawn.
import { readFileSync } from 'node:fs';
import { star } from '../star.mjs';
import { sharpStar } from '../halo.mjs';
import { polyOf, distTo } from './cutter.mjs';
const RAW = process.argv[2];
const P = (d, step = 0.05) => polyOf(d, 48).flatMap((q) => { const o = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push({ p: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], t: [b[0] - a[0], b[1] - a[1]] }); } o.push({ p: q.at(-1), t: [q.at(-1)[0] - q.at(-2)[0], q.at(-1)[1] - q.at(-2)[1]] }); return o; });
function scene(n, c) {
  const svg = readFileSync(`${RAW}/${n}-sparkles/Container=regular, Style=stroke, Corners=${c}.svg`, 'utf8');
  const tags = svg.match(/<path[^>]*>/g);
  const sD = tags.filter((t) => / stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  const fills = tags.filter((t) => !/ stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]);
  const stars = fills.at(-1).match(/M[^M]+/g).map((d) => { const q = polyOf(d, 16)[0]; const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return { c: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], R: (Math.max(...xs) - Math.min(...xs)) / 2 }; });
  // ink points: disc round the line in regular, the band across it in sharp
  const ink = [];
  for (const { p, t } of sD ? P(sD) : []) {
    if (c === 'regular') { for (let k = 0; k < 12; k++) ink.push([p[0] + Math.cos(k * Math.PI / 6), p[1] + Math.sin(k * Math.PI / 6)]); ink.push(p); }
    else { const l = Math.hypot(...t) || 1, nn = [-t[1] / l, t[0] / l]; for (const s of [-1, -0.5, 0, 0.5, 1]) ink.push([p[0] + nn[0] * s, p[1] + nn[1] * s]); }
  }
  for (const d of fills.slice(0, -1)) for (const q of polyOf(d, 16)) ink.push(...q);
  return { ink, stars };
}
const air = (S, ink) => { let a = Infinity; for (const p of ink) a = Math.min(a, distTo(p, S)); return a; };
const box = (ink, polys) => { let b = [99, 99, -99, -99]; for (const p of ink) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]; for (const q of polys) for (const p of q) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]; return b.map((v, i) => +(i < 2 ? v : 24 - v).toFixed(2)); };
for (const n of process.argv.slice(3)) {
  const R = scene(n, 'regular'), Sh = scene(n, 'sharp');
  const polysOf = (list, sharp) => list.map((s) => [polyOf(sharp ? sharpStar(s.c, s.R) : star(s.c, s.R), 16)[0]]);
  const evalStars = (list) => {
    const pr = polysOf(list, false), ps = polysOf(list, true);
    const ar = pr.map((S) => air(S, R.ink)), as = ps.map((S) => air(S, Sh.ink));
    let ss = Infinity; for (const p of pr[1][0]) ss = Math.min(ss, distTo(p, pr[0]));
    const inside = list.every((s) => s.c[0] - s.R >= 1 - 1e-6 && s.c[1] - s.R >= 1 - 1e-6 && s.c[0] + s.R <= 23 + 1e-6 && s.c[1] + s.R <= 23 + 1e-6);
    return { ar, as, ss, inside, pads: box(R.ink, pr.map((x) => x[0])) };
  };
  const now = evalStars(R.stars);
  const out = [`${n}: now air ${now.ar.map((v) => v.toFixed(2))} sharp ${now.as.map((v) => v.toFixed(2))} apart ${now.ss.toFixed(2)} pads ${now.pads}`];
  const opts = [];
  const steps = [0, -0.5, 0.5, -1, 1, -1.5, 1.5];
  for (let i = 0; i < 2; i++) for (const dR of [0, -0.5]) for (const dx of steps) for (const dy of steps) {
    if (!dx && !dy && !dR) continue;
    const list = R.stars.map((s, j) => (j === i ? { c: [s.c[0] + dx, s.c[1] + dy], R: s.R + dR } : s));
    const e = evalStars(list);
    const ok = e.ar.every((a) => a >= 1.995) && e.as.every((a) => a >= 1.995 - 0.414) && e.ss >= 1.995 && e.inside;
    if (!ok) continue;
    const padsSame = e.pads.every((v, k) => Math.abs(v - now.pads[k]) < 0.01);
    opts.push({ star: i, v: [dx, dy], dR, cost: Math.hypot(dx, dy) + (dR ? 1.2 : 0) + (padsSame ? 0 : 2), e });
  }
  opts.sort((a, b) => a.cost - b.cost);
  for (const o of opts.slice(0, 3)) out.push(`   move star${o.star + 1} by ${o.v}${o.dR ? ` R${o.dR}` : ''}: air ${o.e.ar.map((v) => v.toFixed(2))} sharp ${o.e.as.map((v) => v.toFixed(2))} apart ${o.e.ss.toFixed(2)} pads ${o.e.pads}`);
  if (!opts.length) out.push('   no single-star move within 1.5 clears it');
  console.log(out.join('\n'));
}
