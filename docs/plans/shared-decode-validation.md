# Validator report — shared-decode (independent; validator agent, not the developer)

VERDICT: PASS. Baseline SHA 9031ef4 (main), after SHA 9a5a44a (fix/shared-decode). Validated against docs/plans/shared-decode.md ## Validation. 1 run per case (deterministic). Synthetic books built by the validator in scratch dir C:\Users\dirty\scratch-val (mk.js): zz-book2 (A=inserter:4, B=transport-belt:2), zz-nest (book[book[A],B]), zz-book1.

| Tool / input | Baseline 9031ef4 | After 9a5a44a |
|---|---|---|
| used-dirs, 2-bp book | exit 0, both | exit 0, both |
| used-dirs, nested book | crash TypeError, exit 1 | exit 0, A and B |
| belt-curves, 2-bp book | exit 0, silently first-only ("0 belts") | exit 1, "book contains 2 blueprints; pick one" |
| belt-curves, nested | crash TypeError | exit 1, pick one |
| render, 2-bp book | exit 0, silently first-only ("1 entities") | exit 1, pick one |
| render, nested | crash TypeError | exit 1, pick one |
| gridpos (dir with books) | first bp only, then crash on nested | exit 1 at zz-book2, pick one |
| render-png, 2-bp / nested | exit 1, "That's a blueprint book" | exit 1, pick one |
| 1-bp book: belt-curves, render | exit 0 | exit 0, identical |
| 1-bp book: render-png | exit 1 (rejected) | exit 0, renders |

dropoff-a byte-identity baseline vs after: identical for belt-curves, render-png (stdout + draw.json), gridpos, used-dirs, render stdout; render .html differs only by checkout path baked into sprite URLs (identical once stripped).
Target met on all items. Not measured: index.html bpOf, bp.js, books of 3+ blueprints.
Baseline: 9031ef4, symptoms present (see table).
