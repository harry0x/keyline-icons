/**
 * app-window-sparkles, all eight variants, off his refs/ drawing (21 Sep 2026).
 *
 * The stroke is his file verbatim. The rest follow app-window-plus, the
 * family's corner sign, with one addition his cluster forces:
 *
 *   plate    app-window's plate, cut at the corner the way corner.mjs cuts it
 *            (edges at the cut ends' cap line, x = 13 and y = 13, a quarter
 *            of each end cap), MINUS the small star's halo (halo.mjs). The
 *            small star sits 2.05 from the big one, so no notch edge can stand
 *            2 clear of both; the cluster is the modifier and the plate keeps
 *            2 off all of it.
 *   regular  every corner the cut makes is filleted: FJ where the halo meets
 *            a notch edge, FC between two lobes at the halo's waist points
 *   sharp    the same cut with every corner hard, on app-window's sharp plate
 *            (r=1 outer corners); window ends butt at 13; stars keep his tip
 *            fillet and lose the waist one (as the shipped sparkle does)
 *
 *   two-tone  plate 0.4, window stroke, dots and stars black
 *   duotone   plate 0.4, dots and stars black
 *   fill      plate black with the dots knocked out, stars black
 *
 *   node tools/v8/aws.mjs --out=<dir>        writes <dir>/app-window-sparkles/
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { halo, filletLobes, filletVLobe, filletHLobe, sharpStar, Contour, add, mul } from './halo.mjs';

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).replace(/\/$/, '');
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const OUT = arg('out', '/tmp/aws');
const FJ = Number(arg('fj', 1)); // fillet where the halo meets a notch edge
const FC = Number(arg('fc', 1)); // fillet at the halo's waist points

const ref = readFileSync(join(ROOT, 'refs/app-window-sparkles.svg'), 'utf8');
const ds = [...ref.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
const [WINDOW, BIG, SMALL, DOTS] = ds; // his order: window, big star, small star, dots
if (!WINDOW.startsWith('M12 21H6') || !DOTS.startsWith('M8 7C8 7.5523')) throw new Error('refs/app-window-sparkles.svg changed');
const DOTS_OUT = readFileSync(join(ROOT, 'raw/app-window/Container=regular, Style=fill, Corners=regular.svg'), 'utf8')
  .match(/ d="([^"]+)"/)[1].replace(/^[^Z]*Z/, ''); // app-window's knockouts, wound against the plate

const SMALL_C = [13, 14], SMALL_R = 2, BIG_C = [18.5, 18.5], BIG_R = 3.5;
const H = halo(SMALL_C, SMALL_R, 2);
const [top, right, bottom, left] = H.lobes;
const tan = (lobe, line) => add(lobe.c, mul(line.n, lobe.r)); // where an edge line touches a lobe

function plateRegular() {
  const jr = filletHLobe(13, -1, right, FJ, +1); // y = 13 edge, plate above, right of the lobe
  const jb = filletVLobe(13, -1, bottom, FJ, +1); // x = 13 edge, plate left, below the lobe
  const ne = filletLobes(right, top, FC, SMALL_C);
  const nw = filletLobes(top, left, FC, SMALL_C);
  const sw = filletLobes(left, bottom, FC, SMALL_C);
  return new Contour([6, 2]).L([18, 2]).A([18, 6], [22, 6]).L([22, 12]).A([21, 12], [21, 13])
    .L(jr.tl).A(jr.c, jr.tc).A(right.c, ne.ta).A(ne.c, ne.tb)
    .A(top.c, nw.ta).A(nw.c, nw.tb)
    .A(left.c, sw.ta).A(sw.c, sw.tb)
    .A(bottom.c, jb.tc).A(jb.c, jb.tl)
    .L([13, 21]).A([12, 21], [12, 22]).L([6, 22]).A([6, 18], [2, 18]).L([2, 6]).A([6, 6], [6, 2]).Z();
}

function plateSharp() {
  const jr = [right.c[0] + Math.sqrt(right.r ** 2 - (right.c[1] - 13) ** 2), 13];
  const jb = [13, bottom.c[1] + bottom.r];
  return new Contour([3, 2]).L([21, 2]).A([21, 3], [22, 3]).L([22, 12]).A([21, 12], [21, 13])
    .L(jr).A(right.c, tan(right, H.back[0])).L(H.cusp[0]).L(tan(top, H.edges[0])).A(top.c, tan(top, H.back[3]))
    .L(H.cusp[3]).L(tan(left, H.edges[3])).A(left.c, tan(left, H.back[2]))
    .L(H.cusp[2]).L(tan(bottom, H.edges[2])).A(bottom.c, jb)
    .L([13, 21]).A([12, 21], [12, 22]).L([3, 22]).A([3, 21], [2, 21]).L([2, 3]).A([3, 3], [3, 2]).Z();
}

const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
const stroke = (d, cap) => `<path d="${d}" stroke="black" stroke-width="2" stroke-linecap="${cap}" stroke-linejoin="round"/>\n`;
const solid = (d) => `<path d="${d}" fill="black"/>\n`;
const muted = (d) => `<path d="${d}" fill="black" fill-opacity="0.4"/>\n`;
const knocked = (d) => `<path fill-rule="evenodd" clip-rule="evenodd" d="${d}" fill="black"/>\n`;

export function variants() {
  const out = {};
  for (const corners of ['regular', 'sharp']) {
    const sharp = corners === 'sharp';
    const W = sharp ? 'M13 21L3 21L3 3L21 3L21 13' : WINDOW;
    const cap = sharp ? 'butt' : 'round';
    const stars = sharp ? sharpStar(BIG_C, BIG_R) + sharpStar(SMALL_C, SMALL_R) : BIG + SMALL;
    const plate = sharp ? plateSharp() : plateRegular();
    const k = (s) => `Container=regular, Style=${s}, Corners=${corners}.svg`;
    out[k('stroke')] = sharp ? HEAD + stroke(W, cap) + solid(DOTS + stars) + '</svg>\n' : ref;
    out[k('two-tone')] = HEAD + muted(plate) + stroke(W, cap) + solid(DOTS + stars) + '</svg>\n';
    out[k('duotone')] = HEAD + muted(plate) + solid(DOTS + stars) + '</svg>\n';
    out[k('fill')] = HEAD + knocked(plate + DOTS_OUT + stars) + '</svg>\n';
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = join(OUT, 'app-window-sparkles');
  mkdirSync(dir, { recursive: true });
  for (const [file, svg] of Object.entries(variants())) writeFileSync(join(dir, file), svg);
  console.log(`wrote ${dir}`);
}
