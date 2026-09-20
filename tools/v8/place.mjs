/**
 * Where a sparkle of half-extent R sits on a base without cutting it: the
 * base's ink rasterised at 0.05, distance-transformed, and every half-unit
 * centre whose star ink clears it by 2 reported. A cut star is a choice; a
 * clear one should not be guesswork.
 *
 *   node tools/v8/place.mjs <base> [R ...]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { star } from './star.mjs';
import { parse, at } from './cut.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RES = 0.05, N = Math.round(24 / RES), idx = (x, y) => y * N + x;

function inkMask(svg) {
  const m = new Uint8Array(N * N);
  for (const tag of svg.match(/<path[^>]*>/g) || []) {
    const d = (tag.match(/ d="([^"]+)"/) || [])[1]; if (!d) continue;
    const stroked = / stroke="(?!none)/.test(tag), filled = / fill="(?!none)/.test(tag);
    const subs = parse(d);
    const pts = subs.map((s) => { const q = [s.start]; for (const g of s.segs) { const k = g.t === 'L' ? 1 : 24; for (let i = 1; i <= k; i++) q.push(at(g, i / k)); } return q; });
    if (stroked) for (const q of pts) for (let i = 0; i < q.length; i++) {
      disc(m, q[i], 1);
      if (i + 1 < q.length) bar(m, q[i], q[i + 1]);
    }
    if (filled) fill(m, pts, /evenodd/.test(tag));
  }
  return m;
}
function disc(m, c, r) {
  const x0 = Math.max(0, Math.floor((c[0]-r)/RES)), x1 = Math.min(N-1, Math.ceil((c[0]+r)/RES));
  const y0 = Math.max(0, Math.floor((c[1]-r)/RES)), y1 = Math.min(N-1, Math.ceil((c[1]+r)/RES));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px=(x+.5)*RES-c[0], py=(y+.5)*RES-c[1]; if (px*px+py*py <= r*r) m[idx(x,y)] = 1; }
}
function bar(m, a, b) {
  const dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy; if (L2 < 1e-12) return;
  const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-1)/RES)), x1=Math.min(N-1,Math.ceil((Math.max(a[0],b[0])+1)/RES));
  const y0=Math.max(0,Math.floor((Math.min(a[1],b[1])-1)/RES)), y1=Math.min(N-1,Math.ceil((Math.max(a[1],b[1])+1)/RES));
  const L=Math.sqrt(L2);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) { const px=(x+.5)*RES-a[0], py=(y+.5)*RES-a[1]; const u=(px*dx+py*dy)/L2; if (u<0||u>1) continue; if (Math.abs(px*dy-py*dx)/L<=1) m[idx(x,y)]=1; }
}
function fill(m, polys, evenodd) {
  const edges = []; for (const q of polys) for (let i = 0; i < q.length; i++) { const a=q[i], b=q[(i+1)%q.length]; if (a[1]!==b[1]) edges.push(a,b); }
  for (let y = 0; y < N; y++) { const yc=(y+.5)*RES; const xs=[];
    for (let e=0;e<edges.length;e+=2){const a=edges[e],b=edges[e+1]; if((a[1]>yc)!==(b[1]>yc)) xs.push([a[0]+(yc-a[1])*(b[0]-a[0])/(b[1]-a[1]), b[1]>a[1]?1:-1]);}
    xs.sort((p,q)=>p[0]-q[0]); let w=0;
    for (let k=0;k<xs.length-1;k++){ w = evenodd ? (w^1) : w+xs[k][1]; if (w!==0){ const x0=Math.max(0,Math.ceil(xs[k][0]/RES-0.5)), x1=Math.min(N-1,Math.floor(xs[k+1][0]/RES-0.5)); for(let x=x0;x<=x1;x++) m[idx(x,y)]=1; } }
  }
}
export function distance(m) {
  const D = new Float32Array(N*N).fill(Infinity);
  for (let i=0;i<N*N;i++) if (m[i]) D[i]=0;
  const S2 = Math.SQRT2 * RES, S1 = RES;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++) { const i=idx(x,y); let v=D[i];
    if (x>0) v=Math.min(v, D[i-1]+S1); if (y>0) v=Math.min(v, D[i-N]+S1);
    if (x>0&&y>0) v=Math.min(v, D[i-N-1]+S2); if (x<N-1&&y>0) v=Math.min(v, D[i-N+1]+S2); D[i]=v; }
  for (let y=N-1;y>=0;y--) for (let x=N-1;x>=0;x--) { const i=idx(x,y); let v=D[i];
    if (x<N-1) v=Math.min(v, D[i+1]+S1); if (y<N-1) v=Math.min(v, D[i+N]+S1);
    if (x<N-1&&y<N-1) v=Math.min(v, D[i+N+1]+S2); if (x>0&&y<N-1) v=Math.min(v, D[i+N-1]+S2); D[i]=v; }
  return D;
}
export function baseMask(name) {
  return inkMask(readFileSync(join(ROOT, 'raw', name, 'Container=regular, Style=stroke, Corners=regular.svg'), 'utf8'));
}
export function starMask(list) {
  return inkMask(`<svg>${list.map(([x,y,R]) => `<path d="${star([x,y],R)}" fill="black"/>`).join('')}</svg>`);
}
/** Least painted air between two inks, or the overlap in cells. */
export function gap(a, b) {
  const Da = distance(a); let m = Infinity, over = 0;
  for (let i = 0; i < N*N; i++) if (b[i]) { if (a[i]) over++; else m = Math.min(m, Da[i]); }
  return { gap: m, over };
}
export const inkBox = (m) => {
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (m[idx(x,y)]) { const px=(x+.5)*RES, py=(y+.5)*RES; if(px<x0)x0=px; if(px>x1)x1=px; if(py<y0)y0=py; if(py>y1)y1=py; }
  return [x0,y0,x1,y1];
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...rs] = process.argv.slice(2);
  const m = baseMask(name), D = distance(m);
  for (const r of (rs.length ? rs : ['2', '2.5', '3', '3.5']).map(Number)) {
    const hits = [];
    for (let cy = 1; cy <= 23; cy += 0.5) for (let cx = 1; cx <= 23; cx += 0.5) {
      if (cx - r < 1 || cx + r > 23 || cy - r < 1 || cy + r > 23) continue;
      const s = starMask([[cx, cy, r]]);
      let ok = true, min = Infinity;
      for (let i = 0; i < N*N && ok; i++) if (s[i]) { if (m[i]) ok = false; else min = Math.min(min, D[i]); }
      if (ok && min >= 2) hits.push([cx, cy, min]);
    }
    console.log(`R${r}`.padEnd(5), hits.length, hits.slice(0, 40).map(([x,y,g]) => `(${x},${y})${g.toFixed(1)}`).join(' '));
  }
}
