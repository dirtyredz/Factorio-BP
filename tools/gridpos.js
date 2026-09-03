// Working out what Factorio shows as "Grid position" in the blueprint dialog.
//
//   node tools/gridpos.js
//
// CLAUDE.md's note: gridpos ~= 1 - min(entity centre), but the constant is not
// reliable because it depends on the true bounding box, and the gap between that
// and the entity centres varies with which entity is extreme and how it faces.
// sprites/meta.json now carries real footprints, so the box IS computable — this
// prints the candidates so they can be checked against the game.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'sprites', 'meta.json'), 'utf8'));

const read = n => fs.readFileSync(path.join(root, 'blueprints', n + '.txt'), 'utf8').trim();
const decode = s => JSON.parse(zlib.inflateSync(Buffer.from(s.slice(1), 'base64')).toString());
const bpOf = o => o.blueprint || (o.blueprint_book && o.blueprint_book.blueprints[0].blueprint);

// Footprint in tiles, with axes swapped on a quarter turn.
function foot(e) {
  const m = meta[e.name];
  const w = m ? m.tile_width : 1, h = m ? m.tile_height : 1;
  const d = e.direction === undefined ? 0 : e.direction;
  const turned = d === 4 || d === 12;
  return { w: turned ? h : w, h: turned ? w : h };
}

function measure(bp) {
  const ents = bp.entities || [];
  let cx = Infinity, cy = Infinity;          // min entity centre
  let bx = Infinity, by = Infinity;          // min footprint edge
  let cxName = '', bxName = '';
  for (const e of ents) {
    if (e.position.x < cx) { cx = e.position.x; cxName = e.name; }
    cy = Math.min(cy, e.position.y);
    const f = foot(e);
    const l = e.position.x - f.w / 2, t = e.position.y - f.h / 2;
    if (l < bx) { bx = l; bxName = e.name; }
    by = Math.min(by, t);
  }
  return { cx, cy, bx, by, cxName, bxName, n: ents.length };
}

const names = fs.readdirSync(path.join(root, 'blueprints'))
  .filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, ''));

console.log('name'.padEnd(26) + 'grid'.padEnd(9) + 'min centre'.padEnd(16) +
  'min footprint'.padEnd(18) + '1-minfoot'.padEnd(14) + 'extreme entity');
console.log('-'.repeat(110));

const rows = {};
for (const n of names) {
  const bp = bpOf(decode(read(n)));
  const m = measure(bp);
  const g = bp['snap-to-grid'];
  rows[n] = m;
  console.log(
    n.padEnd(26) +
    (g ? (g.x + 'x' + g.y) : '-').padEnd(9) +
    ('(' + m.cx + ', ' + m.cy + ')').padEnd(16) +
    ('(' + m.bx + ', ' + m.by + ')').padEnd(18) +
    ('(' + (1 - m.bx) + ', ' + (1 - m.by) + ')').padEnd(14) +
    m.bxName);
}

// CLAUDE.md records that the owner's in-game grid correction moved every entity
// by (+96, +8) — one grid cell — and changed nothing else. If both halves of
// that pair are stored, they are a free consistency check.
console.log('\npairs differing by a pure translation:');
const ns = Object.keys(rows);
for (let i = 0; i < ns.length; i++) {
  for (let j = i + 1; j < ns.length; j++) {
    const a = rows[ns[i]], b = rows[ns[j]];
    if (a.n !== b.n) continue;
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    if (dx === 0 && dy === 0) continue;
    // Same shift on centres and on footprint edges means a pure translation.
    if (b.bx - a.bx === dx && b.by - a.by === dy) {
      console.log('  ' + ns[i] + ' -> ' + ns[j] + '  moved (' + dx + ', ' + dy + ')');
    }
  }
}
