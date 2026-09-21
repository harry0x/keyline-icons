/**
 * The outer contour of a stroked run — the plate, and the body of a fill.
 *
 * `v6/outline.mjs` does this for lines and arcs, which covers 39 of this
 * batch's 45 bases; the other six (bell, globe, heart, language, message,
 * phone) carry cubics that are not circles, and a control point offset naively
 * is 100x worse than re-solving the handle lengths. So the offset of one
 * segment here is v6's rule for a line and an arc and `offset-cubic`'s for a
 * cubic: hold both endpoint tangents, re-solve the handles so the offset
 * passes through the offset midpoint.
 *
 * Everything else — the join arcs, the caps, chaining the pieces into loops —
 * is v6's, reused rather than rewritten.
 */
import { unionContours } from '../v6/outline.mjs';
import { arcify } from './arcify.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const leftOf = ([x, y]) => [y, -x];
const rad = (d) => (d * Math.PI) / 180;
const onArc = (c, r, a) => [c[0] + r * Math.cos(rad(a)), c[1] + r * Math.sin(rad(a))];

export const startPt = (s) => (s.type === 'A' ? onArc(s.c, s.r, s.a0) : s.p0);
export const endPt = (s) => (s.type === 'A' ? onArc(s.c, s.r, s.a1) : s.p1);
const cubicAt = (s, t) => { const v = 1 - t;
  return [v*v*v*s.p0[0] + 3*v*v*t*s.c1[0] + 3*v*t*t*s.c2[0] + t*t*t*s.p1[0],
          v*v*v*s.p0[1] + 3*v*v*t*s.c1[1] + 3*v*t*t*s.c2[1] + t*t*t*s.p1[1]]; };
export const segAt = (s, t) => (s.type === 'L' ? add(s.p0, mul(sub(s.p1, s.p0), t))
  : s.type === 'A' ? onArc(s.c, s.r, s.a0 + (s.a1 - s.a0) * t) : cubicAt(s, t));
const tangent = (s, t) => {
  if (s.type === 'L') return unit(sub(s.p1, s.p0));
  if (s.type === 'A') { const dir = Math.sign(s.a1 - s.a0) || 1; const a = s.a0 + (s.a1 - s.a0) * t;
    return mul([-Math.sin(rad(a)), Math.cos(rad(a))], dir); }
  const v = 1 - t;
  const d = [3*v*v*(s.c1[0]-s.p0[0]) + 6*v*t*(s.c2[0]-s.c1[0]) + 3*t*t*(s.p1[0]-s.c2[0]),
             3*v*v*(s.c1[1]-s.p0[1]) + 6*v*t*(s.c2[1]-s.c1[1]) + 3*t*t*(s.p1[1]-s.c2[1])];
  if (len(d) > 1e-9) return unit(d);
  return unit(sub(s.p1, s.p0));
};
export const revSeg = (s) => (s.type === 'L' ? { type: 'L', p0: s.p1, p1: s.p0 }
  : s.type === 'A' ? { type: 'A', c: s.c, r: s.r, a0: s.a1, a1: s.a0 }
  : { type: 'C', p0: s.p1, c1: s.c2, c2: s.c1, p1: s.p0 });

/**
 * One segment moved `half` to its left. A cubic keeps its endpoint tangents
 * and re-solves its handle lengths against the offset midpoint: a 2x2 solve on
 * `(q0 + q3)/2 + 3/8 (h0 t0 - h1 t1)`, which is `offset.mjs`'s rule.
 */
function leftOffset(s, half) {
  if (s.type === 'L') { const n = mul(leftOf(unit(sub(s.p1, s.p0))), half);
    return { type: 'L', p0: add(s.p0, n), p1: add(s.p1, n) }; }
  if (s.type === 'A') { const r = s.r + Math.sign(s.a1 - s.a0) * half;
    return r <= 1e-9 ? null : { type: 'A', c: s.c, r, a0: s.a0, a1: s.a1 }; }
  const t0 = tangent(s, 0), t1 = tangent(s, 1);
  const q0 = add(s.p0, mul(leftOf(t0), half));
  const q3 = add(s.p1, mul(leftOf(t1), half));
  const m = add(segAt(s, 0.5), mul(leftOf(tangent(s, 0.5)), half));
  // m = (q0 + q3)/2 + 3/8 (h0 t0 - h1 t1)
  const rhs = mul(sub(m, mul(add(q0, q3), 0.5)), 8 / 3);
  const det = t0[0] * -t1[1] - t0[1] * -t1[0];
  let h0, h1;
  if (Math.abs(det) > 1e-9) {
    h0 = (rhs[0] * -t1[1] - rhs[1] * -t1[0]) / det;
    h1 = (t0[0] * rhs[1] - t0[1] * rhs[0]) / det;
  } else { h0 = h1 = len(sub(s.c1, s.p0)); }
  return { type: 'C', p0: q0, c1: add(q0, mul(t0, h0)), c2: sub(q3, mul(t1, h1)), p1: q3 };
}

