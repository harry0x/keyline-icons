// Build sparkle compounds on shipped bases from a seat spec, all 8 variants in
// raw/ format. Regular: the base cut round the stars (cutter.mjs), his star.
// Sharp: the base's own sharp drawing cut by the same rule, the sharp star.
// Two-tone = duotone = B (object black, lead star black, second grey); a base
// whose two-tone rides the strokes keeps that split. Fill = stroke.
//   node build.mjs <spec.json> <outDir> [names...]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, at } from '../cut.mjs';
import { star } from '../star.mjs';
import { sharpStar } from '../halo.mjs';
import { cut, polyOf, distTo, starPolys } from './cutter.mjs';
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const CONTAINER = { 'circle-trending-up': ['trending-up', 'circle'], 'square-trending-up': ['trending-up', 'square'] };
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const dOf = (t) => t.match(/ d="([^"]+)"/)[1];
const stroked = (t) => / stroke="(?!none)/.test(t), muted = (t) => /opacity="0\.4"/.test(t);
export function baseFile(name, style, corners) {
  const [b, c] = CONTAINER[name] || [name, 'regular'];
  return join(ROOT, 'raw', b, `Container=${c}, Style=${style}, Corners=${corners}.svg`);
}
const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
const st = (d, op, sharp) => (d ? `<path d="${d}" stroke="black"${op < 1 ? ` stroke-opacity="${op}"` : ''} stroke-width="2" stroke-linecap="${sharp ? 'butt' : 'round'}" stroke-linejoin="round"/>\n` : '');
const fl = (d, op = 1) => (d ? `<path d="${d}" fill="black"${op < 1 ? ` fill-opacity="${op}"` : ''}/>\n` : '');
const pts = (d, step = 0.1) => polyOf(d, 32).flatMap((q) => { const o = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(q.at(-1)); return o; });

/** Grey strokes of a base whose two-tone rides the strokes, else null. */
function strokeSplit(name) {
  const two = tags(readFileSync(baseFile(name, 'two-tone', 'regular'), 'utf8'));
  if (two.some((t) => !stroked(t) && muted(t)) || !two.some(muted)) return null;
  return two.filter((t) => stroked(t) && muted(t)).map(dOf).join('');
}
function one(name, spec, corners) {
  const sharp = corners === 'sharp';
  const src = tags(readFileSync(baseFile(name, 'stroke', corners), 'utf8'));
  // spec.drop: boxes [x0, y0, x1, y1]; a base subpath lying inside one is taken out whole (a part the star replaces)
  const inside = (d) => (spec.drop || []).some(([x0, y0, x1, y1]) => polyOf(d, 16).flat().every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
  const keepSub = (d) => (d.match(/M[^M]+/g) || []).filter((sp) => !inside(sp)).join('');
  const strokesD = keepSub(src.filter(stroked).map(dOf).join(''));
  const dotsD = keepSub(src.filter((t) => !stroked(t)).map(dOf).join(''));
  const stars = [spec.lead, spec.small].map(([x, y, R]) => ({ c: [x, y], R }));
  const res = cut(strokesD, stars, { air: spec.air ?? 2, box: spec.box === false ? null : spec.box ?? 3, keep: spec.keep ?? 1.5, stub: sharp });
  // dots: dropped when a star comes within 2 painted units of them
  const SP = starPolys(stars);
  const dots = dotsD ? dotsD.match(/M[^M]+/g).filter((d) => !pts(d).some((p) => SP.some((P) => distTo(p, P) < 2))) : [];
  const runs = res.d ? res.d.match(/M[^M]+/g) : [];
  // what the second star cuts on its own: his small stars sit clear, so any cut here is reported
  const leadOnly = cut(strokesD, [stars[0]], { air: spec.air ?? 2, box: spec.box === false ? null : spec.box ?? 3, keep: spec.keep ?? 1.5, stub: sharp }).d;
  const smallCuts = leadOnly !== res.d;
  // what each base part keeps: a part losing more than 40% is reported, unless the spec allows it
  const lenOf = (d) => polyOf(d, 32).reduce((a, q) => a + q.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0);
  const keptPts = runs.length ? pts(runs.join(''), 0.2) : [];
  const losses = (strokesD.match(/M[^M]+/g) || []).map((sp, i) => {
    const P = pts(sp, 0.2), on = P.filter((p) => keptPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.15)).length;
    return { i, kept: on / P.length, len: lenOf(sp) };
  }).filter((l) => l.kept < 0.6 && !(spec.allowLoss || []).includes(l.i));
  const starsD = stars.map((s) => (sharp ? sharpStar(s.c, s.R) : star(s.c, s.R)));
  // B tones
  const grey = strokeSplit(name);
  let body = [], black = runs;
  if (grey) {
    const G = pts(grey);
    const onGrey = (p) => G.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.1);
    body = runs.filter((r) => { const P = pts(r); return P.filter(onGrey).length / P.length >= 0.5; });
    black = runs.filter((r) => !body.includes(r));
  }
  const stroke = st(runs.join(''), 1, sharp) + fl(dots.join('')) + fl(starsD.join(''));
  const toned = st(body.join(''), 0.4, sharp) + st(black.join(''), 1, sharp) + fl(dots.join('')) + fl(starsD[0]) + fl(starsD[1], 0.4);
  return { stroke, 'two-tone': toned, duotone: toned, fill: stroke, runs, dots, stars, smallCuts, losses, droppedDots: dotsD ? dotsD.match(/M[^M]+/g).length - dots.length : 0 };
}
export function build(name, spec) {
  const out = {}, info = {};
  for (const corners of ['regular', 'sharp']) {
    const r = one(name, spec, corners);
    for (const s of ['stroke', 'two-tone', 'duotone', 'fill']) out[`Container=regular, Style=${s}, Corners=${corners}.svg`] = HEAD + r[s] + '</svg>\n';
    info[corners] = r;
  }
  return { out, info };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [specFile, outDir, ...only] = process.argv.slice(2);
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  for (const n of only.length ? only : Object.keys(spec)) {
    if (!spec[n] || spec[n].skip) continue;
    const { out, info } = build(n, spec[n]);
    const notes = [];
    for (const c of ['regular', 'sharp']) {
      if (info[c].smallCuts) notes.push(`small star cuts (${c})`);
      if (info[c].droppedDots) notes.push(`${info[c].droppedDots} dot(s) dropped (${c})`);
      for (const l of info[c].losses) notes.push(`PART ${l.i} keeps ${(l.kept * 100).toFixed(0)}% of ${l.len.toFixed(1)} (${c})`);
    }
    if (notes.length) console.log(n.padEnd(24), notes.join(', '));
    const dir = join(outDir, 'raw', `${n}-sparkles`); mkdirSync(dir, { recursive: true });
    for (const [f, svg] of Object.entries(out)) writeFileSync(join(dir, f), svg);
  }
  console.log('built');
}
