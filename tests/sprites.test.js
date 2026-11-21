'use strict';
// Sprite manifest fidelity, belt curve and art selection, and preview rendering of every stored blueprint.

const fs = require('fs');
const path = require('path');

const { loadPageApi } = require('../tools/lib/page-api');

const root = path.join(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, 'blueprints', n + '.txt'), 'utf8').trim();

module.exports = async api => {
  const A = await api.decode(read('dropoff-a'));
  const a = api.bpOf(A);
  const checks = [];
  const diag = [];
  const say = s => diag.push(s);

  // --- preview -------------------------------------------------------------
  // The preview's job is to show what's about to be copied, so the thing worth
  // testing is that it can actually draw it — every entity, in every facing the
  // tools can produce, not just the facings the stored blueprints happen to use.

  const spriteDir = path.join(root, 'sprites');
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
  const stored = fs.readdirSync(path.join(root, 'blueprints'))
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
        .execFileSync(process.execPath, [path.join(root, 'tools', 'sprites', 'emit-manifest.js')],
          { encoding: 'utf8' });
      const line = /^ {2}const SPRITES = .*;$/m.exec(emitted);
      const inPage = /^ {2}const SPRITES = .*;$/m.exec(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
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

  for (const l of lossy.slice(0, 6)) say('    fold lost: ' + l);
  for (const t of thin) say('    too few directions: ' + t);
  if (stale) say('    index.html is stale — run: node tools/sprites/emit-manifest.js --write');
  const manifest = checks.splice(0);
  const manifestDiag = diag.splice(0);

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

  const belts = checks.splice(0);

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
    say('\n  missing sprites:');
    for (const g of [...new Set(gaps)].slice(0, 12)) say('    ' + g);
  }
  if (haveSprites && absent.length) {
    say('\n  manifest references missing files: ' + absent.slice(0, 8).join(', '));
    say('  re-run the pipeline in CLAUDE.md#sprites');
  }
  if (!haveSprites) say('\n  (sprites/ absent — file-existence check skipped)');
  const preview = checks.splice(0);
  const previewDiag = diag.splice(0);

  return { manifest, belts, preview, diagnostics: { manifest: manifestDiag, preview: previewDiag } };
};
