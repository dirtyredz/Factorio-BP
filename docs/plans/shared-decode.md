# Shared blueprint decode helper (dk-3bb29e99)

## Chosen scope
Keep: `tools/lib/blueprint.js` (decode, blueprintsOf, loadBlueprint) used by the five tools; tests; doc fixes.
Cut/deferred: index.html `bpOf` (browser side), other P1s.

## Bug
Given a blueprint book, tools disagree: `used-dirs` processes all (one level), `belt-curves`/`render`/`gridpos` silently take blueprints[0], `render-png` (via index.html bpOf) rejects books. Partial results with no warning.

## Validation
- Metric: behaviour of each of the five tools on a synthetic 2-blueprint book (built in a temp dir via zlib; blueprints A with 1 entity, B with 2 entities, distinct names).
- Method: run each tool against the book on the baseline SHA (main 9031ef4) and on the branch HEAD; record exit code and whether output silently reflects only the first blueprint.
- Target: after: used-dirs covers entities of both A and B (and a nested book); belt-curves, render, gridpos, render-png exit non-zero with "book contains 2 blueprints; pick one"; single-blueprint and 1-blueprint-book inputs produce byte-identical output to baseline on blueprints/dropoff-a.
- Baseline: measured by the validator on 9031ef4 (old: silent first-blueprint / partial results).
