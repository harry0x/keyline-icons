/**
 * Is a generated plate the drawing's silhouette?
 *
 * A bounding box says almost nothing — a crescent and a disc share one. So:
 * rasterise the drawing's ink, flood the outside, and what is left is the
 * silhouette the plate has to be. Then count the cells where the two disagree,
 * split into grey OUTSIDE the drawing (which shows past the black, the defect
 * the flank sweep exists for) and silhouette the plate MISSES (which shows as
 * white inside the shape).
 *
 *   node tools/v8/platecheck.mjs <ink dir> <styles dir>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, at } from './cut.mjs';

const RES = 0.05, N = Math.round(24 / RES), idx = (x, y) => y * N + x;
function maskOf(paths) {
  const m = new Uint8Array(N * N);
  for (const { d, stroked, evenodd } of paths) {
    const polys = parse(d).map((s) => { const q = [s.start]; for (const g of s.segs) { const k = g.t === 'L' ? 1 : 24; for (let i = 1; i <= k; i++) q.push(at(g, i / k)); } return q; });
    if (stroked) for (const q of polys) for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (let y = Math.max(0, Math.floor((c[1]-1)/RES)); y <= Math.min(N-1, Math.ceil((c[1]+1)/RES)); y++)
        for (let x = Math.max(0, Math.floor((c[0]-1)/RES)); x <= Math.min(N-1, Math.ceil((c[0]+1)/RES)); x++) {
          const px=(x+.5)*RES-c[0], py=(y+.5)*RES-c[1]; if (px*px+py*py <= 1) m[idx(x,y)] = 1; }
      if (i + 1 < q.length) { const a = c, b = q[i+1], dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy, L=Math.sqrt(L2);
        if (L2 > 1e-12) for (let y=Math.max(0,Math.floor((Math.min(a[1],b[1])-1)/RES)); y<=Math.min(N-1,Math.ceil((Math.max(a[1],b[1])+1)/RES)); y++)
          for (let x=Math.max(0,Math.floor((Math.min(a[0],b[0])-1)/RES)); x<=Math.min(N-1,Math.ceil((Math.max(a[0],b[0])+1)/RES)); x++) {
            const px=(x+.5)*RES-a[0], py=(y+.5)*RES-a[1], u=(px*dx+py*dy)/L2; if (u<0||u>1) continue;
            if (Math.abs(px*dy-py*dx)/L<=1) m[idx(x,y)]=1; } }
    }
    if (!stroked) { const edges=[]; for (const q of polys) for (let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length]; if(a[1]!==b[1]) edges.push(a,b);}
      for (let y=0;y<N;y++){ const yc=(y+.5)*RES, xs=[];
        for (let e=0;e<edges.length;e+=2){const a=edges[e],b=edges[e+1]; if((a[1]>yc)!==(b[1]>yc)) xs.push([a[0]+(yc-a[1])*(b[0]-a[0])/(b[1]-a[1]), b[1]>a[1]?1:-1]);}
        xs.sort((p,q)=>p[0]-q[0]); let w=0;
        for (let k=0;k<xs.length-1;k++){ w = evenodd ? (w^1) : w+xs[k][1]; if (w!==0){ const x0=Math.max(0,Math.ceil(xs[k][0]/RES-0.5)), x1=Math.min(N-1,Math.floor(xs[k+1][0]/RES-0.5)); for(let x=x0;x<=x1;x++) m[idx(x,y)]=1; } } } }
  }
  return m;
}
/** The drawing's silhouette: its ink plus everything the ink encloses. */
function silhouette(ink) {
  const out = new Uint8Array(N * N);
  const stack = [];
  for (let i = 0; i < N; i++) { for (const j of [0, N - 1]) { stack.push([i, j]); stack.push([j, i]); } }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const i = idx(x, y);
    if (out[i] || ink[i]) continue;
    out[i] = 1;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  const sil = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) sil[i] = out[i] ? 0 : 1;
  return sil;
}
const parseSvg = (svg) => [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).map((tag) => ({
  d: (tag.match(/ d="([^"]+)"/) || [])[1],
  stroked: / stroke="(?!none)/.test(tag),
  evenodd: /evenodd/.test(tag),
}));

const [INK, STY] = process.argv.slice(2);
const rows = [];
for (const f of readdirSync(INK).filter((x) => x.endsWith('.svg')).sort()) {
  const n = f.replace('.svg', '');
  const ink = maskOf(parseSvg(readFileSync(join(INK, f), 'utf8')));
  const sil = silhouette(ink);
  const plate = maskOf(parseSvg(readFileSync(join(STY, `${n}.two-tone.svg`), 'utf8')).slice(0, 1).map((p) => ({ ...p, stroked: false })));
  let outside = 0, missing = 0, area = 0;
  for (let i = 0; i < N * N; i++) {
    if (sil[i]) area++;
    if (plate[i] && !sil[i]) outside++;
    if (sil[i] && !plate[i]) missing++;
  }
  rows.push({ n, outside: +(outside / area * 100).toFixed(1), missing: +(missing / area * 100).toFixed(1) });
}
const bad = rows.filter((r) => r.outside > 0.5 || r.missing > 1.5);
console.log(rows.length - bad.length, 'plates are the silhouette;', bad.length, 'are not');
for (const r of bad) console.log('  ', r.n.padEnd(28), 'grey outside', r.outside + '%', ' missed', r.missing + '%');
