'use strict';
// Shared blueprint-string decoding for the Node tools (sync; the page has its own).
// One book policy: blueprintsOf() flattens a book (recursing into nested books);
// loadBlueprint() demands exactly one blueprint and throws otherwise, so a tool
// never silently renders "the first of N".
const zlib = require('zlib');

function decode(str) {
  return JSON.parse(zlib.inflateSync(Buffer.from(str.trim().slice(1), 'base64')).toString());
}

function blueprintsOf(obj) {
  if (obj.blueprint) return [obj.blueprint];
  if (obj.blueprint_book) {
    return (obj.blueprint_book.blueprints || []).flatMap(blueprintsOf);
  }
  return [];
}

function loadBlueprint(str) {
  const all = blueprintsOf(decode(str));
  if (all.length !== 1) {
    throw new Error(`book contains ${all.length} blueprints; pick one`);
  }
  return all[0];
}

module.exports = { decode, blueprintsOf, loadBlueprint };
