/**
 * Emit `use_figma` bodies that put the batch's stroke drawings on the New
 * band, one single-variant set each (no variants yet, his call on 20 Sep).
 *
 * The stars are NOT sent as path data: 52 of them are 32 KB, and they are one
 * shape at three numbers each, so the body carries the unit star and builds
 * them in the plugin. That takes the payload from 39 KB to about 8 KB, which
 * is the difference between ten calls and three.
 *
 *   node tools/v8/figma-push.mjs <svg dir> --rows=<y0,y1,..> --per=10 [--out=dir]
 *   node tools/v8/figma-push.mjs <svg dir> --swap=a,b,c [--out=dir]
 *
 * `--swap` rebuilds the vectors inside sets that already exist instead of
 * creating them: component ids survive, so every Catalog instance stays linked.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { star, unitStar } from './star.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const DIR = process.argv[2];
const PER = +arg('per', 10);
const ROWS = arg('rows', '-384,-488,-592').split(',').map(Number);
const OUT = arg('out', '/tmp/v8-figma');
const PITCH = 256;

// The unit star as star.mjs holds it, pulled out of a generated path so the
// two can never drift: the plugin rebuilds exactly what the sheet showed.
const unit = unitStar(6);

const jobs = [];
readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort().forEach((f, i) => {
  const name = f.replace('.svg', '');
  const svg = readFileSync(join(DIR, f), 'utf8');
  const base = [], stars = [];
  for (const tag of svg.match(/<path[^>]*>/g) || []) {
    const d = (tag.match(/ d="([^"]+)"/) || [])[1];
    if (/ stroke="(?!none)/.test(tag)) { base.push(d); continue; }
    // a filled path is a star: recover its centre and half-extent
    const v = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
    const xs = v.filter((_, k) => k % 2 === 0), ys = v.filter((_, k) => k % 2 === 1);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const R = ((Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys))) / 4;
    if (star([cx, cy], R) !== d) throw new Error(`${name}: filled path is not the house star`);
    stars.push([cx, cy, R]);
  }
  const row = Math.floor(i / PER), col = i % PER;
  jobs.push({ name, x: col * PITCH, y: ROWS[row], base, stars });
});

const body = (chunk) => `const p = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== p.id) await figma.setCurrentPageAsync(p);
if (figma.currentPage.name !== 'Components') return 'wrong page: ' + figma.currentPage.name;

const UNIT = '${unit}';
const N = UNIT.match(/-?\\d*\\.?\\d+/g).map(Number);
const star = (cx, cy, R) => { let i = 0; return UNIT.replace(/-?\\d*\\.?\\d+/g, () => { const v = N[i] * R + (i++ % 2 ? cy : cx); return String(Math.round(v * 1e4) / 1e4); }); };
const SW = (d) => '<path d="' + d + '" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const SOLID = (d) => '<path d="' + d + '" fill="black"/>';

const JOBS = ${JSON.stringify(chunk.map((j) => [j.name, j.x, j.y, j.base, j.stars]))};

const taken = new Set(figma.currentPage.children.map((n) => n.name));
const clash = JOBS.filter(([n]) => taken.has(n));
if (clash.length) throw new Error('already on the page: ' + clash.map((c) => c[0]).join(' '));
const slots = new Set(figma.currentPage.children.map((n) => n.x + ',' + n.y));
const busy = JOBS.filter(([, x, y]) => slots.has(x + ',' + y));
if (busy.length) throw new Error('slot taken: ' + busy.map((b) => b[0]).join(' '));

const made = [];
for (const [name, x, y, base, stars] of JOBS) {
  const svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + base.map(SW).join('') + stars.map((s) => SOLID(star(s[0], s[1], s[2]))).join('') + '</svg>';
  const frame = figma.createNodeFromSvg(svg);
  const c = figma.createComponent();
  c.resize(24, 24); c.clipsContent = false; c.fills = [];
  c.name = 'Container=regular, Style=stroke, Corners=regular';
  c.appendChild(frame); frame.x = 0; frame.y = 0;
  for (const k of [...frame.children]) {
    const kx = k.x, ky = k.y;
    c.appendChild(k); k.x = kx; k.y = ky;
    k.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    k.strokeAlign = 'CENTER';
    k.name = 'Vector';
  }
  frame.remove();
  const set = figma.combineAsVariants([c], figma.currentPage);
  set.name = name;
  set.cornerRadius = 5;
  set.fills = [];
  set.x = x; set.y = y;
  made.push({ name, id: set.id, x: set.x, y: set.y, w: set.width, h: set.height });
}
return { createdNodeIds: made.map((m) => m.id), made };`;

const SWAP = arg('swap', '').split(',').filter(Boolean);

const swapBody = (chunk) => `const p = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== p.id) await figma.setCurrentPageAsync(p);
if (figma.currentPage.name !== 'Components') return 'wrong page: ' + figma.currentPage.name;

const UNIT = '${unit}';
const N = UNIT.match(/-?\\d*\\.?\\d+/g).map(Number);
const star = (cx, cy, R) => { let i = 0; return UNIT.replace(/-?\\d*\\.?\\d+/g, () => { const v = N[i] * R + (i++ % 2 ? cy : cx); return String(Math.round(v * 1e4) / 1e4); }); };
const SW = (d) => '<path d="' + d + '" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const SOLID = (d) => '<path d="' + d + '" fill="black"/>';

const JOBS = ${JSON.stringify(chunk.map((j) => [j.name, j.base, j.stars]))};

const byName = new Map(figma.currentPage.children.map((n) => [n.name, n]));
const missing = JOBS.filter(([n]) => !byName.has(n)).map(([n]) => n);
if (missing.length) throw new Error('not on the page: ' + missing.join(' '));

const done = [];
for (const [name, base, stars] of JOBS) {
  const set = byName.get(name);
  const v = set.children.find((c) => c.name === 'Container=regular, Style=stroke, Corners=regular');
  if (!v) throw new Error('no stroke variant on ' + name);
  const svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + base.map(SW).join('') + stars.map((s) => SOLID(star(s[0], s[1], s[2]))).join('') + '</svg>';
  const frame = figma.createNodeFromSvg(svg);
  for (const old of [...v.children]) old.remove();
  v.appendChild(frame); frame.x = 0; frame.y = 0;
  for (const k of [...frame.children]) {
    const kx = k.x, ky = k.y;
    v.appendChild(k); k.x = kx; k.y = ky;
    k.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    k.strokeAlign = 'CENTER';
    k.name = 'Vector';
  }
  frame.remove();
  done.push({ name, id: v.id, layers: v.children.length });
}
return { mutatedNodeIds: done.map((d) => d.id), done };`;

mkdirSync(OUT, { recursive: true });
if (SWAP.length) {
  const only = jobs.filter((j) => SWAP.includes(j.name));
  const missing = SWAP.filter((n) => !only.some((j) => j.name === n));
  if (missing.length) throw new Error('not in the directory: ' + missing.join(' '));
  for (let i = 0, k = 1; i < only.length; i += PER, k++) {
    const f = join(OUT, `swap-${k}.js`);
    writeFileSync(f, swapBody(only.slice(i, i + PER)));
    console.log(f, `${Math.min(PER, only.length - i)} sets`, `${readFileSync(f, 'utf8').length} chars`);
  }
  process.exit(0);
}
const chunks = [];
for (let i = 0; i < jobs.length; i += PER) chunks.push(jobs.slice(i, i + PER));
chunks.forEach((c, i) => {
  const f = join(OUT, `push-${i + 1}.js`);
  writeFileSync(f, body(c));
  console.log(f, `${c.length} sets`, `${readFileSync(f, 'utf8').length} chars`);
});
