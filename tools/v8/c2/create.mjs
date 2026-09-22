// node create.mjs <buildDir> <out.js> name@x,y ... : a use_figma body that creates these sets
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out, ...items] = process.argv.slice(2);
const D = [], idx = new Map(), SETS = {}, AT = {};
const ref = (d) => { if (!idx.has(d)) { idx.set(d, D.length); D.push(d); } return idx.get(d); };
for (const it of items) {
  const [name, at] = it.split('@'); AT[name] = at.split(',').map(Number); SETS[name] = {};
  for (const c of ['regular', 'sharp']) for (const s of ['stroke', 'two-tone', 'duotone', 'fill']) {
    const svg = readFileSync(join(dir, 'raw', name, `Container=regular, Style=${s}, Corners=${c}.svg`), 'utf8');
    SETS[name][`${s}|${c}`] = [...svg.matchAll(/<path([^>]*)>/g)].map((m) => {
      const a = m[1], d = a.match(/ d="([^"]+)"/)[1], stroke = / stroke="black"/.test(a);
      const op = +((a.match(stroke ? /stroke-opacity="([\d.]+)"/ : /fill-opacity="([\d.]+)"/) || [])[1] ?? 1);
      return [stroke ? 's' : 'f', ref(d), op, /evenodd/.test(a) ? 1 : 0];
    });
  }
}
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const data = JSON.stringify({ D, SETS, AT });
const body = `const DATA = ${data};\nconst EXPECT = '${fnv(data)}';\n` + readFileSync(new URL('./create-body.js', import.meta.url), 'utf8');
new Function('figma', `return (async () => { ${body} })`);
writeFileSync(out, body);
console.log(out, (body.length / 1024).toFixed(1) + 'KB');
