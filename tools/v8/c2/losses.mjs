// What each of his drawings kept of its shipped base: parts lost, closed shapes opened.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { shiftOf } from '../c1/build.mjs';
import { baseOf, translate } from '../c1/kit.mjs';
import { parse } from '../cut.mjs';
import { polyOf } from './cutter.mjs';
const RAW = process.argv[2], ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const pts = (d, step = 0.2) => polyOf(d, 32).flatMap((q) => { const o = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return o; });
const len = (d) => polyOf(d, 32).reduce((a, q) => a + q.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0);
for (const n of readdirSync(RAW).filter((n) => n.endsWith('-sparkles')).sort()) {
  let v = null; try { v = shiftOf(n)?.v; } catch {}
  const bf = `${ROOT}/raw/${baseOf(n)}/Container=regular, Style=stroke, Corners=regular.svg`;
  if (!existsSync(bf)) continue;
  const his = [...readFileSync(`${RAW}/${n}/Container=regular, Style=stroke, Corners=regular.svg`, 'utf8').matchAll(/<path[^>]*stroke="black"[^>]*>/g)].map((m) => m[0].match(/ d="([^"]+)"/)[1]).join('');
  const H = pts(his, 0.1);
  const base = [...readFileSync(bf, 'utf8').matchAll(/<path[^>]*>/g)].map((m) => m[0]).filter((t) => / stroke="(?!none)/.test(t)).map((t) => translate(t.match(/ d="([^"]+)"/)[1], v || [0, 0])).join('');
  const notes = [];
  for (const sp of base.match(/M[^M]+/g) || []) {
    const P = pts(sp), kept = P.filter((p) => H.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.2)).length / P.length;
    const closed = parse(sp)[0].closed, L = len(sp);
    if (kept < 0.6) notes.push(`part of ${L.toFixed(1)} keeps ${(kept * 100).toFixed(0)}%`);
    else if (closed && kept < 0.97 && L < 36) notes.push(`closed shape of ${L.toFixed(1)} opened (${(kept * 100).toFixed(0)}% kept)`);
  }
  if (!v) notes.push('not a shifted base (redrawn)');
  if (notes.length) console.log(n.replace('-sparkles', '').padEnd(20), notes.join('; '));
}
