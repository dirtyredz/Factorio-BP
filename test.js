'use strict';
// Runs the merge logic straight out of index.html against the stored blueprints,
// so the page and the CLI are held to the same known-good result.

const { loadPageApi } = require('./tools/lib/page-api');

const api = loadPageApi(['decode', 'encode', 'compare', 'merge', 'bpOf', 'protect', 'paramsStillBind', 'key', 'ZERO',
  'turnBlueprint', 'flipBlueprint', 'entBox', 'buildPreview', 'SPRITES', 'FOOTPRINT', 'wireEnd', 'CONNECT', 'beltCurves', 'beltAnalysis', 'diffMarks', 'gridPosition',
  'transformTiles', 'findTileOffset', 'occupiedCells',
  'normalise', 'normaliseReport']);

(async () => {
  const M = await require('./tests/merge.test')(api);
  const T = await require('./tests/transforms.test')(api);
  const S = await require('./tests/sprites.test')(api);
  const O = await require('./tests/overlays.test')(api);

  // Batches sit in the order the checks have always printed in.
  const checks = [
    ...M.main, ...T.transforms, ...S.manifest, ...O.gridPosition, ...M.marks, ...S.belts, ...O.wires,
    ...O.gridOverlay, ...S.preview, ...T.normalise, ...T.tileTurns, ...O.floors,
  ];

  // Shared Node-tool decode helper: checks live beside it.
  checks.push(...require('./tools/lib/blueprint.test'));
  checks.push(...require('./tools/lib/page-api.test'));
  checks.push(...require('./tools/lib/merge-checks.test'));
  checks.push(...require('./tools/render/belt-curves.test'));

  for (const line of [...S.diagnostics.manifest, ...S.diagnostics.preview]) console.log(line);

  let bad = 0;
  for (const [name, ok] of checks) {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  console.log(`\n${checks.length - bad}/${checks.length} passed; wires carried: ${M.footer.wires}; output ${M.footer.length} chars`);
  console.log(`scenario 2 anchored on "${M.footer.anchor}", offset (${M.footer.off.x}, ${M.footer.off.y})`);
  process.exit(bad ? 1 : 0);
})().catch(e => {
  // Print where, not just what — a bare message sends you hunting.
  console.error('threw:', e.message);
  console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  process.exit(1);
});
