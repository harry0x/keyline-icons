/**
 * Where everything goes, per icon, under the rule he picked on 21 Sep 2026:
 * "C1 plus R2's nudge".
 *
 *   sign    a star that crosses the body's edge and whose box, grown by 2,
 *           opens to the outside. It stays where he drew it, and the body is
 *           notched the house way (app-window-plus): that box, run out past
 *           every side that reaches the body's edge, inner corners r=3.
 *   emblem  a star on the body. If it is not 2 clear of the notch, the body's
 *           edge, every line and every other star, it NUDGES: straight away
 *           from the sign's centre (R2), in whole units so its tips stay on
 *           the grid, the shortest move that clears. Never relocated to
 *           another corner and never shrunk (the judges' amendment to C1).
 *   free    a star off the body: black everywhere, nudged the same way only
 *           if it crowds something.
 *
 * Clearances are read off a 0.1 raster (raster.mjs), so 2 counts from 1.95.
 * His lines are HIS strokes from refs/, trimmed 1 short of the notch.
 *
 *   node tools/v8/c1/layout.mjs [names...]      prints the plan
 */
import { readdirSync, readFileSync } from 'node:fs';
import { load, ROOT, REFS, bbox, contains, starClass, plateOf, polys, translate } from './kit.mjs';
import * as G from './raster.mjs';

const TOL = 1.95;

/** The Figma set names of the batch: every ref but his duplicates and the shipped pen. */
export function batchNames() {
  // his three-bar list is menu-sparkles; bug and headphones dropped 22 Sep (star in the head, an ear cup gone);
  // book-open, chart-pyramid, chart-scatter-3d and code dropped 22 Sep at 8 and 5 (no seat keeps the drawing whole);
  // globe, layers, table, tablet and loader dropped 22 Sep on his word
  const skip = new Set(['list-sparkles', 'pen-sparkles', 'Slice 1', 'bug-sparkles', 'headphones-sparkles', 'book-open-sparkles', 'chart-pyramid-sparkles', 'chart-scatter-3d-sparkles', 'code-sparkles', 'globe-sparkles', 'layers-sparkles', 'table-sparkles', 'tablet-sparkles', 'loader-sparkles']);
  return readdirSync(REFS).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4))
    .filter((n) => !skip.has(n))
    .map((n) => (n === 'list-sparkles-1' ? 'list-sparkles' : n === 'search-s-sparkles' ? 'search-2-sparkles' : n))
    .sort();
}

const strokeLength = (ds) => ds.reduce((a, d) => a + polys(d, 64).reduce((t, q) => t + q.slice(1).reduce((u, p, i) => u + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0), 0);

export function prep(name, v = [0, 0]) {
  const ic = load(name);
  const plate0 = plateOf(ic.base.two), plate = plate0 && translate(plate0, v);
  if (!plate) return { ic, name, plate: null };
  const plateM = G.fillD(plate);
  // only a star that overlaps the body is on it or crossing it; one he drew beside the
  // outline, however close (hand-pointer's 1.6), stays free and keeps his gap
  const stars = ic.stars.map((s, i) => {
    const overlaps = polys(s.d, 8).flat().some((q) => contains(plate, q));
    return { c: [...s.c], R: s.R, d: s.d, i, cls: overlaps ? starClass(s, plate, 1.9) : 'outside' };
  });
  return { ic, name, plate, plateM, plateBox: bbox(plate), stars, cutEnds: cutEnds(ic, v) };
}

/**
 * Where he cut the base: the ends of his strokes that the shifted base carries on
 * past (a line the base ends there too is not a cut).
 */
function cutEnds(ic, v) {
  const base = readFileSync(`${ROOT}/raw/${ic.baseName}/Container=regular, Style=stroke, Corners=regular.svg`, 'utf8');
  const baseD = [...base.matchAll(/<path[^>]*>/g)].map((m) => m[0]).filter((t) => / stroke="(?!none)/.test(t)).map((t) => translate(t.match(/ d="([^"]+)"/)[1], v)).join('');
  const B = polys(baseD, 48).flatMap((q) => q.slice(1).flatMap((b, i) => { const a = q[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05)); return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }));
  const onBase = (p) => B.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.08);
  const ends = [];
  for (const d of ic.strokes) for (const q of polys(d, 48)) {
    if (q.length < 2) continue;
    const closed = Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6;
    if (closed) continue;
    for (const [e, f] of [[q[0], q[1]], [q[q.length - 1], q[q.length - 2]]]) {
      const t = [e[0] - f[0], e[1] - f[1]], L = Math.hypot(...t) || 1;
      if (onBase([e[0] + (t[0] / L) * 0.3, e[1] + (t[1] / L) * 0.3])) ends.push(e);
    }
  }
  return ends;
}

/** His drawing's ink with every stroke trimmed 1 short of the notches. */
function inkOf(p, notches) {
  const m = G.blank();
  for (const d of p.ic.strokes) { const t = G.trimTo(d, notches); if (t.d) G.strokeD(t.d, m); }
  for (const d of p.ic.detail) G.fillD(d, false, m);
  return m;
}
const bodyOf = (p, notches) => G.andNot(p.plateM, G.rrMask(notches));

