/**
 * Review sheet for a C1 build: per icon, his ref, then regular stroke,
 * two-tone, duotone, fill and the same in sharp, at 40 px, two icons a row.
 *
 *   node tools/v8/c1/review.mjs <buildDir> <out.png> [names...]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, REFS, refOf } from './kit.mjs';
const [dir, png, ...only] = process.argv.slice(2);
const names = only.length ? only : readdirSync(join(dir, 'raw')).sort();
const PX = +(process.env.PX || 40);
const cell = (svg) => svg.replace(/width="24" height="24"/, `width="${PX}" height="${PX}"`);
const file = (n, s, c) => join(dir, 'raw', n, `Container=regular, Style=${s}, Corners=${c}.svg`);
let body = '';
for (const n of names) {
  const ref = readFileSync(join(REFS, `${refOf(n)}.svg`), 'utf8');
  const cells = [cell(ref), '<i></i>'];
  for (const c of ['regular', 'sharp']) { for (const s of ['stroke', 'two-tone', 'duotone', 'fill']) cells.push(existsSync(file(n, s, c)) ? cell(readFileSync(file(n, s, c), 'utf8')) : '<b>?</b>'); if (c === 'regular') cells.push('<i></i>'); }
  body += `<div class="ic"><div class="n">${n.replace('-sparkles', '')}</div><div class="c">${cells.join('')}</div></div>`;
}
const css = `body{margin:0;padding:14px;background:#e9e9e9;font:11px -apple-system,Helvetica,sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ic{background:#fff;border-radius:8px;padding:6px 10px}.n{color:#666;margin-bottom:3px}.c{display:flex;gap:6px;align-items:center}i{width:10px}b{width:${PX}px;color:#d33}`;
const html = png.replace(/\.png$/, '.html');
writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`);
const rows = Math.ceil(names.length / 2);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--screenshot=${png}`, `--window-size=1320,${40 + rows * (PX + 34)}`, '--hide-scrollbars', `file://${html}`], { stdio: 'ignore' });
console.log(png);
