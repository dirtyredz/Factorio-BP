## Chosen scope (lead, after plan-trimmer)
Kept: slices 1-5 (essential, each landed alone with its own gate/commit/push). Trimmed per the trimmer, all low risk:
- **Folders:** two, not three. `tools/sprites/` (10 generation/inspection scripts) and `tools/render/` (render.js, render-png.js/.ps1 plus belt-curves.js, gridpos.js, seed-page.js diagnostics, 6 files). No `tools/diagnostics/`.
- **Loader:** ~20-line `loadPageApi(names, extraGlobals)`: resolve index.html, slice the trailing script, one throw on missing script, `new Function`, return named exports. No identifier validation or extra boundary handling. debug.js injects its richer DOM.
- **prototype-lookup.js:** not a separate file; fold the shared lookup into the inventory module/build-recipe.js, only if >=3 scripts really import it.
- **Tests:** page-api test = one check (named exports + fresh SPRITES for the test.js restore case); keep merge-checks test; belt-curves = one row-shape check; no inventory.test.js (byte-compare is the evidence). No `metadataOrder` unless a byte-compare shows the four lists really differ in order.
- **Docs:** STRUCTURE.md, CLAUDE.md (loader instruction) and path references only; no new GOTCHAS entries unless a real trap appears.
- **Slice 4 (merge predicates):** keep, but if the stacking-key policies make it threaten byte-identical/website behaviour, defer to Docket rather than bend.
- **Slice 5 (entity inventory):** keep; defer if the game dump needed for the byte-compare is absent.
Cut/deferred: slice 6 (render.js drawRank swap, dk-d53b6d72 stays open with a one-line pointer comment); dk-8cbcf9f6 (two path resolvers) deferred; test.js IIFE split and CLAUDE.md->STRUCTURE.md move after.

---

## Goal

Consolidate the tooling debt at `b65f736` through separately committed and pushed slices. Preserve website behavior, the single trailing `<script>`, and byte-identical affected tool output on `dropoff-a`; retain all 206 existing checks.

## Placement

| Home | Files and responsibility |
|---|---|
| `tools/sprites/` | Move `build-recipe.js`, `extract-entities.ps1`, `extract-sprites.ps1`, `emit-manifest.js`, `dump-meta.js`, `dump-connectors.js`, `survey-graphics.js`, `used-dirs.js`, `check-belt-curves.ps1`, `contact-sheet.ps1` here: sprite generation and inspection. |
| `tools/render/` | Move `render.js`, `render-png.js`, `render-png.ps1` together: standalone rendering. |
| `tools/diagnostics/` | Move `belt-curves.js`, `gridpos.js`, `seed-page.js` here: blueprint and page diagnostics. |
| `tools/lib/page-api.js` | New shared Node loader, alongside unchanged `blueprint.js`. Used by root harnesses and tooling. |
| `tools/sprites/supported-entities.json` | New authoritative inventory, separate from generated `sprites/entities.json`. |
| `tools/sprites/prototype-lookup.js` | Extract the identical prototype-category exclusion and lookup logic from three generators. |
| `index.html` | Extract page-owned belt analysis and merge predicates from existing functions, within the existing script. |
| `bp.js`, `test.js`, `debug.js` | Replace loader copies; adapt CLI merge verification and register focused tests. |
| Focused tests | `tools/lib/page-api.test.js`, `tools/lib/merge-checks.test.js`, `tools/diagnostics/belt-curves.test.js`, `tools/sprites/tests/inventory.test.js`. |
| Living docs | Targeted changes to `STRUCTURE.md`, `CLAUDE.md`, `GOTCHAS.md`, `docs/sprites.md`, `docs/ARCHITECTURE.md`, `VERIFY-IN-GAME.md`. |

No new `src/` tree. Extend `STRUCTURE.md`’s enforced homes accordingly. New modules stay well below 800 lines. The already-large page and test harness remain deliberate exceptions under the brief’s deployment and scope constraints.

**Minimal loader:** `loadPageApi(names, extraGlobals = {})`.

- Resolve `index.html` relative to the helper, independently of working directory.
- Extract the single trailing script; reject missing/malformed boundaries.
- Supply the existing minimal `document` and `navigator` defaults; replace individual globals with supplied overrides.
- Validate requested identifiers, evaluate with `new Function`, and return only those names.
- Create fresh execution state on every call. No cached API, global mutation, central export registry, or source-rewriting options.
- Keep `debug.js`’s persistent fake DOM local; inject its `document`, `window`, and `requestAnimationFrame`.

## Sequence

Each slice includes its documentation updates and finishes with its own gate, commit, and push. Later slices may use earlier slices, but none leaves an unfinished migration.

