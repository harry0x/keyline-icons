/**
 * Exact geometry for the C1 build: a body (any closed path of lines and
 * cubics, holes included) minus the house corner notch (a rounded box), with
 * a fillet of radius f at every corner the cut makes.
 *
 * Why exact and not a raster: these ship. The cut runs the standard boundary
 * walk for A minus B: follow A while outside B; on entering B, follow B's
 * boundary the other way round to where A comes out; carry on along A. Every
 * crossing is found by bisection on the segment's own parameter and split by
 * de Casteljau, so nothing is flattened.
 *
 * The fillet at a cut corner is the circle of radius f tangent to both sides,
 * on the body's side. Where the body's edge is a stroke's outer offset and the
 * notch edge is where the stroke's cap ends (app-window-plus), that circle IS
 * the quarter of the cap, "r1 onto each cap", on straight and curved edges
 * alike.
 *
 *   subtractBox(d, rr, { fillet }) -> path string
 *   subtractBoxes(d, [rr...], opts)
 *   area(d), reverse(d)
 */
import { parse, at } from '../cut.mjs';

const EPS = 1e-9;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fmt = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };

/* --------------------------------------------------------------- segments */
// L { p0, p1 } · C { p0, c1, c2, p1 } · A { c, r, a0, a1 } (radians, a1 - a0 = signed sweep)
const onArc = (s, a) => [s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)];
export function pt(s, u) {
  if (s.t === 'A') return onArc(s, s.a0 + (s.a1 - s.a0) * u);
  return at(s, u);
}
export const start = (s) => pt(s, 0);
export const end = (s) => pt(s, 1);
export function tangentAt(s, u) {
  if (s.t === 'A') { const a = s.a0 + (s.a1 - s.a0) * u, k = Math.sign(s.a1 - s.a0); return [-Math.sin(a) * k, Math.cos(a) * k]; }
  const e = 1e-6, a = pt(s, Math.max(0, u - e)), b = pt(s, Math.min(1, u + e)), d = sub(b, a), l = len(d) || 1;
  return mul(d, 1 / l);
}
function splitC(P, t) {
  const [p0, p1, p2, p3] = P;
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
  return [[p0, a, d, f], [f, e, c, p3]];
}
export function slice(s, u0, u1) {
  if (s.t === 'L') return { t: 'L', p0: pt(s, u0), p1: pt(s, u1) };
  if (s.t === 'A') return { t: 'A', c: s.c, r: s.r, a0: s.a0 + (s.a1 - s.a0) * u0, a1: s.a0 + (s.a1 - s.a0) * u1 };
  let P = [s.p0, s.c1, s.c2, s.p1];
  if (u1 < 1) P = splitC(P, u1)[0];
  if (u0 > 0) P = splitC(P, u0 / u1)[1];
  return { t: 'C', p0: P[0], c1: P[1], c2: P[2], p1: P[3] };
}
const segLen = (s) => { if (s.t === 'A') return Math.abs(s.a1 - s.a0) * s.r; let L = 0, p = pt(s, 0); for (let i = 1; i <= 32; i++) { const q = pt(s, i / 32); L += len(sub(q, p)); p = q; } return L; };

/** Closed subpaths of a path string, each a list of L/C segments. */
export function contours(d) {
  return parse(d).map((sp) => {
    const segs = sp.segs.map((g) => (g.t === 'L' ? { t: 'L', p0: g.p0, p1: g.p1 } : { t: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 }));
    const last = segs.length ? end(segs[segs.length - 1]) : sp.start;
    if (len(sub(last, sp.start)) > 1e-7) segs.push({ t: 'L', p0: last, p1: sp.start });
    return segs;
  }).filter((c) => c.length);
}
/** Signed area by the shoelace over a fine sampling: > 0 is clockwise on screen (y down). */
export function contourArea(segs) {
  let A = 0;
  for (const s of segs) { const n = s.t === 'L' ? 1 : 24; let p = pt(s, 0); for (let i = 1; i <= n; i++) { const q = pt(s, i / n); A += p[0] * q[1] - q[0] * p[1]; p = q; } }
  return A / 2;
}
export const area = (d) => contours(d).reduce((a, c) => a + contourArea(c), 0);

