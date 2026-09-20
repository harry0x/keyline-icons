/**
 * The batch's own check: painted air between the cluster and what is left of
 * the base (2 is the rule, and his own drawings run 2.05), the ink box, and any
 * surviving run shorter than a stroke width — a crumb left by a cut is the one
 * defect this treatment produces that nothing else would catch.
 *
 *   node tools/v8/check.mjs <dir>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, at } from './cut.mjs';
const RES = 0.05, N = Math.round(24 / RES), idx = (x, y) => y * N + x;
const dir = process.argv[2];
const mask = (tags) => {
  const m = new Uint8Array(N * N);
  for (const tag of tags) {
    const d = (tag.match(/ d="([^"]+)"/) || [])[1]; if (!d) continue;
    const stroked = / stroke="(?!none)/.test(tag), filled = / fill="(?!none)/.test(tag);
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
    if (filled) { const edges = []; for (const q of polys) for (let i = 0; i < q.length; i++) { const a=q[i], b=q[(i+1)%q.length]; if (a[1]!==b[1]) edges.push(a,b); }
      for (let y=0;y<N;y++){ const yc=(y+.5)*RES, xs=[];
        for (let e=0;e<edges.length;e+=2){const a=edges[e],b=edges[e+1]; if((a[1]>yc)!==(b[1]>yc)) xs.push([a[0]+(yc-a[1])*(b[0]-a[0])/(b[1]-a[1]), b[1]>a[1]?1:-1]);}
        xs.sort((p,q)=>p[0]-q[0]); let w=0;
        for (let k=0;k<xs.length-1;k++){ w = /evenodd/.test(tag) ? (w^1) : w+xs[k][1]; if (w!==0){ const x0=Math.max(0,Math.ceil(xs[k][0]/RES-0.5)), x1=Math.min(N-1,Math.floor(xs[k+1][0]/RES-0.5)); for(let x=x0;x<=x1;x++) m[idx(x,y)]=1; } } } }
  }
  return m;
};
const dist = (m) => {
  const D = new Float32Array(N*N).fill(Infinity);
  for (let i=0;i<N*N;i++) if (m[i]) D[i]=0;
  const S1=RES, S2=Math.SQRT2*RES;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){const i=idx(x,y);let v=D[i];
    if(x>0)v=Math.min(v,D[i-1]+S1); if(y>0)v=Math.min(v,D[i-N]+S1);
    if(x>0&&y>0)v=Math.min(v,D[i-N-1]+S2); if(x<N-1&&y>0)v=Math.min(v,D[i-N+1]+S2); D[i]=v;}
  for (let y=N-1;y>=0;y--) for (let x=N-1;x>=0;x--){const i=idx(x,y);let v=D[i];
    if(x<N-1)v=Math.min(v,D[i+1]+S1); if(y<N-1)v=Math.min(v,D[i+N]+S1);
    if(x<N-1&&y<N-1)v=Math.min(v,D[i+N+1]+S2); if(x>0&&y<N-1)v=Math.min(v,D[i+N-1]+S2); D[i]=v;}
  return D;
};
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  const svg = readFileSync(join(dir, f), 'utf8');
  const tags = svg.match(/<path[^>]*>/g) || [];
  const isStar = (t) => / fill="(?!none)/.test(t) && !/ stroke="(?!none)/.test(t) && /L/.test(t);
  const sTags = tags.filter(isStar), bTags = tags.filter((t) => !isStar(t));
  const notes = [];
  // crumbs: a cut run shorter than a stroke width paints as a dot
  for (const tag of bTags) {
    const d = (tag.match(/ d="([^"]+)"/) || [])[1];
    for (const sp of parse(d)) {
      let L = 0; for (const g of sp.segs) { const k = g.t === 'L' ? 1 : 12; for (let i = 0; i < k; i++) L += Math.hypot(...[0,1].map((j) => at(g,(i+1)/k)[j] - at(g,i/k)[j])); }
      if (L < 2) notes.push(`crumb ${L.toFixed(2)}`);
    }
  }
  let line = f.replace('.svg','').padEnd(28);
  if (sTags.length && bTags.length) {
    const mb = mask(bTags), ms = mask(sTags), Db = dist(mb);
    let g = Infinity, over = 0;
    for (let i = 0; i < N*N; i++) if (ms[i]) { if (mb[i]) over++; else g = Math.min(g, Db[i]); }
    if (over) notes.push(`OVERLAP ${over}`);
    else if (g < 1.9) notes.push(`gap ${g.toFixed(2)}`);
    line += `gap ${over ? 'x' : g.toFixed(2)}  `;
  }
  const all = mask(tags);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (all[idx(x,y)]) { const px=(x+.5)*RES, py=(y+.5)*RES; if(px<x0)x0=px; if(px>x1)x1=px; if(py<y0)y0=py; if(py>y1)y1=py; }
  if (x0 < 0.98 || y0 < 0.98 || x1 > 23.02 || y1 > 23.02) notes.push(`ink ${[x0,y0,x1,y1].map(v=>v.toFixed(1))}`);
  line += `ink ${[x0,y0,x1,y1].map((v)=>v.toFixed(1)).join(',')}`;
  if (notes.length) { bad++; line += '   <- ' + notes.join(' '); }
  console.log(line);
}
console.log(bad ? `${bad} to look at` : 'all clear');
