/**
 * His stroke drawing against the build's, one over the other: his in red, the
 * build's in blue, both translucent, so ink only one side has shows in its
 * colour and shared ink goes purple. For signing off changes to his lines.
 *
 *   node tools/v8/c1/overlay.mjs <buildDir> <out.png> names...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, REFS, refOf } from './kit.mjs';
const [dir, png, ...names] = process.argv.slice(2);
const paths = (svg, colour) => [...svg.matchAll(/<path([^>]*)>/g)].map((m) => {
  const a = m[1], d = a.match(/ d="([^"]+)"/)[1];
  return / stroke="black"/.test(a)
    ? `<path d="${d}" stroke="${colour}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    : `<path d="${d}" fill="${colour}" fill-opacity="0.55"${/evenodd/.test(a) ? ' fill-rule="evenodd"' : ''}/>`;
}).join('');
let body = '';
for (const n of names) {
  const his = readFileSync(join(REFS, `${refOf(n)}.svg`), 'utf8');
  const mine = readFileSync(join(dir, 'raw', n, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8');
  body += `<div><svg width="220" height="220" viewBox="0 0 24 24">${paths(his, '#e11')}${paths(mine, '#06f')}</svg><br>${n.replace('-sparkles', '')}</div>`;
}
const html = png.replace(/\.png$/, '.html');
writeFileSync(html, `<!doctype html><style>body{margin:12px;background:#eee;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:10px}div{background:#fff;padding:6px;text-align:center}</style>${body}`);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--screenshot=${png}`, `--window-size=1200,${260 * Math.ceil(names.length / 5) + 30}`, '--hide-scrollbars', `file://${html}`], { stdio: 'ignore' });
console.log(png);
