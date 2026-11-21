'use strict';
// Checks for tools/lib/blueprint.js, run by test.js as [name, ok] pairs.
const zlib = require('zlib');
const lib = require('./blueprint');

const enc = o => '0' + zlib.deflateSync(Buffer.from(JSON.stringify(o))).toString('base64');
const bp = n => ({ blueprint: { item: 'blueprint', entities: [{ entity_number: 1, name: n }] } });
const book = (...xs) => ({ blueprint_book: { blueprints: xs } });
const two = enc(book(bp('a'), bp('b')));
let threw = '';
try { lib.loadBlueprint(two); } catch (e) { threw = e.message; }

module.exports = [
  ['lib: blueprintsOf returns every blueprint of a 2-blueprint book',
    lib.blueprintsOf(lib.decode(two)).length === 2],
  ['lib: loadBlueprint throws on a 2-blueprint book instead of taking the first',
    /2 blueprints; pick one/.test(threw)],
  ['lib: nested books flatten',
    lib.blueprintsOf(book(bp('a'), book(bp('b'), bp('c')))).length === 3],
  ['lib: single blueprint and 1-blueprint book both load',
    lib.loadBlueprint(enc(bp('a'))).entities[0].name === 'a' &&
    lib.loadBlueprint(enc(book(bp('b')))).entities[0].name === 'b'],
];
