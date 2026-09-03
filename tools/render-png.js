// Emits a flat draw list for render-png.ps1, which rasterises it.
//
//   node tools/render-png.js <blueprint> <out.json> [tilePx] [x0 y0 x1 y1]
//
// The placement comes from the page's own entBox() and SPRITES table, loaded the
// same way bp.js and test.js load them, so a rendered PNG can't drift from what
// the preview draws. The optional bounds crop to a region in TILE coordinates.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</' + 'script>'));

const stub = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} },
  value: '', textContent: '', innerHTML: '', className: '', checked: false,
  removeAttribute() {}, setAttribute() {}, select() {},
});
const api = new Function('document', 'navigator',
  src + '\n;return { bpOf, entBox, drawRank, wireEnd, beltCurves };'
)({ getElementById: stub, querySelectorAll: () => [] },
  { clipboard: { writeText: async () => {} } });

const name = process.argv[2] || 'dropoff-a';
const outFile = process.argv[3] || path.join(root, 'draw.json');
const TILE = Number(process.argv[4]) || 32;
const crop = process.argv.slice(5).map(Number);

const str = fs.readFileSync(path.join(root, 'blueprints', name + '.txt'), 'utf8').trim();
const b = api.bpOf(JSON.parse(zlib.inflateSync(Buffer.from(str.slice(1), 'base64')).toString()));
const ents = b.entities || [];

const curves = api.beltCurves(ents);
const boxes = ents.map(e => api.entBox(e, curves[e.entity_number]));
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
ents.forEach((e, i) => {
  const q = boxes[i];
  minX = Math.min(minX, e.position.x + q.ox); minY = Math.min(minY, e.position.y + q.oy);
  maxX = Math.max(maxX, e.position.x + q.ox + q.w); maxY = Math.max(maxY, e.position.y + q.oy + q.h);
});
if (crop.length === 4) { minX = crop[0]; minY = crop[1]; maxX = crop[2]; maxY = crop[3]; }

const px = v => +(v * TILE).toFixed(1);
const order = ents.map((e, i) => i).sort((p, q) =>
  api.drawRank(ents[p].name) - api.drawRank(ents[q].name) ||
  ents[p].position.y - ents[q].position.y || ents[p].position.x - ents[q].position.x);

const sprites = [];
for (const i of order) {
  const e = ents[i], q = boxes[i];
  if (!q.file) continue;
  sprites.push({
    file: q.file,
    x: px(e.position.x + q.ox - minX), y: px(e.position.y + q.oy - minY),
    w: px(q.w), h: px(q.h),
  });
}

// 5 is copper, odd is red, even is green — decoded from the stored blueprints.
const COLOUR = { rd: '232,87,74', gn: '99,199,77', cu: '217,151,74' };
const byNum = {};
for (const e of ents) byNum[e.entity_number] = e;

// Endpoints come from the page's wireEnd(), so the PNG and the preview agree on
// where a wire lands: combinator input vs output, pole copper at the mast top.
const wires = [], selfWires = [];
for (const w of b.wires || []) {
  const a = byNum[w[0]], c = byNum[w[2]];
  if (!a || !c) continue;
  const kind = w[1] === 5 || w[3] === 5 ? 'cu' : (w[1] % 2 ? 'rd' : 'gn');
  const s = api.wireEnd(a, w[1]), t = api.wireEnd(c, w[3]);
  const x1 = px(s.x - minX), y1 = px(s.y - minY);
  const x2 = px(t.x - minX), y2 = px(t.y - minY);
  const len = Math.hypot(x2 - x1, y2 - y1) / TILE;
  if (len < 0.05) {
    selfWires.push({ x: x1, y: y1, r: px(0.42), rgb: COLOUR[kind], kind });
    continue;
  }
  // Same droop as the page: control point twice the sag below the chord.
  const sag = Math.min(1.1, Math.max(0.09, len * 0.1)) * TILE;
  wires.push({
    x: x1, y: y1, x2: x2, y2: y2,
    cx: +((x1 + x2) / 2).toFixed(1), cy: +((y1 + y2) / 2 + 2 * sag).toFixed(1),
    rgb: COLOUR[kind], kind,
  });
}

fs.writeFileSync(outFile, JSON.stringify({
  width: Math.round(px(maxX - minX)), height: Math.round(px(maxY - minY)),
  tile: TILE, sprites, wires, selfWires,
  label: b.label || name,
}));

console.log(`${sprites.length} sprites, ${wires.length} wires, ${selfWires.length} self-linked` +
  ` -> ${Math.round(px(maxX - minX))}x${Math.round(px(maxY - minY))}px`);
