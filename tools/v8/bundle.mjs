/**
 * The style builder as one `use_figma` body.
 *
 * Sending the finished paths is not on: 147 variants are 293 KB of `d`, which
 * is thirty pastes. The geometry the plugin needs is already IN the file — the
 * stroke variant of every set — so the algorithm travels instead of its
 * output, once, at about 9 KB, and each call builds ten icons.
 *
 * Built by concatenating the modules with their imports and exports stripped,
 * so the plugin runs the same code this repo tests locally.
 *
 *   node tools/v8/bundle.mjs > body.js
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DUPES = ['sub', 'add', 'mul', 'len', 'unit', 'leftOf', 'dot', 'onArc', 'rad', 'K', 'cross', 'at', 'startPt', 'endPt', 'revSeg', 'paramOf', 'cut', 'segAt', 'spanOf', 'dirIn', 'dirOut', 'turn', 'cubicAt', 'polyOf', 'areaOf', 'insidePoly'];
/** Drop a whole declaration, not just its first line: cutting `const at =`
 *  and leaving its body behind is how the bundle came back with a stray `};`. */
const dedupe = (src) => {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hit = DUPES.some((n) => new RegExp(`^(?:export )?const ${n} = `).test(l) || new RegExp(`^(?:export )?function ${n}\\b`).test(l));
    if (!hit) { out.push(l); continue; }
    let depth = (l.match(/[({[]/g) || []).length - (l.match(/[)}\]]/g) || []).length;
    let terminated = /;\s*$/.test(l) && depth <= 0;
    while (!terminated && i + 1 < lines.length) {
      i++;
      const m = lines[i];
      depth += (m.match(/[({[]/g) || []).length - (m.match(/[)}\]]/g) || []).length;
      if (depth <= 0 && /[;}]\s*$/.test(m)) terminated = true;
    }
  }
  return out.join('\n');
};
const strip = (src) => src
  .replace(/^import[^;]*;$/gm, '')
  .replace(/^export (const|function|class|let)/gm, '$1')
  .replace(/^export \{[^}]*\};?$/gm, '')
  .replace(/^\/\*\*[\s\S]*?\*\/$/m, '')          // the file's own banner
  .replace(/\n{3,}/g, '\n\n');

// v5/geom.mjs brings onArc/add/sub/mul/unit/len/dot, which v6's crossings uses
const geom = readFileSync(join(ROOT, 'tools/v5/geom.mjs'), 'utf8');
const pick = (src, names) => names.map((n) => {
  const re = new RegExp(`^export (const ${n} = [^\\n]*|function ${n}\\b[\\s\\S]*?\\n\\})`, 'm');
  const m = src.match(re);
  if (!m) throw new Error('not found in geom: ' + n);
  return m[1];
}).join('\n');

/** Only the pieces of v6 the union walk reaches. */
const pick6 = (src) => {
  const want = ['lineLine', 'lineArc', 'arcArc', 'distToSeg', 'distToRunEnd'];
  const out = [];
  for (const n of want) {
    const m = src.match(new RegExp(`^(?:export )?function ${n}\\b[\\s\\S]*?\\n\\}`, 'm'))
      || src.match(new RegExp(`^(?:export )?const ${n} = [\\s\\S]*?\\n\\};`, 'm'));
    if (!m) throw new Error('not found in v6: ' + n);
    out.push(m[0].replace(/^export /, ''));
  }
  for (const n of ['within', 'crossings', 'distToRun']) {
    const m = src.match(new RegExp(`^export const ${n} = [\\s\\S]*?\\n\\};`, 'm'))
      || src.match(new RegExp(`^export const ${n} = [^\\n]*;`, 'm'))
      || src.match(new RegExp(`^export const ${n} =[\\s\\S]*?;`, 'm'));
    if (!m) throw new Error('not found in v6: ' + n);
    out.push(m[0].replace(/^export /, ''));
  }
  return out.join('\n');
};

