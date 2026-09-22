// Rank sparkle seats on a base, scored the way his 59 read: little of the base
// lost, no feature destroyed, a balanced ink box, the lead star in a corner
// (top right first), the small one close by.
import { readFileSync } from 'node:fs';
import { star } from '../star.mjs';
import { parse, at } from '../cut.mjs';
import { polyOf, distTo } from './cutter.mjs';

export function loadBase(file) {
  const svg = readFileSync(file, 'utf8');
  const tags = [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
  const strokes = tags.filter((t) => / stroke="(?!none)/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  const dots = tags.filter((t) => !/ stroke="(?!none)/.test(t)).map((t) => t.match(/ d="([^"]+)"/)[1]).join('');
  return { strokes, dots };
}
// centre-line samples every 0.1, tagged with their subpath
function samples(d) {
  const out = []; let si = 0;
  for (const s of parse(d)) { for (const g of s.segs) { const L = g.t === 'L' ? Math.hypot(g.p1[0] - g.p0[0], g.p1[1] - g.p0[1]) : 0; const k = g.t === 'L' ? Math.max(1, Math.ceil(L / 0.1)) : 60; for (let i = 0; i < k; i++) out.push({ p: at(g, i / k), s: si }); } out.push({ p: s.segs.at(-1).p1, s: si }); si++; }
  // weight: arc length per sample
  for (let i = 0; i < out.length; i++) { const n = out[i + 1]; out[i].w = n && n.s === out[i].s ? Math.hypot(n.p[0] - out[i].p[0], n.p[1] - out[i].p[1]) : 0; }
  return out;
}
// distance field of one star at R about the origin, 0.05 grid
const DT = new Map();
function starDT(R) {
  if (DT.has(R)) return DT.get(R);
  const H = R + 8, S = 0.05, N = Math.ceil((2 * H) / S);
  const P = [polyOf(star([0, 0], R), 16)[0]];
  const g = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = distTo([-H + (x + 0.5) * S, -H + (y + 0.5) * S], P);
  const f = { H, S, N, g, at: (dx, dy) => { const x = Math.floor((dx + H) / S), y = Math.floor((dy + H) / S); return x < 0 || y < 0 || x >= N || y >= N ? 99 : g[y * N + x]; }, poly: P[0] };
  DT.set(R, f); return f;
}
export function rank(base, { top = 6 } = {}) {
  const S = samples(base.strokes);
  const subLen = []; for (const q of S) subLen[q.s] = (subLen[q.s] || 0) + q.w;
  const dots = base.dots ? parse(base.dots).map((s) => { const q = polyOf(`M${s.start[0]} ${s.start[1]}` + '', 1); const pts = [s.start]; for (const g of s.segs) for (let i = 1; i <= 12; i++) pts.push(at(g, i / 12)); return pts; }) : [];
  const inkBox = (kept, stars) => { let b = [99, 99, -99, -99]; for (const q of kept) b = [Math.min(b[0], q.p[0] - 1), Math.min(b[1], q.p[1] - 1), Math.max(b[2], q.p[0] + 1), Math.max(b[3], q.p[1] + 1)]; for (const d of dots) if (!d.gone) for (const p of d) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]; for (const s of stars) b = [Math.min(b[0], s.c[0] - s.R), Math.min(b[1], s.c[1] - s.R), Math.max(b[2], s.c[0] + s.R), Math.max(b[3], s.c[1] + s.R)]; return b; };
  const cands = [];
  const BB = S.reduce((b, q) => [Math.min(b[0], q.p[0] - 1), Math.min(b[1], q.p[1] - 1), Math.max(b[2], q.p[0] + 1), Math.max(b[3], q.p[1] + 1)], [99, 99, -99, -99]);
  const Rs = [3, 3.5, 4], rs = [2, 2.5];
  for (const R of Rs) {
    const F = starDT(R);
    for (let cx = 1 + R; cx <= 23 - R + 1e-9; cx += 0.5) for (let cy = 1 + R; cy <= 23 - R + 1e-9; cy += 0.5) {
      const touched = new Set(); S.forEach((q) => { if (F.at(q.p[0] - cx, q.p[1] - cy) < 3) touched.add(q.s); });
      const needs = touched.size > 0;
      const Hb = R + 3;
      // the box clears only what the star itself touches, as his frames show
      const gone = S.map((q) => F.at(q.p[0] - cx, q.p[1] - cy) < 3 || (touched.has(q.s) && Math.abs(q.p[0] - cx) < Hb && Math.abs(q.p[1] - cy) < Hb));
      const dotHit = dots.filter((d) => d.some((p) => F.at(p[0] - cx, p[1] - cy) < 2)).length;
      let lost = 0; const lostBy = {}; S.forEach((q, i) => { if (gone[i]) { lost += q.w; lostBy[q.s] = (lostBy[q.s] || 0) + q.w; } });
      let lossCost = 0, killed = 0;
      for (const [si, l] of Object.entries(lostBy)) { const fr = l / subLen[si]; if (fr > 0.6) { killed++; lossCost += 4; } else lossCost += fr * 3; }
      lossCost += lost * 0.05;
      if (killed > 1 || dotHit || lost > 22) continue;
      cands.push({ R, c: [cx, cy], gone, lost, killed, needs, lossCost });
    }
  }
  const out = [];
  for (const L of cands) {
    const kept = S.filter((q, i) => !L.gone[i]);
    // his lead star sits in a corner of the drawing, its ink flush with the two outer edges; top right first
    const corners = [[BB[2] - L.R, BB[1] + L.R, 0], [BB[2] - L.R, BB[3] - L.R, 0.4], [BB[0] + L.R, BB[1] + L.R, 0.9], [BB[0] + L.R, BB[3] - L.R, 1.1]];
    const prior = !L.needs ? 0.8 : Math.min(...corners.map(([x, y, k]) => Math.hypot(L.c[0] - x, L.c[1] - y) * 0.45 + k));
    let best = null;
    for (const r of rs) {
      const f = starDT(r), FL = starDT(L.R);
      for (let cx = 1 + r; cx <= 23 - r + 1e-9; cx += 0.5) for (let cy = 1 + r; cy <= 23 - r + 1e-9; cy += 0.5) {
        const dx = cx - L.c[0], dy = cy - L.c[1], cd = Math.hypot(dx, dy);
        let ss = 99; for (const p of f.poly) ss = Math.min(ss, FL.at(p[0] + dx, p[1] + dy)); if (ss < 2) continue;
        if (kept.some((q) => f.at(q.p[0] - cx, q.p[1] - cy) < 3)) continue; // the small star sits clear
        if (dots.some((d) => d.some((p) => f.at(p[0] - cx, p[1] - cy) < 2))) continue;
        const box = inkBox(kept, [{ c: L.c, R: L.R }, { c: [cx, cy], R: r }]);
        const pads = box.map((v, i) => +(i < 2 ? v : 24 - v).toFixed(3));
        if (Math.min(...pads) < 1 - 1e-6) continue;
        const imb = Math.abs(pads[0] - pads[2]) + Math.abs(pads[1] - pads[3]);
        const whole = pads.every((v) => Math.abs(v - Math.round(v)) < 1e-6) ? 0 : 0.5;
        const cl = ss <= 4.5 ? 0 : cd > 11 ? 1.0 : 0.6 + (ss - 4.5) * 0.1;
        const score = L.lossCost + imb * 1.5 + whole + prior + cl + (L.R === 3.5 ? 0 : L.R === 3 ? 0.2 : 0.3) + (r === 2 ? 0 : 0.2);
        if (!best || score < best.score) best = { score: +score.toFixed(2), lead: [...L.c, L.R], small: [cx, cy, r], lost: +L.lost.toFixed(1), imb: +imb.toFixed(2), ss: +ss.toFixed(2), pads };
      }
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.score - b.score);
  // keep distinct lead seats
  const res = [];
  for (const o of out) if (!res.some((r) => Math.hypot(r.lead[0] - o.lead[0], r.lead[1] - o.lead[1]) < 3)) { res.push(o); if (res.length >= top) break; }
  return res;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const all = {};
  for (const n of names) {
    const t = Date.now();
    const r = rank(loadBase(`${ROOT}/refs/${n}.svg`), { top: 4 });
    all[n] = r;
    console.log(n, `${Date.now() - t}ms`); for (const o of r) console.log('  ', JSON.stringify(o));
  }
  if (outArg) (await import('node:fs')).writeFileSync(outArg.slice(6), JSON.stringify(all, null, 1));
}
