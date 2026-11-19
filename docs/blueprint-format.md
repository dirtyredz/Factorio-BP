# Blueprint format facts

Moved verbatim from CLAUDE.md (2026-11-19). Read before touching parameters, rotation, flipping or snapping.



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