1. **essential — Establish responsibility folders (`dk-26988d47`).**  
   **Files:** All sixteen moves above; path references in `test.js`, `index.html` comments, script usage text, and living docs.  
   **Goal:** Separate responsibilities without semantic edits. Update every `__dirname`/`$PSScriptRoot` calculation, shared-helper import, default output location, and the test harness’s `emit-manifest.js` invocation.  
   **Acceptance:** No flat forwarding scripts; inputs and output locations retain their current meanings. `deploy.ps1` remains unchanged.  
   **Verification:** Common gate below; compare each moved tool’s baseline outputs, including both renderers and diagnostics.  
   **Risk:** Incorrect parent depth, especially `render.js`’s separately calculated default output path.

2. **essential — Centralize page loading (`dk-56b33715`).**  
   **Files:** `tools/lib/page-api.js`, its test, `bp.js`, `test.js`, `debug.js`, `tools/render/render-png.js`.  
   **Goal:** Replace all loader copies, including the additional `new Function` inside `test.js` that restores mutated `SPRITES`.  
   **Acceptance:** Script extraction/evaluation exists only in the helper; export selections remain with callers. The sprite-restoration call receives a genuinely fresh table.  
   **Verification:** Common gate; byte-compare CLI info/merge output, `debug.js` output, and PNG draw JSON.  
   **Risk:** Sharing mutable page state or replacing the debug harness’s richer DOM with the minimal stub.

3. **essential — Make belt diagnostics consume page analysis (`dk-b3cde9c5`).**  
   **Files:** `index.html`, `tools/diagnostics/belt-curves.js`, its test, `test.js`.  
   **Goal:** Extract the existing page neighbor calculation into a page-owned detailed analysis function. Keep `beltCurves(entities)` as its existing map projection; make diagnostic `analyse(bp)` a formatting adapter.  
   **Acceptance:** Preserve the exported diagnostic row shape, including feeders for straight belts. Preserve page feeder selection, direction handling, curve decisions, and diagnostic ordering/text. No neighbor algorithm remains in the diagnostic. Existing callers of `beltCurves` retain their signature.  
   **Verification:** Common gate; byte-identical diagnostic stdout and draw JSON on `dropoff-a`; existing synthetic belt cases remain green.  
   **Risk:** Changing page semantics while accommodating the diagnostic. The page algorithm remains authoritative; overlapping malformed entities must not drive changes to it.

4. **essential — Extract shared merge predicates (`dk-579c663d`).**  
   **Files:** `index.html`, `bp.js`, `tools/lib/merge-checks.test.js`, `test.js`.  
   **Goal:** Introduce page-owned `mergeChecks(base, result, diff, dropped, stackingKey)` returning stable check IDs and booleans. Replace predicates in page `build()` and CLI `verify()`.  
   **Acceptance:** Presenters retain their labels, ordering, summaries, and selection of rows. Browser alignment/redecode rows stay browser-owned; the label-preservation predicate remains available to the CLI. Conditional floor checks retain their current conditions.  
   **Verification:** Common gate; byte-identical merge report/result and debug output; browser verification rows unchanged.  
   **Risk/tradeoff:** The page rounds stacking coordinates through `key(e, ZERO)`; the CLI currently uses raw coordinates. Default to the page key and pass the existing raw serializer from the CLI. This centralizes verification while deliberately retaining that policy difference.

5. **essential — Consolidate supported entities (`dk-06d6670a`).**  
   **Files:** Inventory and prototype-lookup modules above; `build-recipe.js`, `dump-meta.js`, `dump-connectors.js`, `extract-sprites.ps1`; inventory tests and registration.  
   **Goal:** Replace four inventories with ordered records shaped as `{name, icon, metadataOrder, connectors}`. Array order preserves recipe/connector order; `metadataOrder` preserves metadata/icon order. Extract the three identical prototype lookups.  
   **Acceptance:** Preserve all thirteen entities, explicit icon references, nine connector candidates, prototype lookup order, and generated bytes. Keep directional extraction policy in `build-recipe.js`. Leave `survey-graphics.js`’s representative schema examples alone.  
   **Verification:** Common gate; regenerate and byte-compare recipe, entity metadata, footprint metadata, icon/directional PNGs, emitted manifests, and connector output; then render `dropoff-a`.  
   **Risk:** Reordering JSON or stdout, changing the modded chest icon, or filtering away an existing connector diagnostic. Requires the same game dump/install/mod archives as baseline.

