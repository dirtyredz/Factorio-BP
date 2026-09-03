// Stage 1 of sprite extraction: turn Factorio's prototype dump into a flat
// "recipe" of crop-and-paste operations, which extract-entities.ps1 executes.
//
// The rule that makes this work, and that the icon attempt got wrong: an entity
// is never rotated. Factorio ships a pre-drawn frame for every direction, and
// `direction` selects which frame to cut out of the sheet.
//
// Geometry: Factorio draws 32 screen pixels per tile at scale 1. Sprites are
// high-res art with scale 0.5, so a 256 px crop covers 256 * 0.5 / 32 = 4 tiles.
// `shift` is already in tiles and offsets the sprite's centre from the entity's.

const fs = require("fs");
const path = require("path");

const DUMP = path.join(process.env.APPDATA, "Factorio", "script-output", "data-raw-dump.json");
const GAME = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio";
const MODS = path.join(process.env.APPDATA, "Factorio", "mods");
const OUT = path.join(__dirname, "..", "sprites");

const raw = JSON.parse(fs.readFileSync(DUMP, "utf8"));
const PPT = 32; // screen pixels per tile

// Every entity gets all sixteen directions rather than only the ones the stored
// blueprints happen to use: a flip negates direction and a turn adds to it, so
// the tools routinely produce facings that no saved blueprint contains. Frames
// that resolve to the same artwork are written once and shared, so asking for
// all sixteen costs almost nothing.
const ENTITIES = [
  "steel-chest", "medium-electric-pole", "big-electric-pole",
  "bulk-inserter", "fast-transport-belt", "decider-combinator", "train-stop",
  "rail-signal", "rail-chain-signal",
  "straight-rail", "curved-rail-a", "curved-rail-b", "half-diagonal-rail",
];
const ALL_DIRS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// Belts additionally need a frame per curve — "<facing>c<came-from>".
const BELT_CURVES = ["0c4", "4c0", "0c12", "12c0", "4c8", "8c4", "12c8", "8c12"];
const NEEDED = {};
for (const n of ENTITIES) {
  NEEDED[n] = /transport-belt$/.test(n) ? ALL_DIRS.concat(BELT_CURVES) : ALL_DIRS;
}

const DIR8 = ["north", "northeast", "east", "southeast",
              "south", "southwest", "west", "northwest"];

// ---- file resolution -------------------------------------------------------

const zipCache = {};
function resolve(ref) {
  const m = /^__([\w-]+)__\/(.+)$/.exec(ref);
  if (!m) return null;
  const [, mod, rel] = m;
  const direct = path.join(GAME, "data", mod, rel);
  if (fs.existsSync(direct)) return { file: direct };
  if (!(mod in zipCache)) {
    const z = fs.readdirSync(MODS).filter(f => f.startsWith(mod + "_") && f.endsWith(".zip")).sort();
    zipCache[mod] = z.length ? path.join(MODS, z[z.length - 1]) : null;
  }
  if (zipCache[mod]) return { zip: zipCache[mod], entry: rel };
  return null;
}

// PNG dimensions and colour type, straight out of the IHDR chunk.
function pngHeader(file) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(26);
  fs.readSync(fd, b, 0, 26, 0);
  fs.closeSync(fd);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b.readUInt8(25) };
}
function pngSize(file) { return pngHeader(file); }

// Factorio's glow layers (signal lamps, lit windows) are stored without an
// alpha channel because the engine adds them additively, where black reads as
// transparent. Composited normally they paint an opaque black box over the
// entity, so they are dropped rather than blended.
function isGlowSheet(ref) {
  const src = resolve(ref);
  if (!src || !src.file) return false;   // zipped mod art: assume normal
  try { return pngHeader(src.file).colorType === 2; } catch (e) { return false; }
}

// ---- sprite maths ----------------------------------------------------------

