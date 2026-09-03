# Checks that need the game

Everything here is arithmetic that passes its tests and looks right in the preview, but has
never been confirmed against Factorio itself. CLAUDE.md's rule applies: a screenshot of the
blueprint dialog is ground truth, and has settled three questions that confident reasoning got
wrong.

Work through whichever are convenient — each is independent, and each is one paste away from
either confirming a rule or exposing a wrong one. **Report the numbers from the dialog**, not
an impression.

When something here is settled, move it into CLAUDE.md with what confirmed it, and delete it
from this file.

> **Write these in terms of the website, and have the owner start from their own in-game
> blueprint.** They use `open-tools.url`, not the CLI — handing them `node bp.js` commands is a
> mistake that has been made once already. Producing the test string yourself from
> `blueprints/*.txt` is also wrong twice over: that copy may be stale against what is actually
> in their game, and it tests the CLI path rather than the page, which is the product.

---

## 1. Do two normalised blueprints land on the same tile?

The headline claim of the Normalise page, and the newest thing here.

1. In game, export **Drop Off A** to the clipboard.
2. Website → **Normalise** → paste it in.
3. Corner X `0`, Y `0`; tick **Also set Absolute** and set X `-8`, Y `-4`.
4. **Normalise** → **Copy** → paste back in game and place it. Note where it lands.

Then repeat from step 1 with **Drop Off B**, same settings, placed in the same spot.

- **Expected:** both land on exactly the same tiles — same origin, same grid cell.
- **What to report:** the Grid position X/Y shown for each, and whether the two builds coincide.
- **If they don't:** say by how many tiles they differ. That difference is the bug.

Both were normalised to corner `0,0` and pinned to the same Absolute X/Y, so the only remaining
variable is whether "minimum entity centre" is the right thing to anchor on.

## 1b. Does the Grid position figure match the dialog?

Inspect now shows a computed **Grid position**, from `1 − min(entity centre)`. It reproduces the
one recorded value — your hand-corrected (−2, 6) for Drop Off B — but that is a single data
point, and every stored blueprint has a **2×2 rail** as its extreme entity.

*To check, cheaply, whenever you paste anything:* compare the number Inspect shows against the
dialog.

The case that would actually settle it is a build whose leftmost or topmost entity is **1×1** —
a chest or an inserter, not a rail. The formula then lands on a half tile, which can't be right,
and the tool says so rather than showing a number. Whatever the dialog reads for such a build
pins down the general rule.

## 2. What Grid position do you correct a quarter turn to?

The oldest open question. A 180° turn restores the bounding box exactly and is **verified**. A
quarter turn genuinely changes the build's shape — 90 × 12.5 becomes 12.5 × 90 — so there is no
"same cells" to restore, and the current rule is a guess.

Export **Drop Off A**, then website → **Rotate & flip** → paste → **Turn right 90°** → **Copy**.

Paste it in game, then open the dialog and fix the Grid position to whatever it *should* be.

- **What to report:** the Grid position before your correction and after.
- Those two numbers pin the rule. Nothing else will.

## 3. Where does a flip put the Grid position?

A flip keeps the build's size, so the bounding-box restore that works for 180° should apply —
but a mirrored footprint isn't the same footprint for anything with an asymmetric collision
box, so the argument is weaker than it looks. Currently **unconfirmed**.

Export **Drop Off A**, then website → **Rotate & flip** → paste → **Flip horizontally** →
**Copy**, and paste it in game.

- **What to report:** a screenshot of the dialog, or just the Grid position X/Y.

## 4. Is the 96×8 grid deliberate?

Not a bug, just something the new grid overlay made visible: `dropoff-a` has a **96×8**
snap-to-grid, but the build is about **12.5 tiles tall**. It overhangs its own grid cell
vertically — visible as the rail curve hanging below the green box on the Inspect page.

- Fine if you only ever tile these **horizontally** at 96 spacing.
- A problem if you ever stack them in **rows**, because neighbours would overlap.

**What to report:** just whether that's intended. If it isn't, the fix is a taller grid, and
Normalise is the tool for repositioning afterwards.

## 5. Do the belt curves run the right way?

The preview derives belt curves from the neighbours, the way the game does, and the *edges*
each curve joins were verified by measuring the sprites (`tools/check-belt-curves.ps1`).

What that measurement **cannot** settle is flow direction within a pair: the two curves joining
the same two edges cover identical edges and differ only in which way items travel. That half
rests on reading Factorio's prototype names, so it is **inferred**.

*To check:* look at either S-bend in Drop Off A — around x 61–63 and x 68–70, y 5.5–6.5 — in
game and in the preview, and compare the chevron direction on the four curved tiles.

- **Expected:** chevrons sweep the same way in both.
- **If they run backwards**, the two curves in that pair are swapped, and the fix is exchanging
  the paired entries in `CURVE` in `tools/build-recipe.js` — `0c12`/`4c8`, `0c4`/`12c8`,
  `4c0`/`8c12`, `12c0`/`8c4`.

## 6. Two flip rules that no stored blueprint exercises

Both are **inferred** and tested only against synthetic blueprints, because nothing in
`blueprints/` contains either. Neither is urgent — they only matter when you first flip a build
containing one.

- **Splitter priorities.** `input_priority` / `output_priority` are stated as left/right, and a
  mirror swaps left and right. Reasoned from what the words mean, never seen.
  *To check:* flip anything with a splitter that has a priority set, and confirm the priority
  ends up on the side you expect.
- **Half-diagonal rails.** These take odd direction values, and the mirror rule `-d` keeps them
  odd, which is at least self-consistent.
  *To check:* flip a build containing a half-diagonal rail and confirm the track still connects.

## 7. Does a normalised blueprint still behave?

Cheap sanity check to run alongside 1, since normalising touches every entity position:

- The station name still shows its **parameter prompt** on paste, not a substituted value.
- **Inserters still reach** their chests — `pickup_position` and `drop_position` are absolute
  coordinates and are translated too, so this would break loudly if that were wrong.
- The **circuit wires** are still connected.