function roleOf(p, s) {
  if (s.cls === 'inside') return 'emblem';
  if (s.cls === 'outside') return 'free';
  const m = G.andNot(G.rrMask([G.notchFor([s], p.plateBox)]), p.plateM);
  return G.count(m) > 50 ? 'sign' : 'emblem';
}

/** How far a star at q clears everything it must: [edge, ink] in painted units. */
function clears(p, q, R, role, notches, others) {
  const ink = G.edt(G.or(inkOf(p, notches), G.starMask(others)));
  if (role === 'emblem') return [G.clearance(G.edt(G.or(G.not(bodyOf(p, notches)), G.starMask(others))), q, R), G.clearance(ink, q, R)];
  return [G.clearance(G.edt(G.or(bodyOf(p, notches), G.starMask(others))), q, R), G.clearance(ink, q, R)];
}

/**
 * R2's nudge on the grid: whole-unit offsets within `reach`, heading away from
 * the sign (the offset's angle to the bearing under ~35 degrees), the shortest
 * that clears; ties go to the one closer to the bearing.
 */
function nudge(p, s, sign, notches, others, inkNeed, reach = 6) {
  const u0 = [s.c[0] - sign.c[0], s.c[1] - sign.c[1]], L = Math.hypot(...u0), u = [u0[0] / L, u0[1] / L];
  const edgeF = s.role === 'emblem'
    ? G.edt(G.or(G.not(bodyOf(p, notches)), G.starMask(others)))
    : G.edt(G.or(bodyOf(p, notches), G.starMask(others)));
  const inkF = G.edt(G.or(inkOf(p, notches), G.starMask(others)));
  const cands = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    if (!dx && !dy) continue;
    const t = dx * u[0] + dy * u[1], perp = Math.abs(dx * u[1] - dy * u[0]);
    if (t <= 0 || perp > t + 0.01) continue; // within 45 degrees of straight away
    const q = [s.c[0] + dx, s.c[1] + dy];
    if (!G.inCanvas(q, s.R)) continue;
    cands.push({ q, cost: Math.hypot(dx, dy) + 0.5 * perp });
  }
  cands.sort((a, b) => a.cost - b.cost);
  for (const c of cands) if (G.clearance(edgeF, c.q, s.R) >= TOL && G.clearance(inkF, c.q, s.R) >= inkNeed) return c.q;
  return null;
}

function fallback(p, s, notches, others, inkNeed) {
  const inkF = G.edt(G.or(inkOf(p, notches), G.starMask(others)));
  const onF = G.edt(G.or(G.not(bodyOf(p, notches)), G.starMask(others)));
  const offF = G.edt(G.or(bodyOf(p, notches), G.starMask(others)));
  const seek = (F, reach) => {
    const c = [];
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const q = [s.c[0] + dx, s.c[1] + dy];
      if ((dx || dy) && G.inCanvas(q, s.R)) c.push({ q, cost: Math.hypot(dx, dy) });
    }
    c.sort((a, b) => a.cost - b.cost);
    return c.find((x) => G.clearance(F, x.q, s.R) >= TOL && G.clearance(inkF, x.q, s.R) >= inkNeed);
  };
  const on = seek(onF, 7);
  if (on) return { q: on.q, how: 'nearest seat on the body' };
  const off = seek(offF, 14);
  if (off) return { q: off.q, how: 'off the body' };
  return null;
}