6. **optional — Remove the safe portion of renderer duplication.**  
   **Files:** `tools/render/render.js`.  
   **Goal:** Replace its identical local `rank()` with page `drawRank()` through the shared loader.  
   **Acceptance/verification:** Common gate and byte-identical HTML/stdout at tile size 20.  
   **Risk/tradeoff:** This does **not** complete `dk-d53b6d72`; leave it open. Full placement migration is deferred: raw metadata has four-decimal precision while page sprites have three, and the renderers intentionally differ in bounds, curves, and wires. For example, chest height becomes `23.13px` versus `23.12px`. Deletion also fails the output-preservation contract.

## Tests

Register focused modules through the existing harness pattern; do not split its IIFE.

- **Loader:** requested exports, independent mutable state across calls, injected debug DOM wiring, independence from working directory.
- **Belts:** diagnostic row contract for straight and curved belts; retain existing behind-feed, side-feed, splitter, and real S-bend checks.
- **Merge:** deliberately failing metadata/count/parameter/floor predicates, removal settings, conditional floor rows, and raw-versus-rounded stacking coordinates.
- **Inventory:** preserved consumer orders/subsets/icon references; prototype lookup skips same-named item and recipe entries.

Keep all 206 baseline checks; additional checks increase the total. Byte comparisons are acceptance evidence, not assertions that merely duplicate implementation.

## Verification

No build or test execution was performed for this plan. The implementer must capture actual pre-change outputs before editing each slice.

**Every slice:** run `node test.js`, compare affected stdout and generated files byte-for-byte, run `dk check`, then commit and push separately. Follow `docket guide` before the first item write; claim and release the applicable items.

Use the same checkout location, output paths, runtime versions, inputs, and Windows/System.Drawing environment before and after. Preserve raw bytes when capturing stdout. Use binary comparison such as `cmd /c fc /b`; do not normalize paths or reserialize JSON.

Representative commands after relocation:

- `node bp.js info dropoff-a`
- `node bp.js merge dropoff-a dropoff-a-signals consolidation-check --no-clip`
- `node debug.js`
- `node tools/diagnostics/belt-curves.js dropoff-a`
- `node tools/render/render.js dropoff-a render.html 20`
- `node tools/render/render-png.js dropoff-a draw.json 32`
- `node tools/render/render-png.js dropoff-a crop.json 56 56 -1 96 15`
- `powershell -NoProfile -File tools/render/render-png.ps1 draw.json out.png`

Use the same temporary merge slot and filenames for baseline and candidate. Capture artifacts before overwriting them.

For sprite slices, run `build-recipe.js`, `dump-meta.js`, `dump-connectors.js`, and `emit-manifest.js` under `tools/sprites/`, plus `extract-sprites.ps1` and `extract-entities.ps1`. Compare their stdout and generated files; omit `--write` for emitted page literals. These tools do not accept blueprint arguments, so the `dropoff-a` render is an additional downstream check, not a substitute.

For relocation, also compare `gridpos.js`, `used-dirs.js`, `survey-graphics.js`, `check-belt-curves.ps1`, `contact-sheet.ps1`, and `seed-page.js` outputs using their existing inputs.

For page-changing slices, open the local page and confirm unchanged merge checks, belt previews, and floor-overlay behavior. Confirm one trailing script and no new browser dependency. No deployment is needed.

## Validation

none (refactor; byte-identical tool output is the check)

## Docs

- **`STRUCTURE.md`:** Record responsibility folders, shared harness loader, inventory ownership, and remaining debt.
- **`CLAUDE.md`:** Replace per-caller `new Function` instructions with the shared loader contract; correct the description of `tools/`.
- **`docs/sprites.md`:** Update commands, inventory ownership, and loader explanation.
- **`docs/ARCHITECTURE.md`:** Document shared belt analysis and merge predicates, including retained stacking-key policies.
- **`GOTCHAS.md`:** Record fresh loader state, consumer ordering, and legacy renderer precision.
- **`VERIFY-IN-GAME.md`:** Update moved tool references only.

Do not create absent `DECISIONS.md`/`FEATURES.md` files or undertake the deferred documentation migration.

## Open questions / assumptions

- **Cuts with least loss:** omit slice 6; defer full `dk-d53b6d72` and `dk-8cbcf9f6`. The latter needs a cross-language resolver contract and bitmap/ZIP lifetime changes, so it does not fit cheaply.
- If the Factorio prerequisites are unavailable, defer slice 5 rather than land it without the specified output evidence.
- New tool paths are intentional; repository callers and living documentation migrate together. Historical plans remain historical.
- Existing page/test size exceptions do not require prerequisite splitting.
- The brief’s “202-check IIFE” is stale against the documented 206-check baseline. Some structural-debt prose also predates the existing architecture-doc extraction.
- `dk show --json` returned `DOCKET_NOT_A_REPO` despite Git reporting `b65f736`; named item bodies were read directly. No items or source files were changed. The implementer must restore working Docket access before claiming work.