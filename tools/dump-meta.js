// Reads Factorio's own prototype dump and writes sprites/meta.json — the
// footprint table the blueprint string can't give us.
//
//   factorio.exe --dump-data   ->   %APPDATA%\Factorio\script-output\data-raw-dump.json
//
// Blueprints store entity *centres* only. Drawing them to scale needs the
// collision box, which lives in the prototypes and nowhere in the string.
// Tile size follows Factorio's own default: ceil() of the collision box,
// unless the prototype states tile_width/tile_height outright.

const fs = require("fs");
const path = require("path");

const DUMP = path.join(process.env.APPDATA, "Factorio", "script-output", "data-raw-dump.json");
const OUT = path.join(__dirname, "..", "sprites", "meta.json");

// Prototype categories that share names with entities but aren't placeable.
const NOT_AN_ENTITY = new Set([
  "item", "recipe", "item-subgroup", "item-group", "technology",
  "tips-and-tricks-item", "achievement", "custom-input", "shortcut",
]);

const WANT = [
  "straight-rail", "curved-rail-a", "curved-rail-b", "half-diagonal-rail",
  "bulk-inserter", "fast-transport-belt", "steel-chest",
  "rail-signal", "rail-chain-signal",
  "medium-electric-pole", "big-electric-pole",
  "decider-combinator", "train-stop",
];

if (!fs.existsSync(DUMP)) {
  console.error("no dump at " + DUMP + "\nrun: factorio.exe --dump-data");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DUMP, "utf8"));

function findEntity(name) {
  for (const type in raw) {
    if (NOT_AN_ENTITY.has(type) || typeof raw[type] !== "object") continue;
    if (raw[type][name]) return { type, proto: raw[type][name] };
  }
  return null;
}

const out = {};
const missing = [];

for (const name of WANT) {
  const hit = findEntity(name);
  if (!hit) { missing.push(name); continue; }
  const p = hit.proto;
  const cb = p.collision_box;
  const w = cb ? cb[1][0] - cb[0][0] : 1;
  const h = cb ? cb[1][1] - cb[0][1] : 1;

  out[name] = {
    type: hit.type,
    icon: p.icon || (p.icons && p.icons[0].icon) || null,
    // What the entity occupies on the grid, in tiles.
    tile_width: p.tile_width || Math.max(1, Math.ceil(w)),
    tile_height: p.tile_height || Math.max(1, Math.ceil(h)),
    // Exact box, for drawing to scale rather than snapping to whole tiles.
    collision_box: cb ? { x1: cb[0][0], y1: cb[0][1], x2: cb[1][0], y2: cb[1][1] } : null,
  };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(Object.keys(out).length + " entities -> " + path.relative(process.cwd(), OUT));
for (const n in out) {
  const e = out[n];
  console.log("  " + n.padEnd(22) + e.tile_width + "x" + e.tile_height +
    (e.icon && e.icon.startsWith("__base__") ? "" : "   (modded icon)"));
}
if (missing.length) console.log("missing: " + missing.join(", "));
