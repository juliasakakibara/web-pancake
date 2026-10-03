# Tokens — source, generation, and the emitted names

`source-tokens.json` (DTCG) is the single source of truth. `theme.css`
is **generated** from it by `scripts/build-tokens.js` — never edit
`theme.css` by hand, and never add tokens anywhere but
`source-tokens.json` (new tokens are owner-approved, then registered in
the Figma plugin via `PLUGIN-HANDOFF.md`).

## How a source path becomes a CSS custom property

```
--lb-  +  path segments joined with "-"  ,  underscores become hyphens
```

Examples:

| Source path (JSON)        | Emitted custom property     |
|---------------------------|-----------------------------|
| `size.4x`                 | `--lb-size-4x`              |
| `size.0_5x`               | `--lb-size-0-5x`            |
| `size.1_5x`               | `--lb-size-1-5x`            |
| `size.3_5x`               | `--lb-size-3-5x`            |
| `border-width.medium`     | `--lb-border-width-medium`  |
| `action.bg-primary-default` | `--lb-action-bg-primary-default` |

The three `size` keys with underscores (`0_5x`, `1_5x`, `3_5x`) are the
only places the spellings differ — DTCG keys use `_` for the half
steps, the emitted names use `-`. **Always write the hyphen form in
CSS.** There is deliberately no double emission: one JSON path maps to
exactly one custom property (every generated `var()` reference resolves
to the hyphen name, and the in-browser theme editor regenerates root
declarations at runtime with the same transform — a second spelling
would silently diverge on edited themes).

## Why a wrong spelling fails silently

`var(--lb-size-0_5x)` (or any undefined custom property) inside
`calc()` or a shorthand doesn't error — it makes the **whole
declaration** invalid at computed-value time, so the rule just
disappears. If a spacing or size rule mysteriously does nothing, check
the token spelling against this table first.

## Files

- `source-tokens.json` — DTCG source of truth (L1 primitives, L2
  semantic, L3 component tiers; L2/L3 hold only references, never raw
  values).
- `theme.css` — generated output. Light is the `:root` default; dark is
  the `[data-theme="dark"]` block plus an OS-preference block.
- `fonts.css` — font faces.
- `PLUGIN-HANDOFF.md` — the relay ledger to the Figma plugin and
  component library.
- `CONTRAST.md` — measured contrast documentation.
