// Writes a throwaway copy of index.html with stored blueprints already in its
// input boxes, for eyeballing a page without pasting by hand.
//
//   node tools/seed-page.js <out.html> <blueprint>@<textarea-id> ...
//
//   node tools/seed-page.js seeded.html dropoff-a@ins-in
//   node tools/seed-page.js seeded.html dropoff-a@a dropoff-a-signals@b
//
// The strings are copied straight from blueprints/ and never retyped — a single
// wrong character makes a blueprint undecodable.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const outFile = args.shift();

if (!outFile || !args.length) {
  console.error("usage: node tools/seed-page.js <out.html> <blueprint>@<textarea-id> ...");
  process.exit(1);
}

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const done = [];

for (const pair of args) {
  const m = /^(.+)@(.+)$/.exec(pair);
  if (!m) throw new Error('expected <blueprint>@<textarea-id>, got "' + pair + '"');
  const [, name, id] = m;

  const bp = fs.readFileSync(path.join(root, "blueprints", name + ".txt"), "utf8").trim();
  if (/[<>&]/.test(bp)) throw new Error(name + " has markup characters; needs escaping");

  const tag = new RegExp('(<textarea id="' + id + '"[^>]*>)</textarea>');
  if (!tag.test(html)) throw new Error("no empty textarea #" + id + " in index.html");
  html = html.replace(tag, "$1" + bp + "</textarea>");
  done.push(id + " = " + name + " (" + bp.length + ")");
}

fs.writeFileSync(path.join(root, outFile), html);
console.log("seeded " + done.join(", ") + " -> " + outFile);
