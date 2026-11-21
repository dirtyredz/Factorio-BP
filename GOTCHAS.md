# GOTCHAS — factorio-bp

Non-obvious traps, flat at the repo root like the rest of this project's docs.

- **Book policy for the Node tools** (`tools/lib/blueprint.js`): collection consumers
  (`tools/sprites/used-dirs.js`) flatten books recursively via `blueprintsOf`; single-blueprint tools
  use `loadBlueprint`, which throws unless the string holds exactly one blueprint, never
  silently "the first of N". `index.html` has its own `bpOf()`, which also rejects books.
