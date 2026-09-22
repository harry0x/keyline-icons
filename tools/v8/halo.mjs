/**
 * The knockout a star needs where it sits on a plate: every point of plate
 * kept 2 painted units off the star's ink, which is the set's rule for a
 * modifier overlapping its base ("cut a knockout gap of the stroke width").
 *
 * His star (star.mjs) is four straight edges per quadrant pair, a circular
 * fillet at each tip and a concave fillet at each waist. Grown by 2:
 *
 *   tip     a lobe, the tip fillet's circle with 2 added to its radius
 *   edge    the edge moved 2 along its outward normal, tangent to both lobes
 *   waist   the two moved edges meet in a point: the waist fillet (0.44 R)
 *           is smaller than the 2 it grows by, so it vanishes
 *
 * The regular plate fillets that point on the ladder; sharp keeps it hard,
 * the way a sharp notch keeps its corner. Everything here is exact lines and
 * circles off the star's own numbers in star.mjs, so the halo of a star is
 * the same halo in every icon that carries one.
 */

// star.mjs, quadrant 0 at R=1: top tip's right tangent point, the edge to the
// waist, the waist, the edge to the right tip, the right tip's upper tangent.
const T1 = [0.137312, -0.906532];
const T2 = [0.906532, -0.137312];
const D1 = norm([0.147024, 0.372728]);
const D2 = norm([0.372728, 0.147024]);
function norm([x, y]) { const l = Math.hypot(x, y); return [x / l, y / l]; }
const N1 = [D1[1], -D1[0]]; // outward: up-right of the top tip's right edge
const N2 = [D2[1], -D2[0]]; // outward: up-right of the right tip's upper edge
// Tip fillet: tangent to the edge at T2, centred on the axis.
const RT = T2[1] / N2[1];             // 0.14761
const TC = T2[0] - RT * N2[0];        // 0.85237, so the extreme sits on 1
// Sharp waist: the two edges extended to meet on the diagonal.
export const WAIST = (() => {
  // solve T1 + s D1 on x = -y
  const s = -(T1[0] + T1[1]) / (D1[0] + D1[1]);
  return [T1[0] + s * D1[0], T1[1] + s * D1[1]];
})();

const rot = ([x, y], k) => (k === 0 ? [x, y] : k === 1 ? [-y, x] : k === 2 ? [-x, -y] : [y, -x]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const deg = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

/**
 * The halo of star (c, R) grown by `gap`, as primitives in quadrant order.
 * k = 0 top, 1 right, 2 bottom, 3 left (screen y down, clockwise).
 *   lobes[k]   { c, r }  circle about tip k
 *   edges[k]   the edge leaving tip k clockwise: { p, d, n } (point, unit
 *              direction toward the next waist, outward normal)
 *   back[k]    the edge arriving at tip k clockwise (from the previous waist)
 *   cusp[k]    where edges[k] and back[k+1] meet
 */
export function halo(c, R, gap = 2) {
  const lobes = [], edges = [], back = [], cusp = [];
  for (let k = 0; k < 4; k++) {
    const tip = rot([0, -TC], k); // quadrant k's first tip is rot(top, k)
    lobes.push({ c: add(c, mul(tip, R)), r: RT * R + gap });
    const d1 = rot(D1, k), n1 = rot(N1, k), d2 = rot(D2, k), n2 = rot(N2, k);
    edges.push({ p: add(add(c, mul(rot(T1, k), R)), mul(n1, gap)), d: d1, n: n1 });
    back.push({ p: add(add(c, mul(rot(T2, k), R)), mul(n2, gap)), d: d2, n: n2 }); // arrives at tip k+1
  }
  for (let k = 0; k < 4; k++) cusp.push(meet(edges[k], back[k]));
  return { lobes, edges, back, cusp };
}

/** Where two lines { p, d } cross. */
export function meet(a, b) {
  const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
  return add(a.p, mul(a.d, t));
}

/**
 * Fillet of radius f in the plate's corner between two halo lines (the plate
 * lies on the +n side of both). Returns the centre and both tangent points.
 */
export function filletLines(a, b, f) {
  // centre Q: (Q - a.p).n_a = f and (Q - b.p).n_b = f
  const A = [[a.n[0], a.n[1]], [b.n[0], b.n[1]]];
  const r = [f + dot(a.p, a.n), f + dot(b.p, b.n)];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const Q = [(r[0] * A[1][1] - A[0][1] * r[1]) / det, (A[0][0] * r[1] - r[0] * A[1][0]) / det];
  return { c: Q, ta: sub(Q, mul(a.n, f)), tb: sub(Q, mul(b.n, f)) };
}

/**
 * Fillet of radius f in the plate's corner between two neighbouring lobes
 * (plate outside both), on the side away from `from` (the star's centre).
 * The straight between two lobes is 0.32 long on an R=2 star, shorter than
 * any ladder fillet's tangent, so the fillet meets the lobes themselves.
 */
export function filletLobes(a, b, f, from) {
  const m = mul(add(a.c, b.c), 0.5), h = Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) / 2;
  let u = [-(b.c[1] - a.c[1]) / (2 * h), (b.c[0] - a.c[0]) / (2 * h)];
  if (dot(sub(m, from), u) < 0) u = mul(u, -1);
  const Q = add(m, mul(u, Math.sqrt((a.r + f) ** 2 - h * h)));
  return { c: Q, ta: add(a.c, mul(sub(Q, a.c), a.r / (a.r + f))), tb: add(b.c, mul(sub(Q, b.c), b.r / (b.r + f))) };
}

