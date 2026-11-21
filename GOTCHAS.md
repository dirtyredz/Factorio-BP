# GOTCHAS — factorio-bp

Non-obvious traps, flat at the repo root like the rest of this project's docs.

- `tools/` being at 16 files is not accretion: git history shows all 16 arrived in the initial
  import. It's the directory's original shape, not drift — still worth splitting (see above), but
  not a sign of neglect.
- **Book policy for the Node tools** (`tools/lib/blueprint.js`): collection consumers
  (`used-dirs.js`) flatten books recursively via `blueprintsOf`; single-blueprint tools
  use `loadBlueprint`, which throws unless the string holds exactly one blueprint, never
  silently "the first of N". `index.html` has its own `bpOf()`, which also rejects books.
