/**
 * A read-only Figma check that costs almost nothing to send: per variant, a
 * hash of its point set (every node and control point, H/V expanded, rounded
 * to 2dp, sorted, deduplicated) computed here from the build and there from
 * the variant's own export. Also reads caps, joins, alignment, constraints,
 * layer names and plate opacity. Returns only what differs.
 *
 *   node tools/v8/c1/verify.mjs <buildDir> names... > verify.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...names] = process.argv.slice(2);
const PTS = `function pts(d) {
  const t = d.match(/[MLCHVZ]|-?\\d*\\.?\\d+(?:e-?\\d+)?/gi) || []; let i = 0, c, cur = [0, 0], st = [0, 0]; const out = new Set(); const n = () => +t[i++];
  const add = (p) => out.add(p.map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(','));
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
  return [...out].sort().join(';');
}
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };`;
const pts = new Function(`${PTS}; return { pts, fnv };`)();
const WANT = {};
for (const n of names) {
  WANT[n] = {};
  for (const c of ['regular', 'sharp']) for (const s of ['stroke', 'two-tone', 'duotone', 'fill']) {
    const svg = readFileSync(join(dir, 'raw', n, `Container=regular, Style=${s}, Corners=${c}.svg`), 'utf8');
    WANT[n][`Container=regular, Style=${s}, Corners=${c}`] = pts.fnv(pts.pts([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('')));
  }
}
console.log(`const WANT = ${JSON.stringify(WANT)};
${PTS}
const page = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
const byName = new Map(figma.currentPage.children.map((n) => [n.name, n]));
const report = {};
for (const [name, want] of Object.entries(WANT)) {
  const set = byName.get(name), bad = [];
  if (!set) { report[name] = 'missing'; continue; }
  if (set.width !== 200 || set.height !== 104) bad.push('set ' + set.width + 'x' + set.height);
  for (const v of set.children) {
    const w = want[v.name]; if (!w) { bad.push('extra variant ' + v.name); continue; }
    const sharp = v.name.endsWith('sharp');
    let svg; try { svg = await v.exportAsync({ format: 'SVG_STRING' }); } catch (e) { bad.push(v.name + ' will not export'); continue; }
    const got = fnv(pts([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('')));
    if (got !== w) bad.push(v.name.replace('Container=regular, ', '') + ' geometry');
    for (const k of v.children) {
      const stroked = Array.isArray(k.strokes) && k.strokes.length > 0, filled = Array.isArray(k.fills) && k.fills.length > 0;
      const tag = v.name.replace('Container=regular, ', '') + ' ' + k.name;
      if (stroked && filled) bad.push(tag + ' both paints');
      if (stroked && (k.strokeCap !== (sharp ? 'NONE' : 'ROUND') || k.strokeJoin !== 'ROUND' || k.strokeWeight !== 2)) bad.push(tag + ' cap/join ' + k.strokeCap + '/' + k.strokeJoin);
      if (k.strokeAlign !== 'CENTER') bad.push(tag + ' align');
      if (k.constraints.horizontal !== 'SCALE' || k.constraints.vertical !== 'SCALE') bad.push(tag + ' constraints');
      const muted = filled && k.fills.some((f) => f.opacity < 1);
      if (muted && Math.abs(k.fills[0].opacity - 0.4) > 1e-4) bad.push(tag + ' opacity');
      if (k.name !== (muted ? 'Plate' : 'Vector')) bad.push(tag + ' name');
    }
  }
  const missing = Object.keys(want).filter((k) => !set.children.some((v) => v.name === k));
  if (missing.length) bad.push('missing ' + missing.join(', '));
  report[name] = bad.length ? bad : 'ok';
}
return report;`);
