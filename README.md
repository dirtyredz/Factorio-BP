# Factorio blueprint tools

Merge, rotate, flip, and inspect Factorio blueprints without losing snap-to-grid or parametrisation.
Re-selecting a blueprint in game destroys both; these work on the blueprint's own data instead.

**Open `open-tools.url`** — it launches `index.html` straight from disk, so any edit to that file
is live on reload. There's a shareable copy at
https://claude.ai/code/artifact/d0d8838f-70b0-4360-a85e-78c45f19128e, which only reflects changes
that have been published to it.

Paste, click, copy — nothing to install. Every page draws the blueprint with Factorio's own
sprites, so you can see what you're about to paste before you copy it. The CLI below does the
same things from the terminal when you'd rather keep blueprints on disk.

Working on the code? Read [CLAUDE.md](CLAUDE.md) first — it has the format details and the
snapping behaviour, most of which is not guessable and was worked out the hard way.

Factorio can't do this in game. Re-selecting an area replaces the blueprint's contents, and
because a pasted blueprint substitutes real values for its parameters, anything you capture
back from the world has lost them. This tool edits the blueprint's underlying JSON instead:
it appends the new entities and leaves the `parameters` block, the grid settings, and the
parametrised entity fields untouched.

## The workflow

Everything moves through the clipboard. Never paste long blueprint strings into chat — they
are ~2000 characters of base64 and a single wrong character makes them undecodable.

**1. Store the parametrised original** (once per blueprint)

Export it in game, then:

```
node bp.js save dropoff-a
```

**2. Build the new version in game**

Paste the blueprint down (give the parameters any throwaway values), add whatever you want,
then select the whole thing into a *new* blueprint. Don't touch the grid or parameters on it
— they get thrown away. Export it, then:

```
node bp.js save dropoff-a-signals
```

**3. Check what it thinks changed**

```
node bp.js diff dropoff-a dropoff-a-signals
```

**4. Merge**

```
node bp.js merge dropoff-a dropoff-a-signals dropoff-a-v2
```

The result lands on your clipboard. Import it in game, confirm it looks right, and it becomes
the base for next time.

## Commands

| Command | What it does |
|---|---|
| `save <name>` | Read the clipboard, validate it decodes, store it |
| `list` | List stored blueprints with entity/parameter counts |
| `info <name>` | Decode and summarise one |
| `diff <base> <new>` | Align the two and list added / removed / modified |
| `merge <base> <new> [out]` | Merge additions into base, verify, copy to clipboard |
| `turn <name> cw\|ccw\|180` | Rotate a blueprint, keeping grid and parameters |
| `flip <name> h\|v` | Mirror a blueprint left-right or top-bottom |
| `normalise <name> [x] [y] [out]` | Move the build to a fixed corner, so blueprints sharing a grid size land on the same spot. `--absolute=x,y` also sets Absolute X/Y |
| `copy <name>` | Put a stored blueprint back on the clipboard |

Flags: `--anchor=<entity-name>` (line up on this type), `--apply-changes[=<name>]` (take the
rebuilt settings for changed entities), `--apply-removals` (also delete entities missing from
`<new>`), `--no-clip` (write the file, leave the clipboard alone).

Files live in `blueprints/`, one `.txt` per blueprint, no trailing newline.

## Preview

Each page shows the blueprint drawn top-down, right above the string you'd copy:

| Page | What it draws |
|---|---|
| **Inspect** | The blueprint you pasted |
| **Rotate & flip** | The *result* of the turn or flip |
| **Merge** | The *merged* blueprint |

Fit-to-width by default, with −/+/Fit zoom and a scrollable stage; hovering an entity names it.
The footer reads e.g. `103 drawn · x 3…93, y 1…13.5 · grid 96×8 absolute`.

**Grid box** overlays what Factorio shows you in the blueprint dialog:

