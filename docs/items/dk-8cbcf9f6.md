---
id: dk-8cbcf9f6
type: task
created: 2026-10-05
status: todo
since: 2026-10-05
area: structure
priority: P2
rank: t
parent:
fixes: []
blocked_by: []
relates: []
---
# Two path-resolver implementations: extract-sprites.ps1 and build-recipe.js

From BACKLOG.md (2026-09-22 baseline structural review, P2)

- **`tools/extract-sprites.ps1:35-57` and `tools/build-recipe.js:47-60`** — two implementations
  of resolving a mod-relative path to a direct file or cached zip entry, one PowerShell, one JS.
  **Correction:** a Claude lens claimed `extract-entities.ps1` was a third copy; Codex
  disagreed — it consumes an already-resolved recipe and does not repeat mod-reference parsing.
  Low priority; Node and PowerShell cannot share code directly.
