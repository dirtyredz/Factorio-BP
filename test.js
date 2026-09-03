'use strict';
// Runs the merge logic straight out of index.html against the stored blueprints,
// so the page and the CLI are held to the same known-good result.

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</' + 'script>'));

// minimal DOM so the page's event wiring doesn't throw under node
const stub = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} },
  value: '', textContent: '', innerHTML: '', className: '', checked: false,
  removeAttribute() {}, setAttribute() {}, select() {},
});
const document = { getElementById: stub, querySelectorAll: () => [] };
const navigator = { clipboard: { writeText: async () => {} } };

const api = new Function('document', 'navigator',
  src + '\n;return { decode, encode, compare, merge, bpOf, protect, paramsStillBind, key, ZERO,' +
        ' turnBlueprint, flipBlueprint, entBox, buildPreview, SPRITES, FOOTPRINT, wireEnd, CONNECT, beltCurves, diffMarks, gridPosition,' +
        ' normalise, normaliseReport };'
)(document, navigator);

const read = n => fs.readFileSync(path.join(__dirname, 'blueprints', n + '.txt'), 'utf8').trim();

(async () => {
  const A = await api.decode(read('dropoff-a'));
  const B = await api.decode(read('dropoff-a-signals'));

  const d = api.compare(A, B);
  const { out, wires } = api.merge(A, B, d, false);
  const str = await api.encode(out);

  const a = api.bpOf(A);
  const v = api.bpOf(await api.decode(str));
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  const checks = [
    ['offset found', same(d.al.off, { x: -280, y: -796 })],
    ['anchor match count', d.al.score === 103],
    ['2 entities added', d.added.length === 2],
    ['both are rail signals', d.added.every(e => e.name === 'rail-signal')],
    ['signal at 36.5,2.5 dir 12', d.added.some(e =>
      e.position.x + d.al.off.x === 36.5 && e.position.y + d.al.off.y === 2.5 && e.direction === 12)],
    ['signal at 57.5,2.5 dir 12', d.added.some(e =>
      e.position.x + d.al.off.x === 57.5 && e.position.y + d.al.off.y === 2.5 && e.direction === 12)],
    ['nothing removed', d.removed.length === 0],
    // the decider's T/2 slot holds 70000 in the base and the substituted 47500 in the
    // rebuilt one; the base must win or the parameter loses its binding
    ['the substituted formula value is caught', d.modified.length === 1 &&
      d.modified[0].name === 'decider-combinator'],
    ['base keeps 70000, not 47500',
      JSON.stringify(v.entities.find(e => e.name === 'decider-combinator')).includes('70000')],
    ['label kept', a.label === v.label && v.label === 'Drop Off A'],
    ['snap-to-grid kept', same(a['snap-to-grid'], v['snap-to-grid'])],
    ['absolute snapping kept', a['absolute-snapping'] === v['absolute-snapping']],
    ['grid offset kept', same(a['position-relative-to-grid'], v['position-relative-to-grid'])],
    ['parameters kept', same(a.parameters, v.parameters)],
    ['4 parameters present', v.parameters.length === 4],
    ['formula T/2 intact', v.parameters.some(p => p.formula === 'T/2' && p.dependent)],
    ['station string parametrised', v.entities.find(e => e.name === 'train-stop').station === '[item=parameter-0][virtual-signal=down-arrow]'],
    ['wires kept', same(a.wires, v.wires)],
    ['entity count 103 -> 105', v.entities.length === 105],
    ['decoded JSON matches the verified CLI merge',
      JSON.stringify(await api.decode(str)) === JSON.stringify(await api.decode(read('dropoff-a-v2-reference')))],
  ];

  // --- scenario 2: entities swapped for different ones, on a shifted origin ---
  // upgrade every belt, swap the decider (the rarest shared type, so auto-alignment
  // can't lean on it), and move the whole thing so no coordinate matches by luck
  const up = JSON.parse(JSON.stringify(B));
  for (const e of up.blueprint.entities) {
    if (e.name === 'fast-transport-belt') e.name = 'express-transport-belt';
    if (e.name === 'decider-combinator') e.name = 'arithmetic-combinator';
    e.position.x += 37.0;
    e.position.y -= 13.0;
  }
  const U = await api.decode(await api.encode(up));

  const d2 = api.compare(A, U);
  const m2 = api.merge(A, U, d2, false);
  const s2 = await api.encode(m2.out);
  const v2 = api.bpOf(await api.decode(s2));
  const tiles = v2.entities.map(e => e.name + '@' + e.position.x + ',' + e.position.y);

  const forced = api.compare(A, U, 'straight-rail');

  checks.push(
    ['swap: 16 belts + 1 combinator seen as replaced', d2.replaced.length === 17],
    ['swap: belts upgraded, not duplicated',
      d2.replaced.filter(r => r.to.name === 'express-transport-belt').length === 16],
    ['swap: the 2 signals still count as added', d2.added.length === 2],
    ['swap: nothing reported as removed', d2.removed.length === 0],
    ['swap: entity count stays 105', v2.entities.length === 105],
    ['swap: no entity stacked on another', new Set(tiles).size === tiles.length],
    ['swap: old fast belts are gone',
      v2.entities.filter(e => e.name === 'fast-transport-belt').length === 0],
    ['swap: express belts present', v2.entities.filter(e => e.name === 'express-transport-belt').length === 16],
    ['swap: grid survived', same(a['snap-to-grid'], v2['snap-to-grid'])],
    ['swap: parameters survived', same(a.parameters, v2.parameters)],
    ['swap: alignment found the shifted origin',
      same(d2.al.off, { x: -280 - 37, y: -796 + 13 })],
    ['swap: forcing straight-rail gives the same offset', same(forced.al.off, d2.al.off)],
    ['swap: forcing straight-rail names it as the anchor', forced.al.anchor === 'straight-rail']
  );

  // --- scenario 3: pulling in a settings change without breaking parameters ---
  // the train stop gets new logic in game, and its station name comes back concrete
  // because the paste substituted the parameter
  const edited = JSON.parse(JSON.stringify(B));
  const stopB = edited.blueprint.entities.find(e => e.name === 'train-stop');
  stopB.station = 'Iron Drop Off';
  stopB.control_behavior.circuit_condition.comparator = '>';
  stopB.control_behavior.send_to_train = true;
  const E = await api.decode(await api.encode(edited));

  const d3 = api.compare(A, E);
  const stopA = d3.modified.find(e => e.name === 'train-stop');

  const off3 = api.merge(A, E, d3, false, new Set()).out;
  const on3 = api.merge(A, E, d3, false,
    new Set([api.key(stopA, api.ZERO)])).out;
  const stopOff = api.bpOf(off3).entities.find(e => e.name === 'train-stop');
  const stopOn = api.bpOf(on3).entities.find(e => e.name === 'train-stop');
  const v3 = api.bpOf(await api.decode(await api.encode(on3)));
  const stop3 = v3.entities.find(e => e.name === 'train-stop');

  checks.push(
    ['edit: the train stop is seen as changed', !!stopA],
    ['edit: unticked leaves it alone', stopOff.control_behavior.circuit_condition.comparator === '='],
    ['edit: unticked keeps the station name', stopOff.station === '[item=parameter-0][virtual-signal=down-arrow]'],
    ['edit: ticked brings the new comparator', stopOn.control_behavior.circuit_condition.comparator === '>'],
    ['edit: ticked brings the new field', stopOn.control_behavior.send_to_train === true],
    ['edit: ticked KEEPS the parametrised station name',
      stopOn.station === '[item=parameter-0][virtual-signal=down-arrow]'],
    ['edit: ticked keeps the parameter-bound constant',
      stopOn.control_behavior.circuit_condition.constant === 2],
    ['edit: survives a round trip', stop3.control_behavior.circuit_condition.comparator === '>' &&
      stop3.station === '[item=parameter-0][virtual-signal=down-arrow]'],
    ['edit: parameters all still bind', api.paramsStillBind(v3)],
    ['edit: parameters block untouched', same(a.parameters, v3.parameters)],
    ['edit: grid untouched', same(a['snap-to-grid'], v3['snap-to-grid'])],
    ['edit: applying the decider keeps 70000, not 47500', (function () {
      const dec = d3.modified.find(e => e.name === 'decider-combinator');
      if (!dec) return false;
      const m = api.merge(A, E, d3, false, new Set([api.key(dec, api.ZERO)])).out;
      const s = JSON.stringify(api.bpOf(m).entities.find(e => e.name === 'decider-combinator'));
      return s.includes('70000') && !s.includes('47500');
    })()]
  );

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
  const theirs = fs.existsSync(path.join(__dirname, 'blueprints', 'dropoff-a-stoplogic.txt'))
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
    const fresh = new Function('document', 'navigator',
      src + '\n;return SPRITES;')(document, navigator);
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
        .execFileSync(process.execPath, [path.join(__dirname, 'tools', 'emit-manifest.js')],
          { encoding: 'utf8' });
      const line = /^ {2}const SPRITES = .*;$/m.exec(emitted);
      const inPage = /^ {2}const SPRITES = .*;$/m.exec(src);
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
  if (stale) console.log('    index.html is stale — run: node tools/emit-manifest.js --write');

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

  // --- merge marks ----------------------------------------------------------
  // The merge preview colours the result by where each entity came from, so a
  // bad alignment is visible instead of inferred from a match ratio.
  const marksA = api.diffMarks(d);            // 2 signals added, nothing else
  const markedA = api.buildPreview(v, { marks: marksA });
  const plain = api.buildPreview(v);

  // Scenario 2 is the interesting one: 16 belts and a combinator replaced.
  const marks2 = api.diffMarks(d2);
  const marked2 = api.buildPreview(v2, { marks: marks2 });

  // Removals are only absent from the output when they were applied, so that is
  // the only case a ghost belongs in.
  const dropped = api.compare(A, await api.decode(read('dropoff-a')));
  const someGone = api.bpOf(A).entities.slice(0, 3);
  const ghosted = api.buildPreview(v, { marks: {}, ghosts: someGone });

  const nMark = (h, c) => (h.match(new RegExp('class="[^"]*\\b' + c + '\\b[^"]*"', 'g')) || []).length;

  checks.push(
    ['marks: the two added signals are marked', markedA.marked.add === 2],
    // Nothing was replaced, but the decider counts as changed — its formula slot
    // holds the substituted value in the rebuilt copy. It gets a marker even
    // though the base's value was kept, which is the point: it flags what you
    // might want to opt into.
    ['marks: the changed decider is marked too',
      markedA.marked.swap === 0 && markedA.marked.mod === 1],
    ['marks: a marker is drawn for each', nMark(markedA.html, 'mk-add') === 2],
    ['marks: no markers at all without a diff', plain.marked === null &&
      nMark(plain.html, 'mk-add') === 0],
    ['marks: replacements are marked as swaps, not additions',
      marked2.marked.swap === 17 && marked2.marked.add === 2],
    // Markers are sized to the footprint, not the padded sprite frame — a 1x1
    // belt's frame is 2x2, so frame-sized markers would cover its neighbours.
    // A belt's sprite frame is 2 tiles of mostly padding for a 1x1 belt, so a
    // marker drawn to the frame would blanket its neighbours. It has to follow
    // the footprint.
    ['marks: a marker matches the entity footprint, not its sprite frame',
      (() => {
        const one = { entities: [{ entity_number: 1, name: 'fast-transport-belt',
          position: { x: 0.5, y: 0.5 }, direction: 8 }] };
        const box = api.entBox(one.entities[0]);
        const m = api.buildPreview(one, { marks: { 'fast-transport-belt@0.500,0.500': 'add' } });
        const marker = /<u class="mk mk-add"[^>]*width:([\d.]+)px;height:([\d.]+)px/.exec(m.html);
        const img = /<img [^>]*width:([\d.]+)px/.exec(m.html);
        return box.w === 2 && marker && img &&
          Number(marker[1]) === 16 && Number(marker[2]) === 16 && Number(img[1]) === 32;
      })()],
    ['marks: ghosts are drawn for entities that are gone',
      nMark(ghosted.html, 'ghost') === 3 && ghosted.marked.gone === 3],
    ['marks: a ghost also gets a removed marker', nMark(ghosted.html, 'mk-gone') === 3],
    ['marks: ghosts widen the bounds so they cannot be clipped',
      (() => {
        const far = JSON.parse(JSON.stringify(api.bpOf(A).entities[0]));
        far.position = { x: far.position.x - 40, y: far.position.y };
        const g = api.buildPreview(v, { marks: {}, ghosts: [far] });
        return g.w > plain.w + 35;
      })()],
    ['marks: dropped entities are what compare calls removed', dropped.removed.length === 0]
  );

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

  let bad = 0;
  for (const [name, ok] of checks) {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  console.log(`\n${checks.length - bad}/${checks.length} passed; wires carried: ${wires}; output ${str.length} chars`);
  console.log(`scenario 2 anchored on "${d2.al.anchor}", offset (${d2.al.off.x}, ${d2.al.off.y})`);
  process.exit(bad ? 1 : 0);
})().catch(e => {
  // Print where, not just what — a bare message sends you hunting.
  console.error('threw:', e.message);
  console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  process.exit(1);
});