/**
 * Fillet of radius f between the vertical line x = X (plate on the side
 * `side` = -1 for x < X) and a lobe (plate outside it), below or above the
 * lobe's centre by `dir` (+1 below). And the same for a horizontal line.
 */
export function filletVLobe(X, side, lobe, f, dir) {
  const qx = X + side * f;
  const qy = lobe.c[1] + dir * Math.sqrt((lobe.r + f) ** 2 - (qx - lobe.c[0]) ** 2);
  const Q = [qx, qy];
  return { c: Q, tl: [X, qy], tc: add(lobe.c, mul(sub(Q, lobe.c), lobe.r / (lobe.r + f))) };
}
export function filletHLobe(Y, side, lobe, f, dir) {
  const qy = Y + side * f;
  const qx = lobe.c[0] + dir * Math.sqrt((lobe.r + f) ** 2 - (qy - lobe.c[1]) ** 2);
  const Q = [qx, qy];
  return { c: Q, tl: [qx, Y], tc: add(lobe.c, mul(sub(Q, lobe.c), lobe.r / (lobe.r + f))) };
}

/** The sharp star: tips keep his fillet (the round join), waists go to a point. */
export function sharpStar([cx, cy], R) {
  const f = fmt;
  const P = (p, k) => { const q = rot(p, k); return `${f(cx + q[0] * R)} ${f(cy + q[1] * R)}`; };
  // his tip fillet cubics, from star.mjs's Q
  const TIP = [
    [[0.962948, -0.11508], [1, -0.060612], [1, 0]],
    [[1, 0.060612], [0.962948, 0.11508], [0.906532, 0.137312]],
  ];
  let d = `M${P(T1, 0)}`;
  for (let k = 0; k < 4; k++) {
    d += `L${P(WAIST, k)}L${P(T2, k)}`;
    for (const seg of TIP) d += 'C' + seg.map((p) => P(p, k)).join(' ');
  }
  return `${d}Z`;
}

/* ------------------------------------------------------------ path writing */
export const fmt = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const P = (p) => `${fmt(p[0])} ${fmt(p[1])}`;

/**
 * A contour builder: lines and circular arcs, arcs split at every multiple of
 * 90 degrees they cross (so an extreme is always a node) and written as cubics.
 */
export class Contour {
  constructor(start) { this.d = `M${P(start)}`; this.cur = start; }
  L(p) { if (Math.hypot(p[0] - this.cur[0], p[1] - this.cur[1]) > 1e-7) this.d += `L${P(p)}`; this.cur = p; return this; }
  /** Arc about c to point `to`, sweeping the short way (or `sweep` degrees if given). */
  A(c, to, sweep) {
    const r = Math.hypot(this.cur[0] - c[0], this.cur[1] - c[1]);
    const r2 = Math.hypot(to[0] - c[0], to[1] - c[1]);
    if (Math.abs(r - r2) > 1e-6) throw new Error(`arc radius mismatch ${r} vs ${r2}`);
    const a0 = deg(sub(this.cur, c));
    let s = sweep ?? ((deg(sub(to, c)) - a0 + 540) % 360) - 180;
    const cuts = [a0];
    const step = s > 0 ? 90 : -90;
    let m = s > 0 ? Math.floor(a0 / 90) * 90 + 90 : Math.ceil(a0 / 90) * 90 - 90;
    while (s > 0 ? m < a0 + s - 1e-6 : m > a0 + s + 1e-6) { if (Math.abs(m - a0) > 1e-6) cuts.push(m); m += step; }
    cuts.push(a0 + s);
    const at = (a) => [c[0] + r * Math.cos((a * Math.PI) / 180), c[1] + r * Math.sin((a * Math.PI) / 180)];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const u = cuts[i], v = cuts[i + 1];
      const k = (4 / 3) * Math.tan((((v - u) * Math.PI) / 180) / 4);
      const p0 = i === 0 ? this.cur : at(u), p1 = i + 2 === cuts.length ? to : at(v);
      const t0 = [-Math.sin((u * Math.PI) / 180), Math.cos((u * Math.PI) / 180)];
      const t1 = [-Math.sin((v * Math.PI) / 180), Math.cos((v * Math.PI) / 180)];
      this.d += `C${P(add(p0, mul(t0, k * r)))} ${P(sub(p1, mul(t1, k * r)))} ${P(p1)}`;
    }
    this.cur = to;
    return this;
  }
  Z() { return this.d + 'Z'; }
}

export { add, mul, sub, dot, rot };