/* ----------------------------------------------------------- the notch box */
export function inBox(p, rr) {
  if (rr.kind === 'circle') return (p[0] - rr.c[0]) ** 2 + (p[1] - rr.c[1]) ** 2 <= rr.r * rr.r;
  if (p[0] < rr.x0 || p[0] > rr.x1 || p[1] < rr.y0 || p[1] > rr.y1) return false;
  if (rr.r <= 0) return true;
  const cx = Math.min(Math.max(p[0], rr.x0 + rr.r), rr.x1 - rr.r), cy = Math.min(Math.max(p[1], rr.y0 + rr.r), rr.y1 - rr.r);
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= rr.r * rr.r;
}
/** The box's boundary, clockwise on screen, starting at the top edge. */
function boxSegs(rr) {
  const H = Math.PI / 2;
  if (rr.kind === 'circle') return [-H, 0, H, Math.PI].map((a0) => ({ t: 'A', c: rr.c, r: rr.r, a0, a1: a0 + H }));
  const { x0, y0, x1, y1, r } = rr, out = [];
  const L = (a, b) => { if (len(sub(b, a)) > EPS) out.push({ t: 'L', p0: a, p1: b }); };
  const A = (c, a0) => { if (r > 0) out.push({ t: 'A', c, r, a0, a1: a0 + H }); };
  L([x0 + r, y0], [x1 - r, y0]); A([x1 - r, y0 + r], -H);
  L([x1, y0 + r], [x1, y1 - r]); A([x1 - r, y1 - r], 0);
  L([x1 - r, y1], [x0 + r, y1]); A([x0 + r, y1 - r], H);
  L([x0, y1 - r], [x0, y0 + r]); A([x0 + r, y0 + r], Math.PI);
  return out;
}
const reverseSeg = (s) => (s.t === 'L' ? { t: 'L', p0: s.p1, p1: s.p0 } : s.t === 'A' ? { t: 'A', c: s.c, r: s.r, a0: s.a1, a1: s.a0 } : { t: 'C', p0: s.p1, c1: s.c2, c2: s.c1, p1: s.p0 });
const reverseContour = (segs) => segs.slice().reverse().map(reverseSeg);

/** Parameter positions where segment s crosses the box boundary. */
function crossings(s, rr) {
  const ts = [], n = 256;
  const inside = (u) => inBox(pt(s, u), rr);
  for (let i = 0; i < n; i++) {
    let a = i / n, b = (i + 1) / n;
    if (inside(a) !== inside(b)) {
      for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (inside(a) !== inside(m)) b = m; else a = m; }
      ts.push((a + b) / 2);
    }
  }
  return ts;
}
/** Where a point sits along the box boundary: [segment index, parameter]. */
function locateOnBox(B, p) {
  let best = null;
  B.forEach((s, i) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (len(sub(pt(s, m1), p)) < len(sub(pt(s, m2), p))) hi = m2; else lo = m1; }
    const u = (lo + hi) / 2, dd = len(sub(pt(s, u), p));
    if (!best || dd < best.d) best = { i, u, d: dd };
  });
  return best;
}

/* ------------------------------------------------------------------- walk */
/** Sampled polygon of a contour, for point tests. */
const polyOf = (segs) => segs.flatMap((s) => { const n = s.t === 'L' ? 1 : 16; return Array.from({ length: n }, (_, i) => pt(s, i / n)); });
function inPoly(q, p) {
  let c = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i], b = q[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) c = !c;
  }
  return c;
}
/**
 * Every island wound clockwise on screen and every hole the other way, by how
 * deeply each contour is nested. Drawn icons mix them freely (headphones' two
 * cups run opposite ways), and the walk needs them consistent.
 */
function normalise(A) {
  const polys = A.map(polyOf);
  return A.map((segs, i) => {
    const probe = pt(segs[0], 0.5);
    const depth = polys.filter((q, j) => j !== i && inPoly(q, probe)).length;
    const wantCw = depth % 2 === 0;
    return (contourArea(segs) > 0) === wantCw ? segs : reverseContour(segs);
  });
}

