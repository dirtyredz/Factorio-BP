'use strict';
// Check for tools/render/belt-curves.js, run by test.js as [name, ok] pairs.
const { analyse } = require('./belt-curves');

const belt = (n, x, y, d) => ({ entity_number: n, name: 'transport-belt', position: { x, y }, direction: d });
// A west-to-east belt feeding a belt that turns south, plus a belt behind-fed straight run.
const rows = analyse({ entities: [belt(1, 0.5, 0.5, 4), belt(2, 1.5, 0.5, 8)] });

module.exports = [
  ['belt-curves tool: rows keep the diagnostic shape, projected from the page analysis',
    rows.length === 2 &&
    JSON.stringify(rows[0]) === JSON.stringify({ x: 0.5, y: 0.5, dir: 4, feeders: [], curve: null, label: 'straight' }) &&
    JSON.stringify(rows[1]) === JSON.stringify({ x: 1.5, y: 0.5, dir: 8, feeders: ['E'], curve: 4, label: 'E->S' })],
];