- the **green cell**, `0,0` to `(W,H)` — anchored at the blueprint *origin*, not at the build,
  which is why a build far from `0,0` shows the box off to one side
- the **build extent** in dashed amber, measured from entity centres
- a crosshair on the **origin** itself

The view widens to keep the origin on screen, because the distance between the origin and the
build is exactly what determines where the build lands on the grid. That relationship is
otherwise invisible until you paste it in game.

It also shows the **Grid position** — the figure Factorio puts in the blueprint dialog, which
is derived from where the build sits rather than stored in the string. If it ever comes out on
a half tile the tool says so instead of showing a number it cannot stand behind.

**Belts draw their curves.** A blueprint only stores which way each belt faces — whether it bends is worked out from its neighbours, exactly as the game does it, so a corner looks like a corner rather than two straight belts meeting at right angles.

**Wires** draws the circuit connections — red and green for circuit wires, solid copper between
power poles — and draws them where they actually attach, which is rarely the entity's centre.
Copper runs mast-top to mast-top, and a combinator's input and output are separate points, so a
combinator wired from its own output back into its own input shows as the real short span it
is. Every wire hangs, with longer spans drooping further.

This is what makes a flip checkable at a glance — if the curved-rail handling were wrong, the
curves would visibly fail to meet the straight track. It also catches things a status line
can't: a preview reporting `102 drawn, 1 as boxes` means an entity ended up facing a direction
with no sprite, which is exactly what a flip does to a chain signal.

The art is extracted from your local Factorio install into `sprites/`, which has to sit next to
`index.html`. It is **not** part of what gets shared — the sprites are Wube's and the mod
authors' assets, so the published copy has no `sprites/` folder and draws every entity as an
amber box instead. Same layout, same information, no artwork.

