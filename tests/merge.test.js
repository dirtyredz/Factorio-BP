'use strict';
// Merge scenarios (identity, swap, edit, rename) and the merge-preview marks drawn from them.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, 'blueprints', n + '.txt'), 'utf8').trim();

module.exports = async api => {
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

  // --- scenario 3b: a parametrised name that KEEPS its parameter is editable ---
  // Scenario 3 renames the stop to something concrete, which drops parameter-0, so it
  // is held back. But renaming a `[item=parameter-0]` stop while keeping the token —
  // dropping the trailing arrow, or adding free text around it — leaves the binding
  // intact, so the edit must carry across. Regression guard for protect()'s check that
  // every base `parameter-N` still appears in the rebuilt value.
  const renameStop = async newName => {
    const ed = JSON.parse(JSON.stringify(B));
    ed.blueprint.entities.find(e => e.name === 'train-stop').station = newName;
    const E2 = await api.decode(await api.encode(ed));
    const dd = api.compare(A, E2);
    const st = dd.modified.find(e => e.name === 'train-stop');
    const on = api.merge(A, E2, dd, false, new Set([api.key(st, api.ZERO)])).out;
    const off = api.merge(A, E2, dd, false, new Set()).out;
    return {
      seen: !!st,
      on: api.bpOf(on).entities.find(e => e.name === 'train-stop').station,
      off: api.bpOf(off).entities.find(e => e.name === 'train-stop').station,
      binds: api.paramsStillBind(api.bpOf(await api.decode(await api.encode(on)))),
    };
  };
  const dropArrow = await renameStop('[item=parameter-0]');
  const addText = await renameStop('[item=parameter-0] Unload');
  const concrete = await renameStop('[item=iron-plate][virtual-signal=down-arrow]');

  checks.push(
    ['rename: dropping the arrow but keeping parameter-0 is seen as changed', dropArrow.seen],
    ['rename: ticked takes the edit when parameter-0 survives', dropArrow.on === '[item=parameter-0]'],
    ['rename: dropping the arrow still binds every parameter', dropArrow.binds],
    ['rename: unticked still leaves the name alone',
      dropArrow.off === '[item=parameter-0][virtual-signal=down-arrow]'],
    ['rename: adding text around parameter-0 carries across', addText.on === '[item=parameter-0] Unload'],
    ['rename: adding text still binds every parameter', addText.binds],
    ['rename: a substituted concrete item is still held back',
      concrete.on === '[item=parameter-0][virtual-signal=down-arrow]']
  );
  const main = checks.splice(0);

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
  const marks = checks.splice(0);

  return { main, marks, footer: { wires, length: str.length, anchor: d2.al.anchor, off: d2.al.off } };
};
