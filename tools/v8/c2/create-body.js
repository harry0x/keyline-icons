// Create new sets from finished raw/ variants (DATA: D paths, SETS layers per variant, AT
// cells). Checksummed; each variant exported back and compared point for point.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
if (fnv(JSON.stringify(DATA)) !== EXPECT) throw new Error('payload checksum mismatch');
const page = figma.root.children.find((n) => n.name === 'Components');
if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
if (figma.currentPage.name !== 'Components') return 'wrong page';
const { D, SETS, AT } = DATA;
const kids = figma.currentPage.children;
for (const name of Object.keys(SETS)) {
  if (kids.some((n) => n.name === name)) throw new Error(name + ' already exists');
  const [x, y] = AT[name];
  const clash = kids.find((n) => n.x < x + 200 && n.x + n.width > x && n.y < y + 104 && n.y + n.height > y);
  if (clash) throw new Error(name + ' cell taken by ' + clash.name);
}
const COL = { stroke: 16, 'two-tone': 64, duotone: 112, fill: 160 };
const svgOf = (layers) => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + layers.map(([k, i, op, eo]) => k === 's'
  ? `<path d="${D[i]}" stroke="black"${op < 1 ? ` stroke-opacity="${op}"` : ''} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  : `<path${eo ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''} d="${D[i]}" fill="black"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`).join('') + '</svg>';
function populate(comp, layers, sharp) {
  const frame = figma.createNodeFromSvg(svgOf(layers));
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
  const t = d.match(/[MLCHVZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || []; let i = 0, c, cur = [0, 0], st = [0, 0]; const out = new Set(); const n = () => +t[i++];
  const add = (p) => out.add(p.map((v) => (Math.round(v * 1000) / 1000).toFixed(3)).join(','));
  while (i < t.length) {
    if (/^[MLCHVZ]$/i.test(t[i])) c = t[i++].toUpperCase();
    if (c === 'M') { cur = [n(), n()]; st = cur; add(cur); c = 'L'; }
    else if (c === 'L') { cur = [n(), n()]; add(cur); }
    else if (c === 'H') { cur = [n(), cur[1]]; add(cur); }
    else if (c === 'V') { cur = [cur[0], n()]; add(cur); }
    else if (c === 'C') { const a = [n(), n()], b = [n(), n()], e = [n(), n()]; add(a); add(b); add(e); cur = e; }
    else if (c === 'Z') { cur = st; }
    else i++;
  }
  return [...out].map((s) => s.split(',').map(Number));
}
const miss = (A, B) => A.filter(([x, y]) => !B.some(([u, v]) => Math.abs(u - x) < 0.0015 && Math.abs(v - y) < 0.0015)).length;
const report = {}, created = {};
for (const [name, vars] of Object.entries(SETS)) {
  const comps = [];
  for (const [key, layers] of Object.entries(vars)) {
    const [style, corners] = key.split('|');
    const comp = figma.createComponent();
    comp.resize(24, 24); comp.fills = []; comp.clipsContent = false;
    comp.name = 'Container=regular, Style=' + style + ', Corners=' + corners;
    populate(comp, layers, corners === 'sharp');
    comps.push(comp);
  }
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = name;
  for (const v of set.children) { const [, style, corners] = v.name.match(/Style=([^,]+), Corners=(\w+)/); v.x = COL[style]; v.y = corners === 'sharp' ? 64 : 16; }
  set.resize(200, 104); set.x = AT[name][0]; set.y = AT[name][1];
  set.fills = []; set.strokes = []; set.cornerRadius = 5; set.dashPattern = [10, 5]; set.clipsContent = true;
  created[name] = set.id;
  const bad = [];
  for (const [key, layers] of Object.entries(vars)) {
    const [style, corners] = key.split('|');
    const v = set.children.find((c) => c.name === 'Container=regular, Style=' + style + ', Corners=' + corners);
    const got = pts([...(await v.exportAsync({ format: 'SVG_STRING' })).matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(''));
    const want = pts(layers.map(([, i]) => D[i]).join(''));
    const a = miss(want, got), b = miss(got, want);
    if (a || b) bad.push(`${style} ${corners}: ${a} missing, ${b} extra`);
  }
  report[name] = bad.length ? bad : 'ok';
}
return { created, report };
