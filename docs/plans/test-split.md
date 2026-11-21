## Chosen scope (lead, after plan-trimmer)
Kept: new `tests/` dir (enforced home); three extractions, one commit each, landed together after one sign-off: (A) transforms+normalise+tile turns, (B) merge + merge marks (owns nMark/cls privately), (C) sprites/belts. Suites export `async (api) => batches` of existing `[name, ok]` pairs; `test.js` keeps reporter, explicit batch order, diagnostics, footer, exit handling. Baseline `node test.js` stdout+exit captured BEFORE editing and diffed after each commit: must be identical (same text, order, 215 checks).
Then (D) grids+wires+floor overlays: one file `tests/overlays.test.js` (not three), only to finish the item if test.js still carries them; local copy of the tiny class-token helper is acceptable.
Cut: standalone setup slice (folded into A); tests/fixtures.js and tests/assertions.js (two-line local `read`/`fresh`/`same` per suite); isolation probes and fresh-API-per-suite mandate (share one API unless a suite mutates state; SPRITES restore stays as is); GOTCHAS isolation entry; README rewrite beyond check-count fix. Keep: exception-path behaviour, conditional rebuild fixture, independently decoded nA/nB/nC/preA, repo-root-relative fixture paths. Docs: STRUCTURE.md (tests/ home, debt bullet), CLAUDE.md layout/count, README count only.

---

## Goal

Split `test.js` into isolated responsibility suites while retaining it as the page-API loader and runner. Preserve all assertion meanings, the 215 checks, their exact PASS/FAIL text and order, diagnostics, footer values, and exit behavior.

Static inspection accounts for 202 scenario checks plus 13 existing helper checks. The three conditional rebuild checks depend on `blueprints/dropoff-a-stoplogic.txt`, which is present. No tests were executed during planning.

## Placement

Create `tests/` for page scenarios. These tests exercise the browser product; they do not belong in `tools/lib/`, whose enforced purpose is helpers shared by scripts. Leave existing adjacent helper tests where they are.

| File | Responsibility and extraction |
|---|---|
| `test.js` | Keep API creation, explicit batch ordering, diagnostics, reporting, and process exit handling. Extract scenario setup and assertions. |
| `tests/fixtures.js` | Repository-relative fixture paths, blueprint text reads, and fresh decoding through the supplied API. Extract `read` and `fresh`; avoid cached decoded objects. |
| `tests/assertions.js` | Shared comparison primitives: unchanged JSON-stringify `same`, and the identical class-token counters currently named `nMark` and `cls`. Keep grid’s different exact-class counter local. |
| `tests/transforms.test.js` | Turns, flips, normalisation, and tile rotation: **71 checks**, from current lines 180–347, 801–950. These share responsibility for blueprint geometry. |
| `tests/sprites.test.js` | Manifest fidelity, transformed-blueprint rendering, and belt curve/art selection: **26 checks**, from 349–502, 595–659, 777–800. |
| `tests/merge.test.js` | Merge scenarios and their preview marks: **62 checks**, from 18–178 and 534–594. Keeping both together retains their shared scenario products privately. |
| `tests/grids.test.js` | Grid-position calculation and grid overlays: **14 checks**, from 503–533 and 732–776. |
| `tests/wires.test.js` | Wire rendering and connector placement: **13 checks**, from 660–731. |
| `tests/floor-overlays.test.js` | Floor alignment and merging: **16 checks**, from 951–1090. |

This uses exactly eight files in `tests/`. Each should remain comfortably below 800 lines; transforms is the largest extraction at roughly 320 existing lines plus its wrapper. Do not introduce a suite registry, discovery mechanism, or test framework.

Update `STRUCTURE.md`, `CLAUDE.md`, `README.md`, and `GOTCHAS.md` as described below. No changes to `index.html`, `tools/lib/page-api.js`, existing helper suites, or other loader callers are needed.

## Sequence

