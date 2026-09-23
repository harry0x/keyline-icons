// Which sparkle compounds still wait for the 8 and 5 stars: the star sizes in each
// raw/*-sparkle(s) stroke drawing, lead first. At 8 and 5 it is done; 8 and 4 only where he
// took the 4 x 4 fallback (FOUR below; add a name when he does).
//   node tools/v8/c2/left.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { polyOf } from './cutter.mjs';
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const bbox = (d) => { const P = polyOf(d, 24).flat(); const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const isStar = (sp) => { const c = (sp.match(/C/g) || []).length, l = (sp.match(/L/g) || []).length; const b = bbox(sp); return (c === 12 || c === 8) && l === 8 && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.02 && b[2] - b[0] > 1.5; };
// his shipped compounds and the bare glyphs keep their own stars
const OWN = new Set(['message-sparkle', 'message-square-sparkle', 'pen-sparkles', 'sparkle', 'sparkles']);
const FOUR = new Set(['chart-column-sparkles', 'eraser-sparkles', 'film-sparkles']);
const left = [];
for (const n of readdirSync(`${ROOT}/raw`).filter((n) => /sparkles?$/.test(n) && !OWN.has(n)).sort()) {
  const f = `${ROOT}/raw/${n}/Container=regular, Style=stroke, Corners=regular.svg`; if (!existsSync(f)) continue;
  const ds = [...readFileSync(f, 'utf8').matchAll(/<path[^>]*>/g)].map((m) => m[0]).filter((t) => !/ stroke="(?!none)/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  const s = (ds.match(/M[^M]+/g) || []).filter(isStar).map((sp) => { const b = bbox(sp); return +(b[2] - b[0]).toFixed(1); }).sort((a, b) => b - a);
  if (!(s[0] >= 7.9 && s.slice(1).every((v) => v === 5 || (v === 4 && FOUR.has(n))))) left.push(`${n} ${s.join('/')}`);
}
console.log(`${left.length} left\n${left.join('\n')}`);
