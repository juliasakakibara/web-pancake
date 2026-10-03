# Pancake 2 (web-pancake)

> **Built on [letbe-ds](https://github.com/m1ha1l0/letbe-ds) by m1ha1l0, used under the MIT licence.** The original `LICENSE`, `NOTICE` and `THIRD-PARTY-LICENSES.md` are kept unchanged. "letbe" and its mark belong to its author; this project does not use them as its own.
>
> What this fork adds: `scripts/import-theme.mjs` (turns a brand's DTCG tokens into a full theme, with a diff report and contrast warnings) and themes for the Pancake DS family, synced to Figma with Syrup. Everything below this note is letbe-ds's original README.

---

# letbe-ds

**Application-grade UI in plain CSS + JS — no build, no dependencies, no framework. Tokens → components → templates, MIT.**

letbe-ds is a complete design system in three plain files — design tokens, component styles, one JavaScript runtime. **No build step, no dependencies, no framework**: link the files and you own the entire stack. A three-tier DTCG token architecture drives everything — retune a handful of values and the whole system wears your brand, light and dark, without forking a line — and the same tokens round-trip into Figma variables. From buttons, forms and cards it scales to the application tier most systems stop short of: data tables, dashboards, kanban boards, calendars, media players, AI chat. Interactions are accessibility-first with the evidence to show for it; heavy engines stay deliberately yours to choose. MIT — including the parts other systems charge for.

## Why letbe-ds

Five claims, each one checkable in this repo:

1. **The files are the product.** No build step, zero dependencies, no framework.
   `theme.css` + `components.css` + `lb.js` — link three files and you have the
   system, in React, Rails, WordPress, or a hand-written HTML page. Nobody has
   to adopt our toolchain, because there isn't one. That's also why any agent —
   human or AI — can drop letbe-ds into any stack: the design system is just
   files.

2. **Application-grade where others stop at buttons.** A full data-table *view*
   (density, search, filters, column visibility/resize/pinning, row expansion,
   chunked scale), a kanban board with three equivalent interaction models
   (menu, pointer, keyboard), a media player, AI-chat templates, calendar,
   command palette, app shells, composed screens. Several of these are gaps
   that other systems skip or sell as paid tiers — here they're MIT.

3. **Decisions with receipts.** The color model comes from a verified
   multi-system benchmark; the kanban's menu-first interaction order comes from
   WCAG 2.2's actual requirements; the data table stays `role=table` because
   the ARIA Authoring Practices say grid would be wrong; contrast is measured,
   not assumed. Most systems say "accessible" and "considered" — this one can
   show the working.

4. **Honest boundaries: engines not bundled.** The DS ships chrome, state, and
   events; you bring the data layer, the virtualizer, the streaming engine,
   the AI model. No fake batteries that leak, no 200KB of someone else's
   dependency choices. Every boundary is documented on the component it
   belongs to.

5. **One source of truth, and it's code.** Tokens are authored in
   DTCG-standard JSON (`tokens/source-tokens.json`), generate the CSS, and
   round-trip into Figma variables through the letbe plugin — design follows
   code, aliases intact, both themes, typography modes included.

## Getting started

Link the token sheet, component stylesheet, and runtime in your HTML:

```html
<link rel="stylesheet" href="tokens/theme.css">
<link rel="stylesheet" href="components/components.css">
<script src="js/lb.js"></script>
```

Components auto-initialise on `DOMContentLoaded`. Opt interactive behaviour in per-element with data attributes (`data-lb-accordion`, `data-lb-tabs`, `data-lb-table`, …).

**Class combos are contracts.** Copy the full combo from each demo — base + variant +
size (`lb-btn lb-btn--secondary lb-btn--medium`), and every table cell carries
`lb-table__cell`. Base classes alone render unstyled. If a `data-lb-*` root does
nothing at runtime, its opt-in controller is missing — the console names the
exact `js/components/*.js` file to add.

Browse the full component gallery by serving the repo root and opening `/`.

## Using letbe-ds in your project (the vendor manifest)

Copying files into another project? This is the complete packing list — `lb.js`
alone is **not** the whole runtime, and icons are fetched at runtime, not bundled.

**1. Always:**

| File | What it is |
|---|---|
| `tokens/theme.css` | every design token (light + dark) — load FIRST |
| `tokens/fonts.css` + `assets/fonts/` | the shipped typefaces (Inter + Roboto Mono, variable, self-hosted) — or skip both and point `--lb-font-family-1/3` at your own fonts |
| `components/components.css` | all component styles |
| `js/lb.js` | the core runtime (most components) — load before any controller below |

**2. Per feature — heavier controllers live in their own files.** Copy the ones
your pages use and load them *after* `lb.js`:

| You use | Also copy |
|---|---|
| Site/nav header (`data-lb-header`) | `js/components/lb-header.js` |
| App shell (`data-lb-shell`) | `js/components/lb-shell.js` |
| Kanban board (`data-lb-board`) | `js/components/lb-board.js` |
| Chat / conversation list / context budget | `js/components/lb-chat.js` (+ `lb-chat-artifact.js`, `lb-chat-composer-popover.js` if used) |
| Media player | `js/components/lb-media.js` |
| Timeline | `js/components/lb-timeline.js` |
| Multi-select cards/bulk toolbar (`data-lb-selection`) | `js/components/lb-selection.js` |

**3. Icons and flags** — `data-lb-icon` fetches individual SVGs at runtime, and
the phone input renders country flags from `assets/flags/`. Both paths
auto-detect from the `lb.js` script origin (CDN included, since v1.2.0 — note
icons load via `fetch()`, so a foreign asset host must send CORS headers;
jsDelivr does). If you split assets away from `lb.js`, tell the loaders where
they live (once, before or after `lb.js` loads):

```html
<script>
  LB.setIconBasePath('/your/path/to/letbe-icons');
  LB.setFlagBasePath('/your/path/to/letbe-flags');
</script>
```

Without this, icons resolve relative to `data-lb-base` — correct inside this
repo's gallery, wrong everywhere else. On a failed fetch the element keeps
whatever fallback content you authored (so `<span data-lb-icon="x">×</span>`
degrades to the ×).

**4. Optional:** `assets/flags/` (Phone input), `assets/avatars/` (demo only).
`theme-editor.js`, `token-exporter.js`, and `gallery-layout.js` are gallery
chrome — consumers never need them.

Theme your copy by layering **your own** stylesheet after `theme.css` and
re-declaring token values (`--lb-bg-accent`, fonts, radii, type sizes…) — never
edit the vendored files, so a future update is a clean file swap.

**Or skip vendoring entirely — install from the CDN**, pinned to a release tag:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/m1ha1l0/letbe-ds@v1.4.0/tokens/theme.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/m1ha1l0/letbe-ds@v1.4.0/tokens/fonts.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/m1ha1l0/letbe-ds@v1.4.0/components/components.css">
<script src="https://cdn.jsdelivr.net/gh/m1ha1l0/letbe-ds@v1.4.0/js/lb.js"></script>
<script>LB.setIconBasePath('https://cdn.jsdelivr.net/gh/m1ha1l0/letbe-ds@v1.4.0/assets/icons');</script>
```

Pin to a tag (`@v1.4.0`), never `@main` — tagged URLs are immutable and cache
forever. Opt-in controllers load the same way from `js/components/`. See
[`examples/cdn-only.html`](./examples/cdn-only.html) for a page whose only
dependency is that block.

## Theming — your brand in one file

Never edit the vendored files. Layer **your own** stylesheet after `theme.css`
and re-declare token values — the whole system re-themes, light and dark,
because every component consumes tokens and nothing else:

```html
<link rel="stylesheet" href="letbe/theme.css">
<link rel="stylesheet" href="letbe/components.css">
<link rel="stylesheet" href="my-brand.css">  <!-- your layer, always last -->
```

```css
/* my-brand.css — a hypothetical brand retune: the four things a real
   retune touches — brand color, display font, radii, type scale. */
:root {
  --lb-bg-accent: #0f766e;                     /* brand teal takes the accent role */
  --lb-fg-accent: #115e59;
  --lb-t-display-xl-font-family: "Fraunces", serif;
  --lb-radius-surface: 16px;
  --lb-t-body-m-font-size: 18px;               /* marketing scale, up from 16 */
}
[data-theme="dark"] {
  --lb-fg-accent: #5eead4;                     /* keep contrast honest per theme */
}
```

Rules of thumb: retune **values**, never invent parallel class names; theme at
the token layer, not per-component; text on saturated fills uses
`--lb-fg-inverse-strong` (the theme-stable on-color role); check contrast when
you change accent colors — the system's defaults are measured, yours should be
too. Everything a consumer has needed so far — full brand retunes, new fonts,
radius language, marketing type scales — has been value changes in one file,
zero forks.

## Local development

No build step. Serve the repo root as static files and open the gallery at `/`:

```bash
python3 scripts/serve.py 8000
```

Then visit <http://127.0.0.1:8000/>.

> **Use `scripts/serve.py`, not `python3 -m http.server`.** The built-in
> server does **not** support HTTP Range requests, which `<audio>`/`<video>`
> need in order to seek — with it, the Media Player scrubber can't move.
> `scripts/serve.py` is the same static server plus Range (206) support.
> Any other Range-capable static server (`npx serve`, `npx http-server`)
> also works.

## Architecture

- **Tokens** live in `tokens/theme.css`, generated from `tokens/source-tokens.json` (the canonical token source, authored here) via `scripts/build-tokens.js`. The source is **standard DTCG** (W3C Design Tokens Community Group format: `$value`/`$type`, aliases as `{path.to.token}`) — any DTCG-aware tool can consume it directly.
- **Three tiers** — L1 primitives (immutable palette + sizes), L2 semantic (`bg-default`, `fg-muted`, `border-focus`…), L3 conceptual (`action-*`, `field-*`, `surface-*`).
- **Role prefixes name what the pixel IS, not which CSS property draws it** — `bg-*` surfaces and fills (including value-display fills and tracks), `fg-*` foreground ink (text AND icons — outlined icons draw with `stroke="currentColor"`, so their color is still `fg`), `border-*` boundaries, dividers and focus rings only. Cross-role binding is forbidden except where a target's value *is* the source's surface (a filled button's border = its fill). The full doctrine, with the sanctioned-exceptions table, lives on the gallery's Token Architecture page.
- **Components** in `components/components.css` consume tokens, never raw values. Color routes through the semantic tier — L2 roles (`bg-*`, `fg-*`, `border-*`, `surface-*`) by default, the L3 `action-*` / `field-*` / `surface-*` vocabularies where those concepts exist — L1 palette steps are reference material for those tiers, not for component CSS, and L2/L3 hold only references, never literals. Non-color scales are deliberately flatter: spacing and sizing bind the L1 `size-*` scale directly (there is no semantic spacing tier), while radius, shadow, opacity and motion expose role-named L2 aliases over their primitives. One hand-written stylesheet, nothing to compile.
- **Interactive behaviour** in `js/lb.js` — a single IIFE exposing `LB.{Accordion, Tabs, Modal, Table, List, …}`, all with auto-init via data attributes.
- **AI legibility** — `llms.txt` at the repo root is the machine-readable entry point (system summary + full component inventory), generated from `components/meta.json` via `scripts/build-llms.js`; regenerate it alongside `build-landing.js` after any meta change.

## Design principles

Three rules the whole system follows — grounded in measured evidence rather than current fashion:

- **Accent is a signal, not a skin.** A hue that appears everywhere stops
  meaning anything — so violet appears only where it carries information: the one **primary action** in a
  view, **links**, and **state** — selected, active, checked, focus — plus
  fills that *display* a value (slider, progress, spinner) and today-markers.
  Everything at rest is neutral: chips, secondary and ghost buttons, utility
  controls all use neutral text and borders until the user makes them mean
  something. When violet shows up, it always answers a question:
  *what's primary, where am I, what did I choose.*

  **A theme may carry up to two extra signals.** `accent-2` and `accent-3`
  are pre-provisioned, dormant slots. The names are deliberately numbers,
  not meanings: the slot doesn't presume what your second signal is — a
  premium tier, a promotional moment, a distinct product surface — but it
  must *be* one. The rules are the same ones accent already follows: one
  signal per meaning, applied consistently everywhere that meaning appears;
  never decoration; never a substitute for the neutral secondary action;
  and never two extra signals in one view without a reason a user could
  name. If you need a fourth signal, the answer isn't another slot — it's
  a better information design. Fill a slot in the theme editor (Color →
  Accent-2/-3) or in the letbe tokens Figma plugin — both run the same
  shared slot engine (`js/slot-engine.js`): the ramp, roles and button text are derived and
  contrast-measured; until then both slots mirror accent and the
  `.lb-btn--accent-2` / `--accent-3` variants render identical to primary.

- **Menu-opening controls always signal it.** A labeled button that opens a
  menu carries an always-visible chevron (never hover-only). Split buttons get
  a visually separated, permanent chevron segment. The kebab/ellipsis (⋯ / ⋮)
  is reserved for overflow of *secondary* actions — icon-only is fine there
  because the icon itself is the learned indicator; the avatar user-menu is
  the same idiom. Primary actions never live inside a menu. Every menu trigger
  also sets `aria-haspopup` — the visual and the semantics say the same thing.
- **Scrollable means visibly scrollable.** Containers that overflow show a
  subtle, always-present scrollbar thumb (transparent track, so nothing renders
  when there's nothing to scroll). Content discovery must not require
  interaction — hidden-until-scroll bars trade a real affordance for cosmetics.

## Pipeline

```
tokens/source-tokens.json  →  tokens/theme.css  →  components
        ↑                                        ↓
  letbe Figma plugin  ←  HTML viewer / theme editor exports
  (registers tokens as Figma variables so design stays in sync)
```

A single JSON is the source of truth: `tokens/source-tokens.json`, authored in
this repo. `scripts/build-tokens.js` generates `theme.css` from it, components
consume the tokens, and the
[letbe tokens Figma plugin](https://www.figma.com/community/plugin/1671570185456177314/letbe-tokens)
registers them as variables so the Figma library tracks the code. That library
is published on
[Figma Community](https://www.figma.com/community/file/1672532598361033237) —
the components rebuilt as Figma component sets, bound to the same variables.

## Bundled assets

All bundled media lives under `assets/`:

- **`assets/icons/`** — 246 SVG icons: [Lucide](https://lucide.dev/) outlined/filled set (ISC) plus one Lucide-style custom (`square-rounded.svg`), brand logos from [Simple Icons](https://simpleicons.org/) (CC0 code; logos remain trademarks of their owners) and `slack.svg` from [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT) — full details in [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md)
- **`assets/flags/`** — 172 country flags, [circle-flags by HatScripts](https://github.com/HatScripts/circle-flags) (MIT)
- **`assets/avatars/`** — local avatar images used in the Avatar demos
- **`assets/brand/`** — letbe.design logo, mark, favicon

See [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md) for full license texts. If you fork the DS, keep the `LICENSE.txt` files in `assets/icons/` and `assets/flags/` intact — that is the only thing the source licenses ask of you.

## Re-vendoring flags

If the Phone input's country list grows, re-run:

```bash
node scripts/fetch-flags.js           # fetch missing flags only
node scripts/fetch-flags.js --force   # re-fetch everything
```

## Versioning — what counts as breaking

letbe-ds follows [semver](https://semver.org/), and in a CSS+JS system the API
is: **documented class names, `data-lb-*` attributes, dispatched events and
their `detail` shapes, JS API methods, and token NAMES.**

- **Major** (`2.0.0`): renaming/removing any of the above, or changing required
  markup structure of a documented component.
- **Minor** (`1.1.0`): new components, new variants, new tokens — and **token
  VALUE changes** (that's theming, not breakage; visually-noticeable retunes
  are called out in the changelog so you can review before bumping).
- **Patch** (`1.0.1`): bug fixes with no API or intentional visual change.

Pin a tag in your CDN URLs or vendored copy; update by choice, reading
[CHANGELOG.md](./CHANGELOG.md) first.

## Accessibility

Accessibility is designed in AND audited — with receipts:

- **Measured contrast**: every meaningful token pairing in both themes is
  measured against WCAG (4.5:1 text, 3:1 non-text UI) by
  `scripts/audit-contrast.js`, and the full table ships in
  [`tokens/CONTRAST.md`](./tokens/CONTRAST.md) — regenerated on any token
  change, exit-code-gated for releases.
- **Automated audit**: every gallery page (all 82) passes
  [axe-core](https://github.com/dequelabs/axe-core) 4.10 with **zero
  violations** — names, roles, landmarks, nesting, keyboard-reachable
  scroll regions included.
- **Interaction models built to spec**: WCAG 2.2 dragging alternatives on
  every drag interaction (menu-move on the kanban, double-click reset on
  column resize), single-input OTP (SMS autofill + screen readers),
  focus-trapped modal drawers, `aria-live` announcements for board moves
  and filter results, APG-patterned sortable tables (`aria-sort` on `th`,
  native table role — deliberately not `role=grid`), visible labels (never
  placeholder-only), reduced-motion opt-outs across the board.
- **Recovery over interrogation**: destructive actions can offer an Undo
  toast instead of a confirmation dialog — which satisfies WCAG 3.3.4's
  *Reversible* branch rather than training people to click through
  confirmations. Actionable toasts get double the dismiss time, pause on
  hover and focus, and never announce assertively (a `role=alert` would
  race the button); persistence is one option away for the strictest
  reading of WCAG 2.2.1.

Honest scope: no formal assistive-technology test pass has been run yet —
if a screen reader, magnifier, or switch device trips over something, that
is a bug and reports are wanted.

## Privacy

The gallery is static: no cookies, no accounts, no cross-site tracking. Page
views are counted by Plausible Analytics — cookieless, no persistent
identifier, EU-hosted — and only when served from letbe.design (local copies
and forks send nothing). Three preferences live in `localStorage` on the
visitor's device; shipped fonts are self-hosted (the other third-party
requests are demo media from the letbe-media CDN and, on explicit choice, a
Google Fonts family in the theme editor). Full statement on the gallery's
[Privacy page](./privacy/).

## License

letbe-ds is **[MIT](./LICENSE)** — the source (CSS, JS, tokens, docs) AND the
demo media, including the Letbe music tracks. Free for any use, commercial
included. The only exclusions are the **letbe brand** (name, logo, mark) and
bundled third-party assets (icons, flags), which keep their original
permissive licenses — see [NOTICE](./NOTICE) and
[THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md).