export function subtractBox(d, rr, { fillet = 1 } = {}) {
  const A = normalise(contours(d));
  if (!A.length) return '';
  const cw = true;
  // B runs against A's outer contour, so the body stays on the same side of the whole result
  let B = boxSegs(rr);
  if (cw) B = reverseContour(B);
  // split A at the crossings; remember where each crossing lands on B
  const pieces = []; // { segs, out, from, to, ci } per contour: runs between crossings
  const xs = []; // crossing records: { p, b: B position, ci, k (piece index where A leaves the crossing) }
  const runsOf = [];
  A.forEach((segs, ci) => {
    const parts = [];
    for (const s of segs) {
      let u0 = 0;
      for (const u of crossings(s, rr)) { parts.push({ s: slice(s, u0, u), cut: true }); u0 = u; }
      parts.push({ s: slice(s, u0, 1), cut: false });
    }
    // group parts into runs that start and end on crossings
    const cutIdx = parts.map((p, i) => (p.cut ? i : -1)).filter((i) => i >= 0);
    if (!cutIdx.length) { runsOf.push({ ci, whole: segs, out: !inBox(pt(segs[0], 0.5), rr) }); return; }
    const n = parts.length, startAt = (cutIdx[0] + 1) % n;
    let run = [];
    for (let k = 0; k < n; k++) {
      const i = (startAt + k) % n;
      run.push(parts[i].s);
      if (parts[i].cut) {
        const mid = run[Math.floor(run.length / 2)];
        runsOf.push({ ci, segs: run, out: !inBox(pt(mid, 0.5), rr) });
        run = [];
      }
    }
  });
  // crossing points: the start and end of every run
  const runs = runsOf.filter((r) => r.segs);
  for (const r of runs) { r.a = start(r.segs[0]); r.b = end(r.segs[r.segs.length - 1]); r.aOn = locateOnBox(B, r.a); r.bOn = locateOnBox(B, r.b); }
  const outRuns = runs.filter((r) => r.out);
  const Bpos = (o) => o.i + o.u; // position along B's traversal
  const result = [], corners = [];
  const used = new Set();
  for (const r0 of outRuns) {
    if (used.has(r0)) continue;
    const contour = [];
    let r = r0;
    while (r && !used.has(r)) {
      used.add(r);
      contour.push(...r.segs);
      // entering B at r.b: walk B to the next place an outside run starts
      const here = Bpos(r.bOn);
      const next = outRuns.map((o) => ({ o, ahead: ((Bpos(o.aOn) - here) + B.length) % B.length })).filter((x) => x.ahead > 1e-9).sort((x, y) => x.ahead - y.ahead)[0];
      if (!next) throw new Error('subtractBox: no way back out of the notch');
      const path = walkB(B, r.bOn, next.o.aOn);
      corners.push({ at: contour.length }); // A -> B corner sits before this index
      contour.push(...path);
      corners.push({ at: contour.length }); // B -> A corner
      r = next.o;
    }
    result.push({ segs: contour, corners: corners.splice(0) });
  }
  // contours the box never touched
  for (const w of runsOf.filter((r) => r.whole)) if (w.out) result.push({ segs: w.whole, corners: [] });
  // a box wholly inside the body (never here: a notch runs out of it) would be a hole
  return result.map((c) => toD(fillet > 0 ? filletCorners(c.segs, c.corners.map((k) => k.at), fillet, cw) : c.segs)).join('');
}
export function subtractBoxes(d, rrs, opts) { return rrs.reduce((acc, rr) => (acc ? subtractBox(acc, rr, opts) : acc), d); }

/** The piece of B's boundary from position a to position b, in B's traversal order. */
function walkB(B, a, b) {
  const out = [];
  let i = a.i, u = a.u;
  for (let guard = 0; guard < B.length + 2; guard++) {
    if (i === b.i && b.u >= u - 1e-12 && !(guard > 0 && b.u < u)) { if (b.u - u > 1e-9) out.push(slice(B[i], u, b.u)); return out; }
    if (1 - u > 1e-9) out.push(slice(B[i], u, 1));
    i = (i + 1) % B.length; u = 0;
  }
  throw new Error('walkB ran away');
}

