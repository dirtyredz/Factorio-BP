# STRUCTURE — factorio-bp

Where things live and why. This repo is **one self-contained browser tool**, not a multi-module
app — the shape below is flat *by design*, and this file is what tells the placement hook so.

## Layout

```
factorio-bp/
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

- **`tools/` is at 16 files** — past the 12-file general cap and double the 8-file cap for a
  generically-named bucket. It holds three distinct responsibilities and **should be split**:
  - *sprite pipeline & inspection* (~10): `extract-sprites.ps1`, `extract-entities.ps1`,
    `dump-meta.js`, `dump-connectors.js`, `emit-manifest.js`, `build-recipe.js`,
    `survey-graphics.js`, `used-dirs.js`, `check-belt-curves.ps1`, `contact-sheet.ps1`
  - *rendering* (3): `render.js`, `render-png.js`, `render-png.ps1`
  - *dev diagnostics* (3): `belt-curves.js`, `gridpos.js`, `seed-page.js`
  Not accretion — git history shows all 16 arrived in the initial import — so this is original
  shape, not drift. It is still the one directory here that has outgrown a single name.
- **The living-doc set was never bootstrapped.** There is no `docs/` directory. The deploy flow and
  its two real footguns currently live in `CLAUDE.md` instead of `docs/ARCHITECTURE.md` and
  `docs/GOTCHAS.md` where the convention puts them. Worth a `/project-docs` run.
- **Never baselined.** This repo has had no full structural review.
