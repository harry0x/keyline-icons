// Replay the cutter on his 59: shipped base (shifted as build.mjs finds) + his stars,
// then compare the cut ends with his.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse } from '../cut.mjs';
import { shiftOf } from '../c1/build.mjs';
import { load, baseOf, translate } from '../c1/kit.mjs';
import { cut } from './cutter.mjs';
const ROOT = decodeURIComponent(new URL('../../..', import.meta.url).pathname).replace(/\/$/, '');
const opts = JSON.parse(process.argv[2] || '{}');
const endsOf = (d) => parse(d).filter((s) => !s.closed).flatMap((s) => [s.start, s.segs.at(-1).p1]);
let hit = 0, tot = 0; const rows = [];
for (const n of readdirSync('npb/raw').filter((n) => n.endsWith('-sparkles')).sort()) {
  let v; try { v = shiftOf(n)?.v; } catch { continue; }
  if (!v) continue;
  const bf = `${ROOT}/raw/${baseOf(n)}/Container=regular, Style=stroke, Corners=regular.svg`; if (!existsSync(bf)) continue;
  const base = [...readFileSync(bf, 'utf8').matchAll(/<path[^>]*>/g)].map((m) => m[0]).filter((t) => / stroke="(?!none)/.test(t)).map((t) => translate(t.match(/ d="([^"]+)"/)[1], v)).join('');
  const ic = load(n);
  const stars = ic.stars.map((s) => ({ c: s.c, R: s.R }));
  const mine = cut(base, stars, opts).d;
  const his = ic.strokes.join('');
  const baseEnds = endsOf(base), near = (p, L) => L.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05);
  const hisCut = endsOf(his).filter((p) => !near(p, baseEnds)), myCut = endsOf(mine).filter((p) => !near(p, baseEnds));
  const matched = hisCut.filter((p) => myCut.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.15)).length;
  hit += matched; tot += hisCut.length;
  rows.push(`${n.replace('-sparkles', '').padEnd(18)} his ${hisCut.length} mine ${myCut.length} matched ${matched}` + (matched < hisCut.length ? `  his: ${hisCut.map((p) => p.map((x) => +x.toFixed(2)).join(',')).join(' ')} | mine: ${myCut.map((p) => p.map((x) => +x.toFixed(2)).join(',')).join(' ')}` : ''));
}
console.log(rows.join('\n')); console.log(`cut ends matched ${hit} of ${tot}`);
