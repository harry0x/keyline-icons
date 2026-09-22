// Close review: base ghost + regular stroke at 120px on the grid, sharp beside, per compound.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { baseFile } from './build.mjs';
const [dir, outFile, from = 0, to = 999] = process.argv.slice(2);
const names = readdirSync(dir).filter((n) => n.endsWith('-sparkles')).sort().slice(+from, +to);
const grid = Array.from({ length: 25 }, (_, i) => `<path d="M${i} 0V24M0 ${i}H24" stroke="${i % 12 === 0 ? '#ccc' : '#eee'}" stroke-width="0.05"/>`).join('');
const inner = (s) => s.replace(/<svg[^>]*>|<\/svg>/g, '');
let h = '<body style="margin:0;padding:8px;background:#ddd;font:11px sans-serif"><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px">';
for (const n of names) {
  const b = n.replace(/-sparkles$/, '');
  const ghost = inner(readFileSync(baseFile(b, 'stroke', 'regular'), 'utf8')).replace(/"black"/g, '"#f88"');
  for (const c of ['regular', 'sharp']) {
    const s = inner(readFileSync(`${dir}/${n}/Container=regular, Style=stroke, Corners=${c}.svg`, 'utf8'));
    h += `<div style="background:#fff;padding:3px;text-align:center"><svg width="130" height="130" viewBox="0 0 24 24" fill="none">${grid}${c === 'regular' ? ghost : ''}<g opacity="0.85">${s}</g></svg><div>${b} ${c === 'sharp' ? '(sharp)' : ''}</div></div>`;
  }
}
writeFileSync(outFile, h + '</div></body>');
