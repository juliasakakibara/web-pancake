# `js/components/` — Optional component modules

Heavy or composition-specific letbe-ds components live here as standalone
files loaded via additional `<script>` tags after `js/lb.js`. Pages opt
in to only what they need; the core `js/lb.js` stays leaner for pages
that don't use these components.

## Why this folder exists

`js/lb.js` is the framework-agnostic core of letbe-ds. It ships every
foundational component (Button, Input, Modal, Card, etc.) plus shared
utilities (`pointerDrag`, `fmtTime`, icon system, `init()`). Components
in this folder are **heavy** (>500 lines), **opt-in for editor/media
surfaces**, or **bring dependencies on engines** the consumer must
provide (per the pluggable-engine HARD rule).

Each module is one file: one class per file at present.

## What lives here today

| Module | Class | Selector | Notes |
|---|---|---|---|
| `lb-media.js` | `LB.Media` | `[data-lb-media]` | Audio/video player skin over a native `<audio>`/`<video>`. Engine pluggable (`hls.js` / `shaka-player` for HLS/DASH). |
| `lb-timeline.js` | `LB.Timeline` | `[data-lb-timeline]` | Trim/playhead/ruler/zoom primitive. Composes with `LB.Media` via consumer-side wiring but doesn't depend on it. Emits `lb-timeline-selection` for popover-composer composition (see `lb-chat-composer-popover.js`). |
| `lb-chat.js` | `LB.Bubble`, `LB.Thread`, `LB.Composer`, `LB.ToolCall`, `LB.ConvList` | `[data-lb-bubble]`, `[data-lb-thread]`, `[data-lb-composer]`, `[data-lb-tool-call]`, `[data-lb-conv-list]` | AI Chat primitives: message bubble, thread (with role=log live region), composer workbench, tool-call card, conversation sidebar with listbox semantics + kebab menu. |
| `lb-chat-workspace.js` | `LB.ChatWorkspace`, `LB.ContextBudgetBar` | `[data-lb-chat-workspace]`, `[data-lb-context-budget-bar]` | Opt-in dashboard shell + Layout A "Conversational". Settings dock (density / width / line-height), mode selector, layout switcher, mobile drawer, layout registry. Sidebar/main divider uses `LB.Resizable`. |
| `lb-chat-artifact.js` | `LB.Artifact` | `[data-lb-artifact]` | Right-rail Artifacts panel for code / preview output. Tabs (Preview/Code) via `LB.Tabs`, artifact + version selectors via `LB.Select`, Code panel via `lb-code-block`. Augments `LB.ChatWorkspace.prototype` with `openArtifact / closeArtifact / getArtifact`. |
| `lb-chat-composer-popover.js` | `LB.openComposerPopover` *(factory)* | *none — summoned imperatively* | Compact `LB.Composer` inside an `.lb-popover` surface, anchored to a rect. The integration point for music/voice editor surfaces — see the Timeline workspace layout. |
| `lb-chat-workspace-dev.js` | *registers layout `'dev'` on `LB.ChatWorkspace`* | *none* | Layout B — the code-assistant shape. Sidebar collapsed, Ask/Edit/Agent/Plan modes, Artifact rail open. |
| `lb-chat-workspace-timeline.js` | *registers layout `'timeline'` on `LB.ChatWorkspace`* | *none* | Layout C — the generation/timeline shape. Timeline takes the main canvas; composer is summoned via `LB.openComposerPopover` anchored to `lb-timeline-selection`. |

### AI Chat module pattern

The AI Chat arc establishes a convention for component sets that grow
beyond a single file:

- One **primitives** module (`lb-chat.js`): foundational classes that
  work standalone in any layout the consumer builds. No assumptions
  about chrome.
- A **shell** module (`lb-chat-workspace.js`): one opt-in composition
  of the primitives, with a registry for alternative arrangements.
- One **module per arrangement** (`lb-chat-workspace-{converse,dev,timeline}.js`):
  each self-registers via `LB.ChatWorkspace.registerLayout(id, {label, build})`.
  Including the script makes the layout available in the title-bar
  switcher (which becomes visible once 2+ layouts are loaded). Layouts
  are dormant until activated — no DOM is mounted, no listeners
  attached, until the user (or `setLayout()`) picks them.
- **Extension** modules (`lb-chat-artifact.js`, `lb-chat-composer-popover.js`):
  augment the existing surfaces with optional capabilities. Where it
  makes sense they patch helpers onto `LB.ChatWorkspace.prototype` so
  consumers get integrated methods (e.g., `ws.openArtifact(...)`).

Per the pluggable-engine HARD rule, none of these modules wrap a model
API, persist conversations, sandbox previews, or implement markdown.
Consumers bring the engine; letbe-ds ships the chrome.

Future candidates for extraction (heaviest classes in lb.js, in order):
Calendar (~994 lines), DatePicker (~836), ColorPicker (~580). Extract
on demand — none are blocking core pages.

## How to add a new component module

### 1. File skeleton

Use this exact wrapper for every new file in this folder:

