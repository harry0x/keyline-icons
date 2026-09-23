// Sharp may not break what the rounded drawing keeps whole. For every seated compound
// (spec.json and spec-s*.json) and every grown one (grown.json, grown-s*.json), count the
// breaks the stars made (a run past the first, a loop opened) in each corner; FLAG when
// sharp has more. The seat solver applies the same test; this re-checks what is in raw/.
//   node tools/v8/c2/breaks.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const C = `${ROOT}/tools/v8/c2`;
const spec = Object.assign({}, ...readdirSync(C).filter((f) => /^spec(-s\d+)?\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(`${C}/${f}`, 'utf8'))));
const grown = readdirSync(C).filter((f) => /^grown(-s\d+)?\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(`${C}/${f}`, 'utf8')));
const CONTAINER = { 'circle-trending-up': ['trending-up', 'circle'] };
const strokeD = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).filter((t) => / stroke="(?!none)/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
const br = (d) => (d.match(/M/g) || []).length - (d.match(/Z/gi) || []).length;
const f = (box, c) => `Container=${box}, Style=stroke, Corners=${c}.svg`;
const rows = []; let flags = 0;
const check = (name, ref) => {
  const file = `${ROOT}/raw/${name}-sparkles/${f('regular', 'regular')}`; if (!existsSync(file)) return;
  const cur = (c) => readFileSync(`${ROOT}/raw/${name}-sparkles/${f('regular', c)}`, 'utf8');
  const dr = br(strokeD(cur('regular'))) - br(strokeD(ref('regular'))), ds = br(strokeD(cur('sharp'))) - br(strokeD(ref('sharp')));
  if (ds > dr) flags++;
  rows.push(`${ds > dr ? 'FLAG' : 'ok  '} ${name.padEnd(30)} breaks: regular ${dr}, sharp ${ds}`);
};
for (const [n, s] of Object.entries(spec)) {
  if (s.skip || grown.includes(`${n}-sparkles`)) continue;
  const [b, box] = CONTAINER[n] || [n, 'regular'];
  check(n, (c) => readFileSync(`${ROOT}/raw/${b}/${f(box, c)}`, 'utf8'));
}
for (const g of [...new Set(grown)]) check(g.replace(/-sparkles$/, ''), (c) => execSync(`git -C "${ROOT}" show HEAD:"raw/${g}/${f('regular', c)}"`, { encoding: 'utf8' }));
console.log(rows.sort().join('\n') + `\n${flags ? `${flags} FLAGGED` : 'all clear'}`);