Entity types that were never extracted also draw as boxes at their correct footprint. Only the
13 types appearing in the stored blueprints have sprites; adding more is a re-run of the
pipeline in [CLAUDE.md](CLAUDE.md#sprites).

## Normalise — same grid, same spot

Two versions of the same station selected on different days have completely different
coordinates for the same physical entity. **Normalise** puts a build at a fixed corner relative
to the blueprint origin, so anything normalised the same way and sharing a grid size lands on
the same tile in game.

Only the entities move. Editing Absolute X/Y to shift a build doesn't work — that was tried
three times — whereas translating the entities is exactly what Factorio does when you correct
Grid position in the dialog.

**Translations are whole tiles**, because a 1×1 entity sits at half-integer coordinates and a
2×2 on integers; a half-tile shift would produce a blueprint Factorio rejects. If a build can't
reach the corner exactly the leftover is reported rather than quietly rounded away.

**Three things it deliberately doesn't decide for you**, all of which must match for two
blueprints to coincide: grid size, snapping mode, and Absolute X/Y. They're listed on the page
so you can compare them, and there's a tick-box to set Absolute X/Y while you're there.

Worth knowing why that matters — normalising the two real stations to `0,0`:

| | extent after | grid | Absolute X/Y |
|---|---|---|---|
| Drop Off A | x 0…90, y 0…12.5 | 96×8 absolute | (−8, −4) |
| Drop Off B | x 0…90, y 0…12.5 | 96×8 absolute | **(40, −12)** |

Same shape, same grid — and they still wouldn't have landed together until that last column
matched.

### Seeing it on the merge preview

The merge preview colours the result by where each entity came from — green added, amber
replaced, dashed yellow changed, dashed red removed — with a count of each underneath. A bad
alignment shows up as markers scattered in the wrong places, instead of something you have to
infer from the match ratio.

Entities you deleted are drawn faded where they used to be, but only when you ticked the delete
box: with it off they are still in the result, so they are drawn as ordinary entities.

## The four kinds of change

| | What it means | Applied? |
|---|---|---|
| **added** | A tile that was empty in the base now has something | yes |
| **replaced** | Same tile, different entity — an upgrade or a swap | yes: the old one is deleted and the new one takes its place |
| **removed** | In the base, gone from the rebuilt version, nothing in its place | no, unless `--apply-removals` |
| **changed** | Same tile, same entity, different settings | no, ever — see below |

Replacements are paired automatically. Without that pairing a belt upgrade would read as 16
removals plus 16 additions, and since removals aren't applied by default you'd get both belts
stacked on the same tile — an invalid blueprint. The verification step includes a stacking check
for exactly this reason.

## How alignment works

The two blueprints almost never share an origin — select a slightly different area the second
time and every coordinate shifts. So the diff doesn't compare coordinates directly. It generates
candidate offsets by pairing up entities of the same type, then scores each offset by **how many
tiles line up at all**, not by how many entities are identical. That distinction matters when
you've replaced things: an upgraded belt still sits on its old tile, so the geometry survives a
rebuild that the names don't.

```
alignment: offset (-280, -796) anchored on "straight-rail" — 103/105 incoming entities
land on an occupied tile (103 of them identical, 47 offsets tested)
```

The 2 that didn't land are exactly what you added. If that ratio is poor, the offset is wrong and
the merge will place things badly — stop and check.

If auto-alignment picks badly, name the anchor yourself: `--anchor=straight-rail` on the CLI, or
the **Line up on** dropdown in the page. Rail is usually the best choice — there's a lot of it, it
rarely changes between versions, and it spans the whole build.

## What it will not do for you

**Changed settings need opting in, per entity.** Tick **use rebuilt settings** on the ones you
want (or `--apply-changes` on the CLI). They're off by default because the base holds the
parametrised version of that entity and the rebuilt copy holds whatever your test paste
substituted. When you do opt in, the copy goes field by field: `parameter-0`-style references
keep the base value, so a stop named `[item=parameter-0]` stays parametrised while its logic
updates. **Every parameter still binds** in the verification list confirms it worked.

**A quarter turn's grid alignment is a best guess.** A 180° turn restores the build's bounding
box exactly, which is provably right, and so does a flip. A quarter turn changes the build's
shape, so there's no equivalent to restore — check the green box in game, and adjust Grid
position there if needed.

**A flip reverses the traffic through a rail build.** Signals and stops stay on the correct side
of their own track, because the track mirrors along with them, but trains now run through it the
other way. That is what a mirror image *is* — it's still worth checking the stop faces the way
you meant before committing to it.

**Blueprint books aren't supported.** One blueprint at a time.

## Tests

```
node test.js
```

179 checks, running the page's own logic against real blueprints: the signal merge verified
against a result confirmed in game, a synthetic upgrade-and-shift case covering replacement
pairing and anchor override, a settings update that must not break parametrisation, rotation
round-trips, and the flip — whose curved-rail handling is checked against the mirror-symmetric
rail loop in Drop Off A, which a horizontal flip has to reproduce piece for piece.

The last 53 cover the preview, its grid overlay, wires, and normalising: every stored blueprint is drawn in all six ways the tools can
leave it — as stored, three turns, and both flips — and every entity has to come out with real
artwork. The rest guard the sprite table against going stale or losing a direction when it's
regenerated.

## Adding parameters

This tool preserves parameters; it doesn't create them. Do that in game, in the parametrisation
dialog:

- Tick **Parameter** on a row to have it prompted on paste. Its Variable/Formula fields stay
  greyed out until you do.
- Put a name in **Variable** to reference the value from other rows.
- Tick **Formula** to derive a value instead of being prompted for it — e.g. `T/2`. Formulas
  evaluate top to bottom, so the variable must be defined on a row *above*. Drag the grip at
  the right edge of a row to reorder.
- Write percentages as `T * 15 / 100`, multiply before divide, so integer truncation doesn't
  eat the result.

A value can be prompted or derived, never both. To type `95` and store `95000`, you need two
rows: a donor number somewhere in the blueprint that gets prompted, and the real one deriving
from it with `K * 1000`.
