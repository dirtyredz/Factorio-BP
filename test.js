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

  // --- preview -------------------------------------------------------------
  // The preview's job is to show what's about to be copied, so the thing worth
  // testing is that it can actually draw it — every entity, in every facing the
  // tools can produce, not just the facings the stored blueprints happen to use.

  const spriteDir = path.join(__dirname, 'sprites');
  const haveSprites = fs.existsSync(spriteDir);

  // Every file the manifest can ask for, via the shared-art direction in slot 4.
  const wanted = new Set();
  for (const n in api.SPRITES) {
    for (const d in api.SPRITES[n]) wanted.add(n + '_' + api.SPRITES[n][d][4] + '.png');
  }
  const absent = [...wanted].filter(f => !fs.existsSync(path.join(spriteDir, f)));

  checks.push(
    ['preview: the manifest names at least one sprite per entity type',
      Object.keys(api.SPRITES).length >= 13],
    ['preview: every sprite the manifest references exists on disk',
      !haveSprites || absent.length === 0],
    // The first attempt stretched a square icon into the footprint box. A curved
    // rail's frame is square (8x8 tiles) while its footprint is not (2x6), so
    // sizing from the footprint by mistake shows up right here.
    ['preview: sprite frames are sized from the art, not the footprint',
      api.entBox({ name: 'curved-rail-a', position: { x: 0, y: 0 }, direction: 0 }).w ===
      api.entBox({ name: 'curved-rail-a', position: { x: 0, y: 0 }, direction: 0 }).h],
    // Rails read the same from both ends, so direction 8 must reuse north's art.
    ['preview: a rail facing south reuses the north sprite',
      api.entBox({ name: 'straight-rail', position: { x: 0, y: 0 }, direction: 8 }).file ===
      'straight-rail_0.png'],
    ['preview: a chest looks the same from every direction',
      api.entBox({ name: 'steel-chest', position: { x: 0, y: 0 }, direction: 12 }).file ===
      'steel-chest_0.png'],
    // Unknown types fall back to a box, whose axes swap on a quarter turn.
    ['preview: an unknown entity falls back to a 1x1 box',
      (() => {
        const q = api.entBox({ name: 'not-a-real-entity', position: { x: 0, y: 0 } });
        return q.file === null && q.w === 1 && q.h === 1;
      })()],
    ['preview: a fallback box swaps its axes on a quarter turn',
      (() => {
        const n = api.entBox({ name: 'decider-combinator', position: { x: 0, y: 0 } });
        delete api.SPRITES['decider-combinator'];   // force the fallback path
        const up = api.entBox({ name: 'decider-combinator', position: { x: 0, y: 0 }, direction: 0 });
        const side = api.entBox({ name: 'decider-combinator', position: { x: 0, y: 0 }, direction: 4 });
        api.SPRITES['decider-combinator'] = n && undefined;   // restored below
        return up.w === 1 && up.h === 2 && side.w === 2 && side.h === 1;
      })()]
  );

  // Rebuild the entry the check above deleted, so later checks see a clean table.
  {
    const fresh = loadPageApi(['SPRITES']).SPRITES;
    api.SPRITES['decider-combinator'] = fresh['decider-combinator'];
  }

  // The real regression: a flip negates direction and a turn adds to it, so the
  // tools produce facings no saved blueprint contains. A chain signal at
  // direction 3 becomes 13 under a horizontal flip, and 13 had no sprite.
  const stored = fs.readdirSync(path.join(__dirname, 'blueprints'))
    .filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, ''));

  const moves = [
    ['as stored', o => o],
    ['turned 90', o => api.turnBlueprint(o, 1)],
    ['turned 180', o => api.turnBlueprint(o, 2)],
    ['turned 270', o => api.turnBlueprint(o, 3)],
    ['flipped x', o => api.flipBlueprint(o, 'x')],
    ['flipped y', o => api.flipBlueprint(o, 'y')],
  ];

  const gaps = [];
  let previewed = 0;
  for (const name of stored) {
    const obj = await api.decode(read(name));
    for (const [what, run] of moves) {
      const bp = api.bpOf(run(JSON.parse(JSON.stringify(obj))));
      const built = api.buildPreview(bp);
      if (!built) continue;
      previewed++;
      if (built.boxed) {
        // Name the offenders — a bare count is no use when this fails.
        for (const e of bp.entities) {
          if (!api.entBox(e).file) gaps.push(name + ' ' + what + ': ' + e.name + ' dir ' + (e.direction || 0));
        }
      }
      if (built.drawn + built.boxed !== bp.entities.length) {
        gaps.push(name + ' ' + what + ': drew ' + (built.drawn + built.boxed) +
          ' of ' + bp.entities.length);
      }
    }
  }

  // The SPRITES table in index.html is a collapsed copy of sprites/entities.json:
  // directions drawing the same art are folded into "*". Three things can rot —
  // the fold can lose a direction, the copy can go stale against the PNGs, and
  // the extractor can be narrowed back to "only the directions we use", which is
  // the bug that put a chain signal at direction 13 with no sprite.
  const entPath = path.join(spriteDir, 'entities.json');
  const full = fs.existsSync(entPath) ? JSON.parse(fs.readFileSync(entPath, 'utf8')) : null;

  let lossy = [], thin = [];
  if (full) {
    for (const n in full) {
      // Belts carry extra keys beyond the sixteen facings — "8c12" is facing
      // south, fed from the west — so the two kinds are counted separately.
      const keys = Object.keys(full[n].dirs);
      const plain = keys.filter(k => /^\d+$/.test(k));
      const curved = keys.filter(k => /^\d+c\d+$/.test(k));
      if (plain.length !== 16) thin.push(n + ' has ' + plain.length + ' directions');

      for (const k of plain) {
        const got = api.entBox({ name: n, position: { x: 0, y: 0 }, direction: Number(k) }).file;
        if (got !== full[n].dirs[k].file) {
          lossy.push(n + ' dir ' + k + ': table says ' + got + ', extractor made ' + full[n].dirs[k].file);
        }
      }
      for (const k of curved) {
        const [to, from] = k.split('c').map(Number);
        const got = api.entBox({ name: n, position: { x: 0, y: 0 }, direction: to }, from).file;
        if (got !== full[n].dirs[k].file) {
          lossy.push(n + ' curve ' + k + ': table says ' + got + ', extractor made ' + full[n].dirs[k].file);
        }
      }
    }
  }

  // Cheapest way to prove the inlined table matches the PNGs: ask the generator
  // what it would emit now, and compare. No duplicated collapsing logic.
  let stale = null;
  if (full) {
    try {
      const emitted = require('child_process')
        .execFileSync(process.execPath, [path.join(__dirname, 'tools', 'sprites', 'emit-manifest.js')],
          { encoding: 'utf8' });
      const line = /^ {2}const SPRITES = .*;$/m.exec(emitted);
      const inPage = /^ {2}const SPRITES = .*;$/m.exec(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
      stale = !line || !inPage || line[0] !== inPage[0];
    } catch (e) { stale = null; }   // generator unavailable; skip rather than fail
  }

  checks.push(
    ['preview: the "*" fold is lossless — every direction resolves to the extracted art',
      !full || lossy.length === 0],
    ['preview: all 16 directions are extracted, not just the ones in use',
      !full || thin.length === 0],
    ['preview: the table in index.html matches the sprites on disk',
      stale === null || stale === false]
  );

  for (const l of lossy.slice(0, 6)) console.log('    fold lost: ' + l);
  for (const t of thin) console.log('    too few directions: ' + t);
  if (stale) console.log('    index.html is stale — run: node tools/sprites/emit-manifest.js --write');

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

  // --- belt curves ----------------------------------------------------------
  // A blueprint stores only each belt's direction; curving is derived from the
  // neighbours. A belt curves when exactly one belt feeds it from a
  // perpendicular side and nothing feeds it from behind.
  const belt = (n, x, y, d) => ({ entity_number: n, name: 'transport-belt',
    position: { x: x, y: y }, direction: d });
  const fbelt = (n, x, y, d) => ({ entity_number: n, name: 'fast-transport-belt',
    position: { x: x, y: y }, direction: d });

  const curvesOf = list => api.beltCurves(list);

  // Fed from the west by a belt travelling east, then turns south.
  const corner = [belt(1, 0.5, 0.5, 4), belt(2, 1.5, 0.5, 8)];
  // Same, but also fed from behind — a straight run wins.
  const tee = [belt(1, 0.5, 0.5, 4), belt(2, 1.5, 0.5, 8), belt(3, 1.5, -0.5, 8)];
  // Fed from both sides — the two merge, so it stays straight.
  const merge = [belt(1, 0.5, 0.5, 4), belt(2, 2.5, 0.5, 12), belt(3, 1.5, 0.5, 8)];
  // A splitter can feed a belt, but never curves itself.
  const fromSplitter = [
    { entity_number: 1, name: 'splitter', position: { x: 0.5, y: 0.5 }, direction: 4 },
    belt(2, 1.5, 0.5, 8),
  ];

  const real = api.beltCurves(a.entities);
  const realCount = Object.keys(real).length;

  checks.push(
    ['belt: a side feed with nothing behind makes a curve',
      curvesOf(corner)[2] === 4],
    ['belt: a feed from behind keeps it straight', curvesOf(tee)[2] === undefined],
    ['belt: two side feeds merge, so it stays straight', curvesOf(merge)[3] === undefined],
    ['belt: the feeding belt itself is not curved', curvesOf(corner)[1] === undefined],
    ['belt: a splitter can feed a curve', curvesOf(fromSplitter)[2] === 4],
    ['belt: dropoff-a has exactly six curved belts', realCount === 6],
    // Both junctions are symmetric: two turning south, and one back out each way.
    ['belt: those six are the two S-bends',
      (() => {
        const tally = {};
        for (const n in real) {
          const e = a.entities.find(x => x.entity_number === Number(n));
          const k = (e.direction || 0) + 'c' + real[n];
          tally[k] = (tally[k] || 0) + 1;
        }
        return tally['8c4'] === 2 && tally['8c12'] === 2 &&
          tally['4c8'] === 1 && tally['12c8'] === 1;
      })()],
    // Sprites were only extracted for the belt tier the blueprints use.
    ['belt: a curved belt draws a different sprite from a straight one',
      (() => {
        const e = fbelt(1, 0.5, 0.5, 8);
        return api.entBox(e).file !== api.entBox(e, 4).file;
      })()],
    ['belt: every curve key resolves to a real sprite',
      ['0c4', '4c0', '0c12', '12c0', '4c8', '8c4', '12c8', '8c12'].every(k => {
        const [to, from] = k.split('c').map(Number);
        const f = api.entBox(fbelt(1, 0.5, 0.5, to), from).file;
        return f === 'fast-transport-belt_' + k + '.png';
      })],
    // A feed from behind is not a curve, so the straight frame is right. Compared
    // against the straight lookup rather than a filename: directions sharing art
    // share a file, named after whichever direction was extracted first.
    ['belt: an unusable feed direction falls back to the straight sprite',
      api.entBox(fbelt(1, 0.5, 0.5, 8), 8).file === api.entBox(fbelt(1, 0.5, 0.5, 8)).file]
  );

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

  const previewOne = api.buildPreview(a);

  checks.push(
    ['preview: every stored blueprint draws, in every facing a turn or flip makes',
      gaps.length === 0],
    ['preview: that covered every blueprint six ways', previewed === stored.length * moves.length],
    ['preview: nothing is rotated — direction picks a frame, it never spins one',
      previewOne.html.indexOf('rotate(') === -1],
    ['preview: one img per entity', (previewOne.html.match(/<img /g) || []).length === a.entities.length],
    ['preview: bounds cover the build', previewOne.w > 90 && previewOne.h > 10],
    ['preview: rails are drawn before the machines standing on them',
      previewOne.html.indexOf('straight-rail') < previewOne.html.indexOf('steel-chest')]
  );

  if (gaps.length) {
    console.log('\n  missing sprites:');
    for (const g of [...new Set(gaps)].slice(0, 12)) console.log('    ' + g);
  }
  if (haveSprites && absent.length) {
    console.log('\n  manifest references missing files: ' + absent.slice(0, 8).join(', '));
    console.log('  re-run the pipeline in CLAUDE.md#sprites');
  }
  if (!haveSprites) console.log('\n  (sprites/ absent — file-existence check skipped)');

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
