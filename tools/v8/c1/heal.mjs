/**
 * Mends what trimming the base's sharp stroke against his cuts leaves behind
 * (21 Sep 2026, his film, table, video, globe and layers).
 *
 *   corners     Where his drawing turns a corner that the base draws as two
 *               strokes (film's frame into its first column, globe's rim into
 *               its equator), the trim leaves two butt ends a hair apart; the
 *               outer corner between them paints as a missing square. Two open
 *               ends within 0.6 of each other, whose tangents meet on his line,
 *               become one stroke through that corner, so it takes the round
 *               join every other sharp corner has.
 *   false cuts  Where the base's sharp line runs up to ~0.3 off his (sharp
 *               layers is redrawn vertex to vertex), the trim reads the drift
 *               as a cut he made. A gap between two ends that point at each
 *               other, whose whole span lies on his continuous line and that no
 *               other stroke covers, is closed again.
 *
 *   heal(d, onHis) -> d        onHis(p, r): is his centre line within r of p?
 */
import { parse, segsToD } from '../cut.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const flip = (g) => (g.t === 'L' ? { t: 'L', p0: g.p1, p1: g.p0 } : { t: 'C', p0: g.p1, c1: g.c2, c2: g.c1, p1: g.p0 });
const reverse = (segs) => segs.slice().reverse().map(flip);
/** Direction the stroke leaves its last point in (outward). */
const outDir = (segs) => { const g = segs[segs.length - 1]; return unit(sub(g.p1, g.t === 'L' ? g.p0 : (len(sub(g.p1, g.c2)) > 1e-6 ? g.c2 : g.p0))); };
/** Where the lines through a (dir u) and b (dir w) cross; null when near parallel. */
function cross(a, u, b, w) {
  const den = u[0] * w[1] - u[1] * w[0];
  if (Math.abs(den) < 0.2) return null;
  const t = ((b[0] - a[0]) * w[1] - (b[1] - a[1]) * w[0]) / den;
  return [a[0] + u[0] * t, a[1] + u[1] * t];
}
/** segs without the short tail segments that run on past x (the ends a trim leaves). */
function dropTail(segs, x) {
  const s = segs.slice();
  while (s.length > 1 && len(sub(s[s.length - 1].p0, x)) < 0.35) s.pop();
  return s;
}
/** Pull the end of segs back to x: its run-on tail goes, the rest ends at x. */
function endAt(segs, x) {
  const s = dropTail(segs, x);
  const g = { ...s[s.length - 1] }, dlt = sub(x, g.p1);
  g.p1 = x;
  if (g.t === 'C') g.c2 = [g.c2[0] + dlt[0], g.c2[1] + dlt[1]];
  s[s.length - 1] = g;
  return s;
}
/** Sample a polyline of a subpath (for the coverage test). */
const pts = (segs) => segs.flatMap((g) => Array.from({ length: 9 }, (_, i) => {
  const u = i / 8, v = 1 - u;
  return g.t === 'L' ? [g.p0[0] + (g.p1[0] - g.p0[0]) * u, g.p0[1] + (g.p1[1] - g.p0[1]) * u]
    : [v * v * v * g.p0[0] + 3 * v * v * u * g.c1[0] + 3 * v * u * u * g.c2[0] + u * u * u * g.p1[0],
      v * v * v * g.p0[1] + 3 * v * v * u * g.c1[1] + 3 * v * u * u * g.c2[1] + u * u * u * g.p1[1]];
}));
/** Drop the middle point of three collinear line points. */
function straighten(segs) {
  const out = [];
  for (const g of segs) {
    const h = out[out.length - 1];
    if (h && h.t === 'L' && g.t === 'L') {
      const a = unit(sub(h.p1, h.p0)), b = unit(sub(g.p1, g.p0));
      if (dot(a, b) > 0.99999) { out[out.length - 1] = { t: 'L', p0: h.p0, p1: g.p1 }; continue; }
    }
    out.push(g);
  }
  return out;
}

export function heal(d, onHis) {
  const all = parse(d);
  const closed = all.filter((s) => s.closed).map((s) => s.segs);
  let open = all.filter((s) => !s.closed && s.segs.length).map((s) => s.segs);
  // an end is [path index, true for its tail]; orient(i, tail) gives segs ending at that end
  const orient = (i, tail) => (tail ? open[i] : reverse(open[i]));
  for (let guard = 0; guard < 50; guard++) {
    let done = false;
    const ends = open.flatMap((_, i) => [[i, true], [i, false]]);
    for (let a = 0; a < ends.length && !done; a++) for (let b = a + 1; b < ends.length && !done; b++) {
      const [i, ti] = ends[a], [j, tj] = ends[b];
      if (i === j) continue;
      const A = orient(i, ti), B = reverse(orient(j, tj)); // A ends at the gap, B starts there
      const ea = A[A.length - 1].p1, sb = B[0].p0, gap = len(sub(ea, sb));
      const ua = outDir(A), ub = outDir(reverse(B)); // both pointing into the gap
      let joined = null;
      if (gap < 0.6) {
        // a corner: the two tangents cross on his line, close to both ends
        let x = cross(ea, ua, sb, ub) || [(ea[0] + sb[0]) / 2, (ea[1] + sb[1]) / 2];
        // when both ends, their run-on tails dropped, already meet at one vertex, that vertex is the corner
        const pa = dropTail(A, x), pb = reverse(dropTail(reverse(B), x));
        if (len(sub(pa[pa.length - 1].p1, pb[0].p0)) < 0.05 && len(sub(pa[pa.length - 1].p1, x)) < 0.1) x = pa[pa.length - 1].p1;
        if (len(sub(x, ea)) < 0.6 && len(sub(x, sb)) < 0.6 && onHis(x, 0.3)) joined = [...endAt(A, x), ...reverse(endAt(reverse(B), x))];
      } else if (gap < 5 && dot(ua, unit(sub(sb, ea))) > 0.98 && dot(ub, unit(sub(ea, sb))) > 0.98) {
        // a cut he never made: the span is on his line and no other stroke paints it
        const span = Array.from({ length: 11 }, (_, k) => [ea[0] + (sb[0] - ea[0]) * k / 10, ea[1] + (sb[1] - ea[1]) * k / 10]);
        const mid = span[5];
        const others = open.filter((_, k) => k !== i && k !== j).concat(closed).flatMap(pts);
        if (span.every((p) => onHis(p, 0.5)) && !others.some((q) => len(sub(q, mid)) < 0.9)) joined = [...A, { t: 'L', p0: ea, p1: sb }, ...B];
      }
      if (joined) { open = open.filter((_, k) => k !== i && k !== j).concat([straighten(joined)]); done = true; }
    }
    if (!done) break;
  }
  return open.map(segsToD).join('') + closed.map((s) => segsToD(s) + 'Z').join('');
}
