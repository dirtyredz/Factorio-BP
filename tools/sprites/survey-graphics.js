// Prints the graphics schema for each entity we care about. Every entity type
// stores its pictures differently (a chest has one frame, a pole has 4 packed
// into a strip, a rail has 4 layers x 8 variations per direction), so this is
// just reconnaissance before writing an extractor.

const fs = require("fs");
const path = require("path");

const DUMP = path.join(process.env.APPDATA, "Factorio", "script-output", "data-raw-dump.json");
const raw = JSON.parse(fs.readFileSync(DUMP, "utf8"));

const TARGETS = [
  ["container", "steel-chest"],
  ["electric-pole", "medium-electric-pole"],
  ["inserter", "bulk-inserter"],
  ["transport-belt", "fast-transport-belt"],
  ["decider-combinator", "decider-combinator"],
  ["train-stop", "train-stop"],
  ["rail-signal", "rail-signal"],
  ["straight-rail", "straight-rail"],
  ["curved-rail-a", "curved-rail-a"],
];

// Collapse a sprite node to the fields that matter for cropping.
function brief(node, depth) {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.length > 3
      ? ["<" + node.length + " items>", brief(node[0], depth + 1)]
      : node.map(v => brief(v, depth + 1));
  }
  const keep = ["filename", "width", "height", "x", "y", "shift", "scale",
    "direction_count", "variation_count", "frame_count", "line_length",
    "draw_as_shadow", "repeat_count", "lines_per_file"];
  const out = {};
  for (const k of keep) if (node[k] !== undefined) out[k] = node[k];
  if (out.filename) out.filename = out.filename.replace(/^__(\w[\w-]*)__\/graphics\//, "$1:");
  // Recurse into structural keys only.
  for (const k in node) {
    if (keep.includes(k)) continue;
    if (node[k] && typeof node[k] === "object" && depth < 3) {
      const sub = brief(node[k], depth + 1);
      if (sub && (typeof sub !== "object" || Object.keys(sub).length)) out[k] = sub;
    }
  }
  return out;
}

for (const [type, name] of TARGETS) {
  const p = raw[type] && raw[type][name];
  if (!p) { console.log("### " + name + " MISSING"); continue; }
  const gfxKeys = Object.keys(p).filter(k =>
    /picture|sprite|structure|animation|graphics_set|visualisation/i.test(k));
  console.log("\n### " + name + "  [" + type + "]");
  for (const k of gfxKeys) {
    console.log("  " + k + " = " + JSON.stringify(brief(p[k], 0)));
  }
}
