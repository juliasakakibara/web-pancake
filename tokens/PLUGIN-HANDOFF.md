# Plugin Handoff — Tokens Pending Plugin-Side Registration

**Status (trued up 2026-09-15, owner-confirmed)**: All plugin-side work is DELIVERED through plugin v1.0.3 (live on Community 2026-09-02) and the Figma library is PUBLISHED through the second-accent republish (+16 variants, 2026-09-02) — items 1–30 closed. **Open queue is library-only**: 🔵 items 27 (toast neutral+action), 31 (header active indicator), 32 (segmented inset-ring parity check), 34 (Lightbox set), 36 (stepper dots). 🟢 items 12–14/33/35 are mapping references / code-side only — no action unless a build reveals a gap. **No new colour tokens are planned** — components build entirely from existing L2/L3 (user decision 2026-05-27); new tokens get minted ONLY if a built component looks visually off, and then only via the plugin.

**Latest update**: 2026-09-15 (ledger trued: items 11/16/29/30 marked ✅ per owner; items 31–36 appended from the v1.2.0–v1.4.0 releases)
**First created**: 2026-05-03

---

## What this document is

A complete spec for the next Figma plugin chat session. Everything listed here is **already in `tokens/source-tokens.json`** and **already in use across letbe-ds components**. The plugin is the only side that doesn't know about these tokens yet — it needs them registered so that:

1. Re-exports from the plugin don't strip these tokens
2. The plugin's UI lets the user see/edit them
3. The plugin's variable bindings can reference them in Figma component instances

**Rule (memory: `wow_letbe_plugin_vs_ds_separation.md`)**: never modify the Figma plugin from a letbe-ds session. Open a separate chat in `/home/sirdr/ai-projects/letbe/letbe-tokens-figma/` and point the assistant at this document.

---

## Status legend

- ⬜ **Not started** — plugin chat hasn't picked up the item yet
- ⏳ **In progress** — being worked on in the plugin session
- ✅ **Done** — registered in plugin; subsequent letbe-ds re-exports preserve the token
- 🟢 **No plugin work needed (yet)** — the component set builds from existing tokens. Listed here only as a mapping reference. Flips to ⬜ ONLY if a built component reveals a genuine token gap that can't be served by what exists.

When you finish an item in the plugin chat, change the status here (commit lives in letbe-ds repo) so future sessions know what's left.

| # | Item | Status |
|---|---|---|
| 1 | Two new L1 hue palettes (orange, cyan) | ✅ |
| 2 | New L1 size primitive — `size.theme` | ✅ |
| 3 | New L2 — `border-width.action` | ✅ |
| 4 | New L2 "Extras" sidebar category — `data.1..8` and `code.1..8` | ✅ |
| 5 | Twelve new L3 action tokens — danger button (CORRECTED, see below) | ✅ |
| 6 | New L2 "Stroke" sidebar category — `stroke.icon` | ✅ |
| 7 | L2 status intensity tokens — `bg/border-{success,warning,danger,info}-{muted,subtle}` + `fg-{...}-muted` | ✅ |
| 8 | Four new L2 tokens for tier-clean danger button + field hover — `bg.danger-bold`, `bg.danger-boldest`, `border.emphasis-bold`, `fg.inverse-bold` | ✅ |
| 9 | L2 vocabulary refactor — rename 10 tokens, retire `emphasis`/`bold`/`boldest` suffixes in favour of canonical `strong`/`bolder` intensity scale + introduce `bg.inverse` role; fix dark-mode `border.muted` invisibility (collapse to `neutral.800`, same as `border.default`) | ✅ |
| 10 | Typography refactor — phase 1: per-role family mapping + `font.family.{1,2,3}` numbered slots + `$modes.S/M/L` responsive blocks on all L2 typography tokens. Slot 3 (`Roboto Mono`) now wired into components. JSON shape is plugin-ready for Figma variable modes. | ✅ |
| 11 | Textarea → Input variant merge — fold the standalone Textarea Figma component into the Input component set as a `multiline` variant. letbe-ds side already shipped: `.lb-input--multiline` modifier replaces `.lb-textarea`. | ✅ (library published; owner-confirmed 2026-09-15) |
| 12 | Media Player — **no new colour tokens**; builds from existing L2/L3 (mapping below). One open NON-colour question: 44px mobile touch target. | 🟢 |
| 13 | Timeline — **no new colour tokens**; builds from existing L2/L3 (mapping below). | 🟢 |
| 14 | AI Chat — **no new colour tokens**; bubbles bind directly to existing L2 (mapping below). | 🟢 |
| 16 | Two new L3 surface tokens — cutout/separator rings — `surface.border-cutout`, `surface.border-cutout-elevated` | ✅ 2026-08-05 |

---

## What you're adding to the plugin

### 1. Two new L1 hue palettes

**Path in JSON**: `primitives.orange` and `primitives.cyan`
**Format**: 11 stops each (50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950)
**Same shape** as the existing palettes (red, green, yellow, blue, violet, neutral)

**Why**: filled the two largest gaps in the existing 6-hue wheel (red 15° → yellow 72° → green 152° → blue 255° → violet 295°). Orange (45°) and cyan (205°) complete an 8-hue colour-blind-friendly rotation matching ColorBrewer Set1 conventions. Used by the L2 categorical groups `data` and `code`.

**Hex values currently in `tokens/source-tokens.json`**: derived approximations from the OKLCH descriptions. The plugin's OKLCH solver will produce slightly different hexes for the same `oklch(L C H)` description — let the plugin recalculate and overwrite with the canonical values. The OKLCH descriptions in the JSON are authoritative.

**OKLCH spec**:

| Stop | Orange (45° hue) | Cyan (205° hue) |
|---|---|---|
| 50  | oklch(0.970 0.010 45) | oklch(0.970 0.012 205) |
| 100 | oklch(0.940 0.025 45) | oklch(0.940 0.028 205) |
| 200 | oklch(0.895 0.058 45) | oklch(0.895 0.060 205) |
| 300 | oklch(0.840 0.100 45) | oklch(0.840 0.100 205) |
| 400 | oklch(0.740 0.155 45) | oklch(0.740 0.125 205) |
| 500 | oklch(0.620 0.165 45) — Orange base | oklch(0.620 0.140 205) — Cyan base |
| 600 | oklch(0.500 0.150 45) | oklch(0.500 0.125 205) |
| 700 | oklch(0.380 0.125 45) | oklch(0.380 0.105 205) |
| 800 | oklch(0.265 0.085 45) | oklch(0.265 0.075 205) |
| 900 | oklch(0.178 0.050 45) | oklch(0.178 0.045 205) |
| 950 | oklch(0.115 0.028 45) | oklch(0.115 0.025 205) |

### 2. New L1 size primitive — `size.theme`

**Path**: `primitives.size.theme`
**Value**: `1.6px`
**Type**: dimension

Sits inside the existing `size` group. Theme-tunable interactive stroke width. Read at runtime by the theme editor's interactive-stroke knob; written into the L2 `border-width.action`. **This and #3 below are the historical exceptions you mentioned earlier — they were added in letbe-ds before the plugin knew about them.**

### 3. New L2 — `border-width.action`

**Path**: `semantic.border-width.border-width.action`
**Value reference**: `{size.theme}`
**Type**: dimension

Sits inside the existing `border-width` group alongside `none`, `thin`, `medium`. Interactive stroke width referenced by the L3 action component tokens (`action.border-*-default/hover/etc.`).

**Tier integrity note** — while you're in this group, also re-point the three pre-existing siblings off raw values onto the L1 size primitives (HARD RULE: L2/L3 never hold raw values). Already done in `letbe-ds/tokens/source-tokens.json`:

| Token | Old (raw) | New (reference) |
|---|---|---|
| `border-width.none`   | `0px` | `{size.0}` |
| `border-width.thin`   | `1px` | `{size.hairline}` |
| `border-width.medium` | `2px` | `{size.0_5x}` |

The plugin's own export was the original source of these raw values, so this fix only sticks if you make the same change plugin-side. Same numeric output (0/1/2px), just routed through the L1 primitives.

### 4. New L2 "Extras" sidebar category — `data.1..8` and `code.1..8`

**JSON paths**: `semantic.<theme>.data.<n>` and `semantic.<theme>.code.<n>` for `<theme>` ∈ {light, dark}.

**Sidebar UI**: in the plugin's Theme → Color L2 view, the user currently sees three category headers: Foreground (`fg.*`), Background (`bg.*`), Border (`border.*`). Add a **fourth header called "Extras"** that groups the new `data` and `code` tokens. The Extras name is intentionally generic — covers both data viz and code highlighting today, leaves room for future categorical-color edge cases.

**`data.N`** — categorical chart palette. One token per series, used as fill / color / stroke / background depending on the consumer's need. Single semantic axis (categorical identity), not split into fg/bg.

| Token | Light value | Dark value | Hue |
|---|---|---|---|
| `data.1` | `{violet.500}` | `{violet.400}` | violet (matches brand) |
| `data.2` | `{blue.500}`   | `{blue.400}`   | blue |
| `data.3` | `{green.500}`  | `{green.400}`  | green |
| `data.4` | `{yellow.500}` | `{yellow.400}` | yellow |
| `data.5` | `{red.500}`    | `{red.400}`    | red |
| `data.6` | `{neutral.500}`| `{neutral.400}`| neutral |
| `data.7` | `{orange.500}` | `{orange.400}` | orange (NEW palette) |
| `data.8` | `{cyan.500}`   | `{cyan.400}`   | cyan (NEW palette) |

**`code.N`** — code highlighting palette. Same 8 hues as `data.*` but darker stops because code-on-tinted-bg has different contrast targets. Currently consumed: `code.1` (keyword), `code.2` (number/function), `code.3` (string), `code.4` (attr), `code.5` (tag). `code.6..8` reserved.

| Token | Light value | Dark value | Role |
|---|---|---|---|
| `code.1` | `{violet.600}` | `{violet.300}` | keyword |
| `code.2` | `{blue.600}`   | `{blue.300}`   | number / function |
| `code.3` | `{green.600}`  | `{green.300}`  | string |
| `code.4` | `{yellow.600}` | `{yellow.300}` | attribute |
| `code.5` | `{red.600}`    | `{red.300}`    | tag |
| `code.6` | `{neutral.600}`| `{neutral.300}`| reserved |
| `code.7` | `{orange.600}` | `{orange.300}` | reserved |
| `code.8` | `{cyan.600}`   | `{cyan.300}`   | reserved |

### 5. Twelve new L3 action tokens — danger button

**Path**: `component.action.{bg,fg,border}-danger-{default,hover,pressed,disabled}` (12 tokens total)

