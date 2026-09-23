// Grow a built sparkle compound's stars in place to the sizes he settled on 22 Sep 2026:
// lead 8 x 8 (R 4), every other star 5 x 5 (R 2.5). Everything else in the drawing stays
// his: the lines, his cuts, the tones, the hand fixes. Only the strokes a grown star now
// crowds are cut back (the batch's own cutter, 2 painted units of air, ends on the grid),
// and a dot within 2 of a grown star goes, as build.mjs drops them.
//
// Seats: the lead's centre goes to a whole unit (R 4 puts its tips on whole lines), the
// others' to a half unit (R 2.5), each the nearest that keeps the star inside the compound's
// own ink box, so the paddings do not move. Equal stars: the one nearest the top right leads.
//
//   node grow.mjs <outDir> names...        reads raw/<name>/, writes <outDir>/raw/<name>/
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cut, polyOf, distTo, starPolys } from './cutter.mjs';
import { star } from '../star.mjs';
import { sharpStar } from '../halo.mjs';
const ROOT = process.env.GROW_ROOT || decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
export const LEAD = 4, OTHER = 2.5;

const tags = (s) => [...s.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const dOf = (t) => t.match(/ d="([^"]+)"/)[1];
const stroked = (t) => / stroke="(?!none)/.test(t);
const subs = (d) => d.match(/M[^M]+/g) || [];
const bbox = (d) => { const P = polyOf(d, 24).flat(); const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
// his star, regular (12 curves) or sharp (8), both with 8 lines, on a square box
const isStar = (sp) => { const c = (sp.match(/C/g) || []).length, l = (sp.match(/L/g) || []).length; const b = bbox(sp); return (c === 12 || c === 8) && l === 8 && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.02 && b[2] - b[0] > 2.5; };
const r2 = (v) => Math.round(v * 2) / 2;

function inkBox(tagsList) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of tagsList) {
    const g = stroked(t) ? 1 : 0; const q = bbox(dOf(t));
    b = [Math.min(b[0], q[0] - g), Math.min(b[1], q[1] - g), Math.max(b[2], q[2] + g), Math.max(b[3], q[3] + g)];
  }
  return b.map(r2);
}

