# STRUCTURE — factorio-bp

Where things live and why. This repo is **one self-contained browser tool**, not a multi-module
app — the shape below is flat *by design*, and this file is what tells the placement hook so.

## Layout

```
factorio-bp/
  README.md            human quick-start
  CLAUDE.md             how to work here — deploy flow, format facts, sprite pipeline, gotchas
  STRUCTURE.md          this file
  IDEAS.md              agreed but unbuilt work, ranked
  BACKLOG.md            pointer to the Docket items in docs/items/
  GOTCHAS.md            non-obvious traps
  VERIFY-IN-GAME.md     checks that pass their tests but are unconfirmed against Factorio
  index.html          the tool itself — a single-page, buildless Factorio blueprint renderer
  bp.js               blueprint string decode/encode (CLI-usable)
  test.js             test harness
  debug.js            debug harness
  deploy.ps1          deploy entrypoint — stages dist/ and runs `wrangler pages deploy`
  test-strings.txt    scratch blueprint strings for the harnesses
  open-tools.url      convenience shortcut
  blueprints/         fixture data — real blueprint strings used by the harnesses
  sprites/            GENERATED game art (PNG) + entities.json / meta.json / recipe.json
  tools/              16 hand-run dev scripts — sprite pipeline, rendering, diagnostics
```

**Enforced homes** (what the placement hook reads):

- `./` — the root *is* a code home here: the single-page tool (`index.html`) and its
  CLI/test/debug/deploy entrypoints (`bp.js`, `test.js`, `debug.js`, `deploy.ps1`). There is no
  `src/` tree and there should not be one — the tool is a single page with no build step, so a
  source root would be a folder of one file plus three harnesses.
- `blueprints/` — fixture data (blueprint strings). Flat by nature; exempt from fan-out.
- `sprites/` — generated assets. Flat by nature; exempt from fan-out.
- `tools/` — hand-run development scripts: the sprite pipeline, the renderers, and the
  diagnostics. None are needed to run the tool itself.

## Why the root holds code

The default convention reserves the repo root for configuration and docs. This repo is a deliberate
exception and the bullets above are the override. `index.html` is the product; `bp.js`/`test.js`/
`debug.js` are its harnesses; `deploy.ps1` is how it ships. Moving any of them under a `src/` would
add a layer of nothing. New code at the root is still worth a second look — if a *fifth* root script
appears, that is the signal this repo has outgrown flat, not a reason to widen this bullet.

## Structural debt

**Tracked as Docket items** (`dk list`; files in `docs/items/`) — full list with priority, file:line, why, and direction
for each item. Confirmed by the 2026-09-22 baseline review (3 Claude structure lenses + a Codex
cross-model sign-off; see the stamp below). Summary:

- **[P1] `tools/` is at 16 files** — past the 12-file general cap and double the 8-file cap for a
  generically-named bucket. Three distinct responsibilities (sprite pipeline & inspection ~10,
  rendering 3, dev diagnostics 3) should split into responsibility-named folders. Confirmed by
  both a Claude lens and Codex.
- **[P1] Duplicated blueprint-book decode/unwrap** across five `tools/` scripts, with a **latent
  correctness bug**: `used-dirs.js` processes every top-level blueprint in a book while
  `belt-curves.js`/`render.js`/`gridpos.js` each silently take only the first, so valid book input
  produces inconsistent or silently partial results across the tools. Codex-confirmed.
  Direction: one shared sync decode+unwrap helper.
- **[P1] Four independent reimplementations of the load-`index.html`-as-API trick** (`bp.js`,
  `test.js`, `debug.js`, `tools/render-png.js`), each re-deriving slice boundaries, DOM stub shape
  and export list. Direction: one `loadPageApi(names, extraGlobals)`.
- **[P1] `tools/render.js` duplicates `render-png.js`'s job** with its own reimplemented
  entity-placement/z-order logic instead of loading the page's `entBox()`/`drawRank()`/`SPRITES`.
  Undocumented in CLAUDE.md/README. Direction: delete if superseded, or make it consume the page.
- **[P1] `tools/belt-curves.js` reimplements the belt-neighbor algorithm** that `beltCurves()` in
  `index.html` already owns, so the diagnostic can disagree with the product it's meant to
  validate. Direction: load the page's `beltCurves()`; keep the script to formatting only.
- **[P1] Supported-entity inventory hard-coded separately** in `build-recipe.js`, `dump-meta.js`,
  `extract-sprites.ps1`, and partially `dump-connectors.js` — adding entity support needs
  coordinated edits and can silently omit icons, footprints, connectors, or directional art.
  Direction: one responsibility-named entity manifest.
- **[P1] Merge verification reimplemented in `bp.js`** separately from the browser checks at
  `index.html:1886` — CLI and page can accept different outputs for the same merge contract.
  Direction: one page-owned `mergeChecks()` rendered by both.
- **[P1] `test.js`'s 202 checks live in one stateful IIFE** sharing setup and mutable fixtures
  across merge, transforms, sprites, wires, grids, and floor overlays. Direction: keep `test.js`
  as the page-API loader/runner; move scenario suites into responsibility-named test modules.
- **[P2] Stable architecture and gotchas live in `CLAUDE.md`** instead of the documented living-doc
  locations. Direction: extract design into `docs/ARCHITECTURE.md`, hazards into `docs/GOTCHAS.md`,
  leaving links in `CLAUDE.md`.
- **[P2] Two implementations of mod-relative path resolution** (`tools/extract-sprites.ps1`,
  `tools/build-recipe.js`) — one PowerShell, one JS. Low priority; the languages can't share code
  directly. (Codex checked `extract-entities.ps1` for the same pattern and found it does not
  repeat mod-reference parsing — it consumes an already-resolved recipe, so it is not a third
  copy.)

Not accretion — git history shows the original 16 `tools/` files arrived in the initial import, so
the bucket's size is original shape, not drift.

**Last full review: 2026-09-22.** Baseline over the whole codebase — 3 Claude structure lenses
(componentization, abstraction, topology) plus a Codex cross-model sign-off. **Verdict: PASS, no
P0.** All P1/P2 findings above are backlogged, not fixed, per that review's scope.
