/**
 * Figma payloads for a C1 build: per set, the four regular variants are
 * swapped in place (component ids, so Catalog instances, survive) and the four
 * sharp variants created or swapped, laid out as the file does (regular row at
 * y 16, sharp at 64, columns 16/64/112/160, set 200 x 104). Path strings are
 * sent once in a dictionary; the body checks its own checksum, then exports
 * every variant it touched and compares the point sets with what it was sent,
 * returning only differences. A name that is not a set on the page, or is
 * pen-sparkles (a SHIPPED set), throws before anything is written.
 *
 *   node tools/v8/c1/push.mjs <buildDir> <outDir> <perCall> names...
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out, per, ...names] = process.argv.slice(2);
if (names.includes('pen-sparkles')) throw new Error('pen-sparkles is a shipped set');
mkdirSync(out, { recursive: true });
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const STYLES = ['stroke', 'two-tone', 'duotone', 'fill'];
const BODY = readFileSync(new URL('./push-body.js', import.meta.url), 'utf8');
for (let k = 0; k * per < names.length; k++) {
  const group = names.slice(k * per, (k + 1) * per);
  const D = [], idx = new Map();
  const ref = (d) => { if (!idx.has(d)) { idx.set(d, D.length); D.push(d); } return idx.get(d); };
  const SETS = {};
  for (const n of group) {
    SETS[n] = {};
    for (const c of ['regular', 'sharp']) for (const s of STYLES) {
      const svg = readFileSync(join(dir, 'raw', n, `Container=regular, Style=${s}, Corners=${c}.svg`), 'utf8');
      // [kind, d index, opacity, evenodd]  kind: s stroke, f fill
      SETS[n][`${s}|${c}`] = [...svg.matchAll(/<path([^>]*)>/g)].map((m) => {
        const a = m[1], d = a.match(/ d="([^"]+)"/)[1];
        const stroke = / stroke="black"/.test(a);
        const op = +((a.match(stroke ? /stroke-opacity="([\d.]+)"/ : /fill-opacity="([\d.]+)"/) || [])[1] ?? 1);
        return [stroke ? 's' : 'f', ref(d), op, /evenodd/.test(a) ? 1 : 0];
      });
    }
  }
  const data = JSON.stringify({ D, SETS });
  const body = `const DATA = ${data};\nconst EXPECT = '${fnv(data)}';\n${BODY}`;
  new Function('figma', `return (async () => { ${body} })`); // syntax check
  const f = join(out, `push-${String(k + 1).padStart(2, '0')}.js`);
  writeFileSync(f, body);
  console.log(f, (body.length / 1024).toFixed(1) + 'KB', group.join(' '));
}