/** The stars of a compound (stroke, regular), lead first, and where they go. */
export function seats(name) {
  const t = tags(readFileSync(join(ROOT, 'raw', name, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8'));
  const box = inkBox(t);
  const found = [];
  for (const x of t) if (!stroked(x)) for (const sp of subs(dOf(x))) if (isStar(sp)) { const b = bbox(sp); found.push({ c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], R: (b[2] - b[0]) / 2 }); }
  // biggest leads; equal ones: nearest the top right
  found.sort((a, b) => b.R - a.R || (Math.hypot(24 - a.c[0], a.c[1]) - Math.hypot(24 - b.c[0], b.c[1])));
  // candidates within 2 units on the star's grid; hard: inside the box, 2 painted units from
  // every star already placed, and a box edge the old star touched is still touched (so the
  // paddings cannot move); soft: the nearest to where he had it
  const touches = (s) => [s.c[0] - s.R, s.c[1] - s.R, s.c[0] + s.R, s.c[1] + s.R].map((e, i) => Math.abs(e - box[i]) < 0.01);
  const place = (s, R, grid, others) => {
    const opts = (v) => { const o = []; for (let x = Math.ceil((v - 2) / grid) * grid; x <= v + 2 + 1e-9; x += grid) o.push(+x.toFixed(2)); return grid === 1 ? o : o.filter((x) => Math.abs(x % 1) === 0.5); };
    const edge = touches(s);
    let best = null;
    for (const x of opts(s.c[0])) for (const y of opts(s.c[1])) {
      const e = [x - R, y - R, x + R, y + R];
      if (e[0] < box[0] || e[1] < box[1] || e[2] > box[2] || e[3] > box[3]) continue;
      if (edge.some((t, i) => t && Math.abs(e[i] - box[i]) > 0.01)) continue;
      const g = others.length ? Math.min(...others.map((o) => { const P = starPolys([o])[0]; return Math.min(...starPolys([{ c: [x, y], R }])[0][0].map((p) => distTo(p, P))); })) : 99;
      if (g < 2) continue;
      const cost = Math.hypot(x - s.c[0], y - s.c[1]) - 0.1 * Math.min(g, 3);
      if (!best || cost < best.cost) best = { c: [x, y], R, cost, g };
    }
    return best;
  };
  const out = [];
  found.forEach((s, i) => { const p = place(s, i === 0 ? LEAD : OTHER, i === 0 ? 1 : 0.5, out); out.push(p ? { c: p.c, R: p.R, from: s } : { c: s.c, R: s.R, from: s, stuck: true }); });
  return { box, stars: out };
}

const near = (d, ref) => { const R = polyOf(ref, 16).flat(); return polyOf(d, 16).flat().some((p) => R.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.2)); };
function variant(name, file, stars, refRuns) {
  const sharp = file.includes('Corners=sharp');
  const t = tags(readFileSync(join(ROOT, 'raw', name, file), 'utf8'));
  const SP = starPolys(stars);
  const lines = [], dots = [], starPaint = [];
  for (const x of t) {
    // the paint is every attribute but the path itself (the d moves out, never twice)
    const paint = x.replace(/^<path\s*/, '').replace(/\/?>$/, '').replace(/(^|\s)d="[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
    if (stroked(x)) {
      let d = dOf(x);
      try { d = cut(d, stars, { air: 2, box: 3, keep: 1.5, stub: sharp }).d || ''; } catch { throw new Error(`${name} ${file}: the cutter failed`); }
      // sharp keeps only runs the rounded drawing keeps (see build.mjs)
      if (d && refRuns) d = subs(d).filter((r) => near(r, refRuns)).join('');
      if (d) lines.push(`<path d="${d}" ${paint}/>`);
      continue;
    }
    for (const sp of subs(dOf(x))) {
      if (isStar(sp)) {
        const b = bbox(sp), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        const k = stars.reduce((bi, s, i) => (Math.hypot(s.from.c[0] - c[0], s.from.c[1] - c[1]) < Math.hypot(stars[bi].from.c[0] - c[0], stars[bi].from.c[1] - c[1]) ? i : bi), 0);
        starPaint[k] = paint;
      } else if (!polyOf(sp, 16).flat().some((p) => SP.some((P) => distTo(p, P) < 2))) dots.push({ d: sp, paint });
    }
  }
  const byPaint = new Map();
  for (const { d, paint } of dots) byPaint.set(paint, (byPaint.get(paint) || '') + d);
  stars.forEach((s, i) => { const p = starPaint[i] || 'fill="black"'; byPaint.set(p, (byPaint.get(p) || '') + (sharp ? sharpStar(s.c, s.R) : star(s.c, s.R))); });
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
    + lines.map((l) => l + '\n').join('') + [...byPaint].map(([p, d]) => `<path d="${d}" ${p}/>\n`).join('') + '</svg>\n';
}

export function grow(name, outDir) {
  const { box, stars } = seats(name);
  const dir = join(outDir, 'raw', name); mkdirSync(dir, { recursive: true });
  const reg = variant(name, 'Container=regular, Style=stroke, Corners=regular.svg', stars);
  const refRuns = [...reg.matchAll(/<path d="([^"]+)"[^>]* stroke="/g)].map((m) => m[1]).join('');
  for (const f of readdirSync(join(ROOT, 'raw', name)).filter((f) => f.endsWith('.svg'))) writeFileSync(join(dir, f), variant(name, f, stars, f.includes('Corners=sharp') ? refRuns : null));
  return { box, stars };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, ...names] = process.argv.slice(2);
  for (const n of names) {
    const { box, stars } = grow(n, outDir);
    console.log(n.padEnd(32), `box ${box.join(',')}`, stars.map((s) => `${s.stuck ? 'STUCK ' : ''}R${s.from.R}@${s.from.c.join(',')} -> R${s.R}@${s.c.join(',')}`).join('  '));
  }
}
