// Renders a stored blueprint to an HTML page using the extracted entity
// sprites. Nothing is rotated and nothing is stretched: `direction` selects a
// pre-drawn frame, and each frame is placed at its own size using the ox/oy
// offset recorded in entities.json.
//
//   node tools/render.js <blueprint-name> <out.html> [tilePx]

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const name = process.argv[2] || "dropoff-a";
const outFile = process.argv[3] || path.join(__dirname, "..", "render.html");
const TILE = Number(process.argv[4]) || 20;

const root = path.join(__dirname, "..");
const man = JSON.parse(fs.readFileSync(path.join(root, "sprites", "entities.json"), "utf8"));
const str = fs.readFileSync(path.join(root, "blueprints", name + ".txt"), "utf8").trim();
const json = JSON.parse(zlib.inflateSync(Buffer.from(str.slice(1), "base64")).toString());
const bp = json.blueprint || json.blueprint_book.blueprints[0].blueprint;

const spriteDir = path.relative(path.dirname(path.resolve(outFile)),
  path.join(root, "sprites")).split(path.sep).join("/");

const ents = bp.entities || [];
const xs = ents.map(e => e.position.x), ys = ents.map(e => e.position.y);
const minX = Math.min(...xs) - 2, maxX = Math.max(...xs) + 2;
const minY = Math.min(...ys) - 2, maxY = Math.max(...ys) + 2;

// Ground first, then things standing on it, southern rows over northern so
// tall sprites overlap the way they do in game.
function rank(n) {
  if (/rail/.test(n) && !/signal/.test(n)) return 0;
  if (/train-stop/.test(n)) return 1;
  if (/belt/.test(n)) return 2;
  return 3;
}
const order = ents.slice().sort((a, b) =>
  rank(a.name) - rank(b.name) || a.position.y - b.position.y || a.position.x - b.position.x);

let html = "", missing = {};
for (const e of order) {
  const rec = man[e.name];
  const d = e.direction || 0;
  const info = rec && rec.dirs[d];
  if (!info) { missing[e.name + ":" + d] = (missing[e.name + ":" + d] || 0) + 1; continue; }
  const left = (e.position.x - minX + info.ox) * TILE;
  const top = (e.position.y - minY + info.oy) * TILE;
  html += '<img src="' + spriteDir + "/" + info.file + '" style="left:' +
    left.toFixed(2) + "px;top:" + top.toFixed(2) + "px;width:" +
    (info.w * TILE).toFixed(2) + "px;height:" + (info.h * TILE).toFixed(2) + 'px">';
}

const W = (maxX - minX) * TILE, H = (maxY - minY) * TILE;

// One-tile grid, so sprite footprints can be judged against real tiles.
const grid =
  "background-image:" +
  "linear-gradient(to right,rgba(255,255,255,.07) 1px,transparent 1px)," +
  "linear-gradient(to bottom,rgba(255,255,255,.07) 1px,transparent 1px);" +
  "background-size:" + TILE + "px " + TILE + "px;";

fs.writeFileSync(outFile,
  "<style>body{margin:0;background:#3b3b32;font:11px Consolas,monospace;color:#ddd}" +
  "#c{position:relative;width:" + W + "px;height:" + H + "px;" + grid + "}" +
  "#c img{position:absolute;image-rendering:auto}" +
  ".sym{position:absolute;top:0;bottom:0;width:1px;background:#f0f;opacity:.6}" +
  "</style><div id='c'>" + html +
  "<div class='sym' style='left:" + ((48 - minX) * TILE) + "px'></div></div>");

console.log(ents.length + " entities, " + Math.round(W) + "x" + Math.round(H) + "px at " + TILE + "px/tile");
const miss = Object.keys(missing);
if (miss.length) console.log("no sprite for: " + miss.join(", "));
else console.log("every entity had a sprite");
