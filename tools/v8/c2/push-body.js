// Create the new sparkle sets on the New band: 8 variants each, assembled in
// the plugin from the cut base strokes plus his star (star.mjs) and its sharp
// form (halo.mjs sharpStar), both carried verbatim as code. Each variant is
// exported back and compared point for point with what it was built from, and
// a signature per variant returns for the local comparison.
const page = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
if (figma.currentPage.name !== 'Components') return 'wrong page';
const kids = figma.currentPage.children;
for (const it of ITEMS) {
  if (kids.some((n) => n.name === it.name)) throw new Error(it.name + ' already exists');
  const [x, y] = it.at;
  const clash = kids.find((n) => n.x < x + 200 && n.x + n.width > x && n.y < y + 104 && n.y + n.height > y);
  if (clash) throw new Error(it.name + ' cell taken by ' + clash.name);
}
const round = (v, dp) => { const s = v.toFixed(dp).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const f4 = (v) => round(Math.round(v * 1e4) / 1e4, 4);
const fmt = (v) => { const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const rot = ([x, y], k) => (k === 0 ? [x, y] : k === 1 ? [-y, x] : k === 2 ? [-x, -y] : [y, -x]);
function star([cx, cy], R) {
  const P = (p, k) => { const q = rot(p, k); return `${f4(cx + q[0] * R)} ${f4(cy + q[1] * R)}`; };
  let d = `M${P(STAR.START, 0)}`;
  for (let k = 0; k < 4; k++) for (const [cmd, ...pts] of STAR.Q) d += cmd + pts.map((p) => P(p, k)).join(' ');
  return `${d}Z`;
}
function sharpStar([cx, cy], R) {
  const P = (p, k) => { const q = rot(p, k); return `${fmt(cx + q[0] * R)} ${fmt(cy + q[1] * R)}`; };
  let d = `M${P(STAR.T1, 0)}`;
  for (let k = 0; k < 4; k++) { d += `L${P(STAR.WAIST, k)}L${P(STAR.T2, k)}`; for (const seg of STAR.TIP) d += 'C' + seg.map((p) => P(p, k)).join(' '); }
  return `${d}Z`;
}
const HEAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">';
const st = (d, op) => (d ? `<path d="${d}" stroke="black"${op < 1 ? ` stroke-opacity="${op}"` : ''} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : '');
const fl = (d, op = 1) => (d ? `<path d="${d}" fill="black"${op < 1 ? ` fill-opacity="${op}"` : ''}/>` : '');
function svgs(c, stars, sharp) {
  const s = stars.map(([x, y, R]) => (sharp ? sharpStar([x, y], R) : star([x, y], R)));
  const stroke = HEAD + st(c.grey + c.black, 1) + fl(c.dots) + fl(s.join('')) + '</svg>';
  const toned = HEAD + st(c.grey, 0.4) + st(c.black, 1) + fl(c.dots) + fl(s[0]) + fl(s[1], 0.4) + '</svg>';
  return { stroke, 'two-tone': toned, duotone: toned, fill: stroke };
}
function populate(comp, svg, sharp) {
  const frame = figma.createNodeFromSvg(svg);
  for (const k of [...frame.children]) {
    const kx = k.x, ky = k.y;
    comp.appendChild(k); k.x = kx; k.y = ky;
    k.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    k.strokeAlign = 'CENTER';
    const stroked = Array.isArray(k.strokes) && k.strokes.length > 0;
    if (stroked) { k.strokeWeight = 2; k.strokeCap = sharp ? 'NONE' : 'ROUND'; k.strokeJoin = 'ROUND'; }
    const muted = (Array.isArray(k.fills) && k.fills.some((f) => f.opacity < 1)) || (stroked && k.strokes.some((f) => f.opacity < 1));
    k.name = muted && Array.isArray(k.fills) && k.fills.length ? 'Plate' : 'Vector';
  }
  frame.remove();
}
function pts(d) {
  const t = d.match(/[MLCHVZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || []; let i = 0, c, cur = [0, 0], s0 = [0, 0]; const out = new Set(); const n = () => +t[i++];
  const add = (p) => out.add(p.map((v) => (Math.round(v * 1000) / 1000).toFixed(3)).join(','));
  while (i < t.length) {
    if (/^[MLCHVZ]$/i.test(t[i])) c = t[i++].toUpperCase();
    if (c === 'M') { cur = [n(), n()]; s0 = cur; add(cur); c = 'L'; }
    else if (c === 'L') { cur = [n(), n()]; add(cur); }
    else if (c === 'H') { cur = [n(), cur[1]]; add(cur); }
    else if (c === 'V') { cur = [cur[0], n()]; add(cur); }
    else if (c === 'C') { const a = [n(), n()], b = [n(), n()], e = [n(), n()]; add(a); add(b); add(e); cur = e; }
    else if (c === 'Z') { cur = s0; }
    else i++;
  }
  return [...out].map((s) => s.split(',').map(Number));
}
const miss = (A, B) => A.filter(([x, y]) => !B.some(([u, v]) => Math.abs(u - x) < 0.0015 && Math.abs(v - y) < 0.0015)).length;
const layersOf = (svg) => [...svg.matchAll(/<path[^>]*\/>/g)].map((m) => ({ tag: m[0], d: m[0].match(/ d="([^"]+)"/)[1], stroked: / stroke="(?!none)/.test(m[0]) }));
const sig = (svg) => layersOf(svg).map((l) => { const p = pts(l.d); const op = (l.tag.match(/(?:stroke|fill)-opacity="([\d.]+)"/) || [])[1] || '1'; return [l.stroked ? 's' : 'f', +op, p.length, +p.reduce((a, q) => a + q[0], 0).toFixed(2), +p.reduce((a, q) => a + q[1], 0).toFixed(2)]; });
const COL = { stroke: 16, 'two-tone': 64, duotone: 112, fill: 160 };
const report = {}, created = [];
for (const it of ITEMS) {
  const comps = [], built = {};
  for (const corners of ['regular', 'sharp']) {
    const S = svgs(it[corners], it.stars, corners === 'sharp');
    for (const style of ['stroke', 'two-tone', 'duotone', 'fill']) {
      const comp = figma.createComponent();
      comp.resize(24, 24); comp.fills = []; comp.clipsContent = false;
      comp.name = `Container=regular, Style=${style}, Corners=${corners}`;
      populate(comp, S[style], corners === 'sharp');
      comps.push(comp); built[comp.name] = S[style];
    }
  }
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = it.name;
  for (const v of set.children) { const [, style, corners] = v.name.match(/Style=([^,]+), Corners=(\w+)/); v.x = COL[style]; v.y = corners === 'sharp' ? 64 : 16; }
  set.resize(200, 104);
  set.x = it.at[0]; set.y = it.at[1];
  set.fills = []; set.strokes = []; set.cornerRadius = 5; set.dashPattern = [10, 5]; set.clipsContent = true;
  created.push(set.id);
  const bad = [], sigs = {};
  for (const v of set.children) {
    const got = await v.exportAsync({ format: 'SVG_STRING' });
    const g = pts(layersOf(got).map((l) => l.d).join('')), w = pts(layersOf(built[v.name]).map((l) => l.d).join(''));
    const a = miss(w, g), b = miss(g, w);
    if (a || b) bad.push(`${v.name}: ${a} missing, ${b} extra`);
    sigs[v.name.replace('Container=regular, ', '')] = sig(got);
  }
  report[it.name] = bad.length ? bad : 'ok';
}
return { created, report };
