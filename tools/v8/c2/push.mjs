// node push.mjs <buildDir> <spec.json> <outDir> <perCall> : use_figma bodies that create the sets, plus expected signatures
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WAIST } from '../halo.mjs';
const [dir, specFile, out, per] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
// his star and its sharp form, as the constants the two generators use (read from their source, not retyped)
const starSrc = readFileSync(new URL('../star.mjs', import.meta.url), 'utf8');
const Q = eval('(' + starSrc.match(/const Q = (\[[\s\S]*?\n\]);/)[1] + ')');
const START = eval(starSrc.match(/const START = (\[[^\]]+\]);/)[1]);
const haloSrc = readFileSync(new URL('../halo.mjs', import.meta.url), 'utf8');
const T1 = eval(haloSrc.match(/const T1 = (\[[^\]]+\]);/)[1]), T2 = eval(haloSrc.match(/const T2 = (\[[^\]]+\]);/)[1]);
const TIP = eval('(' + haloSrc.match(/const TIP = (\[[\s\S]*?\n  \]);/)[1] + ')');
const STAR = { Q, START, T1, T2, WAIST, TIP };
const BODY = readFileSync(new URL('./push-body.js', import.meta.url), 'utf8');
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const dOf = (t) => t.match(/ d="([^"]+)"/)[1];
const names = readdirSync(join(dir, 'raw')).filter((n) => n.endsWith('-sparkles')).sort();
const items = names.map((n, i) => {
  const base = n.replace(/-sparkles$/, ''), s = spec[base];
  const it = { name: n, at: [(i % 10) * 256, -2256 + Math.floor(i / 10) * 152], stars: [s.lead, s.small] };
  for (const c of ['regular', 'sharp']) {
    const T = tags(readFileSync(join(dir, 'raw', n, `Container=regular, Style=two-tone, Corners=${c}.svg`), 'utf8'));
    const strokesT = T.filter((t) => / stroke="black"/.test(t)), fillsT = T.filter((t) => !/ stroke="black"/.test(t));
    it[c] = { grey: strokesT.filter((t) => /stroke-opacity/.test(t)).map(dOf).join(''), black: strokesT.filter((t) => !/stroke-opacity/.test(t)).map(dOf).join(''), dots: fillsT.slice(0, -2).map(dOf).join('') };
  }
  return it;
});
// expected: signatures of the local files, with the same function the body uses
const lib = new Function(BODY.slice(BODY.indexOf('function pts'), BODY.indexOf('const COL')) + '; return { sig };')();
const expect = {};
for (const n of names) { expect[n] = {}; for (const c of ['regular', 'sharp']) for (const st of ['stroke', 'two-tone', 'duotone', 'fill']) expect[n][`Style=${st}, Corners=${c}`] = lib.sig(readFileSync(join(dir, 'raw', n, `Container=regular, Style=${st}, Corners=${c}.svg`), 'utf8').replace(/\n/g, '')); }
writeFileSync(join(out, 'expect.json'), JSON.stringify(expect));
writeFileSync(join(out, 'items.json'), JSON.stringify(items.map((i) => [i.name, i.at])));
for (let k = 0; k * per < items.length; k++) {
  const code = `const STAR = ${JSON.stringify(STAR)};\nconst ITEMS = ${JSON.stringify(items.slice(k * per, (k + 1) * per))};\n${BODY}`;
  new Function('figma', `return (async () => { ${code} })`);
  writeFileSync(join(out, `call-${k + 1}.js`), code);
  console.log(`call-${k + 1}.js`, code.length, items.slice(k * per, (k + 1) * per).map((i) => i.name.replace('-sparkles', '')).join(' '));
}
