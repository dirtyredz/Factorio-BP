# BACKLOG — factorio-bp

Prioritized structural debt, deferred work, and known issues. Not fixed here — recorded so the
next session (or the next baseline) can pick them up deliberately instead of rediscovering them.

## 2026-09-22 baseline structural review

Source: the repo's first-ever baseline structural review — 3 Claude structure lenses
(componentization, abstraction, topology) plus a Codex cross-model sign-off. **Verdict: PASS, no
P0.** Everything below was confirmed by at least one lens; items Codex specifically weighed in on
say so. None of it was fixed as part of the baseline — see `STRUCTURE.md`'s `## Structural debt`
for the pointer back here.

### P1

- **`tools/` (16 files)** — a generically-named bucket holding three unrelated responsibilities:
  sprite pipeline/inspection (~10: `extract-sprites.ps1`, `extract-entities.ps1`, `dump-meta.js`,
  `dump-connectors.js`, `emit-manifest.js`, `build-recipe.js`, `survey-graphics.js`,
  `used-dirs.js`, `check-belt-curves.ps1`, `contact-sheet.ps1`), rendering (`render.js`,
  `render-png.js`, `render-png.ps1`), dev diagnostics (`belt-curves.js`, `gridpos.js`,
  `seed-page.js`). Past both the 12-file general cap and the 8-file generic-bucket cap. Confirmed
  by both a Claude lens and Codex.
  **Direction:** split into responsibility-named folders (e.g. `tools/sprites/`,
  `tools/render/`, `tools/diagnostics/`).

- **`tools/render.js`** — duplicates `render-png.js`'s job but reimplements its own
  entity-placement/z-order logic (`rank()`, manual `ox`/`oy` from `sprites/entities.json`)
  instead of loading `entBox()`/`drawRank()`/`SPRITES` from `index.html` the way `render-png.js`
  deliberately does. Also undocumented — absent from CLAUDE.md and README.
  **Direction:** delete if superseded, or make it consume the page implementation; its one
  distinct capability is single-file HTML output.

- **`tools/used-dirs.js:12-14`, `tools/belt-curves.js:66-68`, `tools/render.js:19-20`,
  `tools/gridpos.js:18-20`, `tools/render-png.js:33`** — five scripts hand-roll the same
  blueprint-string decode AND their own blueprint-book unwrap. **Codex confirmed the book
  behaviours genuinely differ**: `index.html`'s `bpOf()` rejects books, `used-dirs.js` processes
  all top-level blueprints, and `belt-curves.js`/`render.js`/`gridpos.js` each silently select
  the first. This is structural debt **with a latent correctness bug** in the developer tools —
  valid book input produces inconsistent or silently partial results depending on which tool
  runs it.
  **Direction:** one shared sync decode+unwrap helper used by all five.

- **`bp.js:16-32`, `test.js:8-25`, `debug.js:7-33`, `tools/render-png.js:14-25`** — four
  independent reimplementations of the load-`index.html`-as-API trick, each re-deriving slice
  boundaries, DOM stub shape, and export list. Codex upgraded this from P2 to P1: four consumers
  independently maintaining a fragile execution boundary.
  **Direction:** one `loadPageApi(names, extraGlobals)`.

- **`tools/belt-curves.js:26`** (from Codex) — the diagnostic independently implements the same
  belt-neighbor algorithm as `beltCurves()` in `index.html`, so it can disagree with the product
  while appearing to validate it.
  **Direction:** load the page's `beltCurves()` and keep this script responsible only for
  diagnostic formatting.

- **`tools/build-recipe.js:28`** (from Codex) — the supported-entity inventory is separately
  hard-coded in `build-recipe.js`, `dump-meta.js`, `extract-sprites.ps1`, and partially
  `dump-connectors.js`, so adding entity support needs coordinated edits and can silently omit
  icons, footprints, connectors, or directional art.
  **Direction:** one responsibility-named entity manifest consumed by each pipeline stage.

- **`bp.js:134`** (from Codex) — merge verification rules are reimplemented separately from the
  browser checks at `index.html:1886`, so CLI and page can accept different outputs for the same
  merge contract.
  **Direction:** one page-owned `mergeChecks()` result rendered by both.

- **`test.js:29`** (from Codex) — all 202 checks across merge, transforms, sprites, wires, grids,
  and floor overlays live in one stateful IIFE sharing setup and mutable fixtures.
  **Direction:** keep `test.js` as the page-API loader/runner and move scenario suites into
  responsibility-named test modules.

### P2

- **`STRUCTURE.md:52`** (from Codex) — stable architecture and operational gotchas remain
  embedded in `CLAUDE.md` instead of the documented living-doc locations.
  **Direction:** extract stable design into `docs/ARCHITECTURE.md` and hazards into
  `docs/GOTCHAS.md`, leaving links in `CLAUDE.md`.

- **`tools/extract-sprites.ps1:35-57` and `tools/build-recipe.js:47-60`** — two implementations
  of resolving a mod-relative path to a direct file or cached zip entry, one PowerShell, one JS.
  **Correction:** a Claude lens claimed `extract-entities.ps1` was a third copy; Codex
  disagreed — it consumes an already-resolved recipe and does not repeat mod-reference parsing.
  Low priority; Node and PowerShell cannot share code directly.

### Not baseline debt — original shape

`tools/` being at 16 files is not accretion: git history shows all 16 arrived in the initial
import. It's the directory's original shape, not drift — still worth splitting (see above), but
not a sign of neglect.
