// Figma read-back for a swap: prints use_figma plugin code that exports every variant of
// the named sets and compares a geometry hash with the local raw files (fill rule included,
// so a star left evenodd by the swap tool shows as a mismatch; set star vectors NONZERO).
//   node figma-hash.mjs <dir holding only the <name>-sparkles folders to check> <chunk> <chunks>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ci, cn] = process.argv.slice(2);
const HASH = String.raw`
function pts(d, out) {
  const t = d.match(/[MLCHVZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || []; let i = 0, c, cur = [0, 0], st = [0, 0]; const n = () => +t[i++];
  const add = (p) => out.add(p.map((v) => { const r = (Math.round(v * 100) / 100).toFixed(2); return r === '-0.00' ? '0.00' : r; }).join(','));
  while (i < t.length) {
    if (/^[MLCHVZ]$/i.test(t[i])) c = t[i++].toUpperCase();
    if (c === 'M') { cur = [n(), n()]; st = cur; add(cur); c = 'L'; }
    else if (c === 'L') { cur = [n(), n()]; add(cur); }
    else if (c === 'H') { cur = [n(), cur[1]]; add(cur); }
    else if (c === 'V') { cur = [cur[0], n()]; add(cur); }
    else if (c === 'C') { const a = [n(), n()], b = [n(), n()], e = [n(), n()]; add(a); add(b); add(e); cur = e; }
    else if (c === 'Z') { cur = st; }
    else i++;
  }
}
function sig(svg) {
  const groups = {};
  for (const m of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const a = {}; for (const x of m[1].matchAll(/([a-z-]+)="([^"]*)"/g)) a[x[1]] = x[2];
    const k = ['f=' + (a.fill || 'none'), 'fo=' + (+(a['fill-opacity'] || 1)).toFixed(2), 's=' + (a.stroke || 'none'), 'so=' + (+(a['stroke-opacity'] || 1)).toFixed(2), 'sw=' + (a['stroke-width'] || ''), 'cap=' + (a.stroke ? (a['stroke-linecap'] || 'butt') : ''), 'fr=' + (a['fill-rule'] || 'nonzero')].join('|');
    (groups[k] ||= new Set()); pts(a.d || '', groups[k]);
  }
  return Object.keys(groups).sort().map((k) => k + ':' + [...groups[k]].sort().join(';')).join('#');
}
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };`;
const { sig, fnv } = new Function(`${HASH}; return { sig, fnv };`)();
const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
const lo = Math.floor(names.length * ci / cn), hi = Math.floor(names.length * (+ci + 1) / cn);
const WANT = {};
for (const n of names.slice(lo, hi)) {
  const rows = [];
  for (const f of readdirSync(join(dir, n)).filter((f) => f.endsWith('.svg'))) rows.push(f.slice(0, -4) + '=' + fnv(sig(readFileSync(join(dir, n, f), 'utf8'))));
  WANT[n] = fnv(rows.sort().join('|'));
}
console.log(`const WANT = ${JSON.stringify(WANT)};
${HASH}
const page = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
if (figma.currentPage.name !== 'Components') return 'wrong page';
const byName = new Map(); const dup = [];
for (const n of figma.currentPage.children) if (n.type === 'COMPONENT_SET' && WANT[n.name]) { if (byName.has(n.name)) dup.push(n.name); byName.set(n.name, n); }
const report = {}; let checked = 0;
for (const [name, want] of Object.entries(WANT)) {
  const set = byName.get(name), bad = [];
  if (!set) { report[name] = 'missing'; continue; }
  const rows = [];
  for (const v of set.children) {
    const tag = v.name.replace('Container=', '').replace('Style=', '').replace('Corners=', '');
    const svg = await v.exportAsync({ format: 'SVG_STRING' }); checked++;
    rows.push(v.name + '=' + fnv(sig(svg)));
    const sharp = v.name.endsWith('sharp');
    for (const k of v.children) {
      const stroked = Array.isArray(k.strokes) && k.strokes.length > 0;
      if (stroked && (k.strokeJoin !== 'ROUND' || k.strokeWeight !== 2)) bad.push(tag + ' ' + k.name + ' join/weight ' + k.strokeJoin + '/' + k.strokeWeight);
      if (stroked && k.strokeAlign !== 'CENTER' && k.name !== 'Container') bad.push(tag + ' ' + k.name + ' align ' + k.strokeAlign);
      if (k.constraints && (k.constraints.horizontal !== 'SCALE' || k.constraints.vertical !== 'SCALE')) bad.push(tag + ' ' + k.name + ' constraints');
    }
  }
  if (fnv(rows.sort().join('|')) !== want) bad.push('SET HASH ' + rows.length + ' variants: ' + rows.join(' '));
  if (bad.length) report[name] = bad;
}
return { sets: Object.keys(WANT).length, checked, dup, bad: report };`);
