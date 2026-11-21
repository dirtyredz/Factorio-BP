// Reports which belts in a blueprint should render as curves.
//
//   node tools/render/belt-curves.js [blueprint]
//
// The neighbour rule lives in index.html (beltAnalysis); this is only the
// text formatter over it, so the report cannot drift from what the page draws.

const fs = require('fs');
const path = require('path');
const { loadPageApi } = require('../lib/page-api');

const NAME = { 0: 'N', 4: 'E', 8: 'S', 12: 'W' };

function analyse(bp) {
  const { beltAnalysis } = loadPageApi(['beltAnalysis']);
  return beltAnalysis(bp.entities || []).map(r => ({
    x: r.ent.position.x, y: r.ent.position.y, dir: r.dir,
    feeders: r.feeders.map(nd => NAME[nd]),
    curve: r.curve,                // the direction the belt turns FROM
    label: r.curve === null ? 'straight' : NAME[r.curve] + '->' + NAME[r.dir],
  }));
}

if (require.main === module) {
  const name = process.argv[2] || 'dropoff-a';
  const root = path.join(__dirname, '..', '..');
  const s = fs.readFileSync(path.join(root, 'blueprints', name + '.txt'), 'utf8').trim();
  const bp = require('../lib/blueprint').loadBlueprint(s);

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
