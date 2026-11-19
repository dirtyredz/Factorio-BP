# Architecture notes: previews, normalise, merge

Moved verbatim from CLAUDE.md (2026-11-19). Layout map is in ../STRUCTURE.md; rotation/snapping facts in blueprint-format.md; sprites in sprites.md.

A Claude Artifact copy of the tool is at https://claude.ai/code/artifact/d0d8838f-70b0-4360-a85e-78c45f19128e (republish with the `Artifact` tool, same file path, to update in place). It goes stale the moment `index.html` is edited without republishing. Only publish when asked.

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
