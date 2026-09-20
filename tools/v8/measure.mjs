/** Painted ink of a list of paths, rastered at 0.05: what Figma actually paints. */
import { parse, at } from './cut.mjs';
const RES = 0.05, N = Math.round(24 / RES), idx = (x, y) => y * N + x;
export function inkOfPaths(paths) {
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
  let b = [1e9, 1e9, -1e9, -1e9];
  for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (m[idx(x,y)]) { const px=(x+.5)*RES, py=(y+.5)*RES;
    if(px<b[0])b[0]=px; if(py<b[1])b[1]=py; if(px>b[2])b[2]=px; if(py>b[3])b[3]=py; }
  return b;
}