**Why**: the `.lb-btn--danger` and `.lb-icon-btn--danger` CSS classes (used by Modal's destructive variant) referenced these tokens but they didn't exist — left over from an earlier "danger button removed" cleanup that wiped the tokens but not the CSS rules. Re-introducing them fully so the destructive button in Modal renders red again.

> ⚠️ **CORRECTED 2026-05-09** — the original spec for this item bound several tokens directly to L1 primitives (`{red.500}`, `{red.600}`, `{red.700}`, `{neutral.50}`), which violates the HARD RULE that L3 tokens NEVER skip L2. The plugin chat caught the violation during Item 5 registration. Bindings below now route through L2 (some via new tokens added in Item 8). Same hex output in light theme; dark theme correctly produces lighter saturated reds on hover/pressed (was a UX regression with the old direct-L1 spec).

| Token | $value |
|---|---|
| `bg-danger-default`      | `{bg.danger}` (= red.500) |
| `bg-danger-hover`        | `{bg.danger-bold}` (NEW L2 — see Item 8) |
| `bg-danger-pressed`      | `{bg.danger-boldest}` (NEW L2 — see Item 8) |
| `bg-danger-disabled`     | `{bg.disabled}` |
| `fg-danger-default`      | `{fg.inverse-bold}` (NEW L2 — see Item 8) |
| `fg-danger-hover`        | `{fg.inverse-bold}` |
| `fg-danger-pressed`      | `{fg.inverse-bold}` |
| `fg-danger-disabled`     | `{fg.inverse-muted}` |
| `border-danger-default`  | `{bg.danger}` (mirrors primary's pattern: border tracks bg) |
| `border-danger-hover`    | `{bg.danger-bold}` |
| `border-danger-pressed`  | `{bg.danger-boldest}` |
| `border-danger-disabled` | `{border.disabled}` |

Same shape as the existing `primary` / `secondary` / `ghost` / `link` groups, but routed through L2 for tier integrity.

### 6. New L2 "Stroke" sidebar category — `stroke.icon`

**JSON path**: `semantic.stroke.stroke.icon`

**Sidebar UI**: in the plugin's Theme → Size L2 view, the user currently sees three category headers under Size: **Radius**, **Component size**, **Border**. Add a **fourth header called "Stroke"** that holds the new `stroke.icon` token. Same shape as the existing Border (= border-width) group: a single L2 group whose values reference L1 size primitives.

**Why**: `--lb-icon-stroke-width` was previously a one-off CSS variable defined in `components.css` outside the token tree. The Theme editor's Stroke Icon knob mutated it inline but it had no JSON home, so the value never round-tripped. Renaming to `--lb-stroke-icon` and giving it a proper L2 home (`stroke.icon`) puts it inside the same architecture as the other size knobs (Stroke Action via `border-width.action`, Stroke Decorative via `border-width.thin`).

| Token | $value |
|---|---|
| `stroke.icon` | `{size.theme}` |

Default points at `size.theme` so icons follow the brand's Action stroke thickness (the "Brand" preset in the editor). Tunable by the editor: picking Thin / Brand / Bold relinks the L2 token to `size.hairline` / `size.theme` / `size.0_5x` respectively. Same relink pattern as `border-width.thin`.

### 7. L2 status intensity tokens — `bg/border` × {success,warning,danger,info} × {default, -muted, -subtle}

**JSON paths**: `semantic.{light,dark}.{bg,border,fg}.{success,warning,danger,info}{,-muted,-subtle}`

**Sidebar UI**: existing status colours under the Color L2 view stay in their current slots (fg / bg / border categories). For each status (success / warning / danger / info) and for each axis (bg + border), there are now THREE intensity tiers visible to the user:

- `bg.success` (saturated default, e.g. green.500)
- `bg.success-muted` (mid tint, e.g. green.200 light / green.800 dark)
- `bg.success-subtle` (soft tint, e.g. green.50 light / green.950 dark — this was the OLD `bg.success` value)

For `fg`, only TWO tiers exist (default + muted); `fg-X-subtle` was deliberately NOT added because text colour at the 3rd intensity step would fail WCAG AA against neutral page bg. (Decision documented in expert-ds knowledge and `feedback_l2_vs_l3_decision.md`.)

**Why**: the previous one-tier-per-status model meant components like Banner, Toast, and Badge all consumed the same soft-tint `bg.success` value. There was no way to express a "saturated success bg" (for filled status bars, saturated badges, or attention-grabbing toast variants) without inventing a new token at the L1 level — which would violate the L1-NEVER-from-L3 rule. Extending L2 with intensity tiers gives every consumer the correct semantic name for what they actually want.

| Property | Light values | Dark values |
|---|---|---|
| `bg.success`           | `{green.500}`  | `{green.500}` |
| `bg.success-muted`     | `{green.200}`  | `{green.800}` |
| `bg.success-subtle`    | `{green.50}`   | `{green.950}` |
| `fg.success`           | `{green.600}` (unchanged) | `{green.400}` (unchanged) |
| `fg.success-muted`     | `{green.500}`  | `{green.500}` |
| `border.success`       | `{green.500}`  | `{green.500}` |
| `border.success-muted` | `{green.300}`  | `{green.700}` |
| `border.success-subtle`| `{green.200}`  | `{green.800}` |

(Same shape × warning, danger, info — see `tokens/source-tokens.json` for full set.)

**Migration note for plugin authors**: the OLD value of `bg.success` (`{green.50}`) is now `bg.success-subtle`. The OLD value of `border.success` (`{green.300}`) is now `border.success-muted`. The default-suffix tokens (`bg.success`, `border.success`) now hold the saturated `green.500`. All Banner/Toast/Badge consumers in letbe-ds were migrated to the `-subtle` / `-muted` variants in the same commit. The plugin's existing `bg.success` token entry needs its value updated AND the new `-muted` / `-subtle` keys added.

### 8. Four new L2 tokens for tier-clean danger button + field hover

Added to letbe-ds in commit `b36545c` (2026-05-09) as part of fixing the L3→L1 violations in Item 5. The plugin needs these registered so future re-exports preserve them.

**JSON paths**:
- `semantic.{light,dark}.bg.danger-bold`
- `semantic.{light,dark}.bg.danger-boldest`
- `semantic.{light,dark}.border.emphasis-bold`
- `semantic.{light,dark}.fg.inverse-bold`

**Sidebar UI**: each new token sits inside its existing parent category (Color L2 view → bg / border / fg). No new sidebar headers needed.

**Values**:

| Token | Light value | Dark value | Why |
|---|---|---|---|
| `bg.danger-bold`     | `{red.600}` | `{red.400}` | Hover state for filled danger button. Mirrors `bg.accent-bold` shift pattern: light theme goes darker, dark theme goes lighter (more luminous against dark page bg). |
| `bg.danger-boldest`  | `{red.700}` | `{red.300}` | Pressed state. Same pattern, one step further. |
| `border.emphasis-bold` | `{neutral.500}` | `{neutral.500}` | Field hover border. Theme-stable mid-step that gives a clear contrast bump from resting (`border.emphasis` = neutral.400 light / neutral.700 dark; both move toward neutral.500 on hover). |
| `fg.inverse-bold`    | `{neutral.50}` | `{neutral.50}` | Theme-stable light fg for use on saturated/bold colored backgrounds. **This token does NOT theme-flip** — distinct from its siblings `fg.inverse` (theme-flipping for inverted-luminance surfaces like the tooltip) and `fg.inverse-muted` (theme-flipping muted variant for disabled-on-neutral states). |

**Why `fg.inverse-bold` (theme-stable) and not just bind to `fg.inverse` (theme-flipping)?**

`fg.inverse` is correctly theme-flipping for tooltip-style inverted-luminance surfaces — light text on dark island in light mode, dark text on light island in dark mode. But for **saturated colored bgs** (red.500, violet.500, etc.) the bg is theme-stable (same hex in both themes), so the text on it must also be theme-stable (always light). Binding the danger button to `fg.inverse` produced black text on saturated red in dark mode — both poor contrast and aesthetically wrong. `fg.inverse-bold` solves this cleanly while staying inside the established `fg.inverse-*` naming family.

**Document the family behavior in plugin descriptions**:
- `fg.inverse` — theme-flips for inverted surfaces
- `fg.inverse-muted` — theme-flips, muted variant
- `fg.inverse-bold` — **theme-stable** (neutral.50 both themes), for saturated/bold colored bg

**Future follow-up tracked in letbe-ds (separate session)**: migrate `action.fg-primary-*`, `.lb-card__badge`, `.lb-tab__badge`, and the `.lb-card--media-bg` `#fff` hardcode to use `{fg.inverse-bold}` too. Fixes the latent dark-mode contrast issues on the primary button and removes the existing `#fff` workaround in `components.css`.

---

## Why no fg / bg axis on `data` and `code`

The user's first instinct was `fg-data-N` + `bg-data-N` (16 tokens). After analysis we landed on flat `data.N` (8 tokens):

- A bar chart `<rect fill="…">` is neither `fg` nor `bg` in CSS terms — it's `fill`. Forcing it into the role-on-surface axis (which `fg.*`/`bg.*`/`border.*` represent) is a category error.
- Categorical palettes are conventionally named flat (`chart-1`, `categorical-color-1`) and are not prefixed with fg/bg.
- `data.N` is its own semantic axis (categorical identity), not part of the role-on-surface axis. Treating it as such keeps both axes clean.

For shading variants (lighter/darker shade of the same series), the plan is to use opacity for transient effects (hover, area fills) and add explicit per-hue stops (`data.1-emphasis`, `data.1-muted`) IF a real component asks. Don't pre-build.

---

## Verification after plugin update

After registering the new tokens in the plugin and re-exporting:

1. **Diff the new export against current `tokens/source-tokens.json`** — only differences should be:
   - Plugin metadata (variable IDs, library refs, etc. — expected)
   - OKLCH solver's hex value refinements for orange/cyan stops (use the plugin values; the in-JSON hexes are derived approximations)
   - Optional `$description` text edits if the plugin has nicer descriptions

2. **Re-import the export to letbe-ds**, then run:
   ```
   node scripts/build-tokens.js
   ```
   `tokens/theme.css` should regenerate with all 57 expected lines (22 orange + cyan stops, 1 size.theme, 1 border-width.action, 8 data × 2 themes, 8 code × 2 themes, 1 stroke.icon).

3. **Open `http://localhost:8080/colors/`** and verify Orange + Cyan palettes display correctly with both light and dark theme.

4. **Open `http://localhost:8080/charts/`** and verify the 8-token data palette swatch grid renders. Switch to dark theme — colors should bump one stop lighter.

5. **Open `http://localhost:8080/code-block/`** and verify syntax highlighting works (keyword/string/number colors visible). Toggle dark theme — colors should switch.

6. **Test export** from the theme editor (cog icon → Export tokens). Diff the downloaded JSON against the current `source-tokens.json` — only difference should be metadata. The new tokens (`data.1`, `code.1`, `orange.500`, `cyan.500`, `size.theme`, `border-width.action`, `stroke.icon`) must all appear in the export output.

---

## Outstanding (separate decisions)

These exist in letbe-ds but were NEVER in the Figma plugin and are NOT part of this handoff. Worth deciding on in the plugin session:

- **`brand.*` L1 palette** — runtime-generated by the theme editor when the user picks a brand color. Currently the plugin has no concept of this palette. Options:
  - Leave as-is: brand exists only in user exports, plugin source stays palette-free for `brand`.
  - Add a default `brand` palette to plugin source (e.g. = violet), so the namespace exists in the plugin's variable model.
  - Recommended: leave as-is. The runtime-only model has worked fine; baking a default into plugin source adds confusion without payoff.

---

## Files modified in letbe-ds (for context)

- **`tokens/source-tokens.json`** — primitives.orange, primitives.cyan, primitives.size.theme, semantic.border-width.border-width.action, semantic.{light,dark}.data.1-8, semantic.{light,dark}.code.1-8, **semantic.stroke.stroke.icon (new — item 6)**, twelve `component.action.{bg,fg,border}-danger-*` (item 5) added.
- **`tokens/theme.css`** — regenerated. Do not edit manually.
- **`scripts/build-tokens.js`** — extended `COLOR_HUE_PALETTES` (+ optional `brand`), and emits the new `L2 — Stroke semantic` block (`semantic.stroke.stroke.*`).
- **`js/token-applier.js`** — extended palette list (orange + cyan + optional brand); L2 fg/bg/border loop also iterates `data` + `code`; `semGroups` includes `stroke.stroke` so `--lb-stroke-icon` is emitted; **import sweeps ALL inline `--lb-*` so the imported file IS the new "zero overrides" state**.
- **`js/token-exporter.js`** — extended `L1_GROUPS`, `L2_ROLE_GROUPS`, `SEMANTIC_NAMED_GROUPS` (+ stroke); typography `--lb-t-*` composites now round-trip via a `__composite__` path marker in `setAtPath`; new public `clearImport()` API.
- **`js/theme-editor.js`** — Factory reset uses `location.reload()` for guaranteed canonical state; **Save as baseline** button (folds inline overrides into the imported stylesheet); aria-hidden / inert kept in sync with `.theme-editor--open`; help accordion above the knobs; `--lb-icon-stroke-width` → `--lb-stroke-icon` rename.
- **`js/gallery-layout.js`** — fires `lb-tokens-imported` event after a successful import so the editor resets knob state + UI.
- **`components/components.css`** — replaced 24 invented tokens with system-token references; `--lb-icon-stroke-width` → `--lb-stroke-icon` (now sourced from `semantic.stroke.stroke.icon` via theme.css instead of the orphan `:root` declaration).
- **`components/theme-editor.css`** — help-accordion styles + `.theme-editor__help`.
- **`components/meta.json`**, **`icons/index.html`** — `--lb-icon-stroke-width` → `--lb-stroke-icon` (docs).
- **`js/lb.js`** — `SHARED_DATA_PALETTE_VARS` updated to use `--lb-data-1..8`; `_dataGap()` reads `--lb-size-0-5x` instead of the deleted `--lb-data-gap`.
- **`colors/index.html`** — Orange + Cyan palette sections added.
- **HTML demo pages** (sparkline, donut, dashboard, bar-list, bar-chart, charts) — `--lb-data-series-N` → `--lb-data-N`.

All commits push to the `m1ha1l0/letbe-ds` GitHub repo. The plugin session can clone this repo to inspect what consuming code expects.

---

## 9. L2 vocabulary refactor (2026-05-11)

Foundational naming change. Output of a multi-turn audit triggered by dark-mode visibility bugs that revealed inconsistent suffix semantics across the L2 layer.

### The new L2 vocabulary

**Intensity scale (single axis, signed):**

| Suffix | Position | Meaning |
|---|---|---|
| `subtle` | -2 | Least present (softest tint, faintest border) |
| `muted` | -1 | Less present than default |
| (none) | 0 | Baseline for the role |
| `strong` | +1 | More present than default |
| `bolder` | +2 | Most present (saturated, highest contrast) |

**Same suffix means the same direction across every axis.** `muted` always = -1. `strong` always = +1.

**HARD RULE — L2 NEVER carries state vocabulary.** State suffixes (`-hover`, `-pressed`, `-focus`, `-active`, `-disabled`, `-selected`, `-error`) are FORBIDDEN at L2. They only appear at L3. The plugin must enforce this when listing or editing L2 tokens. (Documented in `ds-knowledge/token-do-and-dont.md`.)

### Rename table

10 token renames + 1 dark-theme value fix. All changes are **name only** — hex output unchanged in light theme; dark `border.muted` value bumped.

**bg axis:**

| Old name | New name | Reason |
|---|---|---|
| `bg.subtle` | `bg.strong` | Was +1 going UP, mis-named with DOWN-suffix |
| `bg.muted` | `bg.bolder` | Was +2 going UP, mis-named with DOWN-suffix |
| `bg.emphasis` | `bg.inverse` | Role rename — pairs with `fg.inverse` (tooltip surface) |
| `bg.accent` | `bg.accent-subtle` | Old soft accent moves to the -2 position |
| `bg.accent-emphasis` | `bg.accent` | Saturated default IS the accent |
| `bg.accent-bold` | `bg.accent-strong` | Intensity-named, not state-named |
| `bg.accent-boldest` | `bg.accent-bolder` | Intensity-named, not state-named |
| `bg.danger-bold` | `bg.danger-strong` | Same pattern |
| `bg.danger-boldest` | `bg.danger-bolder` | Same pattern |

**fg axis:**

| Old name | New name |
|---|---|
| `fg.inverse-bold` | `fg.inverse-strong` |

**border axis:**

| Old name | New name | Reason |
|---|---|---|
| `border.emphasis` | `border.strong` | Asymmetric noun → adjective |
| `border.emphasis-bold` | `border.bolder` | Drop the `bold` collision with `font-weight` |

### Dark-theme value fix (NOT a rename; an actual value change)

| Token | Light dark-theme value (old) | Light dark-theme value (new) | Reason |
|---|---|---|---|
| `border.muted` | `{neutral.900}` | `{neutral.800}` | Old value was invisible at 1px against `bg.default` (neutral.950, only one stop away). New value collapses to same L1 as `border.default` in dark theme. |

### Sidebar UI impact

- The plugin's L2 sidebar should list `subtle / muted / default / strong / bolder` in this order under each axis (bg / fg / border).
- `bg.inverse` sits alongside other neutral bg tokens (NOT as a `strong/bolder` variant — it's a role token, theme-flipping, paired with `fg.inverse`).
- `bg.accent-subtle / accent-muted / accent / accent-strong / accent-bolder` lay out as a 5-step intensity ladder.
- `bg.danger / -muted / -subtle / -strong / -bolder` same shape (status row with both directions).

### Files modified in letbe-ds

- `tokens/source-tokens.json` — 10 L2 keys renamed × 2 themes = 20 entries renamed; 1 dark-theme value bump; L3 alias targets updated to point at new L2 names.
- `tokens/theme.css` — regenerated.
- `scripts/build-tokens.js` — header comment updated to use new names.
- `components/components.css` — all consumer CSS bindings updated (~50 bindings, mostly bg-subtle/bg-muted family).
- `components/gallery.css` + `components/theme-editor.css` — bindings updated.
- `js/theme-editor.js` — brand-derivation map keys + `bgHexFor()` calls + comments updated.
- HTML demo pages — animation, charts, command-palette, dashboard, donut, modal, opacity bindings updated.

### Migration note for plugin authors

Find/replace must be **whole-token-name** (word boundary), not substring. `bg-subtle` is now `bg-strong`, but `fg-subtle` and `bg-success-subtle` STAY (those were correctly named DOWN-direction). Same for `muted`: `bg-muted` → `bg-bolder`, but `fg-muted`, `border-muted`, `bg-success-muted` all STAY.

The collision case to handle carefully: `bg-accent` (soft) → `bg-accent-subtle`, AND `bg-accent-emphasis` (saturated) → `bg-accent`. Atomic swap; the old `bg-accent` name has TWO different meanings in pre/post state. Use a placeholder during migration or rename in two passes.

### Slicing in letbe-ds

The refactor shipped as 8 atomic commits (one per rename group):
- `0e4750f` — Slice 1: dark border-muted value fix
- `0076986` — Slice 2a: bg-emphasis → bg-inverse
- `36aa690` — Slice 2b: bg-subtle/bg-muted → bg-strong/bg-bolder
- `fcbb228` — Slice 2c: bg-accent atomic swap
- `da529d0` — Slice 2d: bg-accent-bold/boldest → bg-accent-strong/bolder
- `cd2925f` — Slice 2e: bg-danger-bold/boldest → bg-danger-strong/bolder
- `3b85871` — Slice 2f: fg-inverse-bold → fg-inverse-strong
- `e69d5ce` — Slice 2g: border-emphasis/emphasis-bold → border-strong/bolder

Plugin chat can replicate the same slicing or do it as one big rename — same end state.

---

## 10. Typography refactor — phase 1 (2026-05-13)

**Phase 1 = JSON shape only. Sizes unchanged.** The Figma plugin needs to mirror the new vocabulary so future re-exports preserve it AND so designers can use Figma variable modes for responsive typography.

This is intentionally a SMALLER refactor than originally scoped. A prior plan (DS-Expert spec) proposed rebuilding L1 with computed `base × ratio^n` step aliases replacing the 13 hand-tuned sizes. That attempt broke component rendering in dense UI and was reverted. The current phase keeps the hand-tuned sizes intact and just adds the architectural plumbing for per-role family swap and responsive modes. The "editor-controlled scale formula" goal remains future work.

### What changed in letbe-ds (3 atomic commits)

| Commit | Change |
|---|---|
| `3b888d8` | F1 — Per-role family mapping: every L2 composite token's `fontFamily` now references `{typography.family.<role>}` instead of `{font.family.sans}` |
| `e7c43d8` | F2 — Wire `--lb-font-family-mono` consumers to the new slot 3 (Roboto Mono) |
| `23b0312` | F4 — `$modes.S/M/L` on all 22 L2 typography tokens; legacy `$modes.mobile` renamed to `$modes.S`; M and L default to empty (inherit base) |

Also live (from earlier scaffolding commits `ed2ce4f` + `af9596f`, before the revert): the L1 primitives `font.family.{1,2,3}`, `font.base.{S,M,L}`, `font.scale-ratio.{S,M,L}`, and the L2 `semantic.typography.family.{role}` aliases. These are now ACTIVELY USED by the composite tokens.

### L1 typography primitives (final shape)

```
primitives.font.family.sans   — DEPRECATED, still present as shim. Same value as font.family.1.
primitives.font.family.1      — Primary family slot. Default: Inter.
primitives.font.family.2      — Secondary family slot. Default: Inter (= same as slot 1).
                                Reserved for action role when brand wants typographic distinction.
primitives.font.family.3      — Monospace family slot. Default: Roboto Mono.

primitives.font.base.S        — Mobile base font size. Default: 16px.
primitives.font.base.M        — Tablet base. Default: 16px.
primitives.font.base.L        — Desktop base. Default: 16px.

primitives.font.scale-ratio.S — Mobile type-scale ratio. Default: 1.25.
primitives.font.scale-ratio.M — Tablet. Default: 1.25.
primitives.font.scale-ratio.L — Desktop. Default: 1.25.

primitives.font.line-height-method  — Internal enum, default "4px-grid".
```

**NOTE on `base` and `scale-ratio`**: these primitives EXIST in the JSON and the build script emits step aliases (`--lb-font-size-step-{n2..8}`) derived from them. But L2 composite tokens currently DO NOT reference the step aliases — they still reference the hand-tuned `font.size.{xs..8xl}` chain. The step aliases are inert today; reserved for a future editor-controlled formula-driven typography option (phase 2, not in scope for plugin Item 10).

Plugin should register `font.family.{1,2,3}`, `font.base.{S,M,L}`, `font.scale-ratio.{S,M,L}`, and `font.line-height-method` as variables, but the values are display-only for now (until phase 2 wires them).

The deprecated `font.family.sans` shim will be removed when phase 2 lands; until then, it stays.

### L2 family aliases (the per-role mapping layer)

New L2 tokens under `semantic.typography.family.<role>`:

| Token | Default value | Used by |
|---|---|---|
| `typography.family.display` | `{font.family.1}` | display.{xs,s,m,l,xl} |
| `typography.family.heading` | `{font.family.1}` | heading.{s,m,l,xl} |
| `typography.family.body` | `{font.family.1}` | body.{xs,s,m,l,xl} |
| `typography.family.action` | `{font.family.2}` | action.{s,m,l} |
| `typography.family.label` | `{font.family.1}` | label.{s,m,l} |
| `typography.family.caption` | `{font.family.1}` | caption.{s,m} |

These aliases are the KNOB. Changing `typography.family.action.$value` from `{font.family.2}` to `{font.family.3}` instantly swaps every button/tab/link label to monospace. Composite tokens reference the alias, not the slot directly.

Plugin should register these as 6 fontFamily-type variables, each aliased to one of the family.N variables.

### $modes shape — S / M / L

Every L2 composite typography token now has the shape:

```json
"body": {
  "m": {
    "$type": "typography",
    "$value": {
      "fontFamily": "{typography.family.body}",
      "fontSize": "{font.size.m}",
      "fontWeight": "{font.weight.regular}",
      "lineHeight": "{font.line-height.m}",
      "letterSpacing": "{font.letter-spacing.normal}"
    },
    "$modes": {
      "S": {},
      "M": {},
      "L": {}
    }
  }
}
```

Rules:
- **Every L2 token has all three modes declared**, even if the override is empty `{}`.
- Empty `{}` means "inherit from `$value`". CSS skips emission for empty modes (no wasteful `@media :root {}` blocks).
- Properties override individually — a mode can override `fontSize` but inherit `fontFamily` from `$value`.

Currently populated overrides (8 tokens):
- `display.{xs,s,m,l,xl}.$modes.S` — shrinks each display size on mobile (was the legacy `$modes.mobile` block; renamed to S)
- `heading.{m,l,xl}.$modes.S` — shrinks each heading size on mobile

All other 14 tokens have all 3 modes empty (= same size at every viewport).

**Plugin needs to create 3 Figma variable modes — `S`, `M`, `L`** — on every L2 typography variable (or just the ones with non-empty overrides; depends on whether the plugin always declares all modes or only populated ones). Recommendation: always declare all three so the variable model is uniform; designers can override M or L from inside Figma without touching JSON.

### CSS breakpoints (for designer reference)

```
S: max-width 600px      (mobile)
M: 601px to 1023px      (tablet)
L: min-width 1024px     (desktop, default)
```

These match the design-system T-shirt sizing vocabulary used by spacing, radius, icon, etc.

### Sidebar UI impact

- **Family slots** (`font.family.{1,2,3}`): plugin sidebar should expose these as 3 pickers. The L1 vocabulary should not use the legacy `sans` name; that's the deprecated shim.
- **Family aliases** (`typography.family.<role>`): plugin sidebar should show 6 dropdowns (one per role), each picking which slot the role uses. UI label: "Display uses → Slot 1 / Slot 2 / Slot 3".
- **Mode picker**: typography section in Theme Studio should let the designer preview each variable mode (S/M/L).

### What is NOT in scope for plugin Item 10

These remain future work in letbe-ds (separate phase 2):

- Editor UI in letbe-ds for Google Fonts lazy-load picker
- Editor UI for live base/ratio mutation
- L2 composite tokens repointed to formula-derived `step` aliases (the `base × ratio^n` chain)
- Removal of the deprecated `font.family.sans` shim
- Removal of the hand-tuned `font.size.{xs..8xl}` primitives

When phase 2 lands, the plugin will receive a follow-up item documenting those changes.

### Files modified in letbe-ds (phase 1)

- `tokens/source-tokens.json` — 22 L2 composite `fontFamily` refs repointed; `$modes.S/M/L` shape added to all 22; legacy `$modes.mobile` renamed to `$modes.S` on 8 tokens.
- `scripts/build-tokens.js` — `MODE_BREAKPOINTS` extended with S/M/L mappings; empty `$modes` blocks now skipped at CSS emission; deprecation warning for legacy `mobile` mode usage.
- `tokens/theme.css` — regenerated.
- `components/components.css` + `gallery.css` — 2 direct `--lb-font-family-sans` refs renamed to `--lb-font-family-1`.
- `components/components.css` + `gallery.css` + `theme-editor.css` — 16 `--lb-font-family-mono` refs renamed to `--lb-font-family-3`.
- 9 HTML demo pages — `--lb-font-family-mono` → `--lb-font-family-3` (calendar, color-picker, command-palette, input, layout, list, modal, segmented, select).

### Migration note for plugin authors

This phase is ADDITIVE in spirit. The plugin's current handling of `font.family.sans` continues to work because the shim still resolves; the new `font.family.{1,2,3}` slots just join it. Same for `$modes.mobile` — the build script still accepts it as an alias of `$modes.S` with a deprecation warning.

Practically the plugin should:
1. Register the new L1 primitives (`font.family.{1,2,3}`, `font.base.{S,M,L}`, `font.scale-ratio.{S,M,L}`, `font.line-height-method`)
2. Register the new L2 family aliases (`typography.family.<role>` × 6)
3. Add 3 Figma variable modes (`S`, `M`, `L`) to the typography variable collection
4. Read `$modes.S/M/L` overrides on each L2 composite and write them as the per-mode values of the Figma variable
5. Treat the legacy `font.family.sans` as the same source as `font.family.1` during import to avoid drift (or just don't register `sans` at all and rely on the shim staying in JSON)

### Slicing in letbe-ds

3 atomic commits:
- `3b888d8` — F1: 22 L2 composite fontFamily refs repointed to `{typography.family.<role>}` aliases. Zero visual change.
- `e7c43d8` — F2: `--lb-font-family-mono` → `--lb-font-family-3` (25 refs across 12 files). Visible: monospace text now actually renders in Roboto Mono instead of browser-default.
- `23b0312` — F4: `$modes.S/M/L` shape uniform across all 22 L2 typography tokens. Build script S/M/L breakpoint mappings. Zero visual change.

Plugin chat can pick these up as one batch or three — same end state.

---

### 11. Textarea → Input variant merge (plugin-side component consolidation) ✅ DONE (library published; owner-confirmed 2026-09-15)

**Scope is Figma-component-only — no token / JSON changes.** Textarea was always 95% the same as Input (same fill / border / radius / focus / disabled tokens). letbe-ds-side has been consolidated: there is no more `.lb-textarea` class. A `<textarea>` element now uses `<textarea class="lb-input lb-input--multiline">`, sharing every token and state with `<input class="lb-input">`.

**What the plugin should do:**

1. Open the Input component set in Figma (the one with variants for size × state × icon slots).
2. Add a new **boolean variant property** named `multiline` (default `false`).
3. When `multiline = true`, the component should:
   - Use a `<textarea>` (or Figma's frame equivalent) instead of a single-line input
   - Min-height ~80px (matches `min-height: 5rem` in letbe-ds)
   - Vertical padding matches `var(--lb-size-2x)` (top + bottom) instead of single-line baseline
   - Resize behaviour: vertical-only handle visible
   - All other variant axes (size, state, error/success border, disabled) still apply on top
4. Delete the standalone Textarea Figma component once Input's `multiline=true` variant is bound to every existing Textarea consumer (page / instance) in Figma.

**Token bindings to verify on the new variant:**
- `bg`: `field-bg-default` / `field-bg-disabled` (already used by Input)
- `border`: `field-border-default` / `-focus` / `-error` / `-success` / `-disabled` (already used by Input)
- `fg`: `field-fg-default` / `-placeholder` / `-disabled` (already used by Input)
- `radius`: `radius-field`
- `border-width`: `border-width-action`
- Typography: `t-body-m` (default) or `t-body-s` (when combined with `size=small`)

**Why this is plugin-only:**

No new tokens were invented — the multiline variant consumes exactly the same field tokens Input already uses. The plugin's variable bindings carry over verbatim. The only change is a structural Figma one: one component instead of two.

**Files modified in letbe-ds (Item 11):**

- `components/components.css` — added `.lb-input--multiline` modifier; removed `.lb-textarea` + `.lb-textarea-field` rules (was 9 selectors)
- `textarea/index.html` — gallery page rewritten to use new variant pattern; sections mirror Input (Default / Sizes / States)
- `components/meta.json` — Textarea entry description updated to reflect Input-variant status

**Memory references:**

- `project_textarea_to_input_consolidation.md` — the parked work that drove this
- `feedback_letbe_ds_check_lb_js_first.md` — extend, don't fork

---

## 🟢 New component sets — existing-token mapping (Items 12–14)

These came out of the 2026-05-27 modern-UX component-set evaluation (Media Player / Timeline / AI Chat). **User decision (2026-05-27): build all three from the colour tokens that already exist — do NOT mint new colour tokens up front.** If a built component looks visually off, we revisit and mint a token THEN, via the plugin. Binding components directly to existing L2/L3 (rather than adding `media.*` / `timeline.*` / `bubble.*` L3 aliases) is also what `feedback_l2_vs_l3_decision.md` mandates — no 1:1 L3 aliases; bind to L2.

The tables below are the **build reference**: which existing token each need consumes. No registration work for the plugin here unless a 🟢 flips to ⬜.

### 12. Media Player — existing-token map

| Need | Existing token to use |
|---|---|
| Player chrome surface | `--lb-surface-bg-elevated` (via Card) |
| Scrim over media | `linear-gradient(transparent, var(--lb-bg-overlay))` — gradient is a CSS construct, the colour is the existing `bg-overlay`. No token needed. |
| Control surface (over video) | `--lb-bg-inverse` or reuse icon-btn ghost `--lb-action-bg-ghost-*` |
| Control glyph fg | `--lb-fg-inverse-strong` |
| Scrubber played fill | `--lb-bg-accent` (matches Slider) |
| Scrubber buffered fill | `--lb-bg-bolder` |
| Scrubber track | reuse Slider's existing track token |
| `::cue` subtitle bg / fg | `--lb-bg-inverse` / `--lb-fg-inverse-strong` |
| Now-playing badge | reuse Badge (existing) |
| Error / empty | reuse Banner / Empty-state (existing) |

**Open NON-colour question (not a colour token):** 44px mobile touch target. `icon-btn--medium` is 40px. Decide during build whether to add a `size` primitive / `icon-btn--large-touch`, or just set `min-height/min-width` on the media transport buttons in CSS. Revisit at build time.

### 13. Timeline — existing-token map

| Need | Existing token to use |
|---|---|
| Track lane bg | `--lb-surface-bg-default` |
| Waveform fill (active region) | `--lb-bg-accent` |
| Waveform dim (outside region) | `--lb-bg-bolder` |
| Playhead | `--lb-bg-danger` (warm-red convention) OR `--lb-bg-accent` (on-brand). Pick at build; both exist. |
| Trim handle bg / grabber | `--lb-bg-accent` / `--lb-border-strong` |
| Region scrim (trimmed-out) | `--lb-bg-overlay` via `color-mix` for alpha, or `--lb-bg-disabled` |
| Ruler tick major / minor | `--lb-border-strong` / `--lb-border-muted` |
| Ruler label | `--lb-fg-muted` |

### 14. AI Chat — existing-token map

| Need | Existing token to use |
|---|---|
| User bubble bg | `--lb-bg-accent-muted` |
| Assistant bubble bg | `--lb-surface-bg-elevated` |
| System bubble bg | `--lb-bg-strong` |
| Tool-call sub-bubble bg | `--lb-bg-info-subtle` |
| Streaming cursor | `--lb-fg-accent` |
| Hover-actions toolbar surface | `--lb-surface-bg-overlay` |
| Code block in bubble | reuse code-block + `--lb-code-1..8` |
| Citation pill | reuse Badge (info) |

### 15. Add `--lb-size-3-5x = 14px` L1 primitive + sweep 8 component sites ✅ DONE 2026-06-01

**Final status 2026-06-01.** Three-step close-out:

1. **letbe-tokens upstream (NOW DELETED):** `3_5x = 14px` was originally pushed to `letbe-tokens@main` commit `1524004` (plugin chat) as a forward-looking baseline entry. Later the same day, the `letbe-tokens` repo (`m1ha1l0/letbe`) was deleted — letbe-ds had drifted 132 tokens ahead and was already the canonical source-of-truth, making the upstream redundant. The plugin-chat commit is preserved in the local clone at `~/ai-projects/letbe/letbe-tokens/` but no longer has a remote.
2. **letbe-ds source-tokens.json:** `3_5x` added directly to the factory-reset baseline as a documented exception to the "never hand-edit" policy (`letbe-ds@d82a00c`). Verified round-trip-safe via Theme Editor → Figma plugin → export → import cycle: `3_5x` survived both directions byte-perfectly; only intended brand-colour change diffed (proves plugin's generic L1 reader handles the new primitive without code changes).
3. **letbe-ds components sweep:** all 8 `0.875rem` raw-value hits swapped to `var(--lb-size-3-5x)`. TODO comments dropped. Zero visual delta (14px = 14px).

**Why.** The 2026-06-01 HYGIENE audit of `components/components.css` found 8 hits of the raw value `0.875rem` (14px) across 7 component families, all on the same semantic pattern: a small glyph slot used as an icon-at-field-label or compact indicator. Affected components:

- `.lb-flag--rect.lb-flag--small .lb-flag__img` (short edge of rect flag)
- `.lb-card__stat-delta svg` (stat-delta indicator)
- `.lb-field__success > [data-lb-icon]` (input field success hint icon)
- `.lb-segmented--sm .lb-segmented__icon` (small segmented icon)
- `.lb-switch::after` (switch thumb)
- `.lb-dropdown-field__hint--success > [data-lb-icon]` (dropdown field success hint icon)
- `.lb-datepicker-field__hint--success > [data-lb-icon]` (datepicker field success hint icon)
- `.lb-code-block__copy [data-lb-icon]` (code-block copy button icon)

The 14px value sits cleanly between the existing `--lb-size-3x` (12px) and `--lb-size-4x` (16px). Fits the geometric scale.

**Naming.** Per the existing L1 size scale (`--lb-size-Nx`), this slot uses the `3-5x` segment naming for half-step intermediate values between integer steps. Confirms with the existing `--lb-size-0-5x` precedent (the only current half-step in the scale).

**Prerequisite (CORRECTED 2026-06-01).** Earlier draft of this item stated "plugin must gain dynamic L1 size-token registration" and pointed at Milestone U. **That was a misdiagnosis** caught by the plugin chat on 2026-06-01. The actual architecture:

- The Figma plugin does NOT carry a fixed L1 size-primitive schema. It reads `size/*` keys generically via a prefix match in plugin `main.js` (`if (varName.indexOf('size/') === 0) return ['WIDTH_HEIGHT','GAP','CORNER_RADIUS','STROKE_FLOAT']`). Any new `size/*` entry in whatever JSON source the plugin is configured against flows through to Figma as a variable with no plugin code change required.
- Milestone U (Path 3 — "dynamic L2/L3 creation") is about an **in-Figma UI** for adding tokens without editing JSON. It is a UX nicety, NOT a prerequisite for new L1 tokens existing.
- The actual minimal path used 2026-06-01 was: edit the source-tokens JSON directly (today, that's `letbe-ds/tokens/source-tokens.json` since letbe-tokens upstream is deleted) → rebuild via the consumer's build script → commit. Plugin code untouched.

**Workflow.** Per `wow_letbe_plugin_vs_ds_separation.md`, plugin work always happens in a separate session from letbe-ds work. Going forward, future L1 size primitive additions follow the same minimal path inside letbe-ds — no Milestone U dependency, no plugin code change. The Theme Editor → Figma plugin → export → `scripts/import-tokens.js` round-trip is the canonical sync surface.

**Remaining letbe-ds work.** All 8 hits are currently raw `0.875rem` with inline TODO comments:

```
/* TODO: var(--lb-size-3-5x) once plugin supports size-token registration (PLUGIN-HANDOFF item 15) */
```

The TODO text is also misleading (it implies plugin work was needed). On the sweep slice, both swap the value and drop the misleading clause:

```
width: var(--lb-size-3-5x); height: var(--lb-size-3-5x);
```

Sweep gates on the next Figma plugin export round-trip into letbe-ds (`scripts/import-tokens.js`) emitting `--lb-size-3-5x: 14px;` in `theme.css`. Zero visual delta (14px = 14px).

### 16. Two new L3 surface tokens — cutout / separator rings ✅ DONE 2026-08-05 (heading trued 2026-09-15; the summary table already said ✅)

**Added to letbe-ds 2026-07-20** (`tokens/source-tokens.json` `component.surface`, rebuilt into `theme.css`, in use across 3 components). Plugin needs them registered so re-exports round-trip without stripping them.

**The two tokens (Figma slash-paths → L2 alias):**

| Figma path | CSS var | `$value` | `$type` |
|---|---|---|---|
| `surface/border/cutout` | `--lb-surface-border-cutout` | `{bg.default}` | color |
| `surface/border/cutout-elevated` | `--lb-surface-border-cutout-elevated` | `{bg.strong}` | color |

Register them in the same `surface` L3 group as `surface/border/{default,elevated,overlay}`, right after `border-overlay`.

**Why they alias a `bg` token (this is intentional, not a tier error):** a cutout ring must *equal the surface behind it*, so overlapping/floating elements read as separated. Same structural move `action/border/primary-default → {bg.accent}` already makes (a filled button's edge equals its own fill). The rule that separates this from a genuine violation: **a border that must EQUAL a fill/surface aliases a bg token; a border that is a separator/outline aliases a border token.** These are the "equal a surface" case.

**Consumers already migrated (letbe-ds side):**
- `.lb-avatar-group > .lb-avatar` — ring → `surface-border-cutout` (base page)
- `.lb-slider` thumb (webkit + moz) → `surface-border-cutout` (base page)
- `.lb-media__range` thumb (webkit + moz) → `surface-border-cutout-elevated` (media chrome bg = `surface-bg-elevated`; the old `surface-bg-default` was one step too light — this fixes a latent mismatch)

Border taxonomy gaps surfaced during this work are consolidated below (see "Known deliberate absences"). **Nothing there is mintable now — the two cutout tokens are the only active item.**

### 17. Style-minting wishlist — RETIRED 2026-08-05, absorbed into item 22 ✅→22

Every wishlist row is now either MINTED into the ramp (item 22: heading/xs absorbs title-semibold-on-body, t-overline absorbs group-label, t-code-s absorbs kbd-mono, counter digits ride t-code-s/heading-xs contexts), explicitly DROPPED as a decision (badge/pill + counter lh-1: the +4px line-box growth was accepted as correct hug-driven theming — do not re-litigate; tooltip-2xs: t-caption-s covers it), or deliberately RAW forever (footer giant 160px = brand decoration, not typography). Effect styles (shadow-1, focus ring) remain plugin-side work — carried into item 22's notes. Historical wishlist below for reference:

**Text styles:**
| Proposed style | Used by | Note |
|---|---|---|
| badge/pill | `.lb-badge`, chips | line-height 1 |
| title-semibold-on-body | card/list titles set in body size + semibold | |
| counter digits | `.lb-counter` | |
| group-label | `.lb-nav__group-label` AND `.lb-shell__group-label` — one voice since aa4f64c (fg-muted, t-label-l family, t-body-xs, medium, 0.04em). Mint ONCE, apply to both. | uppercase micro-label |
| kbd-mono | `kbd` keycaps | mono at caption size |
| tooltip-2xs | `.lb-tooltip` | smallest text role |

**Effect styles:** `shadow-1` and the focus ring.

Code side needs nothing — these already render correctly from tokens in CSS; this is Figma-fidelity work only.

### Known deliberate absences — border taxonomy (flagged, NOT minted)

Audited 2026-07-20 (full `components.css` sweep + 28-agent adversarial verification of every candidate ring/border). The border axis has three intentional gaps. Each is **documented, not an oversight** — the rule is mint-on-first-real-consumer, and none has a consumer today. Listed so a reviewer (or future you) sees the reasoning, and so the trigger for each is recorded.

| Gap (proposed name, tier) | Why it's absent | Mint when… (first real consumer) |
|---|---|---|
| **`border-inverse`** (L2) | Border axis has no inverse partner though `bg-inverse` + `fg-inverse*` exist. Verified: `bg-inverse` currently has **zero consumers**, and the only dark surface (tooltip) has **no border** — it reads via contrast + shadow and inverts correctly. So nothing needs it yet. | A dark surface first gains a stroke: a hairline outline on the tooltip / a dark menu / dark toast-snackbar; a dark chip or `kbd` keycap; a divider inside an inverse surface; or the first component that paints `bg-inverse` and needs an outline. |
| **selection/focus *offset-gap*** (own role, likely L3) | `.lb-color-picker__preset--active` (L5283) draws `0 0 0 2px {bg.default}, 0 0 0 4px {border.accent}` — the inner `bg.default` stop is a surface-colored *moat* between the swatch and its accent selection ring. This is a **distinct concept from the cutout** (a spacer between an element and its own ring, not a ring behind a floating element). Currently the only such gap in the system. | A second consumer needs a surface-colored offset gap between an element and a selection/focus ring. Then tokenize as its own role (e.g. `surface/border/offset-gap`), **not** as a cutout variant. |
| **`border-accent-muted` / `border-accent-subtle`** (L2) | `bg-accent` and `fg-accent` both carry `-muted` / `-subtle` intensity steps; `border-accent` is a lone full-strength step. Cross-axis asymmetry. No consumer wants a quiet accent outline yet. | A quiet/low-emphasis accent outline first appears — ghost-selected state, a subtle-accent chip, a low-emphasis selected card edge — with nowhere to bind but full-strength `border-accent`. |

Not listed as a gap because it's *deliberately complete*: the neutral border tiers (`border-default` / `-muted` / `-strong` / `-bolder`) fully cover field edges + separators — the absence of more neutral border steps is intentional, not missing.

### Discipline reminder

Use existing tokens. If during a build a component genuinely can't be served by any existing token (and looks wrong as a result), STOP that slice, log the specific gap here (flip 🟢 → ⬜ with proposed L3 name + L2 routing), and queue a plugin session. NEVER add a var to `theme.css` directly (2026-04-30 incident) — new tokens are authored in `source-tokens.json` then rebuilt. Most likely we won't need any — the existing L2/L3 set is rich enough to cover all three sets.


### 18. Re-route `action/fg-selected` + `action/border-selected` → `{fg.accent}` ✅ (plugin 2026-08-05)

**Changed in letbe-ds 2026-07-31** (source-tokens.json, rebuilt into theme.css). Both aliased `{bg.accent}` — a FILL color used as text/indicator. Measured in dark mode: violet-600 on neutral-950 ≈ **2.9:1** (fails 4.5:1 text AND the 3:1 non-text minimum for the underline). `{fg.accent}` is the mode-corrected accent (violet-600 light / violet-400 dark): **8.5:1 dark / 7.3:1 light**. Update both variable aliases in the plugin so re-exports round-trip. Consumers (tabs selected, segmented active, pills) need no changes — alias-level fix.

**Amended by item 19 (2026-08-03):** `action/fg-selected → {fg.accent}` stands; `action/border-selected` has since moved to `{border.accent}` (role-correct, numerically identical). Apply items 18 + 19 together in one plugin sitting.

### 19. Activity-color consolidation — two existing-token value edits ✅ (plugin 2026-08-05)

**Changed in letbe-ds 2026-08-03** (source-tokens.json, rebuilt; expert-ds consult + owner alignment). No new tokens — the plugin only re-reads two changed references:

| Token | Old | New | Why |
|---|---|---|---|
| `bg/accent-subtle` (LIGHT mode only) | `{violet.300}` | `{violet.200}` | Quiet-selected surfaces read "primary" at violet-300 (chroma 0.090); violet-200 halves chroma AND raises fg.accent contrast 4.58→5.54:1. Dark stays `{violet.700}`. |
| `action/border-selected` | `{fg.accent}` | `{border.accent}` | Role integrity: border tokens reference border.* L2, never fg.*. Zero visual change — border.accent ≡ fg.accent numerically in both themes. |

Context: all selected/active component states consolidated onto the `action/*-selected` trio in components.css (nav/shell/header active, table row selected, composer tool active, media track active, tree row selected — previously five divergent token paths). Component-side only; no further plugin work. The accent ramp inversion flagged here was fixed same-day — see item 20.

### 20. GAP-12 — accent bg ramp realignment (supersedes item 19's subtle value) ✅ (plugin 2026-08-05)

**Changed in letbe-ds 2026-08-03** (source-tokens.json, rebuilt; expert-ds two-round consult + owner approval). The accent bg ramp had `muted`/`subtle` inverted versus the status-ramp canon in BOTH themes — the dark side made the consolidated selection states (chips, nav) read as loud active fills (violet-700). Realigned + re-pointed; **all existing tokens, no new registrations**:

| Token | Old | New |
|---|---|---|
| `bg/accent-subtle` light | `{violet.200}` (item 19's interim value) | `{violet.50}` |
| `bg/accent-subtle` dark | `{violet.700}` | `{violet.950}` |
| `bg/accent-muted` light | `{violet.100}` | `{violet.200}` |
| `bg/accent-muted` dark | `{violet.900}` | `{violet.800}` |
| `action/bg-selected` | `{bg.accent-subtle}` | `{bg.accent-muted}` |
| `action/bg-secondary-hover` | `{bg.accent-subtle}` | `{bg.accent-muted}` |

Now `subtle` is genuinely the quietest step (canon: 50/950) and `muted` the visible tint (200/800). Selection resolves to violet-200 light (unchanged look) / violet-800 `#261249` dark (fg.accent 6.91:1; darker + lower-chroma than M3's dark secondary-container). Secondary-button hover re-pointed with it (post-realign subtle is a near-invisible wash — unusable hover); hover and pressed now share the muted fill, press feedback carries via transform. This also un-inverted the old hover-louder-than-pressed pair. `$description` strings updated on all six tokens — carry them into the plugin so re-exports round-trip. Apply items 18 + 19 + 20 in one sitting; net-final values are item 20's — **except the four tokens item 21 re-values again (secondary hover/pressed + others): item 21's values are FINAL.**

### 21. State-based accent model — secondary + ghost groups re-valued to neutral ✅ (plugin 2026-08-05)

**Changed in letbe-ds 2026-08-03** (owner decision superseding Meaning A/Q4; internal audit; recorded in README Design principles + ds-knowledge changelog). "Accent is a signal, not a skin" — violet only for primary, links, state (selected/active/checked/focus), value-display fills, today-markers. Eleven existing-token re-values, **zero new tokens, zero renames — Figma components need NO re-binding**, only variable value updates:

| Token | Old | New |
|---|---|---|
| `action/fg-secondary-default` | `{fg.accent}` | `{fg.default}` |
| `action/fg-secondary-hover` | `{fg.accent}` | `{fg.default}` |
| `action/fg-secondary-pressed` | `{fg.accent}` | `{fg.default}` |
| `action/border-secondary-default` | `{border.accent}` | `{border.strong}` |
| `action/border-secondary-hover` | `{border.accent}` | `{border.bolder}` |
| `action/border-secondary-pressed` | `{border.accent}` | `{border.bolder}` |
| `action/bg-secondary-hover` | `{bg.accent-muted}` (item 20's value) | `{bg.strong}` |
| `action/bg-secondary-pressed` | `{bg.accent-muted}` | `{bg.bolder}` |
| `action/fg-ghost-default` | `{fg.accent}` | `{fg.default}` |
| `action/fg-ghost-hover` | `{fg.accent}` | `{fg.default}` |
| `action/fg-ghost-pressed` | `{fg.accent}` | `{fg.default}` |

Everything else in the action group is untouched: primary (violet CTA), link (violet), danger (red), the `*-selected` trio (quiet violet), all disabled tokens, ghost bg states (already neutral). `$description` strings updated on all 11 tokens — carry into the plugin. Apply after/with items 18–20; where 20 and 21 touch the same token, **21 wins**.

**Component-level re-binds for the FIGMA LIBRARY session** (letbe-ds neutralized these at the component layer, no tokens involved — four Figma components re-bind their fills/text to neutral variables):

| Figma component | Re-bind to |
|---|---|
| Badge — default variant | fill `bg/strong` · text `fg/default` · border `border/default` |
| Table — header cells (+ sticky header) | fill `bg/strong` · text `fg/default` |
| Auth — split brand panel | fill `bg/strong` · text `fg/default` |
| Rating — filled star | `fg/default` (empty star stays `fg/muted`) |

### 22. Typography completion — small-heading tier + overline + code group ✅ (plugin 2026-08-05)

**Changed in letbe-ds 2026-08-05** (spec agreed in the Figma library session; source-tokens.json + build script + components.css all landed). The type system grows 6 groups/22 styles → **8 groups/28 styles**; every library text now sits on a named style with ONE intentional exception (footer giant — brand decoration, raw forever).

**New in source-tokens.json (re-import picks up everything):**
| Addition | Value | Note |
|---|---|---|
| `font.letter-spacing.caps` (L1) | `0.04em` | replaces the raw design-intent tracking comments |
| `font.letter-spacing.spaced` (L1) | `0.45em` | OTP code-slot tracking |
| `typography.family.code` (role) | `{font.family.3}` | NEW family role — plugin must deliver styles PRE-BOUND through it (chain live since da127e8) |
| `text.heading.xs` | 14 semibold / lh 20 / tracking NORMAL | deliberate deviation from heading tight tracking (12–14px legibility) |
| `text.heading.2xs` | 12 semibold / lh 16 / normal | kanban column headers |
| `text.overline` | label family, 12 medium / lh 16 / caps tracking | THE aa4f64c group-label voice as a style. SINGLE-VOICE group: vars emit as `--lb-t-overline-*` (no size tier). Uppercase stays CONTENT/CSS-level unless the style push supports textCase — check in the plugin. |
| `text.code.s` | code family, 11 regular / lh 16 | card IDs, keycaps (kbd is now mono — the kbd-mono wish) |
| `text.code.m` | code family, 14 regular / lh 20 | code-block bodies + inline .lb-code (pinned to current pixels) |
| `text.code.l` | code family, **20** regular / lh 28 / spaced tracking | OTP display. **Deviation from the spec draft (said 18):** shipped OTP computes 20px — zero-visual-change principle won; re-pin to 18 only if the library measured otherwise. |

**NOT minted (decisions):** caption/xs 10px (optional in spec, no consumer — mint-on-first-consumer rule); badge/pill + counter lh-1 (accepted line-box behavior); title-semibold-on-body (superseded by heading/xs); footer giant (raw by design).

**Build-script note:** `scripts/build-tokens.js` TYPO_GROUPS now includes overline + code and supports single-voice groups (group node IS the style → `--lb-t-<group>-*`). The plugin's own typography reader must handle the same two shapes.

**CSS adoption landed (letbe-ds side, for the library chip pass):** t-heading-xs → inspector section titles, choice/media-card/playbar titles, toolbar count, shell brand · t-heading-2xs → board column title · t-overline → nav+shell group labels, stat label, donut center label, inspector label, cmdk group labels, list/menu group labels (the last two consolidated 2026-08-05 — chip them too) · t-code-s → board card ID, cmdk kbd, tooltip kbd · t-code-m → code-block + inline code · t-code-l → auth OTP. **Micro-redesign (the only intended visual changes):** kanban due-date drops its medium weight (state color carries the signal), kbd keycaps go mono, tooltip kbd 10→11px, inline .lb-code fixed 14px (was 0.875em relative).

**After plugin re-import:** ping the library session "typography slice imported" → it runs the chip pass (≈30 composite nodes across 7 clusters), verifies per component, retires the item-17 wishlist, updates registry/conventions. Effect styles: DONE — the focus style exists plugin-side (corrected 2026-08-05; item 17's note was stale).

### 23. surface/bg/subtle — RESOLVED, no new variable needed ✅ (code-side fix 2026-08-05)

Library session (cmdk + code-block builds) reported `.lb-code-block` referencing `surface/bg/subtle`, which never reached Figma. Investigation: **the token never existed anywhere** — not in source-tokens.json, not in theme.css; the CSS referenced a phantom var that silently resolved transparent. Fix landed CODE-side: `.lb-code-block` re-bound to `surface/bg-elevated` (→ `{bg.strong}`, the one tinted surface step — a distinct "recessed" token would be a forbidden 1:1 alias until values diverge). **The Figma file's temporary `surface/bg/elevated` binding is therefore the correct PERMANENT binding — no re-bind, no plugin work, nothing to import.** If a recessed surface ever needs its own value, it gets minted with owner approval then.

## 24. Contrast retune — 13 L2 alias re-points (2026-08-11) ✅ APPLIED (plugin verified all values via re-import, 2026-08-11 — no plugin code needed)

The canonical contrast audit (scripts/audit-contrast.js → tokens/CONTRAST.md,
16 required WCAG failures found) drove a coherent L2 retune. VALUES only —
no new tokens, no renames. Update the plugin's variable aliases:

| token (semantic) | light: old → new | dark: old → new |
|---|---|---|
| bg.accent | violet.500 → **violet.600** | violet.600 (unchanged) |
| bg.accent-strong | violet.600 → **violet.700** | violet.400 → **violet.700** |
| bg.accent-bolder | violet.700 → **violet.800** | violet.300 → **violet.800** |
| bg.danger | red.500 → **red.600** | red.500 → **red.600** |
| bg.danger-strong | red.600 → **red.700** | red.400 → **red.700** |
| bg.danger-bolder | red.700 → **red.800** | red.300 → **red.800** |
| border.strong | neutral.400 → **neutral.500** | neutral.700 → **neutral.600** |

Rationale: dark-mode hover/pressed previously LIGHTENED under permanently
white action text (ratios 1.5–2.3); interaction states now darken in both
themes and the accent/danger fill chains are theme-uniform (600/700/800).
border.strong (field boundaries, secondary outlines, scrollbar thumbs) now
clears 3:1 non-text on both themes.

OPEN (decide before applying): dark value-fills (slider/progress consume
bg.accent) measure 2.45 vs their track — one candidate fix mints an L2
value-fill role; owner decision pending in the letbe-ds session.

## 25. Value-display roles — 8 new L2 variables (2026-08-11) ✅ APPLIED (plugin verified via re-import together with item 24)

Owner-approved mint (naming vetted against Radix accent-indicator/track,
Spectrum accent-visual-color; `data` rejected — collides with the
categorical data.1–8 namespace). Add to the plugin's semantic collection:

| variable | light | dark |
|---|---|---|
| bg/accent-value | violet.600 | violet.400 |
| bg/success-value | green.600 | green.400 |
| bg/warning-value | **yellow.700** | yellow.400 |
| bg/danger-value | red.600 | red.400 |

Semantics: VALUE-DISPLAY fills (slider fill+thumb, progress incl. status
variants, spinner arc, media scrubber, timeline handle) — a role, not an
intensity step: tuned 3:1+ against the neutral track (light measured
3.4–4.9, dark 6.2–9.5), where the accent interaction chain is tuned for
text-on-fill. yellow.700 in light: yellow-600 only reaches 2.09 vs track.
L3 unchanged — components bind these L2 roles directly (value fills are
not actions). Figma component re-binds: any slider/progress/spinner fills
bound to bg/accent or action primary should re-bind to bg/accent-value.

Doctrine reference for the plugin docs: role prefixes name what the pixel
IS, not the CSS property (full write-up: gallery /token-architecture/ page
+ ds-knowledge/token-do-and-dont.md §8).


## 26. WCAG pair-manifest emission + status editor-row fix (2026-08-11) ✅ SHIPPED letbe-ds side

The plugin ships a pair-manifest audit engine (plugin commits ec48cb0 +
59594bd) consuming `$schema.wcag_pairs`. letbe-ds now emits it:

- `scripts/audit-contrast.js` syncs `$schema.wcag_pairs` into
  source-tokens.json on every run, generated from the SAME `PAIRS` array
  that writes tokens/CONTRAST.md — single source of truth, cannot drift.
  63 entries, mode-agnostic, slash token paths (L3 concepts split at the
  first dash: `action/fg-primary-default`; L2 after the group name:
  `bg/accent-value`), `over`/`status`/`min` carried through.
- The 4 stale status editor_rows (bgdanger/bgwarn/bgsucc/bginfo)
  re-pointed `bg/X` → `bg/X-subtle` — the pairing components actually
  render since Item 9; slot names + wcag.against untouched per plugin
  constraint (no token paths in `against`).

Plugin follow-up: `npm run bake-presets` + one re-import switches to
manifest mode (badge counts = CONTRAST.md by construction).

OPEN owner decision: whether solid `bg/X` status fills get their own
editor rows against `fg/inverse-strong` (the audited "text on solid
danger fill" pair) or stay editor-hidden.

### Item 26 addendum (2026-08-11, owner decision resolved)
Solid `bg/danger` gets its own editor row: id `bgdangersolid`, NEW slot
`bgDangerSolid`, `wcag.against` = literal `#f7f5f1` (fg/inverse-strong is
theme-STABLE, so the literal is exact — and slot references can't reach
it since no inverse row exists). Danger only — the other status solids
render no text in any component; rows for unrendered pairings was the
disease the -subtle re-point cured. Plugin: wire the new slot to the
canvas if/where a solid danger swatch is painted, else it simply renders
as an audited row.

## 27. Toast — neutral variant + action slot (2026-08-11) ✅ DONE in library (built 2026-08-11, verified against file 2026-09-15) — no plugin action

> Filed here for the trail only. The PLUGIN needs nothing but an optional
> re-import (one new `$schema.wcag_pairs` row, 63 → 64). All build work below
> belongs to the Figma **library** session.

New Toast variant for the Figma library. **No new tokens** — built entirely
from existing roles:

- `.lb-toast--neutral` — surface `surface/bg-elevated` at 94% (backdrop blur is
  CSS-only progressive enhancement; render Figma at flat `surface/bg-elevated`),
  stroke `surface/border-elevated`, text `fg/default` (inherited), radius
  `radius/overlay`, NO status icon. It FOLLOWS the theme like the status
  variants — an earlier inverse-surface (dark-on-light) treatment was reverted
  because neutral and status toasts share one region and are often on screen
  together, so inverting one read as a different component.
- `.lb-toast__action` — one chip, styled from currentColor: fill = ink at 16%,
  border = ink at 42%, `radius/full`, `t-action-s` semibold. In Figma use
  `fg/default` at those opacities — the chip inherits whatever ink its toast uses,
  so one Figma style serves every variant.
- Measured: `fg/default` on `surface/bg-elevated` = 15.82:1 (in CONTRAST.md).

Variant matrix to add: status ∈ {info, success, warning, danger, **neutral**}
× action ∈ {none, present}. Note neutral+no-action is legal but rare; the
variant exists for the undo pattern.

## 28. Typography two-face default — 3 L2 alias retargets (2026-08-21) ✅ SHIPPED plugin v1.0.1 (2e83200 + 56a13eb, live on Community 2026-08-22) — incl. the Role-map UI in the slots section

Canonical role→slot mapping now matches every shipped preset and the
industry two-face model (headline face + text face; buttons follow the
text face). **No new tokens, no renames** — three `$value` edits on
existing L2 aliases in `source-tokens.json`:

| Variable (Figma name) | Was | Now |
|---|---|---|
| `typography/family/display` | `font/family/1` | **`font/family/2`** |
| `typography/family/heading` | `font/family/1` | **`font/family/2`** |
| `typography/family/action`  | `font/family/2` | **`font/family/1`** |

Plugin action: re-import `source-tokens.json`, push. The push should
UPDATE the three variables' alias targets IN PLACE (both modes — families
are unthemed); never delete/recreate, so every ramp alias, style binding
and consumer binding survives. Zero visual delta day-1: `font/family/2`
still holds the same Inter stack as slot 1.

Related, same slice (FYI, no variable changes):
- The editor's role map now exposes all 7 roles — exports may carry a
  `semantic.typography.family.code` remap; import already handles it.
- Slot semantics renamed in descriptions: slot 1 = text face, slot 2 =
  headline face, slot 3 = mono. If the plugin UI labels slots by role
  anywhere, derive the label from the live alias targets rather than
  hardcoding (the web editor now does exactly this).
- The 8 baked preset JSONs need NO rebake: they carry the full mapping
  explicitly and their values coincide with the new canonical.
- Editor role-map UI request (owner-approved, plugin session): mirror the
  Role map control 1:1 — 7 rows (display, heading, body, action, label,
  caption, code → Slot 1/2/3) reading/writing the alias targets of
  `typography/family/<role>`, in place, both modes. PLACEMENT: inside the
  SAME panel/section where the plugin already exposes the three family
  slots — slots first, Role map directly beneath them, exactly like the
  web editor's Typo section (Family slots → Role map → sizes). The slot
  rows' captions should list the roles currently wearing each slot,
  derived live from the alias targets — never hardcoded.

## 29. Second/third accent slots — accent-2 + accent-3 shipped DORMANT (2026-08-31) ✅ DONE — plugin v1.0.3 live 2026-09-02, library republished +16 variants 2026-09-02 (owner-confirmed 2026-09-15)

letbe-ds ships the owner-approved second-accent model (analysis: "The
Second Accent" artifact; O2 fixed slots, hard cap 2). All new vocabulary,
everything L2→L1 / L3→L2, zero raw values:

- **L2 ×2 slots**: `fg/accent-N`, `fg/accent-N-muted`, `fg/accent-N-subtle`,
  `bg/accent-N` + `-subtle/-muted/-strong/-bolder/-value`,
  `border/accent-N` (N = 2, 3) — both themes, DORMANT: aliased to the same
  violet stops as the accent family.
- **L3 ×2 slots**: `action/bg|fg|border-accent-N-{default,hover,pressed,
  disabled}` mirroring primary's shape (fg + disabled alias the shared
  roles). New CSS consumers: `.lb-btn--accent-2`, `.lb-btn--accent-3`
  (render identical to primary while dormant — intended).
- **$schema data**: `wcag_pairing.status_keys` += `accent-2`, `accent-3`;
  `wcag_pairs` 64 → 78 (14 authored pairs, green by construction while
  dormant); `editor_rows` 41 → 45 (fg + button rows per slot).
- **Editor**: Color section is now a slot list (Accent · slot 1 + two
  slot rows with picker/clear/status). A filled slot generates a
  `brand-N.*` runtime ramp (like `brand.*`) and re-points ONLY its
  family, measured; dormant slots mirror accent whenever slot 1 is
  branded, and imports of pre-slot exports are normalized the same way.
  `border-focus` never follows extra slots.

**Plugin action: re-import `source-tokens.json`, push.** 44 new variables
register generically (in-place adds; nothing renamed, nothing re-typed);
the Theme tab gains the accent-2/-3 rows from `editor_rows`; WCAG badges
come from the shipped pairs. No plugin code expected (verified in the
second-accent analysis: shape-only validation, generic sync/explorer/
apply/relink). Exports with a filled slot will carry `brand-2`/`brand-3`
primitives — also generic.

**Figma library (library session, later): +8 button variants per slot
(+16 total)** wearing the new L3 variables — same build recipe as the
danger button. Dormant rendering equals primary, so there is no visual
urgency; variables land with the plugin push and components heal when the
variants are built.

### Item 29 addendum (2026-08-31) — dark-pick engine fix + live pair audit ✅ letbe-ds side

The item-29 follow-up bug (dark ink walked dark, washes walked light, for
seeds snapping ≤400 — provenance confirmed: letbe-ds engine, not plugin) is
FIXED at the shared brand engine, so it covers the accent slots AND the
slot-1 brand knob (same latent bug). Dark ink is now measured (≥4.5 vs the
dark page and its own wash, escalating lighter); washes always walk the
dark side, floored ≥700/≥900. Verified: seeds snapping 200–900 pass every
accent manifest pair in both modes (worst 4.53); the 8 presets are
byte-identical except Ink's two dark washes (600→700, 800→900 — strictly
more contrast).

New behavior the plugin may care about:
- The editor re-runs the family's wcag_pairs live after every slot
  fill/clear AND import — failures surface as a toast (ask 2, incl. the
  import path, so pre-fix baked exports get flagged on arrival).
- Exports now carry `$extensions["design.letbe"].seeds` (the fill hexes) —
  ignored by shape-only consumers, enables re-derivation after engine
  fixes. Themes exported by the pre-fix engine hold baked bad picks:
  re-fill the slot from its seed and re-export.
- No plugin action required; no token names or $schema shapes changed.

## 30. Shared slot engine extracted — js/slot-engine.js (2026-08-31) ✅ DONE — vendored in plugin v1.0.3, live 2026-09-02 (owner-confirmed 2026-09-15)

Per the plugin session's three asks (owner-approved):

1. **`js/slot-engine.js`** — pure, DOM/storage-free, ~340 lines. Exposes
   `window.LetbeSlotEngine`: `ENGINE_VERSION` ('1.0.0') + `CANON` (the
   canonical page/ink/track hexes, overridable per call), STEPS +
   PALETTE_STEPS + step math, OKLCH helpers, `contrastRatio`,
   `generatePalette`, `computeAccentRemap(step, mode, palette?, hexes?)`,
   `planBrandPrimary(palette, step, hexes?)`,
   `computeValueFillStep(palette, mode, hexes?)` (extracted too — needed
   for byte-identical exports), and `auditAccentPairs(wcagPairs,
   mergedJson)` refactored PURE. Vendor the file verbatim and pin against
   ENGINE_VERSION; any output-affecting change bumps it. Regression on
   this side: 10-seed exports byte-identical through the extraction;
   dark-fix matrix (snap 200–900) all pairs pass both modes.
   Load order on pages: slot-engine.js BEFORE theme-editor.js.
2. **Structural fill detection** replaces presence tests: filled ⇔ any
   accent-N ref references `{brand-N.…}`, OR the family diverges from BOTH
   the effective accent refs and the canonical factory positions (a
   deliberate hand-retarget). Hand-made brand-N ramp with zero retargets →
   dormant (ramp preserved, Clear hidden); stale pre-fix exports →
   normalized; hand-retargets → filled + never overwritten. Filling over
   an existing brand-N palette raises a "palette regenerated" warning toast.
3. **Seeds read back**: import prefills each slot picker (and the slot-1
   brand picker) from `$extensions["design.letbe"].seeds` when present.

README venue amendment ("theme editor or the plugin"): SHIPPED — the
README Design-principles sentence already names both venues running the
shared slot engine. Nothing held anymore.

---

### 31. Header active-page indicator ✅ DONE in library 2026-09-15 (bar variant; drawer not modeled) — no plugin action

`.lb-header__link--active` gained a non-colour indicator (both mihailo
consumers hit the colour-only state collapsing in mono themes): an
underline bar inside the link box in the header bar (`::after`, height
`border-width.medium`, `action.border-selected`, inset `size.3x` each
side, `radius.full` ends), and in the drawer the vertical-nav treatment
(`action.bg-selected` fill + `::before` left bar, `action.border-selected`,
rounded right edge). No new tokens — everything binds existing
action/* + radius.full.

Library work: the `header / link` set adds the active underline per the
directional-marker convention (bind the bar to the variable
components.css uses: `action/border/selected`; label stays
`action/fg/selected`). The mobile drawer is NOT modeled in the library,
so the drawer half has no Figma counterpart. Plugin: nothing — existing
tokens only.

### 32. Segmented focus ring moved inset — library parity check ✅ DONE 2026-09-15 (library models no focus state — nothing to retune) — no plugin action

Shipped in v1.1.1 (commit 0ff7128): `.lb-segmented__item:focus-visible`
outline-offset flipped from `+size.0-5x` (outside the pill) to
`-size.0-5x` (inset), because the group became a scroll container and an
outside ring would clip. If the `segmented` set models a focus state,
move the ring inset to match code; if no focus variant exists, no work.
Plugin: nothing — no token changes.

### 33. Forms cluster: form-native Select + DatePicker, LB.Form 🟢 code-side only — no plugin or library action (2026-09-15)

Select and the DatePicker input variant gained hidden-input form
mirroring (`data-lb-name`), `data-lb-required`, side-effect-free
setters, and `setError`/`clearError` on the existing error skin;
`LB.Form` (`data-lb-validate`) is the thin validation behaviour over
those APIs. Pure JS — behaviour is never mirrored in the library, and
the error/hint compositions it toggles already exist in Figma via the
shared `field/message` atom (input/dropdown/phone variants). No tokens.

### 34. Lightbox — new component ✅ DONE in library 2026-09-15 (new `lightbox` set, layout=[desktop, mobile], on its own Lightbox page; blur radius even variable-bound to size/3x) — no plugin action

`LB.Lightbox` (js/components/lb-lightbox.js + the .lb-lightbox block in
components.css) — image viewer composed over the canonical lb-modal
anatomy: blurred backdrop, dialog hugging the image, caption headline +
subline in the header, counter + prev/next ghost icon buttons in the
footer, full screen ≤640px. No new tokens (caption/counter type =
caption-m roles; blur radius size-3x; two design-intent dimension caps
commented in CSS).

Library work: new `lightbox` set built per the standard loop — compose
from the existing modal/backdrop pieces + lb-icon-btn ghost instances;
suggest variants: layout=[desktop, mobile-fullscreen] × caption=[head,
head+sub] with nav (show) and a counter text slot. Bind per
components.css (surface/overlay family, radius/overlay on the dialog).
Plugin: nothing — existing tokens only.

### 35. Show More — new behaviour 🟢 code-side only — no plugin or library action (2026-09-15)

`LB.ShowMore` (core lb.js) + one `[data-lb-show-more] > [hidden]` rule.
Pure behaviour over consumer-authored grids and buttons — behaviours
are never mirrored in the library (scroll-area/resizable precedent),
and no tokens are involved.

### 36. Stepper dots variant ✅ DONE in library 2026-09-15 (density=[default, dots] axis minted on both stepper sets; .deprecated masters were already gone — nothing to delete) — no plugin action

`.lb-stepper--dots` — 12px content-free dots (`--lb-stepper-size:
var(--lb-size-3x)`), filled for complete/active via the normal state
cascade, outlined for upcoming, caption-m labels, descriptions hidden.
KEY BINDING DETAIL: the dot corner binds `radius.interactive` (NOT the
raw 50%/9999 exception family) — dots must follow the theme's
square/round preset; a square-corner theme gets square dots (verified
by flipping the token). No new tokens.

Library work: the merged `stepper` set gains a dots value on its
size/density axis — connector model unchanged (keys off
--lb-stepper-size), indicator content hidden, label style caption-m,
corner bound to the radius/interactive variable. Same session can
delete the `.deprecated/*` old stepper masters the registry still
carries. Plugin: nothing.
