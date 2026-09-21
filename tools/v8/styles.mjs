/**
 * The other seven variants for a drawing in `refs/`.
 *
 * His file is the stroke drawing: the base already cut, plus the cluster. The
 * rest is composed from the BASE's own shipped variants, because those carry
 * every decision the set has already taken — which layer is the muted one,
 * which counter is knocked out, whether two-tone mutes a stroke or lays a
 * plate. The compound inherits all of it and only has to apply the same cut.
 *
 *   stroke    his file
 *   two-tone  base's two-tone, cut, cluster black on top
 *   duotone   base's duotone, cut, cluster black on top
 *   fill      base's fill, cut, cluster black on top
 *
 * A plate or a solid cannot be trimmed the way a stroke is — an area has no
 * ends — so it is rebuilt as the outer contour of the cut centre line it came
 * from, which is what a plate IS.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trim, parse } from './cut.mjs';
import { band, runsOf, segAt, startPt, endPt } from './band.mjs';

const ROOT = '/Users/zafarismatullaev/Documents/GitHub/keyline-icons';
const f = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };

export function tagsOf(svg) {
  return [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
    tag,
    d: (tag.match(/ d="([^"]+)"/) || [])[1],
    stroked: / stroke="(?!none)/.test(tag),
    filled: / fill="(?!none)/.test(tag),
    muted: /(?:fill|stroke)-opacity="0\.4"/.test(tag),
    evenodd: /evenodd/.test(tag),
  }));
}
export const variant = (name, style, corners = 'regular') =>
  readFileSync(join(ROOT, 'raw', name, `Container=regular, Style=${style}, Corners=${corners}.svg`), 'utf8');

/** A contour of lines, arcs and cubics as a path string. */
export function contourD(segs) {
  let d = '', cur = null;
  for (const s of segs) {
    const a = startPt(s);
    if (!cur || Math.hypot(a[0] - cur[0], a[1] - cur[1]) > 1e-6) d += `M${f(a[0])} ${f(a[1])}`;
    if (s.type === 'L') d += `L${f(s.p1[0])} ${f(s.p1[1])}`;
    else if (s.type === 'C') d += `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p1[0])} ${f(s.p1[1])}`;
    else {
      // an arc as cubics, split on the quadrants so nothing sags
      const span = s.a1 - s.a0, n = Math.max(1, Math.ceil(Math.abs(span) / 90));
      for (let i = 0; i < n; i++) {
        const a0 = s.a0 + (span * i) / n, a1 = s.a0 + (span * (i + 1)) / n;
        const k = (4 / 3) * Math.tan(((a1 - a0) * Math.PI) / 720);
        const P = (a) => [s.c[0] + s.r * Math.cos((a * Math.PI) / 180), s.c[1] + s.r * Math.sin((a * Math.PI) / 180)];
        const T = (a) => [-Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)];
        const p0 = P(a0), p1 = P(a1), t0 = T(a0), t1 = T(a1);
        d += `C${f(p0[0] + k * s.r * t0[0])} ${f(p0[1] + k * s.r * t0[1])} ${f(p1[0] - k * s.r * t1[0])} ${f(p1[1] - k * s.r * t1[1])} ${f(p1[0])} ${f(p1[1])}`;
      }
    }
    cur = endPt(s);
  }
  return d + 'Z';
}

/**
 * The cut centre line's runs, paired with the base's runs they came from, so a
 * plate knows which run to rebuild itself out of. Matched by the run's own
 * start point surviving the cut, else by nearest midpoint.
 */
export function cutRuns(baseD, cutD) {
  return { base: runsOf(baseD), cut: runsOf(cutD) };
}

/** The plate for a set of cut runs: every band, as separate subpaths. */
export function plateD(runs, half = 1, cap = 'round') {
  return runs.map((r) => {
    const b = band(r, half, cap);
    return contourD(b.outer) + (b.inner ? contourD(b.inner) : '');
  }).join('');
}

/* ------------------------------------------------------------------ styles */

import { unionContours } from '../v6/outline.mjs';

const mid = (segs) => segAt(segs[Math.floor(segs.length / 2)], 0.5);
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** How far a point sits from a run, sampled. */
function distToRun(run, p) {
  let m = Infinity;
  for (const s of run) for (let i = 0; i <= 12; i++) m = Math.min(m, near(segAt(s, i / 12), p));
  return m;
}
/** The loops of the union of every run's band: a plate, and a fill's body. */
export function bodyLoops(runs, half = 1, cap = 'round') {
  return unionContours(runs.map((r) => band(r, half, cap).outer), runs, half, cap);
}
const areaOf = (segs) => segs.flatMap((g) => Array.from({ length: 16 }, (_, i) => segAt(g, i / 16)))
  .reduce((a, p, i, q) => { const r = q[(i + 1) % q.length]; return a + p[0] * r[1] - r[0] * p[1]; }, 0) / 2;
const insidePoly = (poly, p) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
const polyOf = (segs) => segs.flatMap((g) => Array.from({ length: 16 }, (_, i) => segAt(g, i / 16)));

/**
 * The outer loops of a union, and the holes dropped: a plate is solid, and a
 * counter is not detail (`styles.md`). `unionContours` hands back every loop
 * it walked, holes included, so the ones lying inside another go.
 */
export function outerLoops(loops) {
  const polys = loops.map(polyOf);
  return loops.filter((l, i) => !loops.some((o, j) => j !== i && Math.abs(areaOf(o)) > Math.abs(areaOf(l))
    && insidePoly(polys[j], polyOf(l)[0])));
}
export { band, runsOf, segAt, distToRun, mid };
