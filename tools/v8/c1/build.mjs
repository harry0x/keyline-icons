/**
 * The C1 build: eight variants per AI compound, exact geometry (21 Sep 2026).
 *
 * Every style, the regular stroke included, is the SHIPPED base's own variant
 * of that style and corner, so each base keeps every decision it already ships
 * (which part is grey, which black, what is knocked out), then:
 *
 *   shifted     by the vector that makes it his drawing: several of his refs
 *               are the base moved a half or whole unit to centre the
 *               compound (film -1,+1; table, mic, user a half). v is searched
 *               on the quarter unit and must reproduce his stroke to 0.08.
 *   notched     layout.mjs's notches: the house box for a corner star, the
 *               round badge notch for any other star crossing the edge. Areas
 *               lose the notch with r=1 fillets where it meets their edge
 *               (app-window-plus's quarter of each end cap); strokes stop 1
 *               short of it with round caps, flush with butt caps in sharp.
 *   re-cut      every line cut back 2 painted units from every star at its
 *               FINAL seat, the way his refs cut them; a moved star's old cut
 *               closes up again.
 *   cleared     a small filled piece (a sun, a knockout line, a dot) within 2
 *               of a star is dropped; a plate never is.
 *   stars       black; knocked out of a black area they sit on (fill, and the
 *               duotones whose body is black). Sharp stars keep his tip fillet
 *               and lose the waist one.
 *
 * A name whose stroke is not a shifted base (he redrew part of it) is reported
 * and left for hand work.
 *
 *   node tools/v8/c1/build.mjs --out=<dir> [names...]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { plan, batchNames } from './layout.mjs';
import { load, ROOT, baseOf, polys, contains, bbox, translate } from './kit.mjs';
import { trimTo } from './raster.mjs';
import { subtractBox, reverse, area, normaliseD } from './exact.mjs';
import { trim, parse as parseD, at as atSeg, segsToD } from '../cut.mjs';
import { slice as sliceSeg, pt as ptAt } from './exact.mjs';
import { sharpStar } from '../halo.mjs';
import { heal } from './heal.mjs';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
const fmt = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
/* ------------------------------------------------------------ base layers */
const tags = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
function layers(base, style, corners, v = [0, 0]) {
  const f = join(ROOT, 'raw', base, `Container=regular, Style=${style}, Corners=${corners}.svg`);
  if (!existsSync(f)) throw new Error(`no ${f}`);
  // a shipped layer that both fills and strokes a shape (cursor's fill) paints the
  // shape's outer contour: take that from the same corner's two-tone plate
  const both = (t) => / stroke="(?!none)/.test(t) && / fill="(?!none)/.test(t) && !/ fill="none"/.test(t);
  const plate = () => {
    const t = tags(readFileSync(join(ROOT, 'raw', base, `Container=regular, Style=two-tone, Corners=${corners}.svg`), 'utf8')).find((u) => /fill-opacity="0\.4"/.test(u));
    if (!t) throw new Error(`${base} ${style} ${corners}: a layer carries both paints and there is no plate to take its outline from`);
    return `<path d="${t.match(/ d="([^"]+)"/)[1]}" fill="black"/>`;
  };
  return tags(readFileSync(f, 'utf8')).map((t) => (both(t) ? plate() : t)).map((t) => ({
    d: translate(t.match(/ d="([^"]+)"/)[1], v),
    stroked: / stroke="(?!none)/.test(t),
    filled: / fill="(?!none)/.test(t) && !/ fill="none"/.test(t),
    fillOp: +((t.match(/fill-opacity="([\d.]+)"/) || [])[1] ?? 1),
    strokeOp: +((t.match(/stroke-opacity="([\d.]+)"/) || [])[1] ?? 1),
    evenodd: /evenodd/.test(t),
  }));
}

/* ------------------------------------------------------------------ stars */
function starPaths(L, ic) {
  return L.stars.map((s) => {
    const his = ic.stars[s.i];
    return { ...s, orig: his.c, reg: translate(his.d, [s.c[0] - his.c[0], s.c[1] - his.c[1]]), sharp: sharpStar(s.c, s.R) };
  });
}
const onArea = (layer, s) => contains(layer.d, s.c, layer.evenodd);
function knock(d, starD) {
  const same = Math.sign(area(d)) === Math.sign(area(starD));
  return d + (same ? reverse(starD) : starD);
}