/* ---------------------------------------------------------------- fillets */
/** Interior normal of a clockwise-on-screen boundary (interior on the right). */
const inNormal = (s, u, cw) => { const t = tangentAt(s, u); return cw ? [-t[1], t[0]] : [t[1], -t[0]]; };
function closestOn(s, p) {
  let best = null;
  for (let i = 0; i <= 64; i++) { const u = i / 64, dd = len(sub(pt(s, u), p)); if (!best || dd < best.d) best = { u, d: dd }; }
  let lo = Math.max(0, best.u - 1 / 64), hi = Math.min(1, best.u + 1 / 64);
  for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (len(sub(pt(s, m1), p)) < len(sub(pt(s, m2), p))) hi = m2; else lo = m1; }
  const u = (lo + hi) / 2;
  return { u, d: len(sub(pt(s, u), p)) };
}
/**
 * Replace the corner between segs[k-1] and segs[k] with an arc of radius f.
 * The centre walks back along the incoming side (across as many segments as
 * it takes) at distance f inside the body, until it is f from the outgoing
 * side (also read across segments). A corner that is not convex needs none.
 */
function filletCorners(segs, at, f, cw) {
  const n = segs.length;
  const mod = (i) => ((i % n) + n) % n;
  const cuts = new Map(), arcs = new Map(), gone = new Set();
  const corners = [...new Set(at.map(mod))];
  for (const k of corners) {
    const nextCorner = corners.filter((c) => c !== k).map((c) => mod(c - k)).reduce((a, b) => Math.min(a, b), n);
    const prevCorner = corners.filter((c) => c !== k).map((c) => mod(k - c)).reduce((a, b) => Math.min(a, b), n);
    const outIdx = [], inIdx = [];
    for (let i = 0, L = 0; i < nextCorner && L < 6 * f + 4; i++) { outIdx.push(mod(k + i)); L += segLen(segs[mod(k + i)]); }
    for (let i = 1, L = 0; i <= prevCorner && L < 6 * f + 4; i++) { inIdx.push(mod(k - i)); L += segLen(segs[mod(k - i)]); }
    const near = (Q) => outIdx.reduce((best, idx) => { const c = closestOn(segs[idx], Q); return !best || c.d < best.d ? { ...c, idx } : best; }, null);
    const centre = (idx, u) => add(pt(segs[idx], u), mul(inNormal(segs[idx], u, cw), f));
    const h = (idx, u) => near(centre(idx, u)).d - f;
    if (h(inIdx[0], 1) >= -1e-9) continue; // not a convex corner
    let hit = null;
    const hQ = (Q) => near(Q).d - f;
    for (let j = 0; j < inIdx.length; j++) {
      const idx = inIdx[j];
      // a reflex vertex between two incoming segments: the offset centre jumps across it,
      // and the fillet that fits there touches the vertex itself, its centre f from it
      // (cursor's inner corner). Swing the centre round the vertex to find it.
      if (j > 0) {
        const V = pt(segs[inIdx[j - 1]], 0), c0 = centre(inIdx[j - 1], 0), c1 = centre(idx, 1);
        if (len(sub(c0, c1)) > 1e-6 && hQ(c0) < 0 && hQ(c1) >= 0) {
          const a0 = Math.atan2(c0[1] - V[1], c0[0] - V[0]);
          let sw = Math.atan2(c1[1] - V[1], c1[0] - V[0]) - a0;
          while (sw > Math.PI) sw -= 2 * Math.PI; while (sw < -Math.PI) sw += 2 * Math.PI;
          const at = (t) => [V[0] + f * Math.cos(a0 + sw * t), V[1] + f * Math.sin(a0 + sw * t)];
          let lo = 0, hi = 1;
          for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (hQ(at(m)) >= 0) hi = m; else lo = m; }
          hit = { idx: inIdx[j - 1], u: 0, Q: at(hi) };
          break;
        }
      }
      let prev = 1;
      for (let i = 1; i <= 200; i++) {
        const u = 1 - i / 200;
        if (h(idx, u) >= 0) { let lo = u, hi = prev; for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (h(idx, m) >= 0) lo = m; else hi = m; } hit = { idx, u: lo }; break; }
        prev = u;
      }
      if (hit) break;
    }
    if (!hit) throw new Error(`fillet r=${f} does not fit before the corner`);
    const Q = hit.Q || centre(hit.idx, hit.u), o = near(Q);
    // past a reflex vertex of the incoming side the offset centre sits nearer than f to
    // the side it came round (cursor's inner corner): no fillet of f fits there
    const back = inIdx.reduce((m, idx) => Math.min(m, closestOn(segs[idx], Q).d), Infinity);
    if (back < f - 1e-3) throw new Error(`fillet r=${f} does not fit round a reflex corner (${back.toFixed(2)} from the side)`);
    if (o.idx === outIdx[outIdx.length - 1] && o.u >= 1 - 1e-6) throw new Error(`fillet r=${f} runs past the next corner`);
    const P1 = pt(segs[hit.idx], hit.u), P2 = pt(segs[o.idx], o.u);
    let a0 = Math.atan2(P1[1] - Q[1], P1[0] - Q[0]), a1 = Math.atan2(P2[1] - Q[1], P2[0] - Q[0]);
    let sw = a1 - a0; while (sw > Math.PI) sw -= 2 * Math.PI; while (sw < -Math.PI) sw += 2 * Math.PI;
    for (const idx of inIdx) { if (idx === hit.idx) break; if (cuts.has(idx) || arcs.has(idx)) throw new Error('fillets overlap'); gone.add(idx); }
    for (const idx of outIdx) { if (idx === o.idx) break; if (cuts.has(idx) || arcs.has(idx)) throw new Error('fillets overlap'); gone.add(idx); }
    if (gone.has(hit.idx) || gone.has(o.idx)) throw new Error('fillets overlap');
    cuts.set(hit.idx, { ...(cuts.get(hit.idx) || {}), u1: hit.u });
    cuts.set(o.idx, { ...(cuts.get(o.idx) || {}), u0: o.u });
    arcs.set(o.idx, { t: 'A', c: Q, r: f, a0, a1: a0 + sw });
  }
  const out = [];
  segs.forEach((s, i) => {
    if (arcs.has(i)) out.push(arcs.get(i));
    if (gone.has(i)) return;
    const c = cuts.get(i);
    out.push(c ? slice(s, c.u0 ?? 0, c.u1 ?? 1) : s);
  });
  return out.filter((s) => segLen(s) > 1e-6);
}

