/**
 * A path's cubics read back as circular arcs wherever they are ones.
 *
 * Figma exports every arc as cubics, and the plate machinery (`outlineRun`,
 * `offsetContour`) works on lines and arcs: a line offsets to a line and an arc
 * to a concentric arc, which is exact arithmetic rather than an approximation.
 * So the first thing a plate needs is the arcs back. The tolerance is 0.004,
 * the figure `compounds.md` gives for reading a ref's cubics as circles.
 */
import { parse, at } from './cut.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

/** The circle through three points, or null if they are collinear. */
function circle3(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return [ux, uy];
}
const deg = (c, p) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;

/**
 * One cubic as {type:'A'} when it is an arc to `tol`, else null.
 *
 * The test is POSITIONAL — every sample's distance to the arc as a curve, not
 * its distance to the circle. A radius check alone accepts a piece that runs
 * the long way round, and it accepts one whose parametrisation wanders: the
 * phone's big sweep passed at 0.001 a piece at a time and the chain still
 * stood 0.09 off the curve it was replacing.
 */
export function asArc(g, tol = 0.004) {
  const c = circle3(g.p0, at(g, 0.5), g.p1);
  if (!c) return null;
  const r = len(sub(g.p0, c));
  if (r < 0.05 || r > 1e4) return null;
  let a0 = deg(c, g.p0), a1 = deg(c, g.p1);
  const am = deg(c, at(g, 0.5));
  const norm = (x) => ((x % 360) + 360) % 360;
  const fwd = norm(am - a0) < norm(a1 - a0);
  if (fwd) { while (a1 < a0) a1 += 360; } else { while (a1 > a0) a1 -= 360; }
  const span = a1 - a0, dir = Math.sign(span) || 1;
  const distToArc = (p) => {
    let a = deg(c, p);
    while (dir * (a - a0) < 0) a += 360 * dir;
    while (dir * (a - a0) > 360) a -= 360 * dir;
    const t = (a - a0) / span;
    if (t >= 0 && t <= 1) return Math.abs(len(sub(p, c)) - r);
    return Math.min(len(sub(p, g.p0)), len(sub(p, g.p1)));
  };
  // Distance to the arc as a CURVE, both ends of the parameter range, which is
  // exact. Comparing sample to sample is not: a long segment's samples sit
  // half a unit apart and the spacing alone reads as a quarter unit of error,
  // which is how a perfect quarter arc came to be rejected six times over.
  for (let i = 1; i < 24; i++) if (distToArc(at(g, i / 24)) > tol) return null;
  return { type: 'A', c, r, a0, a1 };
}

/** de Casteljau: half a cubic is a cubic, so a split loses nothing. */
function halve(g) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(g.p0, g.c1), b = mid(g.c1, g.c2), c = mid(g.c2, g.p1);
  const d = mid(a, b), e = mid(b, c), m = mid(d, e);
  return [{ t: 'C', p0: g.p0, c1: a, c2: d, p1: m }, { t: 'C', p0: m, c1: e, c2: c, p1: g.p1 }];
}

/**
 * A cubic that is not a circle, as a chain of arcs.
 *
 * Six of this batch's bases carry them (bell, globe, heart, language, message,
 * phone) and the union walk only knows lines and arcs — it threw on all six
 * and on `mic` and `shield` besides. Halving until each piece reads back as a
 * circle within `tol` converges fast, because any smooth curve is circular in
 * the small: no piece here needs more than four splits.
 */
function asArcs(g, tol, depth = 0) {
  const a = asArc(g, tol);
  if (a) return [a];
  if (depth >= 8) return [{ type: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 }];
  const [l, r] = halve(g);
  return [...asArcs(l, tol, depth + 1), ...asArcs(r, tol, depth + 1)];
}

/** A path string as subpaths of lines and arcs; `free` lists any cubic left over. */
export function arcify(d, tol = 0.004, { split = true, splitTol = 0.001 } = {}) {
  const out = [];
  for (const sp of parse(d)) {
    const segs = [], free = [];
    for (const g of sp.segs) {
      if (g.t === 'L') { segs.push({ type: 'L', p0: g.p0, p1: g.p1 }); continue; }
      const a = asArc(g, tol);
      if (a) { segs.push(a); continue; }
      if (split) { const chain = asArcs(g, splitTol); segs.push(...chain); if (chain.some((s) => s.type === 'C')) free.push(g); continue; }
      free.push(g); segs.push({ type: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 });
    }
    out.push({ closed: sp.closed, segs, free: free.length });
  }
  return out;
}
