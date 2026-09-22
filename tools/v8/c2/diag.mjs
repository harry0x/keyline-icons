// Diagnostic sheet for his sparkle drawings: base ghost (pink), his drawing, and a red
// segment + ring at every place a star comes nearer than 2 painted units to other ink.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { shiftOf } from '../c1/build.mjs';
import { baseOf, translate } from '../c1/kit.mjs';
import { polyOf, distTo } from './cutter.mjs';
const [RAW, outFile, ...names] = process.argv.slice(2);
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const NOTE = JSON.parse(readFileSync('diag-notes.json', 'utf8'));
const P = (d, step = 0.05) => polyOf(d, 48).flatMap((q) => { const o = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(q.at(-1)); return o; });
const grid = Array.from({ length: 25 }, (_, i) => `<path d="M${i} 0V24M0 ${i}H24" stroke="${i % 12 === 0 ? '#ddd' : '#f0f0f0'}" stroke-width="0.05"/>`).join('');
let h = '<body style="margin:0;padding:14px;background:#f2f2f2;font:12px -apple-system,sans-serif;color:#333"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
for (const n of names) {
  const f = `${RAW}/${n}-sparkles/Container=regular, Style=stroke, Corners=regular.svg`;
  const svg = readFileSync(f, 'utf8');
  const tags = svg.match(/<path[^>]*>/g);
  const sD = tags.filter((t) => / stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  const fills = tags.filter((t) => !/ stroke="black"/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]);
  const stars = fills.at(-1).match(/M[^M]+/g), dots = fills.slice(0, -1).join('');
  let v = [0, 0]; try { v = shiftOf(`${n}-sparkles`)?.v || [0, 0]; } catch {}
  const bf = `${ROOT}/raw/${baseOf(n + '-sparkles')}/Container=regular, Style=stroke, Corners=regular.svg`;
  const ghost = existsSync(bf) ? [...readFileSync(bf, 'utf8').matchAll(/<path[^>]*>/g)].map((m) => m[0].replace(/ d="([^"]+)"/, (x, d) => ` d="${translate(d, v)}"`).replace(/"black"/g, '"#f7a8a8"')).join('') : '';
  // near misses: for each star, the closest ink point
  const marks = [];
  const line = sD ? P(sD) : [], dotP = dots ? P(dots) : [];
  const SP = stars.map((d) => [polyOf(d, 24)[0]]);
  SP.forEach((S, i) => {
    let best = null;
    for (const p of line) { const a = distTo(p, S) - 1; if (!best || a < best.a) best = { a, p }; }
    for (const p of dotP) { const a = distTo(p, S); if (!best || a < best.a) best = { a, p }; }
    if (best && best.a < 1.98) marks.push(`<circle cx="${best.p[0]}" cy="${best.p[1]}" r="1.6" fill="none" stroke="#e11" stroke-width="0.25"/><text x="${Math.min(20.5, Math.max(0.5, best.p[0] + 1.2))}" y="${best.p[1] - 1.4}" font-size="1.5" fill="#e11" font-family="sans-serif">${best.a.toFixed(2)}</text>`);
  });
  const his = svg.replace(/<svg[^>]*>|<\/svg>/g, '').replace(/"black"/g, '"#111"');
  h += `<div style="background:#fff;border-radius:10px;padding:10px"><svg width="100%" viewBox="0 0 24 24" fill="none" style="max-width:260px;display:block;margin:auto">${grid}${ghost}<g opacity="0.9">${his}</g>${marks.join('')}</svg><div style="margin-top:6px"><b>${n}</b><br>${NOTE[n] || ''}</div></div>`;
}
writeFileSync(outFile, h + '</div></body>');