/* --------------------------------------------------------------- cutting */
const sharpNotches = (rrs) => rrs.map((rr) => (rr.kind === 'circle' ? rr : { ...rr, r: 0 })); // a badge notch stays round
const notes = [];
const inNotch = (p, rr, g = 0) => (rr.kind === 'circle'
  ? Math.hypot(p[0] - rr.c[0], p[1] - rr.c[1]) <= rr.r + g
  : p[0] >= rr.x0 - g && p[0] <= rr.x1 + g && p[1] >= rr.y0 - g && p[1] <= rr.y1 + g && (() => {
    const r = Math.max(0, rr.r + g), cx = Math.min(Math.max(p[0], rr.x0 - g + r), rr.x1 + g - r), cy = Math.min(Math.max(p[1], rr.y0 - g + r), rr.y1 + g - r);
    return (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r + 1e-9; })());
/** The cut checked against what it should be: body minus notch on a 0.2 grid, fillet band excepted. */
function checkCut(before, after, rr) {
  const bad = [];
  let edge = null; // the body's outline, sampled, only built if needed
  const nearEdge = (p, g = 1.1) => { edge ||= densePts(before); return edge.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= g); };
  for (let y = 0.1; y < 24; y += 0.2) for (let x = 0.1; x < 24; x += 0.2) {
    const p = [x, y];
    if (inNotch(p, rr, 1.1) && !inNotch(p, rr, -1.1)) continue;
    const want = contains(before, p, true) && !inNotch(p, rr);
    if (want === contains(after, p, true)) continue;
    // a fillet at a shallow junction runs further along the edge than 1 unit from the
    // notch: body lost within 1 of the body's own edge and 4 of the notch is that
    if (want && inNotch(p, rr, 4) && nearEdge(p)) continue;
    if (nearEdge(p, 0.15)) continue; // on the outline itself, where sampling a curve decides
    bad.push(`${x.toFixed(1)},${y.toFixed(1)}${want ? '+' : '-'}`);
  }
  if (bad.length > 2) throw new Error(`cut mismatch at ${bad.length} grid points (${JSON.stringify(rr)}): ${bad.slice(0, 8).join(' ')}`);
}
/** Islands a cut leaves under 8 square units are crumbs (clock's rim between two notches); a dot that was there before stays. */
function dropCrumbs(before, after) {
  const small = (d) => (d.match(/M[^M]*/g) || []).filter((sp) => { const a = area(sp); return a > 0 && a < 8; });
  const centre = (sp) => { const b = bbox(sp); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
  const had = small(normaliseD(before)).map(centre);
  const subs = after.match(/M[^M]*/g) || [];
  const kept = subs.filter((sp) => { const a = area(sp); if (!(a > 0 && a < 8)) return true; const c = centre(sp); return had.some((h) => Math.hypot(h[0] - c[0], h[1] - c[1]) < 0.3); });
  if (kept.length < subs.length) notes.push(`dropped ${subs.length - kept.length} crumb(s) a cut left`);
  return kept.join('');
}
function cutArea(d, rrs) {
  const start = d;
  let out = d;
  for (const rr of rrs) {
    let next;
    try { next = subtractBox(out, rr, { fillet: 1 }); }
    catch (e) { next = subtractBox(out, rr, { fillet: 0 }); notes.push(`fillet skipped (${e.message})`); }
    checkCut(out, next, rr);
    out = next;
  }
  return rrs.length ? dropCrumbs(start, out) : out;
}
/**
 * A piece of area his drawing does not outline goes: he drew no line round it, so a
 * plate or a solid there shows past every line (headphones' right cup, which the
 * stars replace). A piece is outlined when most of its edge lies under one of his
 * strokes (within the half width), on his detail, or on a notch. Islands only; a
 * hole goes with the island around it.
 */
function dropOrphans(d, ink, rrs, where) {
  const subs = normaliseD(d).match(/M[^M]*/g) || [];
  const islands = subs.filter((sp) => area(sp) > 0), holes = subs.filter((sp) => area(sp) <= 0);
  const outlined = (sp) => {
    const E = P(sp);
    const on = E.filter((p) => ink.near(p) || rrs.some((rr) => inNotch(p, rr, 0.15) && !inNotch(p, rr, -0.15))).length;
    return on / E.length >= 0.5;
  };
  const keep = islands.filter(outlined);
  if (keep.length === islands.length) return d;
  notes.push(`${where}: dropped ${islands.length - keep.length} piece(s) none of his lines cross`);
  const first = (sp) => { const m = sp.match(/M\s*(-?[\d.]+)[ ,](-?[\d.]+)/); return [+m[1], +m[2]]; };
  return keep.concat(holes.filter((h) => keep.some((sp) => contains(sp, first(h))))).join('');
}
/** A line: stopped at the notches, then cut 2 painted clear of every star. */
function cutLine(d, rrs, sharp, ctx) {
  let out = trimTo(d, rrs, 2, sharp ? 0 : 1).d;
  // his own cuts, replayed: base line he removed near a star that stays put goes here too
  if (out && ctx.removed.length) out = trimBy(out, (p) => ctx.removedNear(p) && !ctx.keptNear(p), 2);
  // a star that moved: its new seat is cleared 2 painted units, as his refs clear theirs
  if (out && ctx.moved.length) out = trim(out, ctx.moved, { gap: 1.9, half: 1, keep: 2 }); // its seat was chosen 2 clear; 1.9 keeps a line at exactly 2
  // and no line may sit nearer a star than his own drawing puts his lines (the sharp base
  // draws some ends differently from the regular one his cuts were read off)
  // (it may shorten a line's end; it may never break a line in two)
  const count = (d) => (d.match(/M/g) || []).length;
  for (const f of ctx.floors || []) if (out) { const t = trim(out, [f.d], { gap: f.gap, half: 1, keep: 2 }); if (t && count(t) <= count(out)) out = t; }
  // butt ends left at one of his corners, and gaps he never cut (heal.mjs)
  if (out && sharp && ctx.onHis) out = heal(out, ctx.onHis);
  return out;
}
/**
 * d with every stretch whose centre line is dead(p) removed; runs under keep go
 * too. A closed ring stays a ring: cut open, it is rotated so the run across its
 * start is one run (two butt caps meeting at a corner leave a notch in sharp);
 * never cut, it keeps its Z so the corner at its start is a join, not two ends.
 */
function trimBy(d, dead, keep) {
  const runs = [];
  for (const sp of parseD(d)) {
    const segs = sp.segs.map((g) => (g.t === 'L' ? { t: 'L', p0: g.p0, p1: g.p1 } : { t: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 }));
    const closed = sp.closed || (segs.length && Math.hypot(segs[0].p0[0] - segs[segs.length - 1].p1[0], segs[0].p0[1] - segs[segs.length - 1].p1[1]) < 1e-6);
    const pieces = [];
    for (const g of segs) {
      const ts = [], n = 120;
      for (let i = 0; i < n; i++) {
        let a = i / n, b = (i + 1) / n;
        if (dead(ptAt(g, a)) !== dead(ptAt(g, b))) { for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (dead(ptAt(g, a)) !== dead(ptAt(g, m))) b = m; else a = m; } ts.push((a + b) / 2); }
      }
      let u0 = 0;
      for (const u of [...ts, 1]) { pieces.push(sliceSeg(g, u0, u)); u0 = u; }
    }
    const live = pieces.map((g) => !dead(ptAt(g, 0.5)));
    if (closed && live.every(Boolean)) { runs.push(segsToD(pieces) + 'Z'); continue; }
    let order = pieces.map((_, i) => i);
    if (closed && live[0] && live[live.length - 1]) { const k = live.lastIndexOf(false); order = [...order.slice(k + 1), ...order.slice(0, k + 1)]; }
    let run = [];
    const flush = () => { if (run.length && run.reduce((a, g) => a + segLength(g), 0) >= keep) runs.push(segsToD(run)); run = []; };
    for (const i of order) { if (live[i]) run.push(pieces[i]); else flush(); }
    flush();
  }
  return runs.join('');
}
const contoursOpen = (d) => parseD(d).map((sp) => sp.segs.map((g) => (g.t === 'L' ? { t: 'L', p0: g.p0, p1: g.p1 } : { t: 'C', p0: g.p0, c1: g.c1, c2: g.c2, p1: g.p1 })));
const segLength = (g) => { let L = 0, a = ptAt(g, 0); for (let i = 1; i <= 16; i++) { const b = ptAt(g, i / 16); L += Math.hypot(b[0] - a[0], b[1] - a[1]); a = b; } return L; };
/** Is any point of subpath sp within g of star s (its own shape)? */
function nearStar(sp, s, g) {
  const P = polys(sp, 16).flat(), S = polys(s.d, 16).flat();
  if (P.some((p) => contains(s.d, p))) return true;
  return P.some((p) => S.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < g));
}

