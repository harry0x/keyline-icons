// Check every built compound against his rules: painted air >= 2 between each
// star and the rest (and between the stars), star ink inside 1..23, ink box
// paddings whole and balanced, and no surviving run shorter than a stroke.
import { readFileSync, readdirSync } from 'node:fs';
import { parse, at } from '../cut.mjs';
import { polyOf, distTo } from './cutter.mjs';
const dir = process.argv[2];
const P = (d, step = 0.05) => polyOf(d, 48).flatMap((q) => { const o = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(q.at(-1)); return o; });
const runLen = (d) => polyOf(d, 48).reduce((a, q) => a + q.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0);
const rows = [];
for (const n of readdirSync(dir).filter((n) => n.endsWith('-sparkles')).sort()) for (const c of ['regular', 'sharp']) {
  const svg = readFileSync(`${dir}/${n}/Container=regular, Style=stroke, Corners=${c}.svg`, 'utf8');
  const tags = svg.match(/<path[^>]*>/g);
  const sD = tags.filter((t) => / stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  const fills = tags.filter((t) => !/ stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]);
  const stars = fills.at(-1).match(/M[^M]+/g).map((d) => [polyOf(d, 24)[0]]);
  const dots = fills.slice(0, -1).join('');
  const line = sD ? P(sD) : [], dotP = dots ? polyOf(dots, 24) : [];
  const issues = [];
  // painted ink: round caps paint a disc round the centre line; butt caps (sharp) paint only across it
  const inkPts = [];
  if (c === 'sharp' && sD) for (const q of polyOf(sD, 48)) {
    const dense = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05)); for (let k = 0; k < n; k++) dense.push({ p: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], t: [b[0] - a[0], b[1] - a[1]] }); }
    dense.push({ p: q.at(-1), t: [q.at(-1)[0] - q.at(-2)[0], q.at(-1)[1] - q.at(-2)[1]] });
    for (const { p, t } of dense) { const l = Math.hypot(...t) || 1, n = [-t[1] / l, t[0] / l]; for (const s of [-1, -0.5, 0, 0.5, 1]) inkPts.push([p[0] + n[0] * s, p[1] + n[1] * s]); }
    for (let i = 1; i < q.length - 1; i++) for (let k = 0; k < 16; k++) inkPts.push([q[i][0] + Math.cos(k * Math.PI / 8), q[i][1] + Math.sin(k * Math.PI / 8)]);
  }
  stars.forEach((S, i) => {
    let a = Infinity;
    if (c === 'sharp') for (const p of inkPts) a = Math.min(a, distTo(p, S)); else for (const p of line) a = Math.min(a, distTo(p, S) - 1);
    for (const q of dotP) for (const p of q) a = Math.min(a, distTo(p, S));
    if (a < 2 - 0.02) issues.push(`star${i + 1} air ${a.toFixed(2)}`);
    const xs = S[0].map((p) => p[0]), ys = S[0].map((p) => p[1]);
    if (Math.min(...xs) < 1 - 1e-6 || Math.min(...ys) < 1 - 1e-6 || Math.max(...xs) > 23 + 1e-6 || Math.max(...ys) > 23 + 1e-6) issues.push(`star${i + 1} outside 1..23`);
  });
  let ss = Infinity; for (const p of stars[1][0]) ss = Math.min(ss, distTo(p, stars[0])); if (ss < 2 - 0.02) issues.push(`stars ${ss.toFixed(2)} apart`);
  for (const r of sD ? sD.match(/M[^M]+/g) : []) if (runLen(r) < 1.5) issues.push(`crumb ${runLen(r).toFixed(2)}`);
  // ink box (strokes padded by 1, dots and stars by their outline)
  let b = [99, 99, -99, -99]; const grow = (p, r) => { b = [Math.min(b[0], p[0] - r), Math.min(b[1], p[1] - r), Math.max(b[2], p[0] + r), Math.max(b[3], p[1] + r)]; };
  if (c === 'regular') for (const p of line) grow(p, 1);
  else for (const q of polyOf(sD, 48)) for (let i = 0; i < q.length; i++) {
    // butt caps: the band across the line at every sample, a disc only at interior joins
    const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...t) || 1, n = [-t[1] / l, t[0] / l];
    grow([q[i][0] + n[0], q[i][1] + n[1]], 0); grow([q[i][0] - n[0], q[i][1] - n[1]], 0);
    if (i > 0 && i < q.length - 1) grow(q[i], 1);
  }
  for (const q of dotP) for (const p of q) grow(p, 0); for (const S of stars) for (const p of S[0]) grow(p, 0);
  const pads = [b[0], b[1], 24 - b[2], 24 - b[3]].map((v) => +v.toFixed(2));
  rows.push({ n, c, issues, pads, ss: +ss.toFixed(2) });
}
for (const r of rows) console.log(r.n.replace('-sparkles', '').padEnd(24), r.c.padEnd(8), `pads ${r.pads.join('/')}`.padEnd(24), r.issues.join(', ') || 'ok');
