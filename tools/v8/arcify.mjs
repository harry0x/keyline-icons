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

/** One cubic as {type:'A'} when it is an arc to `tol`, else null. */
export function asArc(g, tol = 0.004) {
  const c = circle3(g.p0, at(g, 0.5), g.p1);
  if (!c) return null;
  const r = len(sub(g.p0, c));
  if (r < 0.05 || r > 1e4) return null;
  for (let i = 1; i < 16; i++) {
    const p = at(g, i / 16);
    if (Math.abs(len(sub(p, c)) - r) > tol) return null;
  }
  let a0 = deg(c, g.p0), a1 = deg(c, g.p1);
  // the sweep direction comes from the midpoint, not from the endpoints alone
  const am = deg(c, at(g, 0.5));
  const norm = (x) => ((x % 360) + 360) % 360;
  const fwd = norm(am - a0) < norm(a1 - a0);
  if (fwd) { while (a1 < a0) a1 += 360; } else { while (a1 > a0) a1 -= 360; }
  return { type: 'A', c, r, a0, a1 };
}

/** A path string as subpaths of lines and arcs; `free` lists any cubic left over. */
export function arcify(d, tol = 0.004) {
  const out = [];
  for (const sp of parse(d)) {
    const segs = [], free = [];
    for (const g of sp.segs) {
      if (g.t === 'L') { segs.push({ type: 'L', p0: g.p0, p1: g.p1 }); continue; }
      const a = asArc(g, tol);
      if (a) segs.push(a);
      else { free.push(g); segs.push({ type: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 }); }
    }
    out.push({ closed: sp.closed, segs, free: free.length });
  }
  return out;
}
