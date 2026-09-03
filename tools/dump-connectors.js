// Extracts where wires actually attach, per entity and direction, and splices
// the table into index.html as CONNECT.
//
//   node tools/dump-connectors.js [--write]
//
// A wire's connector id says which point it lands on:
//
//   1 red in, 2 green in   -> input_connection_points, else circuit_connector
//   3 red out, 4 green out -> output_connection_points, else the same point
//   5 copper               -> connection_points[].wire.copper
//
// Combinators are the reason this matters: they have genuinely separate input
// and output points, so a combinator wired to its own input from its own output
// is a real line between two places, not a zero-length loop. Power poles are the
// other reason — copper attaches ~3.1 tiles above the pole's centre, at the top
// of the mast, not at the entity position.
//
// Offsets are in tiles, relative to the entity centre, y positive downwards.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DUMP = path.join(process.env.APPDATA, 'Factorio', 'script-output', 'data-raw-dump.json');
const raw = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

const NOT_ENTITY = new Set(['item', 'recipe', 'item-subgroup', 'item-group', 'technology',
  'tips-and-tricks-item', 'achievement', 'custom-input', 'shortcut']);

const WANT = ['steel-chest', 'medium-electric-pole', 'big-electric-pole', 'bulk-inserter',
  'fast-transport-belt', 'decider-combinator', 'train-stop', 'rail-signal', 'rail-chain-signal'];

function findEntity(name) {
  for (const t in raw) {
    if (NOT_ENTITY.has(t) || typeof raw[t] !== 'object') continue;
    if (raw[t][name]) return raw[t][name];
  }
  return null;
}

// These arrays are indexed by direction, but with varying granularity: one entry
// means "the same whichever way it faces", four means per quarter turn, sixteen
// means per 16-way step.
const pick = (arr, d) => {
  if (!Array.isArray(arr) || !arr.length) return null;
  if (arr.length === 1) return arr[0];
  if (arr.length === 4) return arr[Math.floor((d % 16) / 4)];
  return arr[d % arr.length];
};

const round = v => +v.toFixed(3);

const out = {};
const notes = [];

for (const name of WANT) {
  const p = findEntity(name);
  if (!p) { notes.push(name + ': no prototype'); continue; }

  // rail signals keep theirs inside the picture set rather than at the top level
  const circuit = p.circuit_connector ||
    (p.ground_picture_set && p.ground_picture_set.circuit_connector);

  const rows = {};
  for (let d = 0; d < 16; d++) {
    const cc = pick(circuit, d);
    const base = cc && cc.points && cc.points.wire;
    const inp = pick(p.input_connection_points, d);
    const outp = pick(p.output_connection_points, d);
    const power = pick(p.connection_points, d);

    const at = (src, colour) => (src && src[colour]) ? [round(src[colour][0]), round(src[colour][1])] : null;

    const row = {
      1: at(inp && inp.wire, 'red') || at(base, 'red'),
      2: at(inp && inp.wire, 'green') || at(base, 'green'),
      3: at(outp && outp.wire, 'red') || at(base, 'red'),
      4: at(outp && outp.wire, 'green') || at(base, 'green'),
      5: at(power && power.wire, 'copper'),
    };
    for (const k in row) if (!row[k]) delete row[k];
    if (Object.keys(row).length) rows[d] = row;
  }

  if (!Object.keys(rows).length) { notes.push(name + ': no connection points'); continue; }

  // Collapse directions that agree, exactly as the sprite table does.
  const tally = {};
  for (const d in rows) {
    const k = JSON.stringify(rows[d]);
    tally[k] = (tally[k] || 0) + 1;
  }
  let best = null, bestN = 0;
  for (const k in tally) if (tally[k] > bestN) { best = k; bestN = tally[k]; }

  out[name] = { '*': JSON.parse(best) };
  for (const d in rows) if (JSON.stringify(rows[d]) !== best) out[name][d] = rows[d];
}

const line = '  const CONNECT = ' + JSON.stringify(out) + ';';

if (process.argv.includes('--write')) {
  const page = path.join(root, 'index.html');
  let html = fs.readFileSync(page, 'utf8');
  const re = /^ {2}const CONNECT = .*;$/m;
  if (re.test(html)) html = html.replace(re, () => line);
  else html = html.replace(/^ {2}const FOOTPRINT = .*;$/m, m => m + '\n\n' + line);
  fs.writeFileSync(page, html);
  console.log('index.html updated — ' + Object.keys(out).length + ' entities, ' + line.length + ' chars');
} else {
  console.log(line);
}
for (const n of notes) console.log('  ! ' + n);
