'use strict';
// Checks for the page-owned mergeChecks, run by test.js as [name, ok] pairs.
const { loadPageApi } = require('./page-api');

const { mergeChecks, key, ZERO } = loadPageApi(['mergeChecks', 'key', 'ZERO']);
const raw = e => `${e.name}@${e.position.x},${e.position.y}`;

const ent = (x, y) => ({ name: 'stone-wall', position: { x, y } });
const bp = (entities, extra) => Object.assign({ label: 'L', entities, parameters: [] }, extra);
const noDiff = { added: [], removed: [], overlayTiles: [] };

// Two entities 0.0001 apart: distinct as raw coordinates, one cell once rounded.
const near = bp([ent(1, 1), ent(1.0001, 1)]);
const base = bp([ent(1, 1), ent(1.0001, 1)]);

const good = mergeChecks(bp([ent(1, 1)]), bp([ent(1, 1)]), noDiff, false);
const tiled = mergeChecks(bp([]), bp([], { tiles: [{ position: { x: 1, y: 2 } }, { position: { x: 1, y: 2 } }] }),
  { added: [], removed: [], overlayTiles: [{ position: { x: 1, y: 2 } }, { position: { x: 3, y: 4 } }] }, false);

module.exports = [
  ['mergeChecks: a faithful merge passes every check and has no tile ids',
    Object.values(good).every(v => v === true) && good.tilesLanded === undefined],
  ['mergeChecks: page default key rounds, so near-coincident entities count as stacked',
    mergeChecks(base, near, noDiff, false).noStacking === false &&
    mergeChecks(base, near, noDiff, false).noStacking === (new Set(near.entities.map(e => key(e, ZERO))).size === near.entities.length)],
  ['mergeChecks: a raw stackingKey (the CLI policy) tells the same pair apart',
    mergeChecks(base, near, noDiff, false, raw).noStacking === true],
  ['mergeChecks: exact duplicates are stacked under both policies',
    mergeChecks(base, bp([ent(1, 1), ent(1, 1)]), noDiff, false, raw).noStacking === false],
  ['mergeChecks: entity count follows added/removed and the dropped flag',
    mergeChecks(bp([ent(0, 0), ent(5, 5)]), bp([ent(0, 0), ent(9, 9)]), { added: [1], removed: [1], overlayTiles: [] }, true).entityCount === true &&
    mergeChecks(bp([ent(0, 0), ent(5, 5)]), bp([ent(0, 0), ent(9, 9)]), { added: [1], removed: [1], overlayTiles: [] }, false).entityCount === false],
  ['mergeChecks: a changed label or grid fails its own id only',
    (r => r.label === false && r.snapToGrid === true && r.gridOffset === true)(
      mergeChecks(bp([]), bp([], { label: 'other' }), noDiff, false)) &&
    mergeChecks(bp([]), bp([], { 'snap-to-grid': { x: 2, y: 2 } }), noDiff, false).snapToGrid === false],
  ['mergeChecks: floor-tile ids appear only with overlay tiles and catch a missing, duplicated or fractional cell',
    tiled.tilesLanded === false && tiled.tilesUnique === false && tiled.tilesWhole === true &&
    mergeChecks(bp([]), bp([], { tiles: [{ position: { x: 0.5, y: 1 } }] }),
      { added: [], removed: [], overlayTiles: [{ position: { x: 0.5, y: 1 } }] }, false).tilesWhole === false],
];
