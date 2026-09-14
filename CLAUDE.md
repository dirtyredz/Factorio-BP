# factorio-bp — notes for whoever works on this next

Tools for editing Factorio blueprints outside the game, so that **snap-to-grid and
parametrisation survive**. Re-selecting a blueprint in game destroys both: a pasted blueprint
has its parameters substituted with real values, so anything captured back from the world has
lost them.

**The owner opens `open-tools.url`, which points at the local `index.html`.** An edit to that file
is live the moment they reload — no publish step, so don't make them wait on one.

There is also a Claude Artifact copy at
**https://claude.ai/code/artifact/d0d8838f-70b0-4360-a85e-78c45f19128e** — republish with the
`Artifact` tool, same file path, to update it in place. It is for sharing, and it goes stale the
moment you edit `index.html` without republishing. **Only publish when asked.**

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
| `test.js` | 202 checks, same trick — pulls the page's functions and runs them against real blueprints. |
| `debug.js` | Drives the page's `run()` against a fake DOM, so UI-path errors surface in the terminal. |
| `deploy.ps1` | Deploys the public site — stages `index.html` + `sprites/*.png` and runs `wrangler pages deploy`. See [Deployment](#deployment--the-public-site). |
| `blueprints/*.txt` | Real blueprints from the owner. One string per file, no trailing newline. |
| `sprites/*.png` | Entity art cut out of the owner's own Factorio install, one file per entity *and direction*. Game assets, but this tool is free and non-commercial, so publishing them is fine — they ship to the public Pages site via `deploy.ps1`. |
| `tools/*` | One-off scripts that produce `sprites/`. Not needed to run the tools; needed to regenerate the art. See [Sprites](#sprites). |
| `VERIFY-IN-GAME.md` | Checks that pass their tests but have never been confirmed against Factorio. Raise these when the owner says they are in game. |
| `IDEAS.md` | Agreed but unbuilt work, ranked, with what's known vs assumed for each. Move an item into this file and the README when it ships. |

```bash
cd C:\Users\dirty\factorio-bp && node test.js
```

`bp.js` and `test.js` both do `html.slice(html.lastIndexOf('<script>') ...)` — **keep `index.html`
to a single `<script>` block at the end**, or both break. When adding a function they need,
extend the `return { ... }` list in their `new Function(...)` call.

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

## Format facts

A string is `"0"` + base64 of zlib-deflated JSON. `CompressionStream("deflate")` in the browser
and `zlib` in Node both produce strings Factorio accepts; they differ in bytes from Factorio's
own output and from each other, which is fine — compare *decoded JSON*, never the strings.

### Parameters

`blueprint.parameters` is an array; values live inside the entities. Factorio binds a parameter
to an entity field **by matching the stored value**, not by any explicit link.

- `{"type":"id","id":"parameter-0"}` — referenced from entity strings, e.g. a station named
  `[item=parameter-0][virtual-signal=down-arrow]`.
- `{"type":"number","number":"2","name":"Limit"}` — binds to *every* field holding 2.
- `{"number":"70000","formula":"T/2","dependent":true}` — the stored number is the last computed
  value; on paste it recomputes.

Consequences that cost real debugging:

- **Never orphan a `parameter-N` reference — but the token is what's sacred, not the whole
  string.** A name like `[item=parameter-0][virtual-signal=down-arrow]` is a template: only the
  `parameter-0` token must survive. If the rebuilt value dropped it — a concrete item name in its
  place is paste substitution — keep the base. If it still carries every `parameter-N` the base
  had, the binding can't break, so take the edit: renaming a `[item=parameter-0]` stop (dropping
  the arrow, or adding free text around the token) is a real change worth keeping. `protect()`
  compares the two token sets to decide.
- **Do overwrite plain numbers.** They are only "parameter-bound" by coincidence of value, and
  the owner may have deliberately changed one — the train stop's enable condition went 2 → 1
  while `Limit` was also 2, and protecting it silently reverted the exact edit they asked for.
- Values bound to a `dependent` (formula) parameter are pure substitution noise — keep those.
- `paramsStillBind()` is the safety net: after any edit, every parameter's stored value must
  still appear somewhere in the entities.

### Directions

- 16-way, clockwise, 0 = north. **Factorio omits `direction` when it's 0** — an absent direction
  means north, *not* "this entity has no facing". Deriving turnability from "does this type carry
  a direction field anywhere" is wrong and silently left 24 inserters unrotated.
- Rails read the same from both ends, so their direction **wraps at 8, not 16** (`SYMMETRIC` set).
  Confirmed in the art: `straight-rail.pictures` has all eight direction keys, but `south`,
  `southwest`, `west` and `northwest` are **empty objects** — Factorio simply doesn't draw the
  redundant half. Curved rails have content in all eight. Note the trap when reading that data:
  `{}` is truthy, so testing `set[dir]` says every direction has art.
- Genuinely faceless types are matched by the `FACELESS` regex — chests, poles, lamps, and so on.
- Verified: turning Drop Off A 180° in the tool matches a copy Factorio itself rotated, 102/102
  entities identical, zero residual rotation.

### Flipping

Reflecting negates the angle, so a facing goes to `-d`, with the same wrap-at-8 for `SYMMETRIC`
rails. A vertical flip is a horizontal one turned 180°, so it is `8 - d`; only the horizontal
rule needs establishing per entity type.

**Curved rails are chiral and are the whole difficulty.** The mirror image of a left-hand curve
is the right-hand curve, which Factorio stores two slots along rather than at the mirrored
angle: `2 - d`, not `-d`. Both `curved-rail-a` and `curved-rail-b` use the same offset.

Verified, and worth knowing how, because it is reusable: **the rail loop in `dropoff-a` is
exactly mirror-symmetric about x = 48** — all 40 rail pieces pair up at `96 - x` with the same
y — so the blueprint is its own ground truth. All four curved pairs read 0 against 2 and 6
against 12. The build's extreme entities are two of those rails, so the bounding-box restore
maps x to `96 - x` exactly and the flipped loop lands on the original piece for piece. That is
one of the tests.

Half-diagonal rails have odd directions, and `-d` keeps them odd, which is at least
self-consistent — but there are none in any stored blueprint, so it is **inferred**. Same for
the 1.1-era `curved-rail`, which the `CURVED` regex deliberately doesn't match.

Two other things reflect that rotation doesn't:

- **Splitter priorities.** `input_priority`/`output_priority` are stated as left/right, and left
  and right trade places in a mirror. Inferred from what the word means; no splitter in any
  stored blueprint.
- **Tile positions are corners, not centres**, so a tile's mirror image is the next one along:
  `-x - 1`. Entities don't need the -1 because their position is a centre.

  `turnBlueprint` used to get this wrong — it rotated the corner instead of the tile — and was
  off by one under a quarter or half turn. **Fixed.** Rotate the square `[x,x+1]×[y,y+1]` and
  its new minimum corner is one along, so the correction per quarter turn is
  `[[0,0], [-1,0], [-1,-1], [0,-1]][q % 4]`. Still no stored blueprint has tiles, so the tests
  use a synthetic one — deliberately **without** `snap-to-grid`, because `reanchor()` only runs
  when there is one and would otherwise translate the result and hide what's being measured.
  The half-turn case is checked against flipping both ways, which is an independent
  implementation of the same transform.

Grid: a mirror image is the same size, so `snap-to-grid` doesn't swap and
`position-relative-to-grid` stays on the axis it was on. The bounding-box restore is the same
`reanchor()` the 180° turn uses. The "unknown constant cancels" argument is slightly weaker here
than for a turn — the same entities occupy the same box, but a mirrored footprint is not the
same footprint for anything with an asymmetric collision box — so **the resulting Grid position
is unconfirmed**. Ask for a screenshot of the dialog after a flip; that settles it in one round.

### Snapping — read this before touching rotation

Three things are stored; a fourth is shown in game but is **not** in the JSON.

| In game | In JSON | Notes |
|---|---|---|
| Grid size W/H | `snap-to-grid` | Swaps on a quarter turn. Certain. |
| Absolute X/Y | `position-relative-to-grid` | Verified by matching (40, −12) on screen to the same numbers in the JSON. Pins the blueprint to world coordinates — a **placement choice**, nothing about a rotation determines it. |
| Relative / Absolute | `absolute-snapping` | |
| **Grid position X/Y** | *not stored* | Derived from the entities. |

Grid position is a readout of where the build sits relative to the blueprint origin:
`gridpos ≈ 1 − min(entity centre)`. Editing it in game **translates every entity** — measured
exactly: the owner's correction moved all 104 entities by (+96, +8), one grid cell, and changed
nothing else in the JSON.

The green box in the preview is the grid cell anchored at the blueprint **origin**, 0,0 to
(W,H). That is why a build sitting at x −93..−3 shows the box off to one side, and the same
build at x 3..93 shows it overlapping.

**The page draws that box now** — the *Grid box* toggle under every preview. It shows three
things: the cell from 0,0 to (W,H) in green, the build's extent in dashed amber, and a
crosshair on the origin. The stage grows to reach the origin when it has to, because the gap
between origin and build is the thing worth looking at; that growth is what a test pins down.

The extent is measured from **entity centres**, not sprite art, since that's what the grid
responds to. Sprites overhang their entities — a curved rail's frame is 8×8 tiles — so using
art bounds would silently overstate the build.

What it deliberately does *not* show is a computed Grid position, because the constant in
`gridpos ≈ 1 − min` is unreliable and a wrong number is worse than none. See `IDEAS.md`.

**So: to control snapping, translate the entities.** Do not try to fix it via
`position-relative-to-grid`; three separate attempts at that were all wrong.

**Solved, and more simply than the earlier notes here assumed.** `gridPosition()` computes it:

```
gridpos = 1 − min(entity centre)      on both axes
```

Verified against the only ground truth in the project. The owner hand-corrected Drop Off B's
Grid position to **(−2, 6)**; `dropoff-b-fixed` has a minimum entity centre of (3, −5), and
1−3 = −2, 1−(−5) = 6. Two corroborations fall out: `dropoff-b` gives (94, 14), differing by
exactly (96, 8) — one grid cell, which is precisely the correction that produced the fixed copy —
and the tool's own 180° turn (`dropoff-b-180`) lands on (−2, 6) too.

**Collision boxes are the wrong tool here, despite what this file used to suggest.** Solving for
the constant from footprint edges instead of centres gives 0 on one axis and −2 on the other —
inconsistent — because the extreme entity is a curved rail and its collision box is the
runtime-generated placeholder `trains.lua` warns about. Centres were sufficient all along.

**The one caveat, and it's real:** the formula gives a half-integer when the extreme entity isn't
2×2, since a 1×1 sits on a half tile and Grid position in the dialog is a whole number. So it
almost certainly reduces to something in terms of the extreme entity's *occupied tile*, and
`1 − min(centre)` is that rule specialised to a 2×2 extreme — which every stored blueprint has,
because rails are the extreme entities. `gridPosition()` returns `whole: false` in that case and
the UI says the number can't be trusted; the only stored blueprint that trips it is
`dropoff-b-toolturned`, a known-bad turn. **A build whose extreme entity is 1×1 would settle
the general form in one screenshot.**

What works instead, and why: for a **180° turn, restore the bounding box.** Rotating about the
origin throws the box to the far side; translating by `(minX+maxX, minY+maxY)` puts it back on
the cells it started on. The unknown constant cancels, because the same entities occupy the same
box. Verified — it reproduces the owner's hand-corrected Grid position (−2, 6) exactly.

A **quarter turn has no exact answer**: the build genuinely changes shape (90 × 12.5 becomes
12.5 × 90) and the grid changes with it, so there are no "same cells" to restore. Current rule
puts the corner where the swapped axes say. **Unverified** — if the owner reports the Grid
position they correct a 90° turn to, that pins it.

## Sprites

All three pages draw a preview of the blueprint. The art is cut out of the owner's own install
at `C:\Program Files (x86)\Steam\steamapps\common\Factorio` (2.1.12 + Space Age, ~25 mods).

**These are Wube's assets (plus `aai-containers`' steel-chest retexture). This tool is free and
non-commercial, so publishing them is fine** — `deploy.ps1` ships them to the public Pages site.
*(This reverses an earlier "local use only, never publish" rule; the owner settled it 2026-09-14.)*
The page still degrades on its own: any entity with no sprite, and any image that fails to load,
becomes an amber box at the right footprint, so a copy without the art shows a readable schematic
instead of an empty panel. Keep that fallback working.