const SHARED = `
const degR = (r) => (r * 180) / Math.PI;
const ang = (c, p) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const leftOf = ([x, y]) => [y, -x];
const startPt = (s) => (s.type === 'A' ? onArc(s.c, s.r, s.a0) : s.p0);
const endPt = (s) => (s.type === 'A' ? onArc(s.c, s.r, s.a1) : s.p1);
const revSeg = (s) => (s.type === 'L' ? { type: 'L', p0: s.p1, p1: s.p0 }
  : s.type === 'A' ? { type: 'A', c: s.c, r: s.r, a0: s.a1, a1: s.a0 }
  : { type: 'C', p0: s.p1, c1: s.c2, c2: s.c1, p1: s.p0 });
const cubicAt = (s, t) => { const v = 1 - t;
  return [v*v*v*s.p0[0] + 3*v*v*t*s.c1[0] + 3*v*t*t*s.c2[0] + t*t*t*s.p1[0],
          v*v*v*s.p0[1] + 3*v*v*t*s.c1[1] + 3*v*t*t*s.c2[1] + t*t*t*s.p1[1]]; };
const segAt = (s, t) => (s.type === 'L' ? add(s.p0, mul(sub(s.p1, s.p0), t))
  : s.type === 'A' ? onArc(s.c, s.r, s.a0 + (s.a1 - s.a0) * t) : cubicAt(s, t));
const at = (s, t) => (s.t === 'L' || s.t === 'C' ? (s.t === 'L' ? add(s.p0, mul(sub(s.p1, s.p0), t)) : cubicAt(s, t)) : segAt(s, t));
const paramOf = (s, p) => { if (s.type === 'L') { const u = sub(s.p1, s.p0); return dot(sub(p, s.p0), u) / dot(u, u); }
  const span = s.a1 - s.a0, dir = Math.sign(span) || 1; let a = ang(s.c, p);
  while (dir * (a - s.a0) < -1e-9) a += 360 * dir;
  while (dir * (a - s.a0) > Math.abs(span) + 1e-9) a -= 360 * dir;
  return (a - s.a0) / span; };
const spanOf = (s) => (s.type === 'L' ? len(sub(s.p1, s.p0)) : (Math.abs(s.a1 - s.a0) * Math.PI * s.r) / 180);
const dirIn = (s) => (s.type === 'L' ? unit(sub(s.p1, s.p0))
  : unit(mul([-Math.sin(rad(s.a1)), Math.cos(rad(s.a1))], Math.sign(s.a1 - s.a0))));
const dirOut = (s) => (s.type === 'L' ? unit(sub(s.p1, s.p0))
  : unit(mul([-Math.sin(rad(s.a0)), Math.cos(rad(s.a0))], Math.sign(s.a1 - s.a0))));
const turn = (a, b) => (Math.atan2(a[0] * b[1] - a[1] * b[0], dot(a, b)) * 180) / Math.PI;
const cutSeg = (s, t0, t1) => (s.type === 'L' ? { type: 'L', p0: segAt(s, t0), p1: segAt(s, t1) }
  : { type: 'A', c: s.c, r: s.r, a0: s.a0 + (s.a1 - s.a0) * t0, a1: s.a0 + (s.a1 - s.a0) * t1 });
`;