```js
/**
 * lb-{name}.js — LB.{Name} short description
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register() so any [data-lb-{name}] element gets auto-init when
 * LB.init() runs (or immediately if registration happens AFTER
 * DOMContentLoaded).
 *
 * Dependencies — all from the public LB API:
 *   - LB.fmtTime          (if used)
 *   - LB.pointerDrag      (if used)
 *   - LB.icon, LB.initIcons, LB.iconPreload  (via window.LB)
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-{name}] LB is not defined — load js/lb.js before js/components/lb-{name}.js');
    return;
  }

  const LB = window.LB;
  const fmtTime = LB.fmtTime;          // destructure only what you use
  const pointerDrag = LB.pointerDrag;

  // ─── {NAME} ───────────────────────────────────────────────
  // … class body identical to what it would be inside lb.js …

  class MyComponent {
    constructor(el) { /* … */ }
    // …
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.MyComponent = MyComponent;
  LB.register('myComponent', MyComponent, '[data-lb-my-component]');
})();
```

### 2. `LB.register(name, ClassRef, selector?)` contract

| Argument | Type | Purpose |
|---|---|---|
| `name` | `string` (camelCase) | Identifies the registration; becomes the property key on host elements as `_lb{Name}` (PascalCase). For `register('media', ...)`, instances live at `el._lbMedia`. |
| `ClassRef` | `class` | Constructor invoked as `new ClassRef(el)` for each match. |
| `selector` | `string` (optional) | CSS selector for auto-init sweep. Omit for components instantiated only programmatically (e.g., `ToastManager`). |

Behaviour:
- Adds the registration to an internal list iterated by `LB.init(root)`.
- If `LB.init` has **already** run (`document.readyState !== 'loading'`),
  `register()` immediately sweeps `document` so the component activates
  on existing DOM. **You don't need to handle the load-order race** —
  modules can load before or after lb.js's auto-init, and both work.
- Idempotent: existing `el._lb{Name}` instances are not re-created on
  subsequent `init()` calls.

### 3. Dependency rules — STRICT

Modules can use **only the public `LB` API**. They cannot reach into
private functions inside the lb.js IIFE.

If a new component needs a helper that's currently private in lb.js
(e.g., `escapeHtml`, `niceTicks`):

- **Option A (preferred)**: promote the helper to the public LB API in
  the same slice that introduces the module. Discuss the addition
  before the extraction.
- **Option B**: copy the helper into the new module file as a local
  function. Acceptable only if the helper is small (<20 lines) and
  unlikely to be needed elsewhere. Note the duplication in the commit.

Currently public utilities the modules in this folder use:

- `LB.fmtTime(seconds) → "MM:SS"` (or `"H:MM:SS"` for ≥ 1hr)
- `LB.pointerDrag(captureEl, opts)` — shared drag lifecycle (see
  the JSDoc at the top of `lb.js`)
- `LB.icon(name, targetEl)`, `LB.initIcons(root)`, `LB.iconPreload(names)`
- `LB.Slider` (constructor; needed by `LB.Timeline` for inner zoom slider)
- `LB.register(name, Class, selector?)` itself

### 4. Page integration

Load order is one-way: **lb.js first, then any modules in this folder**.

```html
<script src="../js/lb.js"></script>
<script src="../js/components/lb-media.js"></script>
<script src="../js/components/lb-timeline.js"></script>
<!-- Then your demo/usage script -->
```

Pages that don't use Media or Timeline don't load the corresponding
module — they get a smaller payload.

## Testing checklist for a new extraction

After writing the new module + removing the class from lb.js:

1. **Syntax**: `node --check js/lb.js` and `node --check js/components/lb-{name}.js` both pass.
2. **Regression**: open a demo page that does NOT use the new module
   (e.g., `/button/`) and verify zero console errors. Confirm
   `LB.{Name}` is `undefined` (proves the module isn't bleeding into
   the core).
3. **Activation**: open the module's own demo page and verify:
   - `LB.{Name}` is a function
   - Every `[data-lb-{name}]` element has `_lb{Name}` set
   - The class's primary interactions still work (drag, click, keyboard)
   - Zero console errors
4. **Coexistence**: open any page that uses multiple modules (e.g.,
   `/timeline/` uses both Media and Timeline) and verify both
   activate cleanly.
5. **Late-load safety**: simulate the module loading AFTER
   `DOMContentLoaded` — `LB.register` should sweep existing DOM and
   activate matches immediately.

Each slice should ship one extraction with the above verification
recorded in the commit message.

## Existing single-component scripts outside this folder

The DS already has three loose script files in `js/`:

- `theme-editor.js` (~2,470 lines) — Theme Editor floating panel
- `gallery-layout.js` (~700 lines) — Gallery navigation rail
- `token-exporter.js` (~50 lines) — Theme Editor's export action

These predate the modularization arc and follow their own conventions.
They are not subject to the `LB.register()` pattern (they don't carry
auto-init selectors — they're loaded explicitly by the gallery pages).
New components go in `js/components/` and follow the pattern here.