// One layer -> a crop rect in the sheet plus a destination box in tiles,
// measured from the entity centre. `index` picks the frame.
function layerOp(sp, index) {
  const src = resolve(sp.filename);
  if (!src) return null;

  const w = sp.width || sp.size || 0;
  const h = sp.height || sp.size || 0;
  if (!w || !h) return null;

  const scale = sp.scale || 1;
  const baseX = sp.x || 0, baseY = sp.y || 0;

  // Frames tile across the sheet, line_length per row.
  const line = sp.line_length || sp.frame_count || sp.direction_count || 1;
  const col = index % line, row = Math.floor(index / line);

  const shift = sp.shift || [0, 0];
  const tw = w * scale / PPT, th = h * scale / PPT;

  return {
    src,
    sx: baseX + col * w, sy: baseY + row * h, sw: w, sh: h,
    // Destination in tiles, relative to entity centre.
    dx: shift[0] - tw / 2, dy: shift[1] - th / 2, dw: tw, dh: th,
  };
}

// Shadows are dropped so sprites sit flat on the grid; glow sheets because
// they cannot be alpha-composited (see isGlowSheet).
function drawable(l) { return !l.draw_as_shadow && !isGlowSheet(l.filename); }
function layersOf(node) { return (node.layers || [node]).filter(drawable); }

// ---- per-prototype-type frame selection ------------------------------------

// A quarter-turn sprite set: north, east, south, west.
const way4 = d => Math.floor((d % 16) / 4);

const PICKERS = {
  container: (p, d) => layersOf(p.picture).map(l => layerOf(l, 0)),

  "electric-pole": (p, d) => layersOf(p.pictures).map(l => layerOf(l, way4(d))),

  // Only the platform: the hand is a separate animated piece drawn on top and
  // would just be a stray arm at this zoom.
  inserter: (p, d) => {
    const sh = p.platform_picture.sheet;
    const size = pngSize(resolve(sh.filename).file);
    const frames = Math.max(1, Math.round(size.w / sh.width));
    // The platform faces the inserter's *pickup* side, i.e. opposite its drop.
    return [layerOf(Object.assign({}, sh, { line_length: frames }), way4(d + 8))];
  },

  // A belt's direction is all the blueprint stores; whether it draws curved is
  // derived from its neighbours. So a belt has four straight frames plus eight
  // curves, keyed "<facing>c<came-from>".
  //
  // Row order is Factorio's own, from the commented-out defaults in
  // base/prototypes/entity/transport-belts.lua (1-based there, 0-based here):
  //   0 east   1 west   2 north  3 south
  //   4 east->north   5 north->east   6 west->north   7 north->west
  //   8 south->east   9 east->south  10 south->west  11 west->south
  "transport-belt": (p, d) => {
    const STRAIGHT = { 4: 0, 12: 1, 0: 2, 8: 3 };
    // Factorio's curve names describe EDGES, not travel: "east_to_north" enters
    // the east edge and leaves by the north one, so the flow is travelling west
    // and turns north. Getting that backwards inverts every curve, and it was
    // caught by measuring which tile edges each sprite's art actually meets —
    // see tools/check-belt-curves.ps1.
    const CURVE = {
      "0c12": 4,   // east_to_north   in E, out N
      "4c8": 5,    // north_to_east   in N, out E
      "0c4": 6,    // west_to_north   in W, out N
      "12c8": 7,   // north_to_west   in N, out W
      "4c0": 8,    // south_to_east   in S, out E
      "8c12": 9,   // east_to_south   in E, out S
      "12c0": 10,  // south_to_west   in S, out W
      "8c4": 11,   // west_to_south   in W, out S
    };
    // Belts are 4-way. An off-quarter direction is not legal for one, but round
    // to the nearest rather than emitting a frame built from a NaN crop, which
    // is what the earlier version did without saying so.
    const row = typeof d === "string" ? CURVE[d]
      : STRAIGHT[(Math.round((d % 16) / 4) * 4) % 16];
    if (row === undefined) return [];
    const a = p.belt_animation_set.animation_set;
    return [layerOf(a, row * (a.frame_count || 1))];
  },

  "decider-combinator": (p, d) =>
    layersOf(p.sprites[DIR8[way4(d) * 2]]).map(l => layerOf(l, 0)),

  "train-stop": (p, d) => {
    const k = DIR8[way4(d) * 2];
    const ops = [];
    for (const part of ["rail_overlay_animations", "animations", "top_animations"]) {
      if (!p[part] || !p[part][k]) continue;
      // The top layer's second entry is a colour mask; it renders white on its
      // own, so only the first layer of each part is taken.
      ops.push(layerOf(layersOf(p[part][k])[0], 0));
    }
    return ops;
  },

  signal: (p, d) => {
    const st = p.ground_picture_set.structure;
    // direction_count 16 rows x frame_count 3 light states; frame 0.
    return layersOf(st).map(l => layerOf(l, d * (l.frame_count || 1)));
  },

  rail: (p, d) => {
    const set = p.pictures;
    // Rails read the same from both ends, and Factorio encodes that by leaving
    // the redundant half of the directions as empty objects — a straight rail
    // has art for four, a curved one for all eight. An empty object is truthy,
    // so the test has to be for actual content.
    const names = DIR8.filter(n => set[n] && Object.keys(set[n]).length);
    const k = names[Math.floor((d % 16) / 2) % names.length];
    const order = ["stone_path_background", "stone_path", "ties", "backplates", "metals"];
    return order.filter(o => set[k] && set[k][o]).map(o => layerOf(set[k][o], 0));
  },
};