/* ----------------------------------------------------------------- output */
function arcToCubics(s) {
  const out = [], sw = s.a1 - s.a0, H = Math.PI / 2;
  const cuts = [s.a0];
  if (sw > 0) { let m = Math.floor(s.a0 / H + 1e-9) * H + H; while (m < s.a1 - 1e-7) { cuts.push(m); m += H; } }
  else { let m = Math.ceil(s.a0 / H - 1e-9) * H - H; while (m > s.a1 + 1e-7) { cuts.push(m); m -= H; } }
  cuts.push(s.a1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const u = cuts[i], v = cuts[i + 1], k = (4 / 3) * Math.tan((v - u) / 4);
    const p0 = onArc(s, u), p1 = onArc(s, v);
    const t0 = [-Math.sin(u), Math.cos(u)], t1 = [-Math.sin(v), Math.cos(v)];
    out.push({ t: 'C', p0, c1: add(p0, mul(t0, k * s.r)), c2: sub(p1, mul(t1, k * s.r)), p1 });
  }
  return out;
}
const P = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
export function toD(segs) {
  const flat = segs.flatMap((s) => (s.t === 'A' ? arcToCubics(s) : [s]));
  let d = `M${P(start(flat[0]))}`;
  flat.forEach((s, i) => {
    const last = i === flat.length - 1;
    if (s.t === 'L') { if (!last) d += `L${P(s.p1)}`; }
    else d += `C${P(s.c1)} ${P(s.c2)} ${P(s.p1)}`;
  });
  return d + 'Z';
}
export const reverse = (d) => contours(d).map((c) => toD(reverseContour(c))).join('');
/** The same path with islands clockwise and holes the other way. */
export const normaliseD = (d) => normalise(contours(d)).map((c) => toD(c)).join('');
