# Sprites pipeline

Moved verbatim from CLAUDE.md (2026-11-19). Read before touching `sprites/`, `tools/` or the preview drawing.

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
node tools/sprites/build-recipe.js        # dump -> sprites/recipe.json + entities.json
tools/sprites/extract-entities.ps1        # recipe -> sprites/*_<dir>.png
node tools/sprites/emit-manifest.js --write   # entities.json -> the SPRITES table in index.html
node tools/sprites/dump-meta.js           # collision boxes + tile sizes -> sprites/meta.json
```

To produce a PNG of a blueprint — for sharing, or for looking at something too small to see in
the page:

```bash
node tools/render/render-png.js dropoff-a draw.json 56 56 -1 96 15   # last four crop, in tiles
tools/render/render-png.ps1 draw.json out.png
```

It loads the page's own `entBox()` and `SPRITES` through the same `new Function` trick as
`bp.js`, so a rendered PNG cannot drift from what the preview draws.

`--dump-data` writes a 44 MB `data-raw-dump.json` into `%APPDATA%\Factorio\script-output\`.
It is regenerable and safe to delete. `tools/sprites/contact-sheet.ps1` lays every sprite on a labelled
grid — **look at it after any change here**, since a wrong frame index still produces a
plausible-looking file.

All 16 directions are extracted for every entity, not just the ones the stored blueprints use:
a flip negates direction and a turn adds to it, so the tools routinely produce facings no saved
blueprint contains. Frames that resolve to identical art share one file, so 82 PNGs cover 208
entity/direction pairs. `tools/sprites/used-dirs.js` reports which pairs actually occur.

### Traps, all of which cost time

- **Glow layers have no alpha.** `rail-signal-lights.png` and its kind are stored as RGB
  because the engine adds them additively, where black reads as transparent. Alpha-composite
  one and it paints an opaque black box over the entity. They're skipped by PNG colour type,
  not by filename.
- **Icons are mipmap strips.** `graphics/icons/*.png` are 120×64 — 64+32+16+8. Only the
  leftmost square is full-res. (`tools/sprites/extract-sprites.ps1` pulls these; the page doesn't use
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

`tools/render/seed-page.js` writes a throwaway copy of the page with blueprints already in its inputs,
so a page can be checked in a browser without pasting by hand:

```bash
node tools/render/seed-page.js seeded.html dropoff-a@rot-in
node tools/render/seed-page.js seeded.html dropoff-a@a dropoff-a-signals@b
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
