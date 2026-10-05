# GOTCHAS — factorio-bp

Non-obvious traps, flat at the repo root like the rest of this project's docs.

- `tools/` being at 16 files is not accretion: git history shows all 16 arrived in the initial
  import. It's the directory's original shape, not drift — still worth splitting (see above), but
  not a sign of neglect.
- **Codex confirmed the book
  behaviours genuinely differ**: `index.html`'s `bpOf()` rejects books, `used-dirs.js` processes
  all top-level blueprints, and `belt-curves.js`/`render.js`/`gridpos.js` each silently select
  the first. This is structural debt **with a latent correctness bug** in the developer tools —
  valid book input produces inconsistent or silently partial results depending on which tool
  runs it.
