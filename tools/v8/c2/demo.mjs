// Demo sheet: per compound, the shipped base, then stroke and two-tone in both corners, and real sizes.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { baseFile } from './build.mjs';
const [dir, outFile, from = 0, to = 999] = process.argv.slice(2);
const names = readdirSync(dir).filter((n) => n.endsWith('-sparkles')).sort().slice(+from, +to);
const rd = (n, s, c) => readFileSync(`${dir}/${n}/Container=regular, Style=${s}, Corners=${c}.svg`, 'utf8');
const sized = (svg, px, col = '#111') => svg.replace(/width="24" height="24"/, `width="${px}" height="${px}"`).replace(/"black"/g, `"${col}"`);
let h = `<body style="margin:0;padding:14px;background:#f2f2f2;font:11px -apple-system,sans-serif;color:#666">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">`;
for (const n of names) {
  const b = n.replace(/-sparkles$/, '');
  h += `<div style="background:#fff;border-radius:10px;padding:10px 10px 8px">
  <div style="display:flex;gap:8px;align-items:center">
    <div style="opacity:.35">${sized(readFileSync(baseFile(b, 'stroke', 'regular'), 'utf8'), 40)}</div>
    ${sized(rd(n, 'stroke', 'regular'), 56)}${sized(rd(n, 'two-tone', 'regular'), 56)}
    <span style="width:1px;height:44px;background:#eee"></span>
    ${sized(rd(n, 'stroke', 'sharp'), 56)}${sized(rd(n, 'two-tone', 'sharp'), 56)}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
    <span>${b}</span><span style="display:flex;gap:6px">${sized(rd(n, 'stroke', 'regular'), 24)}${sized(rd(n, 'stroke', 'regular'), 16)}${sized(rd(n, 'two-tone', 'regular'), 24)}</span>
  </div></div>`;
}
writeFileSync(outFile, h + '</div></body>');