### The one rule that matters

**Nothing is ever rotated.** Factorio ships a pre-drawn frame for every direction, and
`direction` selects which frame to cut from the sheet. An early attempt rotated item icons with
a CSS transform and stretched them to the footprint box; it produced skewed, wrongly-angled
junk. If a preview looks tilted, that's the bug returning.

### Pipeline

```bash
"C:\Program Files (x86)\Steam\steamapps\common\Factorio\bin\x64\factorio.exe" --dump-data
node tools/build-recipe.js        # dump -> sprites/recipe.json + entities.json
tools/extract-entities.ps1        # recipe -> sprites/*_<dir>.png
node tools/emit-manifest.js --write   # entities.json -> the SPRITES table in index.html
node tools/dump-meta.js           # collision boxes + tile sizes -> sprites/meta.json
```

To produce a PNG of a blueprint — for sharing, or for looking at something too small to see in
the page:

```bash
node tools/render-png.js dropoff-a draw.json 56 56 -1 96 15   # last four crop, in tiles
tools/render-png.ps1 draw.json out.png
```

It loads the page's own `entBox()` and `SPRITES` through the same `new Function` trick as
`bp.js`, so a rendered PNG cannot drift from what the preview draws.

`--dump-data` writes a 44 MB `data-raw-dump.json` into `%APPDATA%\Factorio\script-output\`.
It is regenerable and safe to delete. `tools/contact-sheet.ps1` lays every sprite on a labelled
grid — **look at it after any change here**, since a wrong frame index still produces a
plausible-looking file.

All 16 directions are extracted for every entity, not just the ones the stored blueprints use:
a flip negates direction and a turn adds to it, so the tools routinely produce facings no saved
blueprint contains. Frames that resolve to identical art share one file, so 82 PNGs cover 208
entity/direction pairs. `tools/used-dirs.js` reports which pairs actually occur.

### Traps, all of which cost time

- **Glow layers have no alpha.** `rail-signal-lights.png` and its kind are stored as RGB
  because the engine adds them additively, where black reads as transparent. Alpha-composite
  one and it paints an opaque black box over the entity. They're skipped by PNG colour type,
  not by filename.
- **Icons are mipmap strips.** `graphics/icons/*.png` are 120×64 — 64+32+16+8. Only the
  leftmost square is full-res. (`tools/extract-sprites.ps1` pulls these; the page doesn't use
  them, but they suit a legend.)
- **Sprite frames are padded.** A belt frame is 128 px at `scale 0.5` = 2 tiles, but only the
  middle ~1.1 tiles is opaque. That is correct — don't "fix" it. Measure the alpha bounding box
  before believing a sprite is the wrong size.
- **Mod art lives in the `.zip`.** `aai-containers` retextures `steel-chest`, so the resolver
  reads mod archives without unpacking them.
- **Geometry:** tiles = `px * scale / 32`, and `shift` is already in tiles. Verified against
  `steel-chest` (64×74 at 0.5 → 1 × 1.16 tiles, a 1×1 entity).

### Why the manifest is inlined

`index.html` is opened straight off disk, and a `file://` page **cannot `fetch()` a sibling
`.json`** — the browser calls it cross-origin. So the `SPRITES` table is a literal in the
script block, regenerated with `emit-manifest.js --write`. `<img src="sprites/…">` is exempt
from that rule, which is why the PNGs can stay as loose files.

`tools/seed-page.js` writes a throwaway copy of the page with blueprints already in its inputs,
so a page can be checked in a browser without pasting by hand:

```bash
node tools/seed-page.js seeded.html dropoff-a@rot-in
node tools/seed-page.js seeded.html dropoff-a@a dropoff-a-signals@b
```

### What the tests hold down

`entBox` and `buildPreview` are exported to `test.js` like everything else, and build no DOM —
they return HTML strings — so they run under node unchanged. The checks that matter:

- **All 16 directions are extracted**, compared against `sprites/entities.json`. This is the one
  that commemorates a real bug: extracting only the directions the stored blueprints use looks
  fine until a flip turns a chain signal from direction 3 to 13, which had no sprite.
- **The `"*"` fold is lossless** — every direction resolves to the file the extractor actually
  made. Note that `"*"` means a missing direction can no longer show up as a *box*; it would
  silently draw the wrong facing instead, so this check is what replaces the visible symptom.
- **`index.html` matches the PNGs on disk**, by re-running `emit-manifest.js` and diffing its
  output against the inlined table. Catches re-extracting and forgetting `--write`.
- **Nothing is rotated**, and **frames are sized from the art, not the footprint** — the two
  halves of the original skew-and-spin bug.

All five were confirmed to fail when the corresponding bug is reintroduced. A preview test that
has never been seen failing is worth very little; if you add one, break the code on purpose once.

### Known gaps

Deliberate: no shadows, no lamp glows (signals render unlit), no inserter hand, no train-stop
colour mask, animations frozen at frame 0. Only the 13 entity types in the stored blueprints
are extracted — anything else falls back to a box, which is the intended behaviour, not a bug.

### Belt curves

**A blueprint never says a belt is curved.** It stores `direction` only; the game derives the
curve from the neighbours, and so does `beltCurves()`:

> a belt curves when exactly one belt feeds it from a perpendicular side and nothing feeds it
> from directly behind

"Feeds" is by output tile — a belt at Q facing d outputs into `Q + unit(d)` — so a neighbour
feeds this belt when its output tile *is* this belt's tile. Two side feeds means a merge and
stays straight. Undergrounds, splitters and loaders can feed a curve but never curve themselves,
which is why `FEEDS` and `CURVES` are different regexes. On `dropoff-a` this finds 6 curved
belts out of 16, forming the two S-bends at the branch.

Sprites are keyed `"<facing>c<came-from>"`, e.g. `8c12` is facing south, fed by flow that was
travelling west. Rows 4–11 of the belt sheet are the curves.

**The trap, and it inverted every curve on the first attempt:** Factorio's curve names describe
**edges, not travel**. `east_to_north` enters the *east edge* and leaves by the *north edge* —
so the flow is travelling **west** and turns north. Reading it as "was going east, now going
north" gives the mirror image of the right answer.

That was caught without the game by `tools/check-belt-curves.ps1`, which measures how much of
each tile edge a curve sprite's art actually covers and compares it against what the key
implies. Worth keeping: it turns a question about a naming convention into a measurement.

What it **cannot** prove is flow direction *within* a pair — the two curves joining the same
edges are mirror images in time, not space, so they cover identical edges. `east_to_north` vs
`north_to_east` is settled only by the prototype names, and is therefore **inferred**. If a
curved belt ever renders with its chevrons running backwards, that pair is swapped.

### Wires

`blueprint.wires` is an array of `[entity_a, connector_a, entity_b, connector_b]`, referencing
`entity_number` rather than position — which is why a translation doesn't touch them.

Connector ids, **read off the stored blueprints** rather than from documentation:

| id | meaning | evidence in `dropoff-a` |
|---|---|---|
| 1 | red, input side | the chest chain, `[31,1,35,1]` and on |
| 2 | green, input side | `[92,2,92,4]` — the decider bridging its own two sides |
| 3 | red, output side | `[92,3,96,1]` — decider output into the train stop |
| 4 | green, output side | the other end of that same self-link |
| 5 | copper, pole to pole | `[28,5,59,5]`, joining two medium poles |

So: **5 is copper, odd is red, even is green.** All 17 wires in `dropoff-a` classify cleanly —
3 copper, 13 red, 1 green — and that split is one of the tests.

The preview draws them as an SVG layer between the entities and the grid overlay.

**Where a wire lands is real data, not the entity centre.** `CONNECT` in `index.html` holds the
offsets, extracted by `tools/dump-connectors.js --write` from the prototypes, keyed by entity,
direction and connector id. The first attempt drew centre to centre and the owner spotted three
separate things wrong with it in one go:

- **A combinator has separate input and output points.** `input_connection_points` and
  `output_connection_points` are distinct, per direction. A decider facing east has its green
  input at `[-0.781, -0.125]` and its green output at `[0.719, -0.109]` — 1.5 tiles apart. So a
  combinator wired from its own output back into its own input is a **real span**, not the
  zero-length loop the first version drew as a ring. That wire is genuinely there and was
  missing.
- **Copper attaches at the top of the mast**, not at the pole's position: `[0.234, -3.109]` for
  a medium pole, over three tiles up. A power line should run mast-top to mast-top.
- **Copper is solid.** It was dashed, which is wrong — nothing about a power wire is dashed.

**Wires hang.** Each span is a quadratic curve, not a straight line, with sag scaled to length
(`min(1.1, max(0.09, len * 0.1))` tiles) so a long pole run droops visibly and a short hop
barely does. The control point goes twice the wanted sag below the chord, because a quadratic
passes through the average of its control point and its two ends at the midpoint. GDI+ in
`render-png.ps1` only draws cubics, so it converts by pulling each control two thirds of the way
from its end toward the quadratic control.

The zero-length ring still exists as a fallback for any entity with no `CONNECT` entry wired to
itself — but with the table populated, nothing in the stored blueprints hits it.

## Normalising

`normalise(obj, {x, y})` translates every entity so the build's **minimum entity centre** lands
on a chosen corner. The point is that two blueprints normalised to the same corner, sharing a
grid size, land on the same spot in game. `#/normalise` and `node bp.js normalise` both use it.

It only translates entities, because that is the only lever that works — see the Snapping
section. The verified evidence is the same: the owner's in-game grid correction moved all 104
entities by (+96, +8) and changed nothing else in the JSON.

**Translations are whole tiles only, and this is a real constraint, not caution.** A 1×1
entity's centre sits at half-integer coordinates and a 2×2's on integers, so a half-tile shift
would put entities off-tile and Factorio would reject the blueprint. Consequence: if one build's
edge entity is 1×1 and another's is 2×2, their minima keep a 0.5 difference that no translation
can remove. `residual` reports it rather than hiding it — don't "fix" this by rounding.

Also moved, because they hold absolute positions rather than offsets:

- `pickup_position` / `drop_position` on inserters.
- `tiles`, which translate exactly like entities. **No −1 here** — the corner-versus-centre
  correction that flipping needs does not apply to a pure translation, only to reflection.

**Landing two blueprints together needs three more things to match**, and none of them are
implied by a move: grid size, `absolute-snapping`, and `position-relative-to-grid`. The page
lists all three so they can be compared across blueprints, and offers to set the last one.
Measured on the real pair: normalising `dropoff-a` and `dropoff-b` to (0,0) gave both an extent
of x 0…90, y 0…12.5 on a 96×8 grid — but their Absolute X/Y were (−8,−4) and (40,−12), so they
would still *not* have coincided until that was matched.

**Unverified in game.** The arithmetic is tested and the previews agree, but nobody has yet
pasted two normalised blueprints down and confirmed they land on the same tile. Worth one
screenshot.

## Merge behaviour

Four categories, from `compare()`:

| | Meaning | Applied |
|---|---|---|
| added | empty tile now occupied | yes |
| replaced | same tile, different entity | yes — old deleted, new put in its place |
| removed | gone, nothing in its place | only with `--apply-removals` |
| changed | same entity, different settings | only when opted in per entity |

Replacements must stay paired. Splitting them into a removal plus an addition stacks both
entities on one tile, since removals are off by default. `verify()` checks for stacking.

Opted-in changes merge **field by field** through `protect()`, so parameter references survive
while the rest updates.

### Seeing the diff

The merge preview colours the result by where each entity came from — `diffMarks()` turns
`compare()`'s four categories into position keys the drawing loop looks up. Green added, amber
replaced, dashed yellow changed, dashed red removed, with a legend and counts under the picture.
The point is that a bad alignment becomes visible rather than something inferred from a match
ratio.

Two things that are easy to get wrong here:

- **Markers follow the footprint, not the sprite frame.** Frames are padded — a 1×1 belt's is
  2×2 — so a frame-sized marker blankets its neighbours and you can't tell which tile changed.
- **Ghosts only when removals were applied.** A removed entity is *absent* from the output only
  in that case, so that's when drawing it faded in its old place tells the truth. With removals
  off it's still in the result and gets drawn as an ordinary entity; ghosting it as well would
  claim something false.

Note the keys differ per category: added and replaced live in the rebuilt copy's coordinates and
need `d.al.off`, while modified and removed are already in the base's, which is what the output
uses.

### Alignment

The two blueprints rarely share an origin, and a rebuild can come back rotated. `findOffset()`
tries all four rotations, generates candidate offsets by pairing entities of shared types, and
scores by **how many tiles line up — not how many entities match**. That distinction matters:
an upgraded belt still occupies its old tile, so geometry survives a rebuild that names don't.

After rotating, symmetric entities get their direction healed back (a horizontal rail keeps
direction 4 however you spin it, and spinning it invents a difference that isn't there).

`shape()` normalises an absent direction to 0. Note the trap it replaced: `JSON.stringify(obj,
keyArray)` filters *nested* objects too, so the original comparison never looked inside
`control_behavior` and missed a real difference.

### Floor tiles

A blueprint can carry `blueprint.tiles` (concrete, landfill, stone path) as well as entities, and
the merge brings the rebuilt side's floor across. Two shapes:

- **A rebuild that also has floor.** Its tiles ride the *same* alignment the entities got —
  rotated `al.q` quarter turns, shifted by `al.off` — so they land where the build did.
- **A tiles-only overlay.** A floor with no entities can't be lined up by them, so it was the
  thing that threw the old `"One of these has no entities in it."` error. It is now lined up by
  where its tiles land on the base: `occupiedCells()` is the set of integer cells the base fills
  (floor tiles by their corner, plus each entity's footprint — a 1×1 fills its own cell, a 2×2 the
  three back toward the origin too), and `findTileOffset()` scores each candidate offset by how
  many overlay tiles land on one, across all four rotations — the same "most tiles line up" rule
  `findOffset()` uses for entities. If nothing overlaps anywhere (a floor with no counterpart in
  the base) the two bounding boxes are matched at their corners instead, and the UI says so.

`transformTiles(tiles, q, off)` does the geometry, and it must use the **corner nudge**
`[[0,0],[-1,0],[-1,-1],[0,-1]][q%4]` that `turnBlueprint` established — a tile position is the
cell's top-left corner, not a centre, so rotating the corner alone lands one cell off. `merge()`
unions the transformed tiles onto the base keyed by cell, and **the overlay wins** where both name
a tile for the same cell, since it is the thing being stamped down. The offsets stay whole: a
same-type entity pair differs by a whole number of tiles, and tile candidates are integer by
construction, so no floor ever lands on a half tile.

The **Tile offset** box (`#toff`, `parseOffset()`) sets the placement by hand — whole tiles only —
when the auto-align gets it wrong; it only bites the tiles-only path. The preview needs no new
code: `buildPreview` already drew `tiles`.

**Inferred, not yet game-verified:** that a merged floor lands on the right cells *in game*. The
arithmetic is tested (tiles-only align, rotation, manual offset, overwrite, whole-cell, round
trip — 14 checks) and the preview agrees, but no merged floor has been pasted down. One screenshot
would settle it — see VERIFY-IN-GAME.md.

## Appending to this file

Keep the split between **verified** (checked against Factorio's own output or a screenshot) and
**inferred**. Most of the wasted effort here came from confident reasoning about grid semantics
that turned out wrong three times; each was settled in one round by asking for real data. When
something gets confirmed, say what confirmed it.
