# Changelog

All notable changes to letbe-ds. Follows [Semantic Versioning](https://semver.org/)
— see "What counts as breaking" in the README before relying on an update.

## [1.4.0] — 2026-09-15

Minor: two new pieces both mihailo consumers had to build at site
level, one stepper variant, and two small fixes. No new tokens.

- **Lightbox** (`LB.Lightbox`, opt-in `js/components/lb-lightbox.js`).
  Any `<a href="image" data-lb-lightbox>` opens in an image viewer
  composed over the canonical modal anatomy: a dialog that hugs the
  image, caption headline + subline (`data-lb-caption`/`-sub` →
  figcaption → alt), 1-of-N counter, prev/next + arrow keys wrapping
  through the group, cross-fade (off under prefers-reduced-motion),
  blurred backdrop, full screen on phones. Group by a shared attribute
  value or a `[data-lb-gallery]` container. Modal owns focus trap,
  scroll lock, Esc, backdrop-click; modifier clicks and no-JS keep the
  plain link. No loader or zoom bundled.
- **Show More** (`LB.ShowMore`, core runtime). `data-lb-show-more="N"`
  collapses a grid to N rows of its rendered column count and reveals
  the rest via your own button (`data-lb-show-more-for`), wired with
  aria-expanded/controls and a swapped label; phone row override,
  scroll-back on collapse, ResizeObserver recompute, consumer-hidden
  tiles respected. Ships a `[data-lb-show-more] > [hidden]` rule so a
  tile's own display (inline styles included) never beats the collapse.
- **Stepper dots** (`.lb-stepper--dots`): 12px content-free track —
  filled complete/active, outlined upcoming, caption labels; the dot
  corner binds `radius.interactive`, so dots follow the theme's
  square/round preset.
- **Fix: focus trap ignores untabbable elements** (shared by Modal,
  Sheet and the new Lightbox) — hidden controls can no longer become
  trap edges that let Tab walk out of a dialog.
- **Fix:** `bar-chart-3` icon name aliases to the shipped `bar-chart`;
  the chat context-budget meter no longer throws on `getRatio()`.

## [1.3.0] — 2026-09-15

Minor: forms become a first-class surface — the custom pickers submit
like native controls and the DS ships the validation behaviour its
error skin always implied. No new tokens. Deletable consumer
workarounds: hidden-input mirroring, hand-rolled required checks and
validators around DS selects/datepickers.

- **Select is form-native.** `data-lb-name` renders a hidden input that
  submits with the form; `data-lb-required` announces the state;
  `getValue()` and side-effect-free `setValue(v)` land on the instance
  (the legacy `.value` setter routes there — it no longer fires change
  events or steals focus); `setError(msg)`/`clearError()` drive the
  existing error skin plus a `.lb-field__error` message with the
  standard alert icon and aria wiring; errors clear on selection and
  the field follows its form's reset. `lb-select-change` now bubbles.
- **DatePicker (input variant) is form-native.** `data-lb-name` renders
  hidden mirror(s) — `name-start`/`name-end` in range and week modes;
  `data-lb-format` picks the submitted serialization (`iso` default,
  LOCAL dates — no UTC shift; `epoch`; or a `formatValue(date, mode)`
  option; time mode submits `HH:MM`). Same `getValue`/`setError`/
  `clearError`/required/reset surface as Select; the trigger now also
  returns to its placeholder when a form reset clears the selection.
- **`LB.Form` — validation behaviour, thin by design.** Opt in with
  `data-lb-validate`: on submit it enforces required/email/url on
  native inputs, 6–15 national digits on the phone composition,
  required state on DS selects and datepickers, and — because
  `novalidate` silences the browser — every other native constraint in
  the form via the control's own localized message. Errors render the
  existing skin, the first invalid field is focused and scrolled into
  view, fields clear live as the user types or picks, and reset wipes
  the slate. Validation runs in the document capture phase, so consumer
  submit listeners only ever see submits that passed; `onValid`
  receives them explicitly. Sanitization and sending stay yours.

## [1.2.0] — 2026-09-15

Minor: one new public API (`LB.setFlagBasePath`), a theme-proof active
state on the header, and the library now owns its own box model. No new
tokens. Deletable consumer workarounds: flag-path rescue listeners,
select-trigger truncation rules, and dropdown-list `box-sizing`
patches.

- **Header: the active page is never colour-only.** Themes may map the
  selected ink to the default ink (mono themes do), which used to leave
  the current page indistinguishable. `--active` now draws an underline
  bar in the header bar and the vertical-nav treatment (selected fill +
  left bar) in the drawer — same non-colour signal family as nav and
  tabs.
- **lb-\* owns border-box.** Components always assumed border-box, but
  only the docs shell's reset delivered it — consumer pages without a
  global reset hit content-box overflow (dropdown options painting a
  horizontal scrollbar, select triggers overflowing their wrap). A
  scoped word-boundary reset at the top of components.css fixes every
  case at once; the deliberate content-box spots (grouped avatar,
  switch track, datepicker grids) are unaffected.
- **Select: long option labels truncate** with an ellipsis on the
  one-line trigger instead of wrapping it taller; the full label is
  mirrored into the trigger's `title`.
- **CDN-hosted assets resolve on the CDN.** The icon and flag path
  detectors kept only the script's pathname, so a CDN-hosted `lb.js`
  404'd its flags on the consumer's own domain. Both now use the script
  origin, and `LB.setFlagBasePath` ships as the escape hatch symmetric
  with `setIconBasePath`. (Icons load via `fetch()` — a foreign asset
  host must send CORS headers; jsDelivr does.)
- **tokens/README.md** documents the emitted custom-property names and
  the underscore→hyphen transform (`size.0_5x` → `--lb-size-0-5x`),
  including why a wrong spelling fails silently inside `calc()`.

## [1.1.1] — 2026-09-15

Patch: mobile overflow fixes across the library — no new tokens, no new
APIs, no markup changes required by consumers. Two known site-level
workarounds this release makes deletable: hiding the media player's
volume slider on phones, and any page-level transport-row wrap rules.

- **Media player: phones get a real narrow layout.** The compact
  container query moved from 320px (which real ~340–410px phone players
  never triggered, overflowing the box) to 480px of player width, and
  the reflow keeps the desktop shape: scrubber on its own line, then one
  line — play + times left, mute + volume right, the volume slider
  flexing between 48px and its desktop width as the smallest piece.
  `--video` hides the slider in the narrow layout (its row can't hold
  one on a phone line); the mute button stays as the sound control.
  Touch targets: coarse pointers still grow the transport buttons to
  48px.
- **Table: no more sideways page scroll on phones.** The wrap is now the
  containing block for the absolutely-positioned visually-hidden column
  labels, which used to stretch the page from inside scrolled-out
  columns.
- **Navigation: the horizontal bar scrolls in place** when its items
  can't fit a narrow screen, with the active-page underline and focus
  rings intact (the bottom hairline is now an inset shadow so the
  scroller can't clip it — pixel-identical rendering).
- **Tabs and segmented controls scroll in place** when their labels
  overflow, per the visible-when-overflowing scrollbar policy; the
  segmented focus ring moved inset so the scroller can't cut it.
- **Popover clamps into the viewport on open** — a panel centered on a
  trigger near the screen edge no longer renders half off-screen; its
  max-width also caps at the viewport minus gutters.
- **Inline datepicker scrolls its fixed grid in place** on narrow
  containers (time mode excluded — its dropdowns need the overflow).
- **Fields cap at their containing block**, so the phone input's wide
  country trigger + dial code composition fits small screens.
- **letbe.design defaults to dark mode** (site pages only — nothing a
  library consumer inherits).

## [1.1.0] — 2026-09-02

Minor: two dormant extra-accent slots (new token names, additive), the
two-face typography default (token values changed, no names), and the
shared slot engine. The full slot program is live across all three tools —
letbe.design's theme editor, the letbe tokens Figma plugin (which vendors
`js/slot-engine.js` byte-identical at ENGINE_VERSION 1.0.0), and the
Community library (components bound, dormant violet until themes fill
slots).

- **Shared slot engine.** The brand/accent math (OKLCH ramp, remap,
  measured planner, value-fill pick, pair audit) now lives in a pure,
  DOM-free `js/slot-engine.js` (`window.LetbeSlotEngine`, `ENGINE_VERSION`)
  that the theme editor consumes and the Figma plugin vendors verbatim —
  one engine, two tools, same bytes. Slot "filled" detection is structural
  (accent-N refs actually wearing their own identity) instead of
  presence-based — a hand-made `brand-N` palette without retargets now
  correctly reads dormant, a deliberate hand-retarget reads filled and is
  never overwritten by normalization, and re-filling over an existing
  palette warns before regenerating. Imported themes prefill each slot
  picker from the stored seed (`$extensions["design.letbe"].seeds`), not
  the snapped 500 step.
- **Fix: brand-engine dark picks for light seeds (WCAG).** For seeds whose
  lightness snapped to step ≤400, the dark-mode walk inverted: ink landed on
  the dark side (2.1:1-class text) and washes on the light side — affecting
  the accent slots AND the slot-1 brand knob (latent since the engine
  shipped; every preset snaps ≥500 and is byte-identical after the fix,
  except Ink's two dark washes which move one step darker — strictly more
  contrast). Dark ink is now measured (first stop clearing 4.5 vs the dark
  page and its own wash), washes always walk the dark side with a ≥700/≥900
  floor. Verified across seeds snapping 200–900: all accent manifest pairs
  pass both modes (worst 4.53). The editor now re-runs those pairs live
  after every slot fill/clear AND import, surfacing failures as a toast —
  themes exported by the older engine carry baked bad picks, so re-fill the
  slot from its seed after updating; exports now persist seed hexes in
  `$extensions["design.letbe"].seeds` to make that possible.
- **Second and third accent slots.** `accent-2` and `accent-3` ship as
  pre-provisioned, dormant L2/L3 vocabulary — per slot: 10 semantic roles
  (both themes) mirroring the accent family, 12 `action.*-accent-N-*`
  tokens mirroring primary's shape, and a `.lb-btn--accent-N` variant.
  **Visual delta: none** — dormant slots alias the same stops as accent
  (and the theme editor keeps them mirrored under a branded slot 1), so
  the new variants render identical to primary until a theme fills the
  slot (Theme Editor → Color: one seed color; ramp, roles and button text
  derived and contrast-measured in both themes; ✕ returns the slot to
  dormant). Focus never follows the extra slots. Doctrine: "Accent is a
  signal" gains the "up to two extra signals" amendment (README). 14 new
  WCAG pairs join the generated contrast receipt (78 total).
  Compatibility: older exports import cleanly (dormant slots are
  normalized to mirror the imported accent); a theme exported *with a
  filled slot* needs a letbe-ds build that knows the `brand-2`/`brand-3`
  palettes — this release or later.

- **Typography — two-face default.** `typography.family.display` and
  `.heading` now alias `{font.family.2}` (the headline face);
  `typography.family.action` moves to `{font.family.1}` — buttons share the
  text face, as every shipped preset already assumed. **Visual delta: none**
  — slot 2 ships the same Inter stack as slot 1, so nothing changes until a
  brand picks a headline font. Themes exported earlier carry their own full
  mapping and are unaffected. Slot semantics: 1 = text face, 2 = headline
  face, 3 = mono.
- **Theme editor.** The role→slot map is a first-class section (no longer
  collapsed under "Advanced"), slot captions derive live from the effective
  mapping, and the `code` role joins the map (all 7 L2 family roles
  editable). Presets shed their now-redundant family mappings.
- **Monospace micro-UI follows the code role.** Six spots (datepicker time
  colon, color-picker hex/number inputs, code-block title, calendar times)
  re-bind from the L1 slot to `--lb-typography-family-code` — identical
  rendering by default; remapping the code role now moves them too.
- **Typography page.** Missing specimens added (heading-xs/2xs, overline,
  code s/m/l); the role→slot table gains the code row and an overline note.

## [Unreleased → v1.0.0]

First public release. What ships:

- **Tokens**: 3-tier DTCG architecture (`tokens/source-tokens.json` → generated
  `theme.css`), ~500 tokens, native light/dark, responsive S/M/L typography modes,
  8-group/28-style type ramp (incl. overline + code tiers). Role-prefix doctrine
  is documented and normative — `bg-*` surfaces and fills, `fg-*` ink (text and
  icons), `border-*` boundaries; the prefix names what the pixel *is*, not the CSS
  property that draws it. Accent is a signal, not a skin: neutral at rest, accent
  only for primary action, links, selection, focus and value-display fills — the
  latter via the `bg.*-value` role family, tuned against its track rather than
  against text.
- **Components**: ~60 component families — forms, overlays, navigation, data viz
  (stat/sparkline/bar-list/donut/bar-chart/line-chart), media player, timeline,
  chat, command palette, tree, calendar, data table (density/search/filters/
  column visibility/resize/pinning/expansion/chunked append), kanban board
  (menu-move + pointer drag + keyboard, WCAG 2.5.7-first), toasts (four status
  variants plus a neutral actionable flavor carrying one Undo action).
- **Templates**: header, footer, auth (6 flows), app shell (3 styles + peek rail),
  AI chat, library view, inspector, playbar, composer dock, data-table view,
  dashboard (incl. the Store-overview commerce skeleton).
- **Theme editor**: live token editing across every gallery page — brand colour
  (a measured brand engine plans the whole primary interaction chain in both
  modes), radius, strokes, type slots and role map, viewport preview — with
  eight out-of-the-box presets (Letbe, Mono, Neon, Candy, Terra, Ocean,
  Editorial, Ink), each contrast-verified in both themes. Themes travel four
  ways through one import path: file (Import/Export), clipboard (Copy/Paste),
  link (`#theme=…`), and the Figma plugin round-trip.
- **Accessibility, with receipts**: every meaningful token pairing measured in
  both themes and published in `tokens/CONTRAST.md` (regenerated on every token
  change, exit-code-gated); every gallery page passes axe-core with zero
  violations; every component page carries an "a11y (built in)" paragraph whose
  claims are verified against the source. Interaction models are built to spec:
  dragging alternatives, focus-trapped drawers, live-region announcements,
  labelled comboboxes, reduced-motion opt-outs, undo over confirmation for
  reversible actions.
- **Documentation**: every component, chart and template page carries the same
  triad — intro, a11y, Usage — plus live code samples; `components/meta.json`
  is the machine-readable inventory (name, description, usage for all 80
  entries) that generates the landing page and `llms.txt`; the About page and
  the Token Architecture page carry the reasoning behind the system.
- **Principles**: no build step, zero dependencies, pluggable engines (the DS
  ships chrome/state/events; you bring data layers, virtualizers, AI models,
  streaming engines), accessibility-first interaction models throughout.
- **Media**: demo tracks and the brand film are served from the companion
  `letbe-media` repo via CDN (also MIT); the gallery ships only its own images.
