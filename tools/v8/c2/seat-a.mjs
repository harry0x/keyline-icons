// Option A seats (his pick, 22 Sep 2026): lead R 5, second R 3, where the sparkles read as AI
// rather than as a small sign. For each base, the seat that cuts the least of it such that
//  - the compound's ink box has whole, balanced paddings (left = right, top = bottom), the
//    lead star touching the box in its corner and the base moved by whole units to fill the
//    far sides (a base and its compounds are the same drawing, translated);
//  - a small closed part (a head, a node: bbox 8 or under) is never cut;
//  - the second star keeps 2 painted units from the lead, off its axes (tips never face tips);
//  - the sharp drawing is split no more than the rounded one: a square corner reaches further
//    than a fillet, and file's fold split at its corner in sharp only (22 Sep 2026).
//   PROTECT=all | PROTECT=0,2   stroke subpaths (base order) that must come through uncut
//   MAXSHIFT=4                   how far the base may move, whole units (default 3)
//   node seat-a.mjs name[:tr|tl|br|bl] ...   prints spec entries for spec.json; a corner holds the lead
//   there (the corner he approved on the sheet), else every corner is tried
import { readFileSync } from 'node:fs';
import { cut, polyOf, distTo, starPolys } from './cutter.mjs';
import { translate } from '../c1/kit.mjs';
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
// his sizes, settled 22 Sep 2026: lead 8 x 8, second 5 x 5 (A was first shown at 10 and 6)
const RL = +(process.env.RL || 4), RS = +(process.env.RS || 2.5), AIR = 2;
const tags = (s) => [...s.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const dOf = (t) => t.match(/ d="([^"]+)"/)[1];
const stroked = (t) => / stroke="(?!none)/.test(t);
const lenOf = (d) => (d ? polyOf(d, 24).reduce((a, q) => a + q.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0), 0) : 0);
const bbox = (d) => { const P = polyOf(d, 24).flat(); const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const safeCut = (d, st) => { try { return cut(d, st, { air: AIR, box: 3, keep: 1.5 }).d || ''; } catch { return null; } };
const minDist = (d, star) => { const S = starPolys([star])[0]; return Math.min(...polyOf(d, 48).flat().map((p) => distTo(p, S))); };
const gapStars = (a, b) => { const A = starPolys([a])[0]; return Math.min(...starPolys([b])[0][0].map((p) => distTo(p, A))); };
const CORNERS = { tr: [1, -1], br: [1, 1], tl: [-1, -1], bl: [-1, 1] };
export function seat(name, corner, top = 0) {
  // a containered base lives in its glyph's set (build.mjs's CONTAINER table)
  const [dir, box] = { 'circle-trending-up': ['trending-up', 'circle'], 'square-trending-up': ['trending-up', 'square'] }[name] || [name, 'regular'];
  const src = tags(readFileSync(`${ROOT}/raw/${dir}/Container=${box}, Style=stroke, Corners=regular.svg`, 'utf8'));
  const strokes = src.filter(stroked).map(dOf).join('');
  const sharpStrokes = tags(readFileSync(`${ROOT}/raw/${dir}/Container=${box}, Style=stroke, Corners=sharp.svg`, 'utf8')).filter(stroked).map(dOf).join('');
  const sharpTotal = lenOf(sharpStrokes);
  const subs = strokes.match(/M[^M]+/g);
  // ink box of the base: stroke centre lines grown by 1, fills as drawn
  const fills = src.filter((t) => !stroked(t)).map(dOf).join('');
  const bb = bbox(strokes + fills);
  const ink = [bb[0] - 1, bb[1] - 1, bb[2] + 1, bb[3] + 1].map((v) => Math.round(v * 2) / 2);
  const small = subs.filter((sp) => /Z/i.test(sp) && (() => { const b = bbox(sp); return Math.max(b[2] - b[0], b[3] - b[1]) <= 8; })());
  const total = lenOf(strokes);
  // cuts in a drawing: one per run past the first, one per loop opened
  const breaks = (d) => (d.match(/M/g) || []).length - (d.match(/Z/gi) || []).length;
  const PROT = process.env.PROTECT === 'all' ? subs.map((_, i) => i) : (process.env.PROTECT || '').split(',').filter(Boolean).map(Number);
  const MAXS = +(process.env.MAXSHIFT || 3);
  // every protected subpath comes through the cut whole, at this shift and with these stars
  const whole = (dx, dy, stars) => PROT.every((i) => { const sp = translate(subs[i], [dx, dy]); const k = safeCut(sp, stars); return k !== null && Math.abs(lenOf(k) - lenOf(sp)) < 0.05; });
  const cands = [];
  // corner: sx, sy = +1 for right/bottom
  for (const [sx, sy] of corner ? [CORNERS[corner]] : Object.values(CORNERS)) for (let L = 1; L <= 4; L++) for (let T = 1; T <= 4; T++) {
    // the far sides come from the base, the near sides from the lead star
    const dx = sx > 0 ? L - ink[0] : (24 - L) - ink[2];
    const dy = sy > 0 ? T - ink[1] : (24 - T) - ink[3];
    if (dx % 1 || dy % 1 || Math.abs(dx) > MAXS || Math.abs(dy) > MAXS) continue;
    const moved = [ink[0] + dx, ink[1] + dy, ink[2] + dx, ink[3] + dy];
    if (moved[0] < L || moved[1] < T || moved[2] > 24 - L || moved[3] > 24 - T) continue;
    const c = [sx > 0 ? 24 - L - RL : L + RL, sy > 0 ? 24 - T - RL : T + RL];
    const lead = { c, R: RL };
    const S = translate(strokes, [dx, dy]);
    if (small.some((sp) => minDist(translate(sp, [dx, dy]), lead) < AIR + 1)) continue;
    const k = safeCut(S, [lead]); if (k === null) continue;
    if (!whole(dx, dy, [lead])) continue;
    cands.push({ dx, dy, L, T, lead, S, SS: translate(sharpStrokes, [dx, dy]), dmg: total - lenOf(k) + 1.5 * (Math.abs(dx) + Math.abs(dy)) });
  }
  cands.sort((a, b) => a.dmg - b.dmg);
  let best = null;
  const tryAt = (cd, x, y) => {
      const s = { c: [x, y], R: RS };
      const far = Math.hypot(x - cd.lead.c[0], y - cd.lead.c[1]);
      if (far > RL + RS + 7 || gapStars(cd.lead, s) < AIR) return;
      if (small.some((sp) => minDist(translate(sp, [cd.dx, cd.dy]), s) < AIR + 1)) return;
      const k = safeCut(cd.S, [cd.lead, s]); if (k === null) return;
      if (!whole(cd.dx, cd.dy, [cd.lead, s])) return;
      const ks = safeCut(cd.SS, [cd.lead, s]); if (ks === null) return;
      // sharp may trim a free end further (its ends run out past the round cap), but it may not
      // break a stroke the rounded drawing keeps whole (file's fold): a new run or an opened loop.
      // A square corner reaches further than a fillet: sharp eraser's body opened at 8 and 5, 22 Sep
      if (breaks(ks) - breaks(cd.SS) > breaks(k) - breaks(cd.S)) return;
      const off = Math.abs(Math.sin(2 * Math.atan2(y - cd.lead.c[1], x - cd.lead.c[0])));
      const cost = total - lenOf(k) + 1.5 * (Math.abs(cd.dx) + Math.abs(cd.dy)) + 0.15 * far + 3 * (1 - off);
      if (!best || cost < best.cost) best = { cost, cd, s };
      // distinct arrangements: the lead's corner and the side the second star takes
      const key = `${cd.lead.c[0] > 12 ? 'r' : 'l'}${cd.lead.c[1] > 12 ? 'b' : 't'}:${Math.sign(Math.round(s.c[0] - cd.lead.c[0]))},${Math.sign(Math.round(s.c[1] - cd.lead.c[1]))}`;
      if (!groups.has(key) || cost < groups.get(key).cost) groups.set(key, { cost, cd, s, key });
  };
  const groups = new Map();
  // coarse on whole units, then the half units round the best
  for (const cd of cands.slice(0, top ? 12 : 3)) {
    const box = [cd.L, cd.T, 24 - cd.L, 24 - cd.T];
    for (let x = box[0] + RS; x <= box[2] - RS; x += 1) for (let y = box[1] + RS; y <= box[3] - RS; y += 1) tryAt(cd, x, y);
  }
  if (top) return [...groups.values()].sort((a, b) => a.cost - b.cost).slice(0, top).map(({ cd, s, key }) => ({ key, spec: { lead: [...cd.lead.c, RL], small: [...s.c, RS], ...(cd.dx || cd.dy ? { shift: [cd.dx, cd.dy] } : {}) }, pads: [cd.L, cd.T] }));
  if (!best) return null;
  { const { cd, s } = best; const box = [cd.L, cd.T, 24 - cd.L, 24 - cd.T];
    for (let x = s.c[0] - 1; x <= s.c[0] + 1; x += (RS % 1 ? 1 : 0.5)) for (let y = s.c[1] - 1; y <= s.c[1] + 1; y += (RS % 1 ? 1 : 0.5))
      if (x >= box[0] + RS && x <= box[2] - RS && y >= box[1] + RS && y <= box[3] - RS) tryAt(cd, x, y); }
  const { cd, s } = best;
  const out = { lead: [...cd.lead.c, RL], small: [...s.c, RS] };
  if (cd.dx || cd.dy) out.shift = [cd.dx, cd.dy];
  return { spec: out, pads: [cd.L, cd.T], cut: +(total - lenOf(safeCut(cd.S, [cd.lead, s]))).toFixed(1), total: +total.toFixed(1) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const top = +(process.env.TOP || 0);
  for (const a of process.argv.slice(2)) { const [n, cn] = a.split(':'); if (top) { for (const o of seat(n, cn || null, top)) console.log(n, o.key, JSON.stringify(o.spec), 'pads ' + o.pads.join('/')); continue; } const r = seat(n, cn); console.log(n, JSON.stringify(r && r.spec), r ? `pads ${r.pads.join('/')} cut ${r.cut}/${r.total}` : 'NO SEAT'); }
}
