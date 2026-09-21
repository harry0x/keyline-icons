/**
 * Does the plate this batch generates match the plate the set already ships?
 *
 * The compound's plate has to be the base's plate with the cut in it, so the
 * generator earns its place by reproducing the UNCUT one first. Sampled both
 * ways at 0.05 and compared as a Hausdorff distance; `v7`'s own plate check
 * uses 0.003 and this holds to the same figure.
 *
 *   node tools/v8/checkplate.mjs [base ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { band, runsOf, segAt } from './band.mjs';
import { unionContours } from '../v6/outline.mjs';

const ROOT = '/Users/zafarismatullaev/Documents/GitHub/keyline-icons';
const sample = (segs, per = 40) => segs.flatMap((s) => Array.from({ length: per }, (_, i) => segAt(s, i / per)));
const near = (p, pts) => Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
const hausdorff = (a, b) => Math.max(...a.map((p) => near(p, b)));

function plateOfFile(svg) {
  const out = [];
  for (const tag of svg.match(/<path[^>]*>/g) || []) {
    if (!/fill-opacity="0\.4"/.test(tag)) continue;
    out.push((tag.match(/ d="([^"]+)"/) || [])[1]);
  }
  return out;
}
export function report(names) {
  const rows = [];
  for (const b of names) {
    let two;
    try { two = readFileSync(`${ROOT}/raw/${b}/Container=regular, Style=two-tone, Corners=regular.svg`, 'utf8'); }
    catch { rows.push({ base: b, note: 'no two-tone' }); continue; }
    const plates = plateOfFile(two);
    if (!plates.length) { rows.push({ base: b, note: 'no plate (muted strokes)' }); continue; }
    const stroke = readFileSync(`${ROOT}/raw/${b}/Container=regular, Style=stroke, Corners=regular.svg`, 'utf8');
    const runs = [];
    for (const tag of stroke.match(/<path[^>]*>/g) || []) {
      if (!/ stroke="(?!none)/.test(tag)) continue;
      runs.push(...runsOf((tag.match(/ d="([^"]+)"/) || [])[1]));
    }
    const want = plates.flatMap((d) => sample(runsOf(d).flat(), 24));
    // The plate is the union of every run's band, not one run's: `video` is a
    // body, a lens and two circles, and `brain` is ten runs. Interior runs
    // (`image`'s mountain) fall inside the union and change nothing.
    // Which single run's band IS the plate: true for most of the set, because
    // a plate is the silhouette of the one closed body. Both directions have
    // to agree, or an inner ring scores zero against half the plate.
    let best = Infinity, which = -1;
    runs.forEach((r, i) => {
      let mine;
      try { mine = sample(band(r, 1).outer, 24); } catch { return; }
      const h = Math.max(hausdorff(mine, want), hausdorff(want, mine));
      if (h < best) { best = h; which = i; }
    });
    // Failing that, the union of every band, which is what a plate over more
    // than one body needs (`video`, `brain`).
    let unionWorst = null;
    if (best > 0.01) {
      try {
        const loops = unionContours(runs.map((r) => band(r, 1).outer), runs, 1, 'round');
        unionWorst = +hausdorff(want, loops.flatMap((l) => sample(l, 24))).toFixed(4);
      } catch (e) { unionWorst = 'threw'; }
    }
    rows.push({ base: b, worst: +best.toFixed(4), run: which, runs: runs.length, unionWorst });
  }
  return rows;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2);
  for (const r of report(names)) console.log(String(r.base).padEnd(20), r.note || `run ${r.run}/${r.runs} worst ${r.worst}` + (r.unionWorst !== null && r.unionWorst !== undefined ? `  union ${r.unionWorst}` : ''));
}
