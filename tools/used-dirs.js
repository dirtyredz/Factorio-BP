// Which (entity, direction) pairs actually appear across the stored blueprints.
// Only these need sprites extracted.
const fs = require("fs");
const { decode, blueprintsOf } = require("./lib/blueprint");
const path = require("path");

const dir = path.join(__dirname, "..", "blueprints");
const seen = {};

for (const f of fs.readdirSync(dir)) {
  const s = fs.readFileSync(path.join(dir, f), "utf8").trim();
  for (const b of blueprintsOf(decode(s))) {
    for (const e of b.entities || []) {
      (seen[e.name] = seen[e.name] || new Set()).add(e.direction || 0);
    }
  }
}

for (const n of Object.keys(seen).sort()) {
  console.log(n.padEnd(22) + [...seen[n]].sort((a, b) => a - b).join(", "));
}