1. **essential — Establish the setup and runner contract.**

   Capture baseline output before editing. Add the enforced `tests/` placement bullet and extract fixture access and shared comparison primitives.

   In `test.js`, introduce a context factory that calls the existing `loadPageApi` with the current export list. Each extracted suite receives a new context; temporarily remaining inline scenarios retain their existing context.

   Suites export asynchronous functions, with no scenario execution at require time. They return named arrays of existing `[name, ok]` pairs; only suites needing diagnostics or footer metadata return those additional fields. Keep the reporter and exception handler in `test.js`.

   Establish these boundaries:

   - Share immutable source strings and stateless helpers only. Each invocation owns its API, decoded blueprints, synthetic fixtures, and result arrays.
   - Fixture paths resolve against the repository, not the new module directory or process working directory.
   - Root execution remains sequential.
   - Preserve falsy/truthy assertion results; do not replace predicates with another assertion library.
   - Preserve both footer formats. Merge will eventually supply primitive values for wires carried, encoded length, scenario-two anchor, and offset.

   Only `test.js` becomes a caller of the new helpers at this stage. Run the equivalence check before landing.

   **Tradeoff:** this preparatory slice temporarily leaves the existing oversized `test.js` in place. The next slice removes that debt; do not create a temporary oversized “legacy suite” merely to move it elsewhere.

2. **essential — Extract transforms first.**

   Move turns/flips, normalisation, and tile-turn checks into `tests/transforms.test.js`. Return three batches: main transforms, normalisation, and tile turns. Insert each at its original position in `test.js`.

   Decode this suite’s own `A`; keep `half`, `canon`, `norm`, rail helpers, and synthetic fixtures local. Preserve the conditional rebuild fixture check. Normalisation must still decode independent `nA`, `nB`, `nC`, and `preA` objects because `normalise` mutates its input.

   This extraction should bring `test.js` below 800 lines; verify the actual count. All changed scenario callers are now the corresponding explicit calls in `test.js`.

3. **essential — Extract sprites and belt rendering.**

   Move the three sprite/belt blocks into `tests/sprites.test.js`, returning manifest, belt, and preview batches. Keep `stored`, `moves`, `gaps`, `previewed`, manifest data, and file-presence state inside one invocation.

   Give the suite a fresh API and retain its existing deletion/restoration of `SPRITES['decider-combinator']`. Supply the loader through the root context for the existing fresh-table restoration; isolation from other suites does not remove the need to restore the table before later sprite checks.

   Preserve fixture enumeration, optional asset checks, generator invocation, and its catch-and-skip behavior. Resolve `emit-manifest.js`, `index.html`, and sprite paths from the repository root. Return the two diagnostic batches for emission at their original assembly positions.

   **Tradeoff:** belt adjacency checks remain with sprite selection because this existing block couples both; a separate belt module offers little benefit for ten checks.

4. **essential — Extract merge and merge marks together.**

   Move both blocks into `tests/merge.test.js`. Decode its own `A` and `B`; keep `a`, `up`, `edited`, `d`, `v`, `d2`, and `v2` private. Marks consume those same locally generated merge products.

   Return main checks, mark checks, and footer metadata. Do not export intermediate blueprints or make another suite depend on merge running first. Remove obsolete shared setup from `test.js`.

5. **essential — Extract grids.**

   Move grid-position and grid-overlay checks into `tests/grids.test.js`, returning two batches. Decode local inputs; retain cloned `far` and `unsnapped` fixtures.

   Use the shared class-token helper where the original used `nMark`; retain the exact-class counter unchanged. This removes the accidental dependency on the merge-mark block.

6. **essential — Extract wires.**

   Move wire checks into `tests/wires.test.js` with its own API and decoded `dropoff-a`. Keep dangling-wire fixtures and tag counting local; use the shared token counter for the former `cls`.

7. **essential — Extract floor overlays and finish documentation.**

   Move floor checks into `tests/floor-overlays.test.js`. Keep all synthetic factories and `posSet` local, preserving fresh objects at their existing call sites.

   Finish removing scenario state from `test.js`. Keep the four existing helper-test imports at the tail, in their existing order.