const parts = [
  pick(geom, ['K', 'sub', 'add', 'mul', 'len', 'unit', 'dot', 'cross', 'onArc']),
  SHARED,
  dedupe(strip(readFileSync(join(HERE, 'cut.mjs'), 'utf8'))).replace(/const f = [^\n]*\n/, 'const f = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\\.?0+$/, ""); return s === "-0" ? "0" : s; };\n'),
  dedupe(strip(readFileSync(join(HERE, 'arcify.mjs'), 'utf8'))),
  dedupe(strip(readFileSync(join(HERE, 'band.mjs'), 'utf8'))),
  // v6's intersection primitives, which the union walk needs
  pick6(readFileSync(join(ROOT, 'tools/v6/outline.mjs'), 'utf8')),
  // union.mjs carries its own radian `deg`; arcify's takes two points, so the
  // union's is renamed rather than one of them silently winning.
  dedupe(strip(readFileSync(join(HERE, 'union.mjs'), 'utf8'))
    .split('\n').filter((l) => !/^const (deg|ang) = /.test(l)).join('\n')
    .replace(/\bdeg\(/g, 'degR(').replace(/\bcut\(/g, 'cutSeg(')),
];
/** The style composition and the driver, which only exist inside the plugin. */
const DRIVER = `
const contourD = (segs) => {
  let d = '', cur = null;
  for (const s of segs) {
    const a = startPt(s);
    if (!cur || len(sub(a, cur)) > 1e-6) d += 'M' + f(a[0]) + ' ' + f(a[1]);
    if (s.type === 'L') d += 'L' + f(s.p1[0]) + ' ' + f(s.p1[1]);
    else if (s.type === 'C') d += 'C' + f(s.c1[0]) + ' ' + f(s.c1[1]) + ' ' + f(s.c2[0]) + ' ' + f(s.c2[1]) + ' ' + f(s.p1[0]) + ' ' + f(s.p1[1]);
    else {
      const span = s.a1 - s.a0, n = Math.max(1, Math.ceil(Math.abs(span) / 90));
      for (let i = 0; i < n; i++) {
        const a0 = s.a0 + (span * i) / n, a1 = s.a0 + (span * (i + 1)) / n;
        const k = (4 / 3) * Math.tan(rad(a1 - a0) / 4);
        const P = (a) => [s.c[0] + s.r * Math.cos(rad(a)), s.c[1] + s.r * Math.sin(rad(a))];
        const T = (a) => [-Math.sin(rad(a)), Math.cos(rad(a))];
        const p0 = P(a0), p1 = P(a1), t0 = T(a0), t1 = T(a1);
        d += 'C' + f(p0[0] + k * s.r * t0[0]) + ' ' + f(p0[1] + k * s.r * t0[1]) + ' ' + f(p1[0] - k * s.r * t1[0]) + ' ' + f(p1[1] - k * s.r * t1[1]) + ' ' + f(p1[0]) + ' ' + f(p1[1]);
      }
    }
    cur = endPt(s);
  }
  return d + 'Z';
};
const polyOf = (segs) => segs.flatMap((g) => Array.from({ length: 16 }, (_, i) => segAt(g, i / 16)));
const areaOf = (segs) => Math.abs(polyOf(segs).reduce((a, p, i, q) => { const r = q[(i + 1) % q.length]; return a + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
const insidePoly = (poly, p) => { let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c; };
const outerOnly = (loops) => { const polys = loops.map(polyOf);
  return loops.filter((l, i) => !loops.some((o, j) => j !== i && areaOf(o) > areaOf(l) && insidePoly(polys[j], polys[i][0]))); };
const midOf = (run) => segAt(run[Math.floor(run.length / 2)], 0.5);
const distRun = (run, p) => { let m = Infinity;
  for (const s of run) for (let i = 0; i <= 16; i++) { const q = segAt(s, i / 16); m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); }
  return m; };
const runD = (r) => { let d = ''; r.forEach((s, i) => { if (i === 0) { const p = startPt(s); d += 'M' + f(p[0]) + ' ' + f(p[1]); }
  d += contourD([s]).replace(/^M[^LC]*/, '').replace(/Z$/, ''); }); return d; };
const pathsOf = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((t) => ({
  d: (t.match(/ d="([^"]+)"/) || [])[1], stroked: / stroke="(?!none)/.test(t), muted: /-opacity="0\\.4"/.test(t) }));

/** The three extra styles for one drawing, given its base's plate plan. */
function stylesOf(svg, spec, baseStrokeSvg, baseTwoSvg) {
  const paths = pathsOf(svg);
  const strokes = paths.filter((p) => p.stroked), solids = paths.filter((p) => !p.stroked);
  const runs = strokes.flatMap((p) => arcify(p.d).map((sp) => sp.segs));
  let plateRuns = runs;
  if (spec.kind === 'run' && baseStrokeSvg) {
    const baseRuns = pathsOf(baseStrokeSvg).filter((p) => p.stroked).flatMap((p) => arcify(p.d).map((sp) => sp.segs));
    const target = baseRuns[spec.run];
    if (target) { const keep = runs.filter((r) => distRun(target, midOf(r)) < 0.2); if (keep.length) plateRuns = keep; }
  }
  const loops = outerOnly(unionBands(plateRuns.map((r) => band(r, 1).outer), plateRuns, 1, 'round'));
  const plate = loops.map(contourD).join('');
  const SW = (d) => '<path d="' + d + '" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const MU = (d) => '<path d="' + d + '" fill="none" stroke="black" stroke-opacity="0.4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const SO = (d) => '<path d="' + d + '" fill="black"/>';
  const PL = (d) => '<path d="' + d + '" fill="black" fill-opacity="0.4"/>';
  const HD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">';
  const doc = (ls) => HD + ls.filter(Boolean).join('') + '</svg>';
  const out = {};
  if (spec.kind === 'none' && baseTwoSvg) {
    const muted = pathsOf(baseTwoSvg).filter((p) => p.muted).flatMap((p) => arcify(p.d).map((sp) => sp.segs));
    const dim = [], lit = [];
    runs.forEach((r) => (muted.some((m) => distRun(m, midOf(r)) < 0.2) ? dim : lit).push(runD(r)));
    out['two-tone'] = doc([dim.length ? MU(dim.join('')) : null, lit.length ? SW(lit.join('')) : null, ...solids.map((p) => SO(p.d))]);
    out.duotone = out['two-tone'];
  } else {
    out['two-tone'] = doc([PL(plate), ...strokes.map((p) => SW(p.d)), ...solids.map((p) => SO(p.d))]);
    const inside = runs.filter((r) => !plateRuns.includes(r) && loops.some((l) => insidePoly(polyOf(l), midOf(r))));
    out.duotone = doc([PL(plate), ...inside.map((r) => SW(runD(r))), ...solids.map((p) => SO(p.d))]);
  }
  const inside = runs.filter((r) => !plateRuns.includes(r) && loops.some((l) => insidePoly(polyOf(l), midOf(r))));
  const outside = runs.filter((r) => !plateRuns.includes(r) && !inside.includes(r));
  const knock = inside.map((r) => contourD(band(r, 1).outer)).join('');
  out.fill = doc([
    plate ? (knock ? '<path fill-rule="evenodd" clip-rule="evenodd" d="' + plate + knock + '" fill="black"/>' : SO(plate)) : null,
    ...outside.map((r) => SW(runD(r))), ...solids.map((p) => SO(p.d)),
  ]);
  return out;
}
`;

const body = parts.join('\n\n') + '\n' + DRIVER;
// comments are a third of it and the plugin does not read them
const lean = body
  .replace(/^\s*\/\*\*[\s\S]*?\*\/\s*$/gm, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\n{2,}/g, '\n');
console.log(process.argv.includes('--lean') ? lean : body);
