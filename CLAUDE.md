# factorio-bp — notes for whoever works on this next

Tools for editing Factorio blueprints outside the game, so that **snap-to-grid and
parametrisation survive**. Re-selecting a blueprint in game destroys both: a pasted blueprint
has its parameters substituted with real values, so anything captured back from the world has
lost them.

**The owner opens `open-tools.url`, which points at the local `index.html`.** An edit to that file
is live the moment they reload — no publish step, so don't make them wait on one.

A Claude Artifact copy also exists (URL and republish notes in `docs/ARCHITECTURE.md`). **Only publish when asked.**

## Deployment — the public site

**The tool is also a live public website: https://factorio-bp-tools.dirtyredz.com** — a Cloudflare
Pages project named `factorio-bp-tools` (default subdomain `factorio-bp-tools.pages.dev`). This is a
third, separate copy — distinct from the local `open-tools.url` file and the Artifact.

**A `git push` does NOT update it.** GitHub only stores the code; the live site is a separate
Cloudflare Pages copy that changes ONLY when the deploy is run. This has bitten a session already:
the code was pushed to GitHub, everyone assumed the site was live, and it kept serving the old
version until the deploy was run by hand. If you change `index.html` and the owner wants it live,
**deploy it — pushing is not deploying.**

**Deploy:** `./deploy.ps1`. It stages `index.html` + `sprites/*.png` into `dist/` and runs
`npx wrangler pages deploy dist --project-name factorio-bp-tools`. One-time prereq: `npx wrangler
login` (auth is then stored under `%APPDATA%\xdg.config\.wrangler`). Deploying is an outward
publish — confirm with the owner first, then verify the result at the URL above.

**It publishes ONLY `index.html` + `sprites/*.png` — never the blueprints, the docs, or the
source.** The site once served the whole repo root, exposing `blueprints/*.txt` (the owner's real
strings), this file, and `bp.js`/`test.js` publicly; `deploy.ps1` stages a clean `dist/` precisely
so that can't recur. Don't `wrangler pages deploy .` from the repo root.

## Layout

| File | What it is |
|---|---|
| `index.html` | The whole product. Markup, styles, and **all the logic**. Hash-routed: `#/merge`, `#/rotate` (turns *and* flips), `#/normalise`, `#/inspect`. |
| `bp.js` | CLI front end. **Loads its logic out of `index.html`** so the two can't drift. |
| `test.js` | 215 checks, same trick — loads the page's functions, runs the suites in `tests/` (transforms, merge, sprites, overlays) and the helper checks in `tools/`. |
| `debug.js` | Drives the page's `run()` against a fake DOM, so UI-path errors surface in the terminal. |
| `deploy.ps1` | Deploys the public site — stages `index.html` + `sprites/*.png` and runs `wrangler pages deploy`. See [Deployment](#deployment--the-public-site). |
| `blueprints/*.txt` | Real blueprints from the owner. One string per file, no trailing newline. |
| `sprites/*.png` | Entity art cut out of the owner's own Factorio install, one file per entity *and direction*. Game assets, but this tool is free and non-commercial, so publishing them is fine — they ship to the public Pages site via `deploy.ps1`. |
| `tools/sprites/*` | One-off scripts that produce `sprites/` (extraction pipeline) plus sprite diagnostics. Not needed to run the tools; needed to regenerate the art. See `docs/sprites.md`. |
| `tools/render/*` | Renderers (`render-png.js/.ps1`), `seed-page.js`, `belt-curves.js`, `gridpos.js`. Hand-run. |
| `tools/lib/*` | Shared helpers and their checks: `blueprint.js` (decode), `page-api.js` (loads the page's functions). |
| `VERIFY-IN-GAME.md` | Checks that pass their tests but have never been confirmed against Factorio. Raise these when the owner says they are in game. |
| `IDEAS.md` | Agreed but unbuilt work, ranked, with what's known vs assumed for each. Move an item into this file and the README when it ships. |


```bash
node test.js
```

`bp.js`, `test.js`, `debug.js` and `tools/render/render-png.js` all load the page's functions through
`tools/lib/page-api.js` (`loadPageApi(names, extraGlobals)`), which slices the last `<script>` — **keep
`index.html` to a single `<script>` block at the end**, or all of them break. When adding a function a
caller needs, add its name to that caller's `loadPageApi([...])` list.

## Working with the owner

**Never paste a blueprint string into chat, in either direction.** They are ~2000 characters of
base64 and a single wrong character makes them undecodable. Retyping one *will* corrupt it —
this happened twice and cost several rounds, including one bogus "these two strings are
identical" conclusion drawn from a file the model had duplicated by mistake.

Use the clipboard:

```bash
# in:  ask them to copy in game, then
powershell -Command "(Get-Clipboard -Raw).Trim() | Out-File -Encoding ascii -NoNewline blueprints/name.txt"
# out:
node bp.js copy <name>
```

A corrupted transcription almost never inflates cleanly, so **a successful zlib decode is good
evidence the copy is intact**. Report length and entity count before trusting anything.

The owner reads Factorio's blueprint dialog fluently and will screenshot it. Those screenshots
are ground truth and have settled three separate questions that reasoning alone got wrong — ask
for one rather than theorising.

## Reference docs (read before touching the area)

- `docs/blueprint-format.md` — string format, parameters (never orphan a `parameter-N` token), directions, flipping (curved rails are chiral), snapping and Grid position. Verified vs inferred facts are marked; read before touching rotation.
- `docs/sprites.md` — sprite extraction pipeline, "nothing is ever rotated", sprite traps, why the manifest is inlined, what the sprite tests hold down, known gaps.
- `docs/ARCHITECTURE.md` — belt curves, wires and connector ids, normalising (whole tiles only), merge categories, alignment, floor tiles, and the Artifact copy URL.
- `VERIFY-IN-GAME.md` — checks that pass tests but are unconfirmed in Factorio.

## Appending to this file

Keep the split between **verified** (checked against Factorio's own output or a screenshot) and
**inferred**. Most of the wasted effort here came from confident reasoning about grid semantics
that turned out wrong three times; each was settled in one round by asking for real data. When
something gets confirmed, say what confirmed it.