/**
 * The join arc between two offset ends, about the vertex they turn on.
 *
 * `null` when there is nothing to turn: two offsets that already meet differ
 * by a float, the old guard let them through, and `while (a1 <= a0) a1 += 360`
 * then drew a FULL CIRCLE of radius 1 at every tangent junction. A rounded
 * rectangle's plate came back with eight of them hanging off it.
 */
const arcBetween = (c, from, to, dir) => {
  const ang = (p) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
  let a0 = ang(from), a1 = ang(to);
  if (dir > 0) { while (a1 < a0 - 1e-9) a1 += 360; } else { while (a1 > a0 + 1e-9) a1 -= 360; }
  // A join or a cap never turns more than half a circle. Two offsets that meet
  // to within a float can land a hair the wrong side, and `+= 360` then turned
  // that into a FULL circle of radius 1 at every tangent junction: a rounded
  // rectangle's plate came back with eight discs stuck to it, reading as one
  // stroke width of error in exactly the places the corners are.
  if (Math.abs(a1 - a0) < 1e-6 || Math.abs(a1 - a0) > 180) return null;
  return { type: 'A', c, r: len(sub(from, c)), a0, a1 };
};

/** A run stroked `half` either side, as one closed contour. */
export function band(segs, half = 1, cap = 'round') {
  const fwd = segs.map((s) => leftOffset(s, half)).filter(Boolean);
  const rev = [...segs].reverse().map(revSeg);
  const back = rev.map((s) => leftOffset(s, half)).filter(Boolean);
  const out = [];
  const joinIntoList = (target, list, source) => {
    for (let i = 0; i < list.length; i++) {
      if (i) {
        const prev = endPt(target[target.length - 1]), next = startPt(list[i]);
        if (len(sub(prev, next)) > 1e-4) {
          const v = source[i] ? startPt(source[i]) : null;
          const j = v && arcBetween(v, prev, next, 1);
          if (j) target.push(j);
        }
      }
      target.push(list[i]);
    }
  };
  const joinInto = (list, source) => joinIntoList(out, list, source);
  joinInto(fwd, segs);
  const head = startPt(segs[0]), tail = endPt(segs[segs.length - 1]);
  const closed = len(sub(head, tail)) < 1e-7;
  if (closed) {
    // A ring offsets to two rings, not to one band with the ends joined: the
    // first pass ran an arc from the outer edge across to the inner one, and
    // the "plate" it returned then walked both, which reads as exactly one
    // stroke width of error. Close each loop onto its own seam instead.
    const closeLoop = (loop, vertex) => {
      const a = endPt(loop[loop.length - 1]), b = startPt(loop[0]);
      if (len(sub(a, b)) > 1e-4) { const j = arcBetween(vertex, a, b, 1); if (j) loop.push(j); }
      return loop;
    };
    const fwdLoop = closeLoop(out, head);
    const backOut = [];
    joinIntoList(backOut, back, rev);
    const backLoop = closeLoop(backOut, head);
    // Which side is OUT depends on the run's winding, and an exported path's
    // winding is whatever Figma felt like. Take the side with the larger area.
    const areaOf = (segs) => Math.abs(segs.flatMap((g) => Array.from({ length: 12 }, (_, i) => segAt(g, i / 12)))
      .reduce((a, p, i, q) => { const r = q[(i + 1) % q.length]; return a + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
    return areaOf(fwdLoop) >= areaOf(backLoop) ? { outer: fwdLoop, inner: backLoop } : { outer: backLoop, inner: fwdLoop };
  }
  const capAt = (vertex, from, to) => {
    if (cap !== 'round') return { type: 'L', p0: from, p1: to };
    return arcBetween(vertex, from, to, 1) || { type: 'L', p0: from, p1: to };
  };
  out.push(capAt(tail, endPt(fwd[fwd.length - 1]), startPt(back[0])));
  joinInto(back, rev);
  out.push(capAt(head, endPt(back[back.length - 1]), startPt(out[0])));
  return { outer: out, inner: null };
}

/** Every run's band, unioned; the loops come back longest first. */
export function silhouette(runs, half = 1, cap = 'round') {
  const contours = [], polys = [];
  for (const r of runs) {
    const b = band(r, half, cap);
    contours.push(b.outer);
    polys.push(r);
  }
  return unionContours(contours, polys.map((r) => r), half, cap);
}

export const runsOf = (d) => arcify(d).map((sp) => sp.segs);
