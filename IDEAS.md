# Ideas not yet built

Ranked by value against what this project has actually cost. Anything that gets built moves
out of here and into [README.md](README.md) (what it does) and [CLAUDE.md](CLAUDE.md) (how it
works and what was verified).

Keep the same discipline as CLAUDE.md: say what is **known** and what is **assumed**, so a
half-remembered idea doesn't get implemented as though it were a settled design.

---

## ~~1. Draw the snap-to-grid box in the preview~~ — **done**

Shipped. See the Preview section in [README.md](README.md) and the grid overlay notes in
[CLAUDE.md](CLAUDE.md#snapping--read-this-before-touching-rotation).

It now shows a computed Grid position too — see idea 2, which turned out to be solvable.

## ~~2. Compute the Grid position~~ — **done**, and collision boxes weren't needed

`gridpos = 1 − min(entity centre)`, verified against the owner's hand-corrected (−2, 6). The
collision-box route in the original note below was a red herring: footprint edges give an
inconsistent constant because the extreme entity is a curved rail with a placeholder box.
Shown on Inspect and under every preview. See CLAUDE.md's Snapping section, including the one
open caveat — a build whose extreme entity is 1×1 would pin down the general form.

<details><summary>original note</summary>

## 2. Compute the Grid position from collision boxes

CLAUDE.md's quarter-turn rule is **unverified** and the flip's resulting Grid position
**unconfirmed**. Both were blocked on "the string carries centres, never footprints".

That blocker is gone: `factorio.exe --dump-data` exposes `collision_box`, and
`sprites/meta.json` already holds it for every entity in the stored blueprints. With idea 1 on
screen, the tool can show its computed Grid position and one screenshot settles it permanently.

**Caution:** rail prototypes carry a placeholder collision box — `trains.lua` says the real one
is generated at runtime — and every stored build is rail-extreme, so rails likely need handling
of their own. Worth attempting; not guaranteed to work.

</details>

## ~~3. Set the origin, so similar blueprints share coordinates~~ — **done**

*The owner's idea.* Shipped as the **Normalise** page and `node bp.js normalise`. See the
README, and the Normalising section in CLAUDE.md.

What was built, of the shapes below: **normalise to a corner**, plus an optional setting of
Absolute X/Y, because a corner alone does not make two blueprints land together. The other
shapes — align to another blueprint, anchor on a named entity — are still open and would fit
the same page.

<details><summary>original note</summary>

Re-selecting a build in game shifts every coordinate, so two versions of the
same station have entirely different numbers for the same physical entity. Normalising the
origin would make them line up.

This is the same lever CLAUDE.md already identifies for snapping — **to control snapping,
translate the entities** — so one feature serves both purposes: consistent coordinates between
versions, *and* a way to place the build on the grid deliberately.

Shapes it could take, roughly in order of usefulness:

- **Align to another blueprint.** `findOffset()` already solves exactly this for merging: it
  tries four rotations and scores candidate offsets by how many tiles line up. Reusing it to
  *rewrite* B's coordinates rather than merge them is a small step, and it makes a diff between
  versions readable by eye.
- **Normalise to a corner.** Translate so the build's minimum entity centre lands on a chosen
  coordinate. Cheap, deterministic, no second blueprint needed.
- **Anchor on a named entity.** Put "the train stop" at a fixed coordinate. Most meaningful for
  rail builds, where the stop is the thing that has to line up with the world.
- **Explicit nudge.** Type a translation. Useful for dialling in snapping once the grid box from
  idea 1 shows what is happening.

**Known:** translating entities is the correct and only reliable way to move a build relative to
the grid; editing `position-relative-to-grid` is not, and three attempts at it all failed. A
grid-position correction the owner made in game moved all 104 entities by (+96, +8) and changed
nothing else in the JSON, which is what this feature would do directly.

**Assumed:** that nothing else in a blueprint stores an absolute coordinate that would need
moving with the entities. Wires are entity-number references and tiles carry their own
positions, both already handled by the turn and flip paths — but a build with train schedules or
other position-bearing fields should be checked before trusting this.

</details>

## ~~4. Colour the diff on the merge preview~~ — **done**

`diffMarks()` turns `compare()`'s four categories into position keys, and the merge preview
outlines each entity accordingly, with a legend and counts. Removals are drawn as faded ghosts
where they used to sit — but only when removals were actually applied, since otherwise the
entity is still there. Markers follow the **footprint**, not the padded sprite frame.

## ~~5. Fix the tile corner bug in `turnBlueprint`~~ — **done**

Rotating the tile's square rather than its corner: the correction per quarter turn is
`[[0,0], [-1,0], [-1,-1], [0,-1]][q % 4]`. Seven tests, including a check against flipping both
ways as an independent half turn. Details in CLAUDE.md's Flipping section.

## ~~6. Draw the wires~~ — **done**

Shipped with the preview. Connector ids decoded from the stored data — 1 red in, 2 green in,
3 red out, 4 green out, 5 copper — and documented in CLAUDE.md's Wires section. An entity wired
to itself gets a mark rather than a zero-length line.

## ~~7. Merge floor tiles, including a tiles-only overlay~~ — **done**

The merge was entity-only: `compare()` threw the moment either side had no entities, and
`merge()` never touched `tiles` even when both sides had them. Now a rebuilt blueprint's floor is
carried across on the same offset its entities got, and a blueprint that is *only* floor is a
first-class case — lined up by where its tiles land on the build (`findTileOffset`/`occupiedCells`
score tile-on-cell overlap across all four rotations, exactly as `findOffset` does for entities),
then stamped on. A **Tile offset** box sets the placement by hand when the auto-align lands it
wrong. Documented in CLAUDE.md's Merge behaviour section; 14 tests cover it, and the preview draws
the floor for free since `buildPreview` already handled `tiles`.

**Unverified:** nobody has pasted a merged floor down in game yet — see VERIFY-IN-GAME.md.

## Lower priority

- **Blueprint books.** README calls these out as unsupported. A real limitation, a bigger change
  than anything above.
- **Click an entity in the preview for its settings.** Read a decider's conditions or a stop's
  station string without decoding by hand.
- **Self-maintaining sprite extraction.** `ENTITIES` in `tools/build-recipe.js` is hardcoded,
  while `tools/used-dirs.js` already computes what the stored blueprints need. Wiring them
  together means a new blueprint pulls its own art instead of silently falling back to boxes.
