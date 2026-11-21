'use strict';
// Runs the merge logic straight out of index.html against the stored blueprints,
// so the page and the CLI are held to the same known-good result.

const fs = require('fs');
const path = require('path');

const { loadPageApi } = require('./tools/lib/page-api');

const api = loadPageApi(['decode', 'encode', 'compare', 'merge', 'bpOf', 'protect', 'paramsStillBind', 'key', 'ZERO',
  'turnBlueprint', 'flipBlueprint', 'entBox', 'buildPreview', 'SPRITES', 'FOOTPRINT', 'wireEnd', 'CONNECT', 'beltCurves', 'beltAnalysis', 'diffMarks', 'gridPosition',
  'transformTiles', 'findTileOffset', 'occupiedCells',
  'normalise', 'normaliseReport']);

const read = n => fs.readFileSync(path.join(__dirname, 'blueprints', n + '.txt'), 'utf8').trim();

(async () => {
  const A = await api.decode(read('dropoff-a'));

  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const nMark = (h, c) => (h.match(new RegExp('class="[^"]*\\b' + c + '\\b[^"]*"', 'g')) || []).length;

  const M = await require('./tests/merge.test')(api);
  const a = api.bpOf(A);
  const checks = [...M.main];

  const T = await require('./tests/transforms.test')(api);
  checks.push(...T.transforms);

  const S = await require('./tests/sprites.test')(api);
  checks.push(...S.manifest);


  // --- grid position --------------------------------------------------------
  // The one piece of ground truth in the project: the owner hand-corrected Drop
  // Off B's Grid position to (-2, 6), and dropoff-b-fixed is the result. Every
  // check here hangs off that.
  const gpOf = async n => api.gridPosition(api.bpOf(await api.decode(read(n))));
  const gFixed = await gpOf('dropoff-b-fixed');
  const gPlain = await gpOf('dropoff-b');
  const g180 = await gpOf('dropoff-b-180');
  const gBad = await gpOf('dropoff-b-toolturned');

  checks.push(
    ['gridpos: reproduces the owner\'s hand-corrected (-2, 6)',
      gFixed.x === -2 && gFixed.y === 6 && gFixed.whole],
    // The correction that produced the fixed copy moved everything one cell.
    ['gridpos: the uncorrected copy is exactly one grid cell away',
      gPlain.x - gFixed.x === 96 && gPlain.y - gFixed.y === 8],
    ['gridpos: the tool\'s 180 turn lands on the same value as the hand fix',
      g180.x === gFixed.x && g180.y === gFixed.y],
    // The old broken turn sat on a half tile; that must be reported, not hidden.
    ['gridpos: a half-tile result is flagged as unreliable', gBad.whole === false],
    ['gridpos: translating the build moves it by the same amount, negated',
      (() => {
        const bp = api.bpOf(JSON.parse(JSON.stringify(A)));
        const before = api.gridPosition(bp);
        for (const e of bp.entities) e.position = { x: e.position.x + 7, y: e.position.y - 3 };
        const after = api.gridPosition(bp);
        return after.x === before.x - 7 && after.y === before.y + 3;
      })()],
    ['gridpos: nothing to measure gives nothing', api.gridPosition({ entities: [] }) === null]
  );

  checks.push(...M.marks);

  checks.push(...S.belts);

  // --- wires ----------------------------------------------------------------
  // A wire is [entity_a, connector_a, entity_b, connector_b]. Connector ids read
  // off the stored blueprints: 1 red in, 2 green in, 3 red out, 4 green out,
  // 5 copper. dropoff-a has 17 — three copper joins between poles, thirteen red
  // (the chest chain plus the decider's output into the stop), and one green
  // where the decider bridges its own two sides.
  const wv = api.buildPreview(a);
  const noWire = api.buildPreview(a, { wires: false });
  // Match the class as a token: the self-link carries two ("w-gn w-self").
  const cls = (h, c) => (h.match(new RegExp('class="[^"]*\\b' + c + '\\b[^"]*"', 'g')) || []).length;
  const tags = (h, t) => (h.match(new RegExp('<' + t + ' ', 'g')) || []).length;

  // A wire pointing at an entity that isn't there must be skipped, not drawn to
  // a phantom 0,0 — a merge that drops an entity could leave one behind.
  // buildPreview takes the blueprint itself, not the { blueprint: ... } wrapper.
  const dangling = {
    entities: [{ entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } }],
    wires: [[1, 1, 99, 1]],
  };

  checks.push(
    ['wires: every wire is accounted for',
      wv.wires.total === 17 && wv.wires.drawn + wv.wires.self === 17],
    ['wires: the combinator self-link is one of them', wv.wires.self === 1],
    // It has separate input and output points, so wiring its own output back to
    // its own input is a real span, not a zero-length loop needing a marker.
    ['wires: all 17 draw as real spans, none as centre markers',
      tags(wv.html, 'path') === 17 && tags(wv.html, 'circle') === 0],
    ['wires: a combinator\'s input and output are different places',
      (() => {
        const e = { name: 'decider-combinator', position: { x: 0, y: 0 }, direction: 4 };
        const gi = api.wireEnd(e, 2), go = api.wireEnd(e, 4);
        return Math.hypot(go.x - gi.x, go.y - gi.y) > 1;
      })()],
    // Copper lands at the top of the mast, not on the entity position.
    ['wires: pole copper attaches well above the pole centre',
      (() => {
        const e = { name: 'medium-electric-pole', position: { x: 0, y: 0 } };
        return api.wireEnd(e, 5).y < -2.5;
      })()],
    ['wires: an entity with no connection data falls back to its centre',
      (() => {
        const e = { name: 'not-a-real-entity', position: { x: 7, y: 3 } };
        const p = api.wireEnd(e, 1);
        return p.x === 7 && p.y === 3;
      })()],
    // A straight line would be wrong: they hang.
    ['wires: each span is a curve, and longer spans hang further',
      (() => {
        const q = wv.html.match(/Q([-\d.]+) ([-\d.]+)/g) || [];
        return q.length === 17;
      })()],
    ['wires: connector 5 is read as copper, and there are three',
      cls(wv.html, 'w-cu') === 3],
    ['wires: odd connectors are red, even are green',
      cls(wv.html, 'w-rd') === 13 && cls(wv.html, 'w-gn') === 1],
    ['wires: turning them off removes the whole layer',
      noWire.html.indexOf('pv-wires') === -1 && noWire.wires.drawn === 0],
    ['wires: the entity count is unaffected by drawing them',
      noWire.drawn === wv.drawn],
    ['wires: a wire to a missing entity is skipped',
      (() => {
        const r = api.buildPreview(dangling);
        return r.wires.total === 1 && r.wires.drawn === 0 && r.html.indexOf('<line') === -1;
      })()],
    // Drawn over the entities the way the game does, but under the grid overlay
    // so the green cell stays readable.
    ['wires: drawn above the build but below the grid overlay',
      wv.html.indexOf('pv-wires') > wv.html.lastIndexOf('<img ') &&
      wv.html.indexOf('pv-wires') < wv.html.indexOf('pv-cell')]
  );

  // --- grid overlay ---------------------------------------------------------
  // The green box in game is the grid cell anchored at the blueprint ORIGIN, so
  // the overlay's job is to show the gap between origin and build. The stage has
  // to reach the origin for that to mean anything.
  const ov = api.buildPreview(a);
  const noOv = api.buildPreview(a, { overlay: false });
  const count = (h, c) => (h.match(new RegExp('class="' + c + '"', 'g')) || []).length;

  // A build pushed away from the origin: the overlay must widen the stage to
  // keep 0,0 on screen, which is the whole point of drawing it.
  const far = JSON.parse(JSON.stringify(a));
  for (const e of far.entities) e.position = { x: e.position.x + 200, y: e.position.y };
  const farOv = api.buildPreview(far);
  const farNo = api.buildPreview(far, { overlay: false });

  // Same build, no snapping: origin and extent still worth drawing, cell isn't.
  const unsnapped = JSON.parse(JSON.stringify(a));
  delete unsnapped['snap-to-grid'];

  checks.push(
    ['grid: the cell, the extent and the origin are all drawn',
      nMark(ov.html, 'pv-cell') === 1 && count(ov.html, 'pv-bbox') === 1 &&
      count(ov.html, 'pv-origin') === 1],
    ['grid: turning the overlay off removes all three',
      count(noOv.html, 'pv-cell') + count(noOv.html, 'pv-bbox') + count(noOv.html, 'pv-origin') === 0],
    ['grid: the cell is reported at the blueprint\'s own snap size',
      ov.grid && ov.grid.x === 96 && ov.grid.y === 8 && ov.grid.absolute === true],
    // Entity centres, not sprite extents — the grid cares where things are.
    ['grid: the extent is measured from entity centres',
      ov.centres.x0 === 3 && ov.centres.x1 === 93 &&
      ov.centres.y0 === 1 && ov.centres.y1 === 13.5],
    ['grid: a build far from the origin widens the stage to reach it',
      farOv.w > farNo.w + 190],
    ['grid: ...and the un-overlaid stage stays the size of the build',
      Math.abs(farNo.w - noOv.w) < 0.01],
    ['grid: an unsnapped blueprint draws no cell but still shows origin and extent',
      (() => {
        const u = api.buildPreview(unsnapped);
        return count(u.html, 'pv-cell') === 0 && count(u.html, 'pv-origin') === 1 &&
          count(u.html, 'pv-bbox') === 1 && u.grid === null;
      })()],
    ['grid: the overlay is drawn over the build, not under it',
      ov.html.indexOf('pv-cell') > ov.html.lastIndexOf('<img ')]
  );

  checks.push(...S.preview);

  checks.push(...T.normalise);

  checks.push(...T.tileTurns);

  // --- floor-tile overlay ---------------------------------------------------
  // Merging a tiles-only blueprint onto a build. It has no entities, so it can't
  // be lined up by them — it is lined up by where its floor lands on the base, and
  // the tiles are stamped across. Every case here used to be impossible: compare()
  // threw "no entities" the moment either side had none, and merge() never touched
  // tiles even when it didn't. No stored blueprint has floor, so these are synthetic.
  const posSet = tiles => new Set((tiles || []).map(t => t.position.x + ',' + t.position.y));

  // Base: three chests on cells (0,0),(2,0),(0,2). Overlay: the same three-cell
  // shape as floor, drawn 100 tiles away, so the aligner has to find (-100,-100).
  const baseEnts = () => ({ blueprint: { item: 'blueprint', entities: [
    { entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } },
    { entity_number: 2, name: 'steel-chest', position: { x: 2.5, y: 0.5 } },
    { entity_number: 3, name: 'steel-chest', position: { x: 0.5, y: 2.5 } },
  ] } });
  const floorOnly = off => ({ blueprint: { item: 'blueprint', tiles: [
    { name: 'concrete', position: { x: 0 + off, y: 0 + off } },
    { name: 'concrete', position: { x: 2 + off, y: 0 + off } },
    { name: 'concrete', position: { x: 0 + off, y: 2 + off } },
  ] } });

  const td = api.compare(baseEnts(), floorOnly(100));
  const tm = api.merge(baseEnts(), floorOnly(100), td, false);
  const tv = api.bpOf(tm.out);
  const tRound = api.bpOf(await api.decode(await api.encode(tm.out)));

  // A set offset wins over the search.
  const mdo = api.compare(baseEnts(), floorOnly(0), '', { x: 5, y: 5 });
  const mmo = api.merge(baseEnts(), floorOnly(0), mdo, false);
  const mvo = api.bpOf(mmo.out);

  // A rebuilt build that also brought floor: the tiles ride the entity offset across.
  const shifted = { blueprint: { item: 'blueprint', entities: [
    { entity_number: 1, name: 'steel-chest', position: { x: 10.5, y: 0.5 } },
    { entity_number: 2, name: 'steel-chest', position: { x: 12.5, y: 0.5 } },
    { entity_number: 3, name: 'steel-chest', position: { x: 10.5, y: 2.5 } },
  ], tiles: [{ name: 'concrete', position: { x: 10, y: 0 } }] } };
  const cd = api.compare(baseEnts(), shifted);
  const cm = api.merge(baseEnts(), shifted, cd, false);
  const cv = api.bpOf(cm.out);

  // Overwrite: the base already floored a cell, the overlay names it differently.
  const baseFloored = () => ({ blueprint: { item: 'blueprint',
    entities: [{ entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } }],
    tiles: [{ name: 'stone-path', position: { x: 0, y: 0 } }] } });
  const overlayCell = { blueprint: { item: 'blueprint', tiles: [{ name: 'concrete', position: { x: 0, y: 0 } }] } };
  const odc = api.compare(baseFloored(), overlayCell);
  const omc = api.merge(baseFloored(), overlayCell, odc, false);
  const ovc = api.bpOf(omc.out);

  checks.push(
    ['tiles: a floor-only rebuild is merged as tiles, not entities',
      td.tilesOnly === true && td.added.length === 0 && td.removed.length === 0],
    ['tiles: it is auto-aligned by where the floor lands on the build',
      td.al.off.x === -100 && td.al.off.y === -100 && td.al.score === 3 && td.al.confident === true],
    ['tiles: the base entities are left untouched', tv.entities.length === 3],
    ['tiles: the floor is stamped onto the build\'s cells',
      same(posSet(tv.tiles), new Set(['0,0', '2,0', '0,2'])) && tm.tiles === 3],
    ['tiles: every merged tile sits on a whole cell',
      tv.tiles.every(t => Number.isInteger(t.position.x) && Number.isInteger(t.position.y))],
    ['tiles: the overlay survives an encode/decode round trip',
      same(posSet(tRound.tiles), new Set(['0,0', '2,0', '0,2']))],
    ['tiles: a set offset overrides the search',
      mdo.al.off.x === 5 && mdo.al.off.y === 5 && /set offset/.test(mdo.al.anchor) &&
      same(posSet(mvo.tiles), new Set(['5,5', '7,5', '5,7']))],
    ['tiles: a rebuild\'s own floor rides the entity offset across',
      cd.tilesOnly === false && cd.al.off.x === -10 && cd.al.off.y === 0 &&
      cv.entities.length === 3 && same(posSet(cv.tiles), new Set(['0,0'])) && cm.tiles === 1],
    ['tiles: the overlay wins where both name the same cell',
      ovc.tiles.length === 1 && ovc.tiles[0].name === 'concrete' && omc.tiles === 0],
    ['tiles: rotating an overlay uses the corner nudge, like a turn',
      (() => {
        const r = api.transformTiles([{ name: 'concrete', position: { x: 0, y: 0 } }], 1, { x: 0, y: 0 });
        return r[0].position.x === -1 && r[0].position.y === 0;
      })()],
    ['tiles: ...and the offset is added after the rotation',
      (() => {
        const r = api.transformTiles([{ name: 'concrete', position: { x: 0, y: 0 } }], 1, { x: 5, y: 3 });
        return r[0].position.x === 4 && r[0].position.y === 3;
      })()],
    ['tiles: an overlay that overlaps nothing falls back to matching corners',
      (() => {
        const r = api.findTileOffset({ entities: [] }, { tiles: [{ name: 'concrete', position: { x: 4, y: 6 } }] });
        return r.confident === false && r.score === 0 && r.off.x === -4 && r.off.y === -6 && /corners/.test(r.anchor);
      })()],
    ['tiles: a rebuild with neither entities nor tiles is rejected clearly',
      (() => {
        try { api.compare(baseEnts(), { blueprint: { item: 'blueprint', entities: [], tiles: [] } }); return false; }
        catch (e) { return /nothing in it/.test(e.message); }
      })()],
    // An overlay captured turned. The base cells spell an asymmetric L so only the
    // right rotation lines it up; the overlay is that same floor turned a quarter and
    // moved off, and the aligner has to turn it back and land all four tiles.
    ['tiles: a floor captured rotated is turned back to line up',
      (() => {
        const L = { blueprint: { item: 'blueprint', entities: [
          { entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } },
          { entity_number: 2, name: 'steel-chest', position: { x: 1.5, y: 0.5 } },
          { entity_number: 3, name: 'steel-chest', position: { x: 2.5, y: 0.5 } },
          { entity_number: 4, name: 'steel-chest', position: { x: 0.5, y: 1.5 } },
        ] } };
        const turnedFloor = api.transformTiles(
          [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }].map(p => ({ name: 'concrete', position: p })),
          1, { x: 50, y: 50 });
        const rd = api.compare(L, { blueprint: { item: 'blueprint', tiles: turnedFloor } });
        const rv = api.bpOf(api.merge(L, { blueprint: { item: 'blueprint', tiles: turnedFloor } }, rd, false).out);
        return rd.al.q === 3 && rd.al.score === 4 &&
          same(posSet(rv.tiles), new Set(['0,0', '1,0', '2,0', '0,1']));
      })()],
    // A floor-only base is legal too (two floors combined). merge() used to walk an
    // undefined entity list and throw; now it normalises to an empty one.
    ['tiles: two floor-only blueprints merge into one floor, no entities',
      (() => {
        const baseFloor = { blueprint: { item: 'blueprint', tiles: [
          { name: 'stone-path', position: { x: 0, y: 0 } },
          { name: 'stone-path', position: { x: 1, y: 0 } }] } };
        const addFloor = { blueprint: { item: 'blueprint', tiles: [
          { name: 'concrete', position: { x: 1, y: 0 } },
          { name: 'concrete', position: { x: 2, y: 0 } }] } };
        const dd = api.compare(baseFloor, addFloor, '', { x: 0, y: 0 });
        const mv = api.bpOf(api.merge(baseFloor, addFloor, dd, false).out);
        return dd.tilesOnly === true && (mv.entities || []).length === 0 &&
          same(posSet(mv.tiles), new Set(['0,0', '1,0', '2,0']));
      })()],
    // A floor drawn BESIDE a build, not under it, can be forced to land exactly one
    // tile on the build at some offset — but that single forced tile is no signal, so
    // it must fall back to matching corners rather than claim a confident alignment.
    ['tiles: a floor beside the build falls back instead of a false alignment',
      (() => {
        const base = { blueprint: { item: 'blueprint',
          entities: [{ entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } }] } };
        const border = { blueprint: { item: 'blueprint', tiles: [
          { name: 'concrete', position: { x: 50, y: 50 } },
          { name: 'concrete', position: { x: 51, y: 50 } }] } };
        const bd = api.compare(base, border);
        // It may coincidentally force one tile onto the build, so the score isn't the
        // tell — confidence is: a single forced tile is not a real alignment.
        return bd.al.confident === false && /corners/.test(bd.al.anchor);
      })()]
  );

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