/** One base variant, shifted, notched, re-cut, cleared, with the stars laid on. */
function variant(base, style, corners, v, rrs, stars, ctx) {
  const sharp = corners === 'sharp';
  const Ls = layers(base, style, corners, v);
  const pending = stars.map((s) => ({ ...s, d: sharp ? s.sharp : s.reg, placed: false }));
  const cctx = { ...ctx, moved: pending.filter((s) => s.from).map((s) => s.d),
    floors: pending.filter((s) => !s.from).map((s) => ({ d: s.d, gap: Math.min(2, ctx.gaps[s.i]) - 0.03 })) };
  const out = [];
  for (const l of Ls) {
    if (l.stroked && l.filled) throw new Error(`${base} ${style} ${corners}: a layer carries both paints`);
    if (l.stroked) { const d = cutLine(l.d, rrs, sharp, cctx); if (d) out.push({ kind: 'stroke', d, op: l.strokeOp }); continue; }
    // small pieces (holes and islands) a star now sits on or crowds are dropped; the body is kept
    // a body is anything of 20 square units or more; a smaller piece (sun, dot, knockout
    // line) a star sits on or crowds goes, and only a body takes a star's knockout
    const BODY = 20;
    const subs = l.d.match(/M[^M]*/g) || [];
    const kept = subs.filter((sp) => Math.abs(area(sp)) >= BODY || !pending.some((s) => nearStar(sp, s, 2)));
    if (kept.length < subs.length) notes.push(`${style} ${corners}: dropped ${subs.length - kept.length} piece(s) under a star`);
    let d = kept.join('');
    if (!d) continue;
    d = cutArea(d, rrs);
    if (!d) continue;
    d = dropOrphans(d, ctx.ink, rrs, `${style} ${corners}`);
    if (!d) continue;
    const hasBody = (d.match(/M[^M]*/g) || []).some((sp) => Math.abs(area(sp)) >= BODY);
    if (l.fillOp >= 1 && hasBody) for (const s of pending) if (!s.placed && s.role !== 'sign' && onArea({ ...l, d }, s)) { d = knock(d, s.d); s.placed = true; s.knocked = true; }
    // a star across a split in a black body (brain's fissure) overlaps two pieces with its
    // centre on neither; it would merge into both, and cutting it out needs a boolean
    // this kit has not got, so it stops the build for hand work
    if (l.fillOp >= 1 && hasBody) for (const s of pending) {
      if (s.placed || s.role === 'sign') continue;
      const P0 = polys(s.d, 8).flat();
      const hit = (normaliseD(d).match(/M[^M]*/g) || []).filter((sp) => area(sp) >= BODY && P0.some((q) => contains(sp, q)));
      if (hit.length >= 2 && !process.env.C1_ALLOW_STRADDLE) throw new Error(`${style} ${corners}: a star at ${s.c} straddles ${hit.length} black pieces; it would merge into them`);
    }
    out.push({ kind: 'fill', d, op: l.fillOp, evenodd: l.evenodd || pending.some((s) => s.knocked) });
  }
  const loose = pending.filter((s) => !s.placed).map((s) => s.d).join('');
  if (loose) out.push({ kind: 'fill', d: loose, op: 1 });
  return toSvg(out, sharp);
}
function toSvg(ls, sharp) {
  const cap = sharp ? 'butt' : 'round';
  // strokes merge into one layer per opacity, as the set ships them; fills keep their order
  return HEAD + ls.map((l) => (l.kind === 'stroke'
    ? `<path d="${l.d}" stroke="black"${l.op < 1 ? ` stroke-opacity="${l.op}"` : ''} stroke-width="2" stroke-linecap="${cap}" stroke-linejoin="round"/>\n`
    : `<path${l.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''} d="${l.d}" fill="black"${l.op < 1 ? ` fill-opacity="${l.op}"` : ''}/>\n`)).join('') + '</svg>\n';
}