export function plan(name, v = [0, 0]) {
  const p = prep(name, v);
  // no plate (the tone split rides the strokes): no body to notch, every star is free
  // where he drew it, and the lines keep his cuts
  if (!p.plate) return { name, noPlate: true, base: p.ic.baseName, v, notches: [], notes: [], stars: p.ic.stars.map((s, i) => ({ c: [...s.c], R: s.R, role: 'free', i, d: s.d })) };
  const stars = p.stars.map((s) => ({ ...s, role: roleOf(p, s) }));
  const signs = stars.filter((s) => s.role === 'sign');
  // a corner star takes the house box (app-window-plus): the box lands where he
  // cut. Anywhere else the box would trim his stroke further than he did, and
  // the star takes the round badge notch instead (bell-dot), 2 clear of its tips.
  const notches = signs.map((s) => {
    const box = G.notchFor([s], p.plateBox);
    const extra = strokeLength(p.ic.strokes) - strokeLength(p.ic.strokes.map((d) => G.trimTo(d, [box]).d).filter(Boolean));
    s.notch = extra <= 0.6 ? 'box' : 'circle';
    s.extra = extra;
    if (s.notch === 'box') {
      // the box lines up with his cut too: a side he cut further back than 2 clear moves
      // out to meet the cap of that line (up to 1), as the round notch grows to his cut
      for (const e of p.cutEnds) {
        const near = signs.reduce((m, o) => (Math.hypot(e[0] - o.c[0], e[1] - o.c[1]) - o.R < Math.hypot(e[0] - m.c[0], e[1] - m.c[1]) - m.R ? o : m), signs[0]);
        if (near !== s) continue;
        const inX = e[0] >= box.x0 && e[0] <= box.x1, inY = e[1] >= box.y0 && e[1] <= box.y1;
        if (inY && e[0] < box.x0) { const g = box.x0 - e[0] - 1; if (g > 0.01 && g <= 1.01) box.x0 -= g; }
        if (inY && e[0] > box.x1) { const g = e[0] - box.x1 - 1; if (g > 0.01 && g <= 1.01) box.x1 += g; }
        if (inX && e[1] < box.y0) { const g = box.y0 - e[1] - 1; if (g > 0.01 && g <= 1.01) box.y0 -= g; }
        if (inX && e[1] > box.y1) { const g = e[1] - box.y1 - 1; if (g > 0.01 && g <= 1.01) box.y1 += g; }
      }
      // never at the cost of a line he kept
      const grown = strokeLength(p.ic.strokes) - strokeLength(p.ic.strokes.map((d) => G.trimTo(d, [box]).d).filter(Boolean));
      if (grown > extra + 0.1) return G.notchFor([s], p.plateBox);
      s.grown = grown;
      return box;
    }
    // the round notch lines up with his cut: wide enough that the cap of every line he
    // cut back from this star lands on it (he often cut further than 2 clear)
    const c = G.circleFor(s);
    for (const e of p.cutEnds) {
      const near = signs.reduce((m, o) => (Math.hypot(e[0] - o.c[0], e[1] - o.c[1]) - o.R < Math.hypot(e[0] - m.c[0], e[1] - m.c[1]) - m.R ? o : m), signs[0]);
      if (near !== s) continue;
      const r = Math.hypot(e[0] - s.c[0], e[1] - s.c[1]) - 1;
      if (r > c.r && r < c.r + 1) c.r = r;
    }
    s.notchR = c.r;
    return c;
  });
  const notes = [];
  for (const s of stars) {
    if (s.role === 'sign') continue;
    const others = stars.filter((o) => o !== s);
    const [e, k] = clears(p, s.c, s.R, s.role, notches, others);
    s.clear = [e, k];
    // only a star the cut crowds moves; one he drew close to a line stays as drawn, and
    // a shortfall under 0.2 is the lint's marginal band, not worth moving his star for
    if (e >= 1.8) continue;
    if (!signs.length) { notes.push(`${s.role} R${s.R} at ${s.c} crowds (${e.toFixed(2)}, ${k.toFixed(2)}) with no sign to nudge from`); s.stuck = true; continue; }
    const sign = signs.slice().sort((a, b) => Math.hypot(a.c[0] - s.c[0], a.c[1] - s.c[1]) - Math.hypot(b.c[0] - s.c[0], b.c[1] - s.c[1]))[0];
    const q = nudge(p, s, sign, notches, others, Math.min(TOL, k - 0.05));
    if (q) { s.from = s.c; s.c = q; continue; }
    // C1's fallbacks, never shrinking: the nearest clear seat anywhere on the body,
    // then the nearest open spot off it
    const fb = process.env.C1_NOFALLBACK ? null : fallback(p, s, notches, others, Math.min(TOL, k - 0.05)); // C1_NOFALLBACK: leave it where he drew it
    if (fb) { s.from = s.c; s.c = fb.q; s.fallback = fb.how; notes.push(`${s.role} R${s.R} could not nudge: ${fb.how} ${s.from}→${fb.q}`); if (fb.how === 'off the body') s.role = 'free'; }
    else { s.stuck = true; notes.push(`${s.role} R${s.R} at ${s.c} has no seat at all (edge ${e.toFixed(2)}, ink ${k.toFixed(2)})`); }
  }
  return { name, base: p.ic.baseName, v, notches, stars: stars.map(({ c, R, role, from, stuck, fallback, notch, extra, notchR, i, d }) => ({ c, R, role, from, stuck, fallback, notch, extra, notchR, i, d })), notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : batchNames();
  let moved = 0, stuck = 0;
  for (const n of names) {
    if (n === 'bot-2') { console.log('bot-2'.padEnd(28), 'standalone, no sparkles'); continue; }
    const L = plan(n);
    if (L.noPlate) { console.log(n.padEnd(28), 'no plate (tone split on strokes)'); continue; }
    const mv = L.stars.filter((s) => s.from).map((s) => `${s.role} R${s.R} ${s.from.join(',')}→${s.c.join(',')}`);
    moved += mv.length ? 1 : 0; stuck += L.notes.length ? 1 : 0;
    const roles = L.stars.map((s) => `${s.role[0]}${s.R}`).join(' ');
    console.log(n.padEnd(28), roles.padEnd(14), mv.join('; ') || '-', L.notes.length ? ' !! ' + L.notes.join(' | ') : '');
  }
  console.log({ moved, stuck });
}
