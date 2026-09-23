// The batch sheet he approves from: before, then stroke, two-tone and sharp at 8 and 5.
//   node sheet.mjs <beforeRaw> <afterRaw> <out.html> <title> names...
//   <beforeRaw>: a raw/ copy from git HEAD (git archive HEAD raw/<n> | tar -x -C DIR)
// PNG: Chrome --headless=new --screenshot=out.png --window-size=1000,<rows x 180 + 80> file://out.html
import { readFileSync, writeFileSync } from 'node:fs';
const [before, after, out, title, ...names] = process.argv.slice(2);
const inner = (dir, n, s, c) => readFileSync(`${dir}/${n}/Container=regular, Style=${s}, Corners=${c}.svg`, 'utf8').replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '');
const svg = (b, px) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none">${b}</svg>`;
const cell = (b, cap) => `<div class="v"><div class="pair">${svg(b, 72)}${svg(b, 24)}</div><div class="k">${cap}</div></div>`;
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;font:12px -apple-system,sans-serif;color:#111}.w{padding:24px;width:980px}h1{font-size:18px;margin:0 0 14px}.r{display:flex;gap:10px;align-items:center;background:#f5f5f5;border-radius:12px;padding:10px;margin-bottom:10px}.n{width:150px;font:12px ui-monospace,Menlo,monospace;color:#444}.v{background:#fff;border-radius:8px;padding:8px}.pair{display:flex;align-items:flex-end;gap:10px}.k{font-size:10px;color:#999;margin-top:4px}.sep{width:1px;align-self:stretch;background:#ddd}</style><div class=w><h1>${title}</h1>${names.map((n) => `<div class=r><div class=n>${n}</div>${cell(inner(before, n, 'stroke', 'regular'), 'before')}<div class=sep></div>${cell(inner(after, n, 'stroke', 'regular'), 'stroke')}${cell(inner(after, n, 'two-tone', 'regular'), 'two-tone')}${cell(inner(after, n, 'stroke', 'sharp'), 'sharp')}</div>`).join('')}</div>`;
writeFileSync(out, html);
