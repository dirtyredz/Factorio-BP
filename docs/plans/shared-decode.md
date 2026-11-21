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

Baseline: 9031ef4, deterministic repro (1 run per case): belt-curves and render silently use only the first blueprint of a 2-blueprint book; used-dirs, belt-curves, render, gridpos crash (TypeError) on a nested book; render-png rejects every book; gridpos prints first blueprint then crashes. Validator after-run on 9a5a44a: PASS (used-dirs flattens incl. nested; four single-blueprint tools exit 1 "book contains 2 blueprints; pick one"; dropoff-a outputs byte-identical; 1-blueprint book now works in render-png).
