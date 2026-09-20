/**
 * The AI batch: the rest of the `*-sparkles` names, drawn in the direction
 * Zafar set in `refs/` on 20 Sep 2026 — the shipped base opened around a
 * cluster of two filled sparkles, two painted units of air at the cut.
 *
 *   node tools/v8/build.mjs --out=<dir>        stroke drawings, for the sheet
 *
 * Placement is the only judgement here: the cut itself is `cut.mjs` solving for
 * the gap, so moving a star moves the opening with it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { star } from './star.mjs';
import { trim } from './cut.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const OUT = arg('out', '/tmp/v8');
const ONLY = arg('only', '').split(',').filter(Boolean);

/** The shipped stroke drawing's paths, in file order. */
function base(name) {
  const svg = readFileSync(join(ROOT, 'raw', name, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8');
  return [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
    d: (tag.match(/ d="([^"]+)"/) || [])[1],
    solid: / fill="(?!none)/.test(tag) && !/ stroke="(?!none)/.test(tag),
  }));
}

/**
 * `stars` are [x, y, R]; `drop` removes a base path by index (the sun in
 * `image` goes because his drawing puts a sparkle in its place); `hold` keeps a
 * path out of the cut, so a star near it has to move instead.
 */
const ICONS = {
  'file-sparkles':        { base: 'file',        stars: [[17.5, 19.5, 3.5], [9, 11, 2]] },
  'folder-sparkles':      { base: 'folder',      stars: [[18.5, 6.5, 3.5], [8.5, 14.5, 2]] },
  'user-sparkles':        { base: 'user',        stars: [[18.5, 5, 3], [4.5, 9, 2]] },
  'calendar-sparkles':    { base: 'calendar',    stars: [[18.5, 18.5, 3.5], [8, 14, 2]] },
  'table-sparkles':       { base: 'table',       stars: [[18.5, 5.5, 3.5], [6.5, 19, 2]], keep: 2 },
  'terminal-sparkles':    { base: 'terminal',    stars: [[17.5, 7.5, 3.5], [12.5, 13, 2]] },
  'globe-sparkles':       { base: 'globe',       stars: [[20, 4, 3], [4, 20, 2]] },
  'camera-sparkles':      { base: 'camera',      stars: [[19.5, 6, 3], [5, 17, 2]] },
  'monitor-sparkles':     { base: 'monitor',     stars: [[19.5, 6.5, 3.5], [7, 9, 2]] },
  'scan-text-sparkles':   { base: 'scan-text',   stars: [[18, 12, 3], [12.5, 17, 2]] },
  'headphones-sparkles':  { base: 'headphones',  stars: [[12, 9, 3], [12, 16, 2]] },
  'lightbulb-sparkles':   { base: 'lightbulb',   stars: [[12, 11.5, 3], [19, 20.5, 2]] },
  'cloud-sparkles':       { base: 'cloud',       stars: [[12, 12, 3], [21, 6, 2]] },
  'shield-sparkles':      { base: 'shield',      stars: [[12, 12, 3.5], [19, 4, 2]] },
  'clock-sparkles':       { base: 'clock',       stars: [[20, 4, 3], [5, 19, 2]] },
  'zap-sparkles':         { base: 'zap',         stars: [[19, 5, 3], [4.5, 19.5, 2]] },
  'sticky-note-sparkles': { base: 'sticky-note', stars: [[19, 19, 3], [9, 9, 2.5]] },
  // The pupil comes out and a sparkle takes its place, which is what he did to
  // `image`'s sun: a mark that is already a disc in the middle of the drawing
  // is the seat, not an obstacle.
  'eye-sparkles':         { base: 'eye', baseD: ['M2 12C3.0523 7.3229 7.206 4 12 4C16.794 4 20.9477 7.3229 22 12C20.9477 16.6771 16.794 20 12 20C7.206 20 3.0523 16.6771 2 12Z'],
                            stars: [[12, 12, 3], [20.5, 19, 2]] },
  'send-sparkles':        { base: 'send',        stars: [[5, 18.5, 3], [11.5, 21, 2]] },
  'refresh-cw-sparkles':  { base: 'refresh-cw',  stars: [[12, 12, 3], [20, 20, 2]] },
  'sliders-horizontal-sparkles': { base: 'sliders-horizontal', stars: [[19, 5, 3], [4.5, 19, 2]] },
  'layers-sparkles':      { base: 'layers',      stars: [[19.5, 5, 3], [4.5, 19, 2]] },
  'chart-column-sparkles':{ base: 'chart-column',stars: [[19, 5, 3], [5.5, 7, 2]] },
  'bell-sparkles':        { base: 'bell',        stars: [[19, 5, 3], [4, 19, 2]] },
  'heart-sparkles':       { base: 'heart',       stars: [[12, 11, 3], [20.5, 19.5, 2]] },
  'phone-sparkles':       { base: 'phone',       stars: [[19.5, 4.5, 3], [3.5, 20.5, 2]] },
};

/** Drawings that are not a shipped base plus a cluster. */
const CUSTOM = {
  // bot-2: the round assistant head he asked for (20 Sep 2026), our own circle
  // with two slot eyes. Short eyes above the centre are what keeps it apart
  // from `pause` in a circle container: that glyph's bars run 0.55 of the head,
  // these run 0.23 and sit half a unit high, which reads as a face.
  'bot-2': [
    'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z',
    'M9.5 10L9.5 13M14.5 10L14.5 13',
  ],
};

const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">';
const STROKE = (d) => `<path d="${d}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const SOLID = (d) => `<path d="${d}" fill="black"/>`;

/** Only when run as the command: `gen-motorsport.mjs` overwrote shipped files
 *  by being imported, and a flag is not a guard. */
export { ICONS, CUSTOM };
if (import.meta.url !== `file://${process.argv[1]}`) { /* imported as a library */ }
else {
mkdirSync(OUT, { recursive: true });
for (const [name, spec] of Object.entries(ICONS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const cluster = spec.stars.map(([x, y, R]) => star([x, y], R));
  const layers = [];
  const paths = spec.baseD ? spec.baseD.map((d) => ({ d, solid: false })) : base(spec.base);
  paths.forEach((p, i) => {
    if ((spec.drop || []).includes(i)) return;
    if (p.solid) { layers.push(SOLID(p.d)); return; }          // dots keep their own path
    const d = (spec.hold || []).includes(i) ? p.d : trim(p.d, cluster, { gap: spec.gap ?? 2.05, keep: spec.keep ?? 0.75 });
    if (d) layers.push(STROKE(d));
  });
  for (const d of cluster) layers.push(SOLID(d));
  writeFileSync(join(OUT, `${name}.svg`), `${HEAD}\n${layers.join('\n')}\n</svg>\n`);
}
for (const [name, ds] of Object.entries(CUSTOM)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  writeFileSync(join(OUT, `${name}.svg`), `${HEAD}\n${ds.map(STROKE).join('\n')}\n</svg>\n`);
}
console.log('wrote', Object.keys(ICONS).length + Object.keys(CUSTOM).length, 'to', OUT);
}