let currentIndexBase = 0;
function layerOf(sp, index) { return layerOp(sp, index); }

// ---- build -----------------------------------------------------------------

const NOT_ENTITY = new Set(["item", "recipe", "item-subgroup", "item-group",
  "technology", "tips-and-tricks-item", "achievement", "custom-input", "shortcut"]);

function findEntity(name) {
  for (const t in raw) {
    if (NOT_ENTITY.has(t) || typeof raw[t] !== "object") continue;
    if (raw[t][name]) return { type: t, proto: raw[t][name] };
  }
  return null;
}

function pickerFor(type) {
  if (/rail-signal|rail-chain-signal/.test(type)) return PICKERS.signal;
  if (/^(straight-rail|curved-rail-[ab]|half-diagonal-rail)$/.test(type)) return PICKERS.rail;
  return PICKERS[type];
}

const recipe = [];
const manifest = {};
const problems = [];
const sameArt = {};   // entity -> layer signature -> file already queued

for (const name in NEEDED) {
  const hit = findEntity(name);
  if (!hit) { problems.push(name + ": no prototype"); continue; }
  const pick = pickerFor(hit.type);
  if (!pick) { problems.push(name + ": no picker for type " + hit.type); continue; }

  manifest[name] = { type: hit.type, dirs: {} };

  for (const d of NEEDED[name]) {
    let ops;
    try { ops = pick(hit.proto, d).filter(Boolean); }
    catch (e) { problems.push(name + " dir " + d + ": " + e.message); continue; }
    if (!ops.length) { problems.push(name + " dir " + d + ": no layers"); continue; }

    // Canvas = union of the layer boxes, in tiles.
    const x0 = Math.min(...ops.map(o => o.dx)), y0 = Math.min(...ops.map(o => o.dy));
    const x1 = Math.max(...ops.map(o => o.dx + o.dw)), y1 = Math.max(...ops.map(o => o.dy + o.dh));

    // Directions that cut the same frames share one file — a chest looks the
    // same sixteen ways, and a rail's art repeats every half turn.
    const sig = JSON.stringify(ops);
    let file = sameArt[name] && sameArt[name][sig];
    if (!file) {
      file = name + "_" + d + ".png";
      (sameArt[name] = sameArt[name] || {})[sig] = file;
      recipe.push({
        out: file,
        // Render at native resolution so nothing is resampled twice.
        px: Math.round((x1 - x0) * PPT), py: Math.round((y1 - y0) * PPT),
        originX: x0, originY: y0, ppt: PPT,
        layers: ops,
      });
    }
    manifest[name].dirs[d] = {
      file,
      // Where the image's top-left sits relative to the entity centre, in tiles.
      ox: +x0.toFixed(4), oy: +y0.toFixed(4),
      w: +(x1 - x0).toFixed(4), h: +(y1 - y0).toFixed(4),
    };
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "recipe.json"), JSON.stringify(recipe, null, 1));
fs.writeFileSync(path.join(OUT, "entities.json"), JSON.stringify(manifest, null, 1));

console.log(recipe.length + " sprites queued across " + Object.keys(manifest).length + " entities");
for (const p of problems) console.log("  ! " + p);
