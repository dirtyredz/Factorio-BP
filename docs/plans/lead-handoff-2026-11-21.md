# factorio-bp lead handoff — 2026-11-21

Main is pushed and clean apart from this file. `node test.js` = 215/215 (loader/runner in test.js; suites in tests/ and tools/lib/*.test.js).

## Done this session (all merged to main, codex sign-off PASS each, byte-identical tool output)
- dk-3bb29e99 shared blueprint decode/book policy (tools/lib/blueprint.js; validator PASS, docs/plans/shared-decode*.md)
- dk-26988d47 tools/ split into tools/sprites + tools/render
- dk-56b33715 tools/lib/page-api.js loader
- dk-b3cde9c5 belt-curves via page beltAnalysis
- dk-579c663d page-owned mergeChecks
- dk-dd350926 test.js split (tests/transforms|merge|sprites|overlays.test.js; plan docs/plans/test-split.md)

## Queue for the next lead (in order)
1. dk-9fcce671 (P2): move stable design/gotchas out of CLAUDE.md into docs/ARCHITECTURE.md / GOTCHAS.md, leave links. Docs-only, light.
2. dk-d53b6d72 (P1): tools/render/render.js duplicates render-png.js placement. Prior analysis (docs/plans/tools-consolidation.md slice 6): full migration is NOT output-preserving (raw metadata 4-decimal vs page sprites 3-decimal; renderers differ in bounds/curves/wires). Size it first; options: delete render.js if superseded (check README/docs use), else the safe drawRank() swap, else a pointer comment and leave open.
3. dk-8cbcf9f6 (P2): two path resolvers (extract-sprites.ps1 vs build-recipe.js); low priority, languages can't share code; may be closeable as won't-fix with a cross-reference comment.
- Deferred: dk-06d6670a (entity inventory x4). Needs a Factorio install / --dump-data to regenerate and byte-compare; none on Valhalla. Note is on the item; plan slice 5 in docs/plans/tools-consolidation.md.

## Process notes
- Pattern per item: Plan: block, developer-light (Sonnet) in worktree under C:\Users\dirty\projects\.worktrees\factorio-bp\, fast gate `node test.js`, byte-compare tool output vs main checkout, sign-off via `node ~/.claude/hooks/usage/cli.js review-launch codex-review --repo <wt> --prompt-file <f> --output-file <o>` (prompt = review-signoff agent body + BRIEF; the output must be a readable report; behavioural claims need a named plan + validator report file in the repo or sign-off FAILs), then `git merge --ff-only`, `gate-cli.js clear .`, push, remove worktree/branch, `dk set <id> --status done` and commit docs/items.
- Hook warnings "Outcome plan has no baseline" are false triggers for plans stating `Validation: none (refactor...)`.
- Uncommitted untracked scratch in main: .tmp/, docs/plans/tools-consolidation.md.events.jsonl/.job.json (launcher artifacts; don't commit).
- Sign-off reviewers fail on stale STRUCTURE.md debt bullets and doc counts: update STRUCTURE.md/CLAUDE.md in the same slice.