/* ------------------------------------------ his stroke as a shifted base */
/** Points every 0.1 along a path, lines included (polys() keeps a line's two ends only). */
const densePts = (d) => P(d);
const P = (d) => polys(d, 24).flatMap((q) => q.slice(1).flatMap((b, i) => { const a = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1)); return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }).concat([q[q.length - 1]]));
const oneWay = (A, B) => A.reduce((m, p) => Math.max(m, B.reduce((n, q) => Math.min(n, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity)), 0);
/**
 * The shift v that turns the base's stroke drawing into his, found the way his
 * refs were made: the base cut back 2 painted units from his stars where he
 * put them. Best on the quarter unit, with its drift both ways.
 */
export function shiftOf(name) {
  const ic = load(name), base = baseOf(name);
  const orig = ic.stars.map((s) => s.d);
  const H = P(ic.strokes.join(''));
  const Hs = H.filter((_, i) => i % Math.max(1, Math.floor(H.length / 160)) === 0);
  // his ink must lie on the shifted base (he only ever cut it): score every shift on that alone
  const scored = [];
  for (let dy = -1.5; dy <= 1.5; dy += 0.25) for (let dx = -1.5; dx <= 1.5; dx += 0.25) {
    const T = P(layers(base, 'stroke', 'regular', [dx, dy]).filter((l) => l.stroked).map((l) => l.d).join(''));
    scored.push({ v: [dx, dy], on: oneWay(Hs, T) });
  }
  scored.sort((a, b) => a.on - b.on || Math.hypot(...a.v) - Math.hypot(...b.v));
  // the full check on the best few: his ink on the base (the criterion), and how much
  // more base survives a 2-unit cut round his stars than he kept (only reported: he
  // often cut further, and the notch reproduces that)
  let best = null;
  for (const c of scored.slice(0, 3)) {
    const T = P(layers(base, 'stroke', 'regular', c.v).filter((l) => l.stroked).map((l) => l.d).join(''));
    const a = oneWay(H, T);
    if (!best || a < best.drift) best = { v: c.v, drift: a, hisOnly: a };
  }
  const theirs = layers(base, 'stroke', 'regular', best.v).filter((l) => l.stroked).map((l) => trim(l.d, orig, { gap: 2, half: 1, keep: 0.75 })).filter(Boolean).join('');
  best.baseOnly = oneWay(P(theirs), H);
  return best;
}

/**
 * What he cut from the base, as points: base centre line (shifted, notched) that
 * his drawing does not carry, near a star that stays where he put it. Cuts that
 * belonged to a star that moved are not replayed: its old seat closes up.
 */
function hisCuts(ic, base, v, L, stars) {
  const his = P(ic.strokes.join(''));
  const baseLine = P(layers(base, 'stroke', 'regular', v).filter((l) => l.stroked).map((l) => trimTo(l.d, L.notches, 2, 1).d).filter(Boolean).join(''));
  const origin = stars.map((s) => ({ c: s.orig, R: s.R, moved: !!s.from }));
  const grid = (pts) => { const g = new Map(); for (const p of pts) { const k = `${Math.floor(p[0])},${Math.floor(p[1])}`; (g.get(k) || g.set(k, []).get(k)).push(p); } return g; };
  const near = (g, p, r) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of g.get(`${Math.floor(p[0]) + dx},${Math.floor(p[1]) + dy}`) || []) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < r) return true; return false; };
  const H = grid(his);
  // C1_CUTTOL: where his drawing sits a little off the base (mic's 0.21), a difference is not a cut
  const removed = baseLine.filter((p) => !near(H, p, +(process.env.C1_CUTTOL || 0.08))).filter((p) => {
    const o = origin.reduce((m, s) => (Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.R < Math.hypot(p[0] - m.c[0], p[1] - m.c[1]) - m.R ? s : m), origin[0]);
    return o && !o.moved;
  });
  const Rg = grid(removed);
  // his painted gap from each star to his nearest line
  const gaps = {};
  for (const s of stars) { const S = P(ic.stars[s.i].d); gaps[s.i] = his.reduce((m, p) => Math.min(m, S.reduce((n, q) => Math.min(n, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity)), Infinity) - 1; }
  // everything he drew but the stars: an area piece whose edge none of it covers goes
  const D = grid(P(ic.detail.join('')));
  const wide = (g, p, r) => { for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const q of g.get(`${Math.floor(p[0]) + dx},${Math.floor(p[1]) + dy}`) || []) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < r) return true; return false; };
  const ink = { near: (p) => wide(H, p, 1.05) || near(D, p, 0.15) };
  return { removed, removedNear: (p) => near(Rg, p, 0.35), keptNear: (p) => near(H, p, 0.2), onHis: (p, r) => near(H, p, r), gaps, ink };
}

