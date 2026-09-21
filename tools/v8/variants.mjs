/**
 * The other three styles for every drawing in `refs/`.
 *
 *   two-tone  the silhouette in grey, his drawing black on top
 *   duotone   the silhouette in grey, only the detail black
 *   fill      the silhouette solid, interior detail knocked out
 *
 * The silhouette is the union of every cut run's band — the centre line
 * offset a unit, which is what a plate IS — with the loops that lie inside
 * another dropped, because a plate is solid and a counter is not detail.
 *
 *   node tools/v8/variants.mjs <svg dir> --out=<dir>
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { band, runsOf, segAt } from './band.mjs';
import { unionBands } from './union.mjs';
import { contourD } from './styles.mjs';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };

const polyOf = (segs) => segs.flatMap((g) => Array.from({ length: 16 }, (_, i) => segAt(g, i / 16)));
const areaOf = (segs) => Math.abs(polyOf(segs).reduce((a, p, i, q) => { const r = q[(i + 1) % q.length]; return a + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
const insidePoly = (poly, p) => { let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c; };
export const outerOnly = (loops) => { const polys = loops.map(polyOf);
  return loops.filter((l, i) => !loops.some((o, j) => j !== i && areaOf(o) > areaOf(l) && insidePoly(polys[j], polys[i][0]))); };

export function parseSvg(svg) {
  return [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
    d: (tag.match(/ d="([^"]+)"/) || [])[1],
    stroked: / stroke="(?!none)/.test(tag),
    evenodd: /evenodd/.test(tag),
  }));
}

/** The whole drawing's silhouette, cut and all. */
export function silhouetteD(paths) {
  const runs = paths.filter((p) => p.stroked).flatMap((p) => runsOf(p.d));
  if (!runs.length) return '';
  const loops = outerOnly(unionBands(runs.map((r) => band(r, 1).outer), runs, 1, 'round'));
  const solids = paths.filter((p) => !p.stroked).map((p) => p.d).join('');
  return loops.map(contourD).join('') + solids;
}

const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">';
const STROKE = (d) => `<path d="${d}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const SOLID = (d) => `<path d="${d}" fill="black"/>`;
const PLATE = (d) => `<path d="${d}" fill="black" fill-opacity="0.4"/>`;
const doc = (layers) => `${HEAD}\n${layers.join('\n')}\n</svg>\n`;

export function styles(svg) {
  const paths = parseSvg(svg);
  const plate = silhouetteD(paths);
  const black = paths.map((p) => (p.stroked ? STROKE(p.d) : SOLID(p.d)));
  const detail = paths.filter((p) => !p.stroked).map((p) => SOLID(p.d));
  return {
    'two-tone': doc([PLATE(plate), ...black]),
    duotone: doc([PLATE(plate), ...(detail.length ? detail : black)]),
    fill: doc([SOLID(plate)]),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const DIR = process.argv[2], OUT = arg('out', '/tmp/v8-styles');
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.svg')).sort()) {
    const out = styles(readFileSync(join(DIR, f), 'utf8'));
    for (const [style, svg] of Object.entries(out)) writeFileSync(join(OUT, `${f.replace('.svg', '')}.${style}.svg`), svg);
    n++;
  }
  console.log('wrote', n * 3, 'files to', OUT);
}