The runner’s explicit batch order must remain:

**Merge 52 → transforms 49 → sprite manifest 10 → grid position 6 → merge marks 10 → belts 10 → wires 13 → grid overlay 8 → sprite preview 6 → normalise 15 → tile turns 7 → floors 16 → existing helper checks 13.**

No PASS/FAIL reordering is necessary. Evaluation of some independent batches will happen earlier within their owning suite; buffering results and diagnostics preserves displayed order.

**Cut list — optional reduced scope:** land slices 1–3 for the smallest useful stopping point: shared setup plus the two largest groups, approximately 540 existing scenario lines extracted. Add slice 4 to remove the most significant remaining cross-block dependency. Defer grids, wires, and floors first if needed; their checks remain inline and active. Such a stopping point is partial completion, not closure of the full Docket item.

## Tests

Move the existing checks unchanged into the files above; add no counted product assertions.

Preserve these easy-to-alter semantics:

- `a = api.bpOf(A)` remains an alias within its owning suite.
- Optional rebuild and sprite-file behavior stays conditional.
- JSON-stringify equality stays exactly as written, including its existing use with `Set` values in floor checks. Strengthening those assertions is separate work.
- Grid exact-class counting must not become class-token counting.

Use an uncommitted verification probe to invoke each extracted suite twice with fresh contexts and compare its ordered results and metadata. Also invoke suites in a different evaluation order while assembling their output in the fixed runner order. This checks isolation without changing the 215-check contract.

## Verification

The implementer must:

1. Run the documented `node test.js` on the pre-change checkout and save stdout, stderr, and exit status outside the committed tree.
2. Run `node test.js` after every slice with the same Node version, fixtures, and assets. Require exit zero, **215/215**, and identical ordered PASS/FAIL lines. Compare complete stdout too, including diagnostics and both footer lines.
3. Review moved predicates and names against the original; output equivalence alone cannot prove assertion semantics were preserved.
4. Confirm exception reporting still prints `threw:`, the message, four stack frames, and exits one. Extracted stack locations will naturally differ.
5. Check that `tests/` has eight files, each below 800 lines, and that `test.js` is below 800 after slice 2.
6. Confirm the diff contains no product, fixture, or generated-asset changes.

There is no build step or required running-app check for this test-only refactor.

Before implementation item writes, run `docket guide`, claim the existing item, and follow its workflow. Release the claim when finished and run `dk check` before pushing.

## Validation

Validation: none (test refactor; same check count and names is the check).

## Docs

- **`STRUCTURE.md`:** Add `tests/` to the tree and enforced Layout bullets; document its eight-file allocation and root runner ownership. Update the structural-debt entry only to reflect the scope actually completed.
- **`CLAUDE.md`:** Describe `test.js` as the loader/runner for isolated scenario suites and existing adjacent helper checks.
- **`README.md`:** Keep `node test.js` as the command; replace its stale 179-check description with the suite-based description.
- **`GOTCHAS.md`:** Record fresh API/decoded-fixture ownership, intentional mutation within suites, and interleaved output batches.

`CLAUDE.md` and `STRUCTURE.md` say 206 checks; the Docket body says 202. These counts are stale against the current 215 total. Prefer removing brittle totals from general documentation. No new `DECISIONS.md` or `FEATURES.md` is needed.

## Open questions / assumptions

- Plan assumes the supplied checkout represents the requested main HEAD. `dk show dk-dd350926 --json` reported that it could not recognize this directory as a Git worktree; the item body was read directly, and no item was changed. The implementer must resolve checkout recognition before claiming work.
- Preserve output compatibility through explicit named batches rather than grouping all printed checks by suite. This small orchestration cost is justified by the requested stable order.
- The first setup slice is allowed to retain the pre-existing file-size violation until slice 2. If placement enforcement rejects that intermediate state, land slices 1 and 2 together.
- All seven slices are required for the full split; the cut list explicitly offers a smaller, independently useful scope.