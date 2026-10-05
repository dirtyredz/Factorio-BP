---
id: dk-b3cde9c5
type: task
created: 2026-10-05
status: todo
since: 2026-10-05
area: structure
priority: P1
rank: z
parent:
fixes: []
blocked_by: []
relates: []
---
# tools/belt-curves.js:26: reimplements beltCurves() from index.html

From BACKLOG.md (2026-09-22 baseline structural review, P1)

- **`tools/belt-curves.js:26`** (from Codex) — the diagnostic independently implements the same
  belt-neighbor algorithm as `beltCurves()` in `index.html`, so it can disagree with the product
  while appearing to validate it.
  **Direction:** load the page's `beltCurves()` and keep this script responsible only for
  diagnostic formatting.
