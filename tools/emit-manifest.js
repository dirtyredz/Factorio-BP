// Prints the sprite manifest as a compact JS literal for pasting into
// index.html.
//
// It has to be inlined rather than fetched: the page is opened straight off
// disk via open-tools.url, and a file:// page cannot fetch() a sibling .json —
// the browser treats it as a cross-origin request. <img src="sprites/x.png">
// is not subject to that, which is why the PNGs can stay as loose files.
//
//   node tools/emit-manifest.js
//
// Shape: { "entity-name": { "<direction>": [ox, oy, w, h, src] } }
// ox/oy are the sprite's top-left offset from the entity centre, in tiles, and
// w/h its size in tiles. `src` is the direction that owns the PNG: directions
// drawing identical art share one file, so a rail facing south reads
// straight-rail_0.png. Arrays rather than objects to keep it small.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const man = JSON.parse(fs.readFileSync(path.join(root, "sprites", "entities.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(root, "sprites", "meta.json"), "utf8"));

const out = {};
for (const name in man) {
  const rows = {};
  for (const d in man[name].dirs) {
    const i = man[name].dirs[d];
    // Keep only the direction key from the filename; the page rebuilds the rest.
    // Belt curve keys aren't plain numbers — "8c12" means facing south, fed
    // from the west — so this stays a string when it has to.
    const m = /_([0-9]+(?:c[0-9]+)?)\.png$/.exec(i.file);
    if (!m) throw new Error('unexpected sprite filename: ' + i.file);
    rows[d] = [i.ox, i.oy, i.w, i.h, /^\d+$/.test(m[1]) ? Number(m[1]) : m[1]];
  }

  // Most entities look the same from most directions — a chest from all
  // sixteen. The commonest row becomes "*" and only the exceptions are listed.
  const tally = {};
  for (const d in rows) {
    const k = JSON.stringify(rows[d]);
    tally[k] = (tally[k] || 0) + 1;
  }
  let best = null, bestN = 0;
  for (const k in tally) if (tally[k] > bestN) { best = k; bestN = tally[k]; }

  out[name] = { "*": JSON.parse(best) };
  for (const d in rows) if (JSON.stringify(rows[d]) !== best) out[name][d] = rows[d];
}

// Footprints for anything without a sprite, so the fallback box is the right size.
const foot = {};
for (const n in meta) foot[n] = [meta[n].tile_width, meta[n].tile_height];

const round = o => JSON.stringify(o).replace(/-?\d+\.\d+/g, m => String(+(+m).toFixed(3)));

const sprites = "  const SPRITES = " + round(out) + ";";
const footprint = "  const FOOTPRINT = " + round(foot) + ";";

// --write splices both straight into index.html, so re-extracting sprites and
// refreshing the page is two commands rather than a copy-paste.
if (process.argv.includes("--write")) {
  const page = path.join(root, "index.html");
  let html = fs.readFileSync(page, "utf8");
  for (const [re, line] of [[/^ {2}const SPRITES = .*;$/m, sprites],
                            [/^ {2}const FOOTPRINT = .*;$/m, footprint]]) {
    if (!re.test(html)) throw new Error("couldn't find " + re + " in index.html");
    html = html.replace(re, () => line);
  }
  fs.writeFileSync(page, html);
  console.log("index.html updated — " + Object.keys(out).length + " entities, " +
    (sprites.length + footprint.length) + " chars");
} else {
  console.log(sprites);
  console.log();
  console.log(footprint);
}
