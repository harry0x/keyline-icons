/**
 * The union of stroke bands, chained at a tolerance arcs can actually meet at.
 *
 * `v6/outline.mjs` does this already and its walk is the right one — pieces
 * cut at every crossing, anything buried in another band dropped, the rest
 * chained nose to tail taking the sharpest turn. What it cannot do is chain
 * THIS batch: it matches endpoints at 1e-6, and an endpoint recomputed from an
 * arc's centre and angle lands further out than that, so nearly every piece
 * became its own loop. `image`'s three runs came back as 26 slivers instead of
 * one plate.
 *
 * So this is v6's algorithm with two changes and nothing else: the match runs
 * at 1e-3, and a piece shorter than that is dropped rather than chained, since
 * a sliver has both ends in the same place and the walk can leave by either.
 */
import { crossings, within, distToRun, startPt, endPt } from '../v6/outline.mjs';
import { add, sub, mul, unit, len, dot, onArc } from '../v5/geom.mjs';

const deg = (r) => (r * 180) / Math.PI;
const ang = (c, p) => deg(Math.atan2(p[1] - c[1], p[0] - c[0]));
const at = (s, t) => (s.type === 'L'
  ? add(s.p0, mul(sub(s.p1, s.p0), t))
  : onArc(s.c, s.r, s.a0 + (s.a1 - s.a0) * t));
const paramOf = (s, p) => {
  if (s.type === 'L') { const u = sub(s.p1, s.p0); return dot(sub(p, s.p0), u) / dot(u, u); }
  const span = s.a1 - s.a0, dir = Math.sign(span) || 1;
  let a = ang(s.c, p);
  while (dir * (a - s.a0) < -1e-9) a += 360 * dir;
  while (dir * (a - s.a0) > Math.abs(span) + 1e-9) a -= 360 * dir;
  return (a - s.a0) / span;
};
const cut = (s, t0, t1) => (s.type === 'L'
  ? { type: 'L', p0: at(s, t0), p1: at(s, t1) }
  : { type: 'A', c: s.c, r: s.r, a0: s.a0 + (s.a1 - s.a0) * t0, a1: s.a0 + (s.a1 - s.a0) * t1 });
const spanOf = (s) => (s.type === 'L' ? len(sub(s.p1, s.p0)) : (Math.abs(s.a1 - s.a0) * Math.PI * s.r) / 180);
const dirIn = (s) => (s.type === 'L'
  ? unit(sub(s.p1, s.p0))
  : unit(mul([-Math.sin((s.a1 * Math.PI) / 180), Math.cos((s.a1 * Math.PI) / 180)], Math.sign(s.a1 - s.a0))));
const dirOut = (s) => (s.type === 'L'
  ? unit(sub(s.p1, s.p0))
  : unit(mul([-Math.sin((s.a0 * Math.PI) / 180), Math.cos((s.a0 * Math.PI) / 180)], Math.sign(s.a1 - s.a0))));
const turn = (a, b) => deg(Math.atan2(a[0] * b[1] - a[1] * b[0], dot(a, b)));

export function unionBands(contours, runs, half = 1, cap = 'round', tol = 1e-3) {
  const kept = [];
  contours.forEach((segs, i) => {
    for (const s of segs) {
      const ts = [0, 1];
      contours.forEach((other, j) => {
        if (i === j) return;
        for (const o of other) for (const p of crossings(s, o)) {
          if (!within(s, p) || !within(o, p)) continue;
          const t = paramOf(s, p);
          if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
        }
      });
      ts.sort((a, b) => a - b);
      const span = spanOf(s), minT = span > 1e-9 ? tol / span : 1;
      const cuts = ts.filter((t, k) => k === 0 || k === ts.length - 1 || t - ts[k - 1] > minT);
      for (let k = 0; k < cuts.length - 1; k++) {
        if (cuts[k + 1] - cuts[k] < minT) continue;
        const mid = at(s, (cuts[k] + cuts[k + 1]) / 2);
        if (runs.some((r, j) => j !== i && distToRun(r, mid, cap) < half - 1e-3)) continue;
        const piece = cut(s, cuts[k], cuts[k + 1]);
        if (spanOf(piece) < tol) continue;
        kept.push(piece);
      }
    }
  });

  const near = (p, q) => len(sub(p, q)) < tol;
  const used = new Set();
  const loops = [];
  for (const seed of kept) {
    if (used.has(seed)) continue;
    const loop = [];
    let cur = seed;
    for (let guard = 0; guard < kept.length + 2; guard++) {
      used.add(cur);
      loop.push(cur);
      const here = endPt(cur);
      const nexts = kept.filter((s) => !used.has(s) && near(startPt(s), here));
      if (!nexts.length) break;
      const d = dirIn(cur);
      cur = nexts.length === 1 ? nexts[0] : nexts.reduce((a, b) => (turn(d, dirOut(b)) > turn(d, dirOut(a)) ? b : a));
    }
    if (loop.length) loops.push(loop);
  }
  return loops;
}
