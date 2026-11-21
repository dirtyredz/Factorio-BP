'use strict';
// Turns, flips, normalisation and tile turns: the blueprint-geometry checks.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, 'blueprints', n + '.txt'), 'utf8').trim();
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

module.exports = async api => {
  const A = await api.decode(read('dropoff-a'));
  const a = api.bpOf(A);
  const checks = [];

  // --- scenario 4: rotating a blueprint on its own ---
  // Compare entities regardless of key order (a turn can move `direction` in the
  // object) and treat an absent direction as north.
  const canon = v => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
      return o;
    }
    return v;
  };
  const norm = o => {
    const c = JSON.parse(JSON.stringify(o));
    for (const e of api.bpOf(c).entities) if (e.direction === undefined) e.direction = 0;
    api.bpOf(c).entities.sort((x, y) =>
      x.position.x - y.position.x || x.position.y - y.position.y || (x.name < y.name ? -1 : 1));
    return JSON.stringify(canon(api.bpOf(c).entities));
  };

  const half = api.turnBlueprint(A, 2);
  const fullCircle = api.turnBlueprint(api.turnBlueprint(A, 2), 2);
  const quarters = api.turnBlueprint(api.turnBlueprint(api.turnBlueprint(api.turnBlueprint(A, 1), 1), 1), 1);
  const quarterOnce = api.turnBlueprint(A, 1);
  const hb = api.bpOf(half), qb = api.bpOf(quarterOnce);

  checks.push(
    ['turn: 180 twice is the original', norm(fullCircle) === norm(A)],
    ['turn: four quarter turns is the original', norm(quarters) === norm(A)],
    ['turn: 180 is not the original', norm(half) !== norm(A)],
    ['turn: entity count unchanged', hb.entities.length === (a.entities || []).length],
    ['turn: parameters untouched', same(a.parameters, hb.parameters)],
    ['turn: station string untouched',
      hb.entities.find(e => e.name === 'train-stop').station ===
      '[item=parameter-0][virtual-signal=down-arrow]'],
    ['turn: 180 keeps grid dimensions', same(a['snap-to-grid'], hb['snap-to-grid'])],
    ['turn: quarter turn swaps grid dimensions',
      qb['snap-to-grid'].x === a['snap-to-grid'].y && qb['snap-to-grid'].y === a['snap-to-grid'].x],
    // the offset belongs to the grid, not the entities: a quarter turn swaps which
    // axis each number applies to, a half turn changes nothing
    ['turn: quarter turn swaps the grid offset',
      qb['position-relative-to-grid'].x === a['position-relative-to-grid'].y &&
      qb['position-relative-to-grid'].y === a['position-relative-to-grid'].x],
    ['turn: half turn leaves the grid offset alone',
      same(hb['position-relative-to-grid'], a['position-relative-to-grid'])],
    ['turn: train stop direction advances half a turn',
      hb.entities.find(e => e.name === 'train-stop').direction ===
      ((a.entities.find(e => e.name === 'train-stop').direction + 8) % 16)],
    ['turn: wires untouched', same(a.wires, hb.wires)],
    ['turn: survives a round trip through a string',
      norm(await api.decode(await api.encode(half))) === norm(half)]
  );

  // --- scenario 5: flipping ---
  // The rail loop in Drop Off A is exactly mirror-symmetric about x = 48 — every one
  // of its 40 pieces has a twin at 96 - x, same y — and the build's extremes are two
  // of those rails, so a horizontal flip must reproduce the loop piece for piece.
  // That is what pins the curved-rail mapping: a curve's mirror image is the
  // other-handed curve, which reads -d + 2 rather than -d.
  const flipX = api.flipBlueprint(A, 'x');
  const flipY = api.flipBlueprint(A, 'y');
  const fxb = api.bpOf(flipX), fyb = api.bpOf(flipY);

  const railSet = bp => JSON.stringify(bp.entities
    .filter(e => /rail/.test(e.name) && !/signal/.test(e.name))
    .map(e => e.name + '@' + e.position.x + ',' + e.position.y + '#' + (e.direction || 0))
    .sort());
  const span = bp => {
    const xs = bp.entities.map(e => e.position.x), ys = bp.entities.map(e => e.position.y);
    return [Math.min.apply(null, xs), Math.max.apply(null, xs),
            Math.min.apply(null, ys), Math.max.apply(null, ys)].join(',');
  };
  const curve = (bp, x, y) => bp.entities.find(e =>
    /curved/.test(e.name) && e.position.x === x && e.position.y === y);

  checks.push(
    ['flip: the mirror-symmetric rail loop comes back identical', railSet(fxb) === railSet(a)],
    ['flip: curved-rail-a at (3,12) reads dir 2, as the one it mirrored from did',
      curve(fxb, 3, 12).name === 'curved-rail-a' && curve(fxb, 3, 12).direction === 2],
    ['flip: curved-rail-b at (9,3) reads dir 12', curve(fxb, 9, 3).direction === 12],
    ['flip: straight rails keep direction 4',
      fxb.entities.filter(e => e.name === 'straight-rail').every(e => e.direction === 4)],
    ['flip: the build sits on the same tiles it did', span(fxb) === span(a)],
    ['flip: horizontal twice is the original', norm(api.flipBlueprint(flipX, 'x')) === norm(A)],
    ['flip: vertical twice is the original', norm(api.flipBlueprint(flipY, 'y')) === norm(A)],
    // both mirrors composed are a half turn, and the half turn is the one that was
    // checked against Factorio's own output — so this carries that evidence across
    ['flip: horizontal then vertical is exactly the verified 180° turn',
      norm(api.flipBlueprint(flipX, 'y')) === norm(api.turnBlueprint(A, 2))],
    ['flip: horizontal is not the original', norm(flipX) !== norm(A)],
    ['flip: vertical is not the original', norm(flipY) !== norm(A)],
    ['flip: entity count unchanged', fxb.entities.length === a.entities.length],
    ['flip: grid dimensions are not swapped', same(a['snap-to-grid'], fxb['snap-to-grid'])],
    ['flip: grid offset left alone', same(a['position-relative-to-grid'], fxb['position-relative-to-grid'])],
    ['flip: parameters untouched', same(a.parameters, fxb.parameters)],
    ['flip: station string untouched',
      fxb.entities.find(e => e.name === 'train-stop').station ===
      '[item=parameter-0][virtual-signal=down-arrow]'],
    ['flip: every parameter still binds', api.paramsStillBind(fxb)],
    ['flip: wires untouched', same(a.wires, fxb.wires)],
    ['flip: north-facing inserters stay north across a horizontal flip',
      fxb.entities.filter(e => e.name === 'bulk-inserter').every(e => e.direction === undefined)],
    ['flip: north-facing inserters face south across a vertical one',
      fyb.entities.filter(e => e.name === 'bulk-inserter').every(e => e.direction === 8)],
    // the stop faces east; mirroring left to right turns it round, mirroring top to
    // bottom leaves it pointing the same way
    ['flip: the east-facing train stop ends up facing west',
      fxb.entities.find(e => e.name === 'train-stop').direction === 12],
    ['flip: a vertical flip leaves the train stop facing east',
      fyb.entities.find(e => e.name === 'train-stop').direction === 4],
    ['flip: survives a round trip through a string',
      norm(await api.decode(await api.encode(flipX))) === norm(flipX)]
  );

  // --- scenario 6: the pieces Drop Off A hasn't got ---
  // No grid here, so positions mirror about the origin and can be read off exactly.
  const synth = await api.decode(await api.encode({ blueprint: {
    item: 'blueprint', version: 562949955649540,
    entities: [
      { entity_number: 1, name: 'splitter', position: { x: 0.5, y: 0.5 }, direction: 4,
        input_priority: 'left', output_priority: 'right', filter: 'iron-plate' },
      { entity_number: 2, name: 'fast-inserter', position: { x: 2.5, y: 0.5 },
        drop_position: { x: 1.2, y: 0 } },
      { entity_number: 3, name: 'locomotive', position: { x: 5, y: 5 }, orientation: 0.25 },
    ],
    tiles: [{ name: 'concrete', position: { x: 0, y: 0 } }],
  } }));
  const sx = api.bpOf(api.flipBlueprint(synth, 'x'));
  const sy = api.bpOf(api.flipBlueprint(synth, 'y'));
  const pick = (bp, n) => bp.entities.find(e => e.name === n);

  checks.push(
    ['flip: positions mirror about the origin', pick(sx, 'splitter').position.x === -0.5 &&
      pick(sx, 'splitter').position.y === 0.5],
    ['flip: an east-facing splitter faces west after a horizontal flip',
      pick(sx, 'splitter').direction === 12],
    ['flip: ...and still faces east after a vertical one', pick(sy, 'splitter').direction === 4],
    ['flip: splitter priorities swap, left for right',
      pick(sx, 'splitter').input_priority === 'right' && pick(sx, 'splitter').output_priority === 'left'],
    ['flip: a vertical flip swaps them too',
      pick(sy, 'splitter').input_priority === 'right' && pick(sy, 'splitter').output_priority === 'left'],
    ['flip: the splitter filter is left alone', pick(sx, 'splitter').filter === 'iron-plate'],
    ['flip: a drop position mirrors as an offset', pick(sx, 'fast-inserter').drop_position.x === -1.2 &&
      pick(sx, 'fast-inserter').drop_position.y === 0],
    ['flip: an east-facing locomotive ends up facing west', pick(sx, 'locomotive').orientation === 0.75],
    ['flip: ...and keeps facing east through a vertical flip',
      pick(sy, 'locomotive').orientation === 0.25],
    // a tile's stored position is its corner, so its mirror image is the next one along
    ['flip: tiles mirror by their corner, not their centre', sx.tiles[0].position.x === -1 &&
      sx.tiles[0].position.y === 0],
    ['flip: a vertical flip moves the tile on the other axis', sy.tiles[0].position.x === 0 &&
      sy.tiles[0].position.y === -1]
  );

  // the real one: their rebuilt blueprint came back rotated 180, so turning the base
  // by 180 should line the two up with no further rotation needed
  const theirs = fs.existsSync(path.join(root, 'blueprints', 'dropoff-a-stoplogic.txt'))
    ? await api.decode(read('dropoff-a-stoplogic')) : null;
  if (theirs) {
    const straight = api.compare(A, theirs);
    const pre = api.compare(half, theirs);
    checks.push(
      ['turn: their rebuild is detected as a half turn', straight.al.q === 2],
      ['turn: pre-turning the base makes it a plain slide', pre.al.q === 0],
      ['turn: both routes see the same changes',
        straight.modified.length === pre.modified.length && straight.added.length === pre.added.length]
    );
  }
  const transforms = checks.splice(0);

  // --- normalise ------------------------------------------------------------
  // The point of the feature: two blueprints normalised the same way, sharing a
  // grid size, land on the same spot in game. So the test is that their minimum
  // entity centres agree afterwards — not that any single one hits a number.
  const minOf = bp => (bp.entities || []).reduce((m, e) => ({
    x: Math.min(m.x, e.position.x), y: Math.min(m.y, e.position.y),
  }), { x: Infinity, y: Infinity });

  const fresh = async n => await api.decode(read(n));

  const nA = await fresh('dropoff-a');
  const nB = await fresh('dropoff-b');
  const rA = api.normalise(nA, { x: 0, y: 0 });
  const rB = api.normalise(nB, { x: 0, y: 0 });
  const mA = minOf(api.bpOf(nA)), mB = minOf(api.bpOf(nB));

  // Same blueprint twice: normalising is idempotent, so a second pass is a no-op.
  const again = api.normalise(nA, { x: 0, y: 0 });

  // A build already at the corner shouldn't move at all.
  const nC = await fresh('dropoff-a');
  api.normalise(nC, { x: 0, y: 0 });
  const nCagain = api.normalise(nC, { x: 0, y: 0 });

  // Round trip through a real encode, since that's what the page copies out.
  const nStr = await api.encode(nA);
  const nBack = api.bpOf(await api.decode(nStr));

  const preA = api.bpOf(await fresh('dropoff-a'));

  checks.push(
    ['normalise: two different blueprints end up sharing a corner',
      mA.x === mB.x && mA.y === mB.y],
    ['normalise: the corner is where it was asked to go', mA.x === 0 && mA.y === 0],
    ['normalise: it is idempotent', again.moved.x === 0 && again.moved.y === 0],
    ['normalise: a build already in place does not move',
      nCagain.moved.x === 0 && nCagain.moved.y === 0],
    // Whole tiles only: a half-tile shift would put 1x1 entities off-tile.
    ['normalise: the translation is a whole number of tiles',
      Number.isInteger(rA.moved.x) && Number.isInteger(rA.moved.y) &&
      Number.isInteger(rB.moved.x) && Number.isInteger(rB.moved.y)],
    ['normalise: every entity moved by the same vector',
      api.bpOf(nA).entities.every((e, i) =>
        e.position.x === preA.entities[i].position.x + rA.moved.x &&
        e.position.y === preA.entities[i].position.y + rA.moved.y)],
    ['normalise: entity count is untouched', api.bpOf(nA).entities.length === 103],
    ['normalise: parameters still bind afterwards', api.paramsStillBind(nBack)],
    ['normalise: grid, snapping and offset are left alone',
      same(preA['snap-to-grid'], nBack['snap-to-grid']) &&
      preA['absolute-snapping'] === nBack['absolute-snapping'] &&
      same(preA['position-relative-to-grid'], nBack['position-relative-to-grid'])],
    ['normalise: the label survives', nBack.label === 'Drop Off A'],
    ['normalise: it survives an encode/decode round trip',
      minOf(nBack).x === 0 && minOf(nBack).y === 0],
    // Inserters store reach as absolute positions, so they have to move too.
    ['normalise: inserter pickup and drop positions move with the entity',
      (() => {
        const src = { blueprint: { entities: [
          { entity_number: 1, name: 'fast-inserter', position: { x: 10.5, y: 4.5 },
            pickup_position: { x: 10.5, y: 5.5 }, drop_position: { x: 10.5, y: 3.5 } },
        ] } };
        const r = api.normalise(src, { x: 0.5, y: 0.5 });
        const e = src.blueprint.entities[0];
        return r.moved.x === -10 && r.moved.y === -4 &&
          e.pickup_position.x === 0.5 && e.pickup_position.y === 1.5 &&
          e.drop_position.y === -0.5;
      })()],
    ['normalise: tiles translate with the build',
      (() => {
        const src = { blueprint: {
          entities: [{ entity_number: 1, name: 'steel-chest', position: { x: 8.5, y: 8.5 } }],
          tiles: [{ name: 'concrete', position: { x: 8, y: 8 } }] } };
        // chest centre 8.5 -> 0.5 is a -8 shift, so the tile at 8 lands on 0
        const r = api.normalise(src, { x: 0.5, y: 0.5 });
        return r.moved.x === -8 && r.moved.y === -8 &&
          src.blueprint.tiles[0].position.x === 0 &&
          src.blueprint.tiles[0].position.y === 0;
      })()],
    // The honest bit: whole-tile steps can't close a half-tile gap between a
    // build whose edge entity is 1x1 and one whose edge is 2x2.
    ['normalise: a half-tile mismatch is reported, not silently swallowed',
      (() => {
        const src = { blueprint: { entities: [
          { entity_number: 1, name: 'steel-chest', position: { x: 5.5, y: 5.5 } },
        ] } };
        const r = api.normalise(src, { x: 0, y: 0 });
        return Math.abs(r.residual.x) === 0.5 && Math.abs(r.residual.y) === 0.5;
      })()],
    ['normalise: the report names what else has to match',
      (() => {
        const m = api.normaliseReport(nBack);
        return m.grid === '96 × 8' && m.snapping === 'absolute' && m.offset === '(-8, -4)';
      })()]
  );
  const normalise = checks.splice(0);

  // --- tiles under a turn ---------------------------------------------------
  // A tile's stored position is its top-left corner, so rotating the corner is
  // not the same as rotating the tile. No stored blueprint has tiles, so this
  // was wrong for a long time without anyone noticing. No snap-to-grid here on
  // purpose: reanchor() only runs when there is one, and it would otherwise
  // translate the result and hide the thing being measured.
  const tiled = () => ({ blueprint: {
    entities: [{ entity_number: 1, name: 'steel-chest', position: { x: 0.5, y: 0.5 } }],
    tiles: [
      { name: 'concrete', position: { x: 0, y: 0 } },
      { name: 'concrete', position: { x: 3, y: 1 } },
    ],
  } });

  const tq = q => api.bpOf(api.turnBlueprint(tiled(), q)).tiles.map(t => t.position);
  const spun = [tq(1), tq(2), tq(3)];

  // Four quarter turns is the identity, tiles included.
  let round = tiled();
  for (let i = 0; i < 4; i++) round = api.turnBlueprint(round, 1);
  const roundTiles = api.bpOf(round).tiles.map(t => t.position);

  // flipBlueprint already handles the corner correctly, so flipping both ways
  // is an independent implementation of a half turn to check against.
  const halfByFlip = api.bpOf(api.flipBlueprint(api.flipBlueprint(tiled(), 'x'), 'y'))
    .tiles.map(t => t.position);

  // Does the rotated tile cover the square the original tile's area maps to?
  const coversRight = (q) => {
    const before = tiled().blueprint.tiles;
    const after = tq(q);
    return before.every((t, i) => {
      // Corners of the original tile's square, rotated q quarter turns.
      const pts = [[t.position.x, t.position.y], [t.position.x + 1, t.position.y],
                   [t.position.x, t.position.y + 1], [t.position.x + 1, t.position.y + 1]]
        .map(([x, y]) => { for (let k = 0; k < q; k++) { const nx = -y; y = x; x = nx; } return [x, y]; });
      const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
      return after[i].x === minX && after[i].y === minY;
    });
  };

  checks.push(
    ['turn: a tile lands on the square its area rotates onto, a quarter turn',
      coversRight(1)],
    ['turn: ...a half turn', coversRight(2)],
    ['turn: ...and three quarters', coversRight(3)],
    ['turn: a tile at 0,0 goes to -1,0 clockwise, not 0,0',
      spun[0][0].x === -1 && spun[0][0].y === 0],
    ['turn: four quarter turns put the tiles back',
      same(roundTiles, tiled().blueprint.tiles.map(t => t.position))],
    ['turn: a half turn agrees with flipping both ways', same(spun[1], halfByFlip)],
    ['turn: entities are not given the tile correction',
      api.bpOf(api.turnBlueprint(tiled(), 1)).entities[0].position.x === -0.5]
  );
  const tileTurns = checks.splice(0);

  return { transforms, normalise, tileTurns };
};
