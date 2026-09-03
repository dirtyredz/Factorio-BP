// Works out which belts in a blueprint should render as curves.
//
//   node tools/belt-curves.js [blueprint]
//
// A blueprint stores only each belt's `direction`; whether it draws curved is
// derived from its neighbours, the same way the game derives it. The rule:
//
//   a belt curves when exactly one belt feeds it from a perpendicular side
//   and nothing feeds it from directly behind
//
// Feeding is defined by output tile: a belt at Q facing d outputs into
// Q + unit(d). So B is fed by N when N's output tile is B's own tile.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const UNIT = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };   // N E S W
const NAME = { 0: 'N', 4: 'E', 8: 'S', 12: 'W' };

// Anything that moves items along and can feed a belt.
const FEEDER = /transport-belt$|underground-belt$|splitter$|loader/;
// Only plain belts curve; undergrounds and splitters are always straight.
const CURVABLE = /(^|-)transport-belt$/;

function analyse(bp) {
  const ents = bp.entities || [];
  const at = {};
  for (const e of ents) at[e.position.x + ',' + e.position.y] = e;

  const out = [];
  for (const e of ents) {
    if (!CURVABLE.test(e.name)) continue;
    const d = e.direction === undefined ? 0 : e.direction;
    if (!UNIT[d]) continue;                       // belts are 4-way

    const feeders = [];
    for (const nd of [0, 4, 8, 12]) {
      // The neighbour that would have to face `nd` to output into this tile.
      const [ux, uy] = UNIT[nd];
      const n = at[(e.position.x - ux) + ',' + (e.position.y - uy)];
      if (!n || !FEEDER.test(n.name)) continue;
      if ((n.direction === undefined ? 0 : n.direction) !== nd) continue;
      feeders.push({ from: nd, ent: n });
    }

    const behind = feeders.filter(f => f.from === d);
    const sides = feeders.filter(f => f.from !== d);

    let curve = null;
    if (!behind.length && sides.length === 1) curve = sides[0].from;

    out.push({
      x: e.position.x, y: e.position.y, dir: d,
      feeders: feeders.map(f => NAME[f.from]),
      curve,                       // the direction the belt turns FROM
      label: curve === null ? 'straight' : NAME[curve] + '->' + NAME[d],
    });
  }
  return out;
}

if (require.main === module) {
  const name = process.argv[2] || 'dropoff-a';
  const root = path.join(__dirname, '..');
  const s = fs.readFileSync(path.join(root, 'blueprints', name + '.txt'), 'utf8').trim();
  const j = JSON.parse(zlib.inflateSync(Buffer.from(s.slice(1), 'base64')).toString());
  const bp = j.blueprint || j.blueprint_book.blueprints[0].blueprint;

  const rows = analyse(bp);
  const curved = rows.filter(r => r.curve !== null);
  const tally = {};
  for (const r of rows) tally[r.label] = (tally[r.label] || 0) + 1;

  console.log(rows.length + ' belts, ' + curved.length + ' should curve\n');
  for (const k of Object.keys(tally).sort()) {
    console.log('  ' + String(tally[k]).padStart(3) + '  ' + k);
  }
  if (curved.length) {
    console.log('\nthe curved ones:');
    for (const r of curved) {
      console.log('  (' + r.x + ', ' + r.y + ') facing ' + NAME[r.dir] +
        ', fed from ' + r.feeders.join('+') + '  =>  ' + r.label);
    }
  }
}

module.exports = { analyse };