/* ------------------------------------------------------------------- icon */
export function build(name, L, v) {
  const ic = load(name), base = baseOf(name);
  notes.length = 0;
  const stars = starPaths(L, ic);
  const rr = { regular: L.notches, sharp: sharpNotches(L.notches) };
  const ctx = hisCuts(ic, base, v, L, stars);
  const out = {};
  for (const corners of ['regular', 'sharp']) for (const style of ['stroke', 'two-tone', 'duotone', 'fill'])
    out[`Container=regular, Style=${style}, Corners=${corners}.svg`] = variant(base, style, corners, v, rr[corners], stars, ctx);
  return { out, notes: [...new Set(notes)] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const OUT = arg('out', '/tmp/c1');
  const plansFile = join(OUT, 'plans.json');
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const todo = names.length ? names : batchNames().filter((n) => n !== 'bot-2');
  mkdirSync(OUT, { recursive: true });
  const plans = existsSync(plansFile) ? JSON.parse(readFileSync(plansFile, 'utf8')) : {};
  const report = [];
  for (const n of todo) {
    if (!plans[n]) {
      const sh = shiftOf(n);
      plans[n] = plan(n, sh && sh.drift <= (process.env.C1_DRIFT || 0.08) ? sh.v : [0, 0]);
      plans[n].shift = sh;
      writeFileSync(plansFile, JSON.stringify(plans, null, 1));
    }
    const L = plans[n], sh = L.shift;
    if (!sh || sh.drift > (process.env.C1_DRIFT || 0.08)) { report.push(`${n}: REDRAWN (best shift ${sh?.v}: his ink ${sh?.hisOnly.toFixed(2)} off the base)`); continue; }
    try {
      const { out, notes: ns } = build(n, L, sh.v);
      const dir = join(OUT, 'raw', n);
      mkdirSync(dir, { recursive: true });
      for (const [f, svg] of Object.entries(out)) writeFileSync(join(dir, f), svg);
      // how far the regular stroke drawing now sits from his, both ways
      const mine = [...out['Container=regular, Style=stroke, Corners=regular.svg'].matchAll(/<path d="([^"]+)" stroke=/g)].map((m) => m[1]).join('');
      const his = load(n).strokes.join('');
      const away = Math.max(oneWay(P(mine), P(his)), oneWay(P(his), P(mine)));
      if (away > 0.05) ns.push(`his stroke changed by ${away.toFixed(2)}`);
      const flags = [...ns, ...(L.notes || [])];
      report.push(`${n}: ${flags.length ? 'BUILT*' : 'BUILT'}${sh.v[0] || sh.v[1] ? ` shift ${sh.v}` : ''}${flags.length ? ' · ' + flags.join(' · ') : ''}`);
    } catch (e) { report.push(`${n}: FAILED ${e.message}`); }
  }
  writeFileSync(plansFile, JSON.stringify(plans, null, 1));
  writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
}
