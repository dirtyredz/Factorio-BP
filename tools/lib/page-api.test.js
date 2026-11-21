'use strict';
// Check for tools/lib/page-api.js, run by test.js as [name, ok] pairs.
const { loadPageApi } = require('./page-api');

const a = loadPageApi(['decode', 'SPRITES']);
const b = loadPageApi(['SPRITES']);
delete a.SPRITES['decider-combinator'];

module.exports = [
  ['lib: loadPageApi returns only the named exports, with a fresh SPRITES per call',
    typeof a.decode === 'function' && Object.keys(a).join() === 'decode,SPRITES' &&
    Object.keys(b).join() === 'SPRITES' && b.SPRITES['decider-combinator'] !== undefined],
];
