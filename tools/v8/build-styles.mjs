/**
 * All four regular styles for every drawing in `refs/`.
 *
 * The compound inherits the BASE's own decisions — which layer is muted, which
 * run carries the plate — and applies his cut to them:
 *
 *   plate     the band of whichever base run the shipped plate came from,
 *             restricted to the parts of it his drawing keeps. Where the base
 *             has no plate (11 of them) the two-tone mutes strokes instead,
 *             and the compound mutes the same ones.
 *   two-tone  plate grey, his drawing black on top
 *   duotone   plate grey, the detail black, no outline
 *   fill      plate solid, interior runs knocked out, the cluster solid
 *
 * `--all-union` falls back to the union of every band for the 17 bases whose
 * plate is not one run; it is the best available and is wrong in places.
 *
 *   node tools/v8/build-styles.mjs <ink dir> --plan=<json> --out=<dir>
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { band, runsOf, segAt } from './band.mjs';
import { unionBands } from './union.mjs';
import { contourD } from './styles.mjs';
import { outerOnly } from './variants.mjs';

const ROOT = '/Users/zafarismatullaev/Documents/GitHub/keyline-icons';
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASE_OF = (n) => (n === 'search-2-sparkles' ? 'search-2' : n.replace(/-sparkles$/, ''));

const parseSvg = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
  d: (tag.match(/ d="([^"]+)"/) || [])[1],
  stroked: / stroke="(?!none)/.test(tag),
  muted: /-opacity="0\.4"/.test(tag),
  evenodd: /evenodd/.test(tag),
}));
const variant = (base, style) => {
  try { return parseSvg(readFileSync(join(ROOT, 'raw', base, `Container=regular, Style=${style}, Corners=regular.svg`), 'utf8')); }
  catch { return null; }
};
const mid = (run) => segAt(run[Math.floor(run.length / 2)], 0.5);
const distToRun = (run, p) => { let m = Infinity;
  for (const s of run) for (let i = 0; i <= 16; i++) { const q = segAt(s, i / 16); m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); }
  return m; };
const polyOf = (segs) => segs.flatMap((g) => Array.from({ length: 16 }, (_, i) => segAt(g, i / 16)));
const insidePoly = (poly, p) => { let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c; };

const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">';
const STROKE = (d) => `<path d="${d}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const MUTED = (d) => `<path d="${d}" fill="none" stroke="black" stroke-opacity="0.4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const SOLID = (d) => `<path d="${d}" fill="black"/>`;
const PLATE = (d) => `<path d="${d}" fill="black" fill-opacity="0.4"/>`;
const KNOCK = (d) => `<path fill-rule="evenodd" clip-rule="evenodd" d="${d}" fill="black"/>`;
const doc = (layers) => `${HEAD}\n${layers.filter(Boolean).join('\n')}\n</svg>\n`;

export function stylesFor(name, svg, plan) {
  const base = BASE_OF(name);
  const paths = parseSvg(svg);
  const strokePaths = paths.filter((p) => p.stroked);
  const solidPaths = paths.filter((p) => !p.stroked);
  const cutRuns = strokePaths.flatMap((p) => runsOf(p.d));
  const spec = plan[base] || { kind: 'off' };

  // which of HIS runs belong to the base run that carries the plate
  let plateRuns = cutRuns;
  if (spec.kind === 'run') {
    const baseSvg = variant(base, 'stroke');
    const baseRuns = baseSvg.filter((p) => p.stroked).flatMap((p) => runsOf(p.d));
    const target = baseRuns[spec.run];
    plateRuns = cutRuns.filter((r) => distToRun(target, mid(r)) < 0.2);
    if (!plateRuns.length) plateRuns = cutRuns;
  }
  const loops = outerOnly(unionBands(plateRuns.map((r) => band(r, 1).outer), plateRuns, 1, 'round'));
  const plateD = loops.map(contourD).join('');

  // which of his runs the base's two-tone mutes
  const two = variant(base, 'two-tone');
  const mutedRuns = new Set();
  if (spec.kind === 'none' && two) {
    const mutedSegs = two.filter((p) => p.muted).flatMap((p) => runsOf(p.d));
    cutRuns.forEach((r, i) => { if (mutedSegs.some((m) => distToRun(m, mid(r)) < 0.2)) mutedRuns.add(i); });
  }
  const runD = (r) => contourPathOf(r);
  const contourPathOf = (r) => {
    let d = '';
    r.forEach((s, i) => { if (i === 0) { const p = segAt(s, 0); d += `M${+p[0].toFixed(4)} ${+p[1].toFixed(4)}`; } d += contourD([s]).replace(/^M[^LCZ]*/, '').replace(/Z$/, ''); });
    return d;
  };

  const out = {};
  if (spec.kind === 'none') {
    const lit = [], dim = [];
    cutRuns.forEach((r, i) => (mutedRuns.has(i) ? dim : lit).push(contourPathOf(r)));
    out['two-tone'] = doc([dim.length ? MUTED(dim.join('')) : null, STROKE(lit.join('') || strokePaths.map((p) => p.d).join('')), ...solidPaths.map((p) => SOLID(p.d))]);
    out.duotone = out['two-tone'];
  } else {
    out['two-tone'] = doc([PLATE(plateD), ...strokePaths.map((p) => STROKE(p.d)), ...solidPaths.map((p) => SOLID(p.d))]);
    const inside = cutRuns.filter((r) => loops.some((l) => insidePoly(polyOf(l), mid(r))) && !plateRuns.includes(r));
    out.duotone = doc([PLATE(plateD), ...inside.map((r) => STROKE(contourPathOf(r))), ...solidPaths.map((p) => SOLID(p.d))]);
  }
  // fill: the plate solid, interior runs knocked out, everything else as drawn
  const insideRuns = cutRuns.filter((r) => loops.some((l) => insidePoly(polyOf(l), mid(r))) && !plateRuns.includes(r));
  const outsideRuns = cutRuns.filter((r) => !insideRuns.includes(r) && !plateRuns.includes(r));
  const knock = insideRuns.map((r) => contourD(band(r, 1).outer)).join('');
  out.fill = doc([
    plateD ? (knock ? KNOCK(plateD + knock) : SOLID(plateD)) : null,
    ...outsideRuns.map((r) => STROKE(contourPathOf(r))),
    ...solidPaths.map((p) => SOLID(p.d)),
  ]);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const DIR = process.argv[2];
  const plan = JSON.parse(readFileSync(arg('plan', '/tmp/plateplan.json'), 'utf8'));
  const OUT = arg('out', '/tmp/v8-styles');
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.svg')).sort()) {
    const name = f.replace('.svg', '');
    const out = stylesFor(name, readFileSync(join(DIR, f), 'utf8'), plan);
    for (const [style, svg] of Object.entries(out)) writeFileSync(join(OUT, `${name}.${style}.svg`), svg);
    n++;
  }
  console.log('wrote', n, 'names x 3 styles to', OUT);
}
