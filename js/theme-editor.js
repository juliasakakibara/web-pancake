/**
 * theme-editor.js — Letbe-DS visual theme editor (rewrite)
 *
 * SINGLE SOURCE OF TRUTH design — every visible token comes from one of
 * three layers, top wins:
 *
 *   3. overrides — user knobs (brand, radius, fontSlots, baseSizes,
 *                  familyMap, strokeAction/Decorative/Icon). Counted
 *                  by the badges.
 *   2. baseline  — imported JSON (or a saved baseline). Acts as the
 *                  "zero overrides" state.
 *   1. canonical — tokens/source-tokens.json (loaded once on startup).
 *
 * State object (persisted to localStorage):
 *   { baseline: null | <DTCG JSON>, overrides: { brand, radius, … } }
 *
 * Rendering: deepMerge(canonical, baseline, computeOverrideJson(...)) →
 * jsonToCss(merged) → set the textContent of <style id="lb-theme-editor">.
 *
 * The editor NEVER writes inline `--lb-*` to :root. It NEVER emits CSS
 * via setProperty. Every action is a state transformation followed by
 * one render() call. There is no event bus between editor parts.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'letbe-ds-theme-editor-v2';
  const STYLE_EL_ID = 'lb-theme-editor';
  const root = document.documentElement;

  // ════════════════════════════════════════════════════════════
  //   1. Constants & math
  // ════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════
  //   1. Constants & math — now the SHARED slot engine
  // ════════════════════════════════════════════════════════════
  // The brand/accent math lives in js/slot-engine.js (pure, DOM-free) so
  // the letbe tokens plugin can vendor the exact same engine. Load order:
  // slot-engine.js BEFORE this file on every page.
  const {
    STEPS, PALETTE_STEPS, snapToStep, shiftStep,
    hexToRgb, rgbToOklch, contrastRatio, generatePalette,
    computeAccentRemap, planBrandPrimary, computeValueFillStep,
  } = window.LetbeSlotEngine;
  const _engineAuditAccentPairs = window.LetbeSlotEngine.auditAccentPairs;
  const INK_LIGHT = window.LetbeSlotEngine.CANON.inkLight,
        INK_DARK  = window.LetbeSlotEngine.CANON.inkDark;

  // ────────────────────────────────────────────────
  //   Knob preset tables (preserved byte-for-byte from v1)
  // ────────────────────────────────────────────────

  const RADIUS_PRESETS = [
    { name: 'Square',  interactive: 'radius.0',    field: 'radius.0',    surface: 'radius.0',    overlay: 'radius.0',     media: 'radius.0',    full: 'radius.0',     badge: 'radius.0' },
    { name: 'Soft',    interactive: 'radius.2',    field: 'radius.2',    surface: 'radius.4',    overlay: 'radius.4',     media: 'radius.4',    full: 'radius.4',     badge: 'radius.4' },
    { name: 'Rounded', interactive: 'radius.4',    field: 'radius.4',    surface: 'radius.8',    overlay: 'radius.12',    media: 'radius.8',    full: 'radius.12',    badge: 'radius.9999' },
    { name: 'Pill',    interactive: 'radius.9999', field: 'radius.9999', surface: 'radius.8',    overlay: 'radius.12',    media: 'radius.8',    full: 'radius.9999',  badge: 'radius.9999' },
  ];

  const STROKE_DECORATIVE_PRESETS = [
    { name: 'None',   ref: 'size.0' },
    { name: 'Thin',   ref: 'size.hairline' },
    { name: 'Medium', ref: 'size.0_5x' },
  ];

  // ── Theme presets ──────────────────────────────────────────
  // Curated starting points, not skins: each preset fills the SAME knobs a
  // user can reach by hand (brand hex, radius, strokes, font slots + role
  // map), so applying one is a head start that stays fully tweakable and
  // exportable. Every color pair was measured through generatePalette +
  // computeAccentRemap against WCAG AA (Ink: AAA) — spec + full contrast
  // tables in ds-knowledge/theme-presets-spec.md.
  // Presets apply in whichever site theme (light/dark) the viewer is in —
  // every preset is contrast-verified in BOTH modes, and yanking someone
  // out of dark mode broke viewer consistency (owner call, 2026-08-10).
  // "Letbe" is the factory card: it clears the baseline too.
  const THEME_PRESETS = [
    { name: 'Letbe', dot: '#7C3AED', factory: true, knobs: {} },
    { name: 'Mono',  dot: '#605d59',
      knobs: { brand: '#605d59', radius: 0, strokeDecorative: 1, strokeIcon: 0,
               fontSlots: { 1: 'Inter', 2: 'Space Grotesk', 3: 'Space Mono' } } },
    { name: 'Neon',  dot: '#007c00',
      knobs: { brand: '#007c00', radius: 0, strokeDecorative: 1, strokeIcon: 0,
               fontSlots: { 1: 'IBM Plex Sans', 2: 'Space Grotesk', 3: 'JetBrains Mono' } } },
    { name: 'Candy', dot: '#c73a72',
      knobs: { brand: '#c73a72', radius: 3, strokeDecorative: 2, strokeIcon: 2,
               fontSlots: { 1: 'Nunito', 2: 'Baloo 2', 3: 'JetBrains Mono' } } },
    { name: 'Terra', dot: '#b8542f',
      knobs: { brand: '#b8542f', radius: 1, strokeDecorative: 1, strokeIcon: 1,
               fontSlots: { 1: 'Nunito Sans', 2: 'Fraunces', 3: 'IBM Plex Mono' } } },
    { name: 'Ocean', dot: '#364fc7',
      knobs: { brand: '#364fc7', radius: 2, strokeDecorative: 1, strokeIcon: 1,
               fontSlots: { 1: 'Inter', 2: 'Schibsted Grotesk', 3: 'JetBrains Mono' } } },
    { name: 'Editorial', dot: '#8a3042',
      knobs: { brand: '#8a3042', radius: 0, strokeDecorative: 1, strokeIcon: 0,
               fontSlots: { 1: 'Libre Franklin', 2: 'Bodoni Moda', 3: 'Courier Prime' } } },
    { name: 'Ink',   dot: '#3b3e82',
      knobs: { brand: '#3b3e82', radius: 0, strokeDecorative: 2, strokeIcon: 2,
               fontSlots: { 1: 'Atkinson Hyperlegible Next', 2: 'Lexend', 3: 'JetBrains Mono' } } },
  ];

  const STROKE_ICON_PRESETS = [
    { name: 'Thin',  ref: 'size.hairline' },
    { name: 'Brand', ref: 'size.theme' },
    { name: 'Bold',  ref: 'size.0_5x' },
  ];

  const ACTION_STROKE_MIN = 0;
  const ACTION_STROKE_MAX = 3;


  // ── Google Fonts curated list (phase 2.1) ──
  // Curated subset — variable fonts where possible, x-heights within
  // ~10% of Inter to keep mixed-family layouts visually consistent.
  // 'fallback' is appended after the chosen face when emitting CSS so
  // the user gets system fonts during the @font-face load + as a safety
  // net if Google Fonts is blocked.
  const GOOGLE_FONTS = [
    // Sans-serif (the primary default family)
    { name: 'Inter',             category: 'sans-serif', featured: true, weights: [400, 500, 600, 700] },
    { name: 'DM Sans',           category: 'sans-serif', featured: true, weights: [400, 500, 700] },
    { name: 'Plus Jakarta Sans', category: 'sans-serif', featured: true, weights: [400, 500, 600, 700] },
    { name: 'Manrope',           category: 'sans-serif', featured: true, weights: [400, 500, 600, 700] },
    { name: 'Outfit',            category: 'sans-serif', weights: [400, 500, 600, 700] },
    { name: 'Public Sans',       category: 'sans-serif', weights: [400, 500, 600, 700] },
    { name: 'Source Sans 3',     category: 'sans-serif', weights: [400, 500, 600, 700] },
    { name: 'Work Sans',         category: 'sans-serif', weights: [400, 500, 600, 700] },
    { name: 'IBM Plex Sans',     category: 'sans-serif', weights: [400, 500, 600, 700] },
    { name: 'Roboto',            category: 'sans-serif', weights: [400, 500, 700] },
    { name: 'Open Sans',         category: 'sans-serif', weights: [400, 500, 600, 700] },
    // Serif
    { name: 'Noto Serif',        category: 'serif', weights: [400, 700] },
    { name: 'Lora',              category: 'serif', weights: [400, 500, 600, 700] },
    { name: 'Source Serif 4',    category: 'serif', weights: [400, 600, 700] },
    { name: 'Fraunces',          category: 'serif', weights: [400, 500, 600, 700] },
    { name: 'Playfair Display',  category: 'serif', weights: [400, 600, 700] },
    // Display / personality
    { name: 'Space Grotesk',     category: 'display', weights: [400, 500, 600, 700] },
    { name: 'Bricolage Grotesque', category: 'display', weights: [400, 500, 600, 700] },
    // Monospace
    { name: 'Roboto Mono',       category: 'mono', featured: true, weights: [400, 500, 700] },
    { name: 'JetBrains Mono',    category: 'mono', featured: true, weights: [400, 500, 700] },
    { name: 'Fira Code',         category: 'mono', weights: [400, 500, 700] },
    { name: 'IBM Plex Mono',     category: 'mono', weights: [400, 500, 700] },
  ];

  // System fallback chain per category — appended after the chosen face
  // when emitting CSS. Keeps render predictable when Google Fonts is
  // slow / blocked / disabled by the user's DNS-block / privacy add-on.
  const FONT_FALLBACKS = {
    'sans-serif':  ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
    'serif':       ['Georgia', '"Times New Roman"', 'serif'],
    'display':     ['system-ui', 'sans-serif'],
    'mono':        ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
    // Added in Slice 2 alongside the full Google Fonts catalog. The snapshot
    // exposes ~200 handwriting families; fallback to system cursive.
    'handwriting': ['cursive'],
  };

  // Roles bound by default to each slot. Used by the editor's role-map
  // UI to show "what's affected" hints next to each slot.
  // Two-face default (canonicalized 2026-08-21): slot 1 = the text face
  // (body + UI), slot 2 = the headline face (display + heading), slot 3 =
  // mono. Matches every shipped preset and the industry norm (headline
  // font + body font; buttons share the body font).
  const DEFAULT_SLOT_ROLES = {
    1: ['body', 'action', 'label', 'caption'],
    2: ['display', 'heading'],
    3: ['code'],
  };

  // L2 typography roles in display order — used by the role-map UI.
  const TYPO_ROLES = ['display', 'heading', 'body', 'action', 'label', 'caption', 'code'];

  // ── Base font size per mode (phase 2.1) ──
  // Default 16 across all modes. Sliders constrained to 14-20 to keep
  // accessibility margins; below 14 body text gets uncomfortable, above
  // 20 the cascade math overflows comfortable line-heights.
  const BASE_SIZE_MIN = 14;
  const BASE_SIZE_MAX = 20;
  const BASE_SIZE_DEFAULT = 16;

  // ── Lazy Google Fonts loader ──
  // Single in-flight Promise per font name so repeated picks don't
  // re-inject the <link>. Loaded fonts persist in localStorage so the
  // next page load injects them up front (avoiding FOIT). Bounded list
  // — last 8 used.
  const FONTS_LOADED_KEY = 'letbe-ds.fontsLoaded';
  const _fontLoadPromises = {};

  function _loadedFontsList() {
    try {
      const raw = localStorage.getItem(FONTS_LOADED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function _rememberFontLoaded(name) {
    const list = _loadedFontsList().filter(n => n !== name);
    list.unshift(name);
    try { localStorage.setItem(FONTS_LOADED_KEY, JSON.stringify(list.slice(0, 8))); } catch {}
  }
  function loadGoogleFont(name) {
    if (!name) return Promise.resolve();
    // Already cached / pre-loaded by index.html static <link>?
    if (_fontLoadPromises[name]) return _fontLoadPromises[name];

    const meta = _findFont(name);
    const weights = meta ? meta.weights : [400, 500, 600, 700];
    const id = 'gfont-' + name.replace(/\s+/g, '-');
    if (document.getElementById(id)) {
      _fontLoadPromises[name] = Promise.resolve();
      return _fontLoadPromises[name];
    }

    _fontLoadPromises[name] = new Promise((resolve) => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name)
        + ':wght@' + weights.join(';')
        + '&display=swap';
      link.onload = () => { _rememberFontLoaded(name); resolve(); };
      link.onerror = () => resolve(); // fall through to fallback chain
      document.head.appendChild(link);
    });
    return _fontLoadPromises[name];
  }

  // Pre-load any fonts the user picked previously so subsequent page
  // loads don't flash unstyled. Bounded to 8 most recent.
  function preloadRecentFonts() {
    _loadedFontsList().forEach(n => loadGoogleFont(n));
  }

  // Load the Google Font referenced by each L1 family slot in a baseline.
  // Without this, importJson() / saveAsBaseline() / bootstrap-rehydrate
  // would emit `--lb-font-family-N: <ImportedFont>, …` into CSS but never
  // fetch the actual webfont — the browser then silently falls through
  // the family stack (typically Georgia / system serif). Idempotent:
  // loadGoogleFont() de-dupes by name, so duplicate calls for the same
  // font are no-ops. Safe on null/empty baselines.
  function loadBaselineFonts(baselineJson) {
    const fam = baselineJson && baselineJson.primitives
      && baselineJson.primitives.font && baselineJson.primitives.font.family;
    if (!fam) return;
    for (const slot of ['1', '2', '3']) {
      const t = fam[slot];
      if (!t || t.$value == null) continue;
      const v = t.$value;
      let first = null;
      if (Array.isArray(v)) first = v[0];
      else if (typeof v === 'string') first = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (first) loadGoogleFont(first);
    }
  }

  // Build the L1 font-family $value (array form) for a chosen font name.
  function buildFamilyValue(name) {
    if (!name) return null;
    const meta = _findFont(name);
    const category = (meta && meta.category) || 'sans-serif';
    const fallbacks = FONT_FALLBACKS[category] || FONT_FALLBACKS['sans-serif'];
    return [name, ...fallbacks.map(f => f.replace(/^"|"$/g, ''))];
  }

  // ── Full Google Fonts catalog (Slice 1 + Slice 2) ──
  // Lazy-loaded from tokens/google-fonts-catalog.json on first picker open
  // (eagerly kicked off at bootstrap so it's usually warm by then).
  // Falls back to the curated 22-font GOOGLE_FONTS list above on any
  // failure — picker degrades gracefully.
  let _fontCatalogCache = null;
  let _fontCatalogPromise = null;

  function _resolveCatalogUrl() {
    const link = document.querySelector('link[rel="stylesheet"][href*="tokens/theme.css"]');
    if (link) return link.href.replace(/theme\.css(\?.*)?$/, 'google-fonts-catalog.json');
    const baseAttr = document.body && document.body.getAttribute('data-lb-base');
    const prefix = baseAttr ? baseAttr.replace(/\/$/, '') + '/' : '';
    return prefix + 'tokens/google-fonts-catalog.json';
  }

  function loadFontCatalog() {
    if (_fontCatalogCache) return Promise.resolve(_fontCatalogCache);
    if (_fontCatalogPromise) return _fontCatalogPromise;
    _fontCatalogPromise = fetch(_resolveCatalogUrl(), { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        if (!data || !Array.isArray(data.fonts)) throw new Error('Bad shape');
        // Normalise category labels: snapshot ships 'monospace', existing
        // FONT_FALLBACKS keys it as 'mono'. Keep one canonical label
        // internal to the editor.
        _fontCatalogCache = data.fonts.map(f => ({
          name: f.name,
          category: f.category === 'monospace' ? 'mono' : f.category,
          weights: Array.isArray(f.weights) && f.weights.length ? f.weights : [400],
          featured: !!f.featured,
        }));
        return _fontCatalogCache;
      })
      .catch(err => {
        console.warn('[theme-editor] Google Fonts catalog snapshot unavailable; using curated 22-font list.', err);
        _fontCatalogCache = GOOGLE_FONTS.slice();
        return _fontCatalogCache;
      });
    return _fontCatalogPromise;
  }

  // Synchronous accessors. Use these when the catalog might not be
  // loaded yet — they return the curated 22 as a safe placeholder.
  function fontCatalog() {
    return _fontCatalogCache || GOOGLE_FONTS;
  }
  // Map<name → meta> built lazily; rebuilt when the catalog changes.
  // Kept separate from the array so iteration order remains stable.
  let _fontByName = null;
  let _fontByNameSource = null;
  function _findFont(name) {
    const cat = fontCatalog();
    if (_fontByNameSource !== cat) {
      _fontByName = new Map(cat.map(f => [f.name, f]));
      _fontByNameSource = cat;
    }
    return _fontByName.get(name);
  }


  // ════════════════════════════════════════════════════════════
  //   2. JSON helpers + JSON-to-CSS pipeline (lifted from
  //      token-applier.js, returns a string instead of writing CSS)
  // ════════════════════════════════════════════════════════════

  const SHADOW_L1_RENAME = { focus: 'ring' };

  function getByPath(rootObj, dotted) {
    return dotted.split('.').reduce(
      (cur, p) => (cur && cur[p] !== undefined) ? cur[p] : undefined,
      rootObj
    );
  }
  function pathToCssVar(dotted) {
    const parts = dotted.split('.');
    if (parts[0] === 'primitives' || parts[0] === 'semantic' || parts[0] === 'component') parts.shift();
    if (parts[0] === 'light' || parts[0] === 'dark') parts.shift();
    if (parts.length >= 2 && parts[0] === parts[1]) parts.shift();
    if (parts[0] === 'typography' && parts[1] === 'text') parts.splice(1, 1);
    return '--lb-' + parts.join('-').replace(/_/g, '-');
  }
  function resolveRefToCssVar(data, ref, themeMode) {
    const refPath = ref.replace(/^\{/, '').replace(/\}$/, '');
    const candidates = [
      `primitives.${refPath}`,
      `semantic.${themeMode}.${refPath}`,
      `semantic.${refPath}`,
      `component.${refPath}`,
    ];
    for (const cand of candidates) {
      const node = getByPath(data, cand);
      if (node && typeof node === 'object' && '$value' in node) {
        if (cand === 'primitives.shadow.focus') return 'var(--lb-shadow-ring)';
        return `var(${pathToCssVar(cand)})`;
      }
    }
    return ref;
  }
  function renderValue(data, val, themeMode) {
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) {
      return val.map(f => /\s/.test(f) ? `"${f}"` : f).join(', ');
    }
    if (typeof val === 'string') {
      return val.replace(/\{[^}]+\}/g, (m) => resolveRefToCssVar(data, m, themeMode));
    }
    return String(val);
  }
  function renderShadow(data, shadow, themeMode) {
    const { x, y, blur, spread, color, opacity } = shadow;
    const resolvedColor = typeof color === 'string' && color.startsWith('{')
      ? resolveRefToCssVar(data, color, themeMode)
      : color;
    const opacityPct = Math.round((opacity || 1) * 100);
    return `${x} ${y} ${blur} ${spread} color-mix(in srgb, ${resolvedColor} ${opacityPct}%, transparent)`;
  }

  /**
   * Walk a DTCG-shaped JSON and emit a CSS string with :root + dark blocks.
   * Same algorithm as the old token-applier.js, but pure: produces a string.
   */
  function jsonToCss(data) {
    if (!data.primitives || !data.semantic || !data.component) {
      throw new Error('Invalid token data — missing primitives / semantic / component');
    }
    const rootDecls = [];
    const darkDecls = [];
    const push = (bucket, name, value) => bucket.push(`  ${name}: ${value};`);

    // L1 — palettes (required + optional brand)
    const REQUIRED = ['neutral', 'red', 'green', 'yellow', 'blue', 'violet', 'orange', 'cyan'];
    const OPTIONAL = ['brand', 'brand-2', 'brand-3'];
    for (const palette of REQUIRED.concat(OPTIONAL)) {
      const scales = data.primitives[palette];
      if (!scales) continue;
      for (const step in scales) {
        const tok = scales[step];
        if (tok && tok.$value !== undefined) {
          push(rootDecls, `--lb-${palette}-${step}`, renderValue(data, tok.$value, 'light'));
        }
      }
    }
    // L1 — size
    if (data.primitives.size) {
      for (const k in data.primitives.size) {
        const t = data.primitives.size[k];
        if (t.$value !== undefined) push(rootDecls, `--lb-size-${k.replace(/_/g, '-')}`, renderValue(data, t.$value, 'light'));
      }
    }
    // L1 — font.{family,size,weight,line-height,letter-spacing,base,scale-ratio}
    // Note: 'base' and 'scale-ratio' added phase 2.1. Per-mode primitives
    // emitted as --lb-font-base-S / -M / -L and --lb-font-scale-ratio-S / -M / -L
    // matching scripts/build-tokens.js so theme.css and editor stay in lockstep.
    const font = data.primitives.font || {};
    for (const sub of ['family', 'size', 'weight', 'line-height', 'letter-spacing']) {
      if (!font[sub]) continue;
      for (const k in font[sub]) {
        const t = font[sub][k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-font-${sub}-${k}`, renderValue(data, t.$value, 'light'));
      }
    }
    // L1 — font.base.{S,M,L} (phase 2.1)
    if (font.base) {
      for (const mode of ['S', 'M', 'L']) {
        const t = font.base[mode];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-font-base-${mode}`, renderValue(data, t.$value, 'light'));
      }
    }
    // L1 — font.scale-ratio.{S,M,L} (phase 2.1)
    if (font['scale-ratio']) {
      for (const mode of ['S', 'M', 'L']) {
        const t = font['scale-ratio'][mode];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-font-scale-ratio-${mode}`, String(t.$value));
      }
    }
    // L1 — radius / opacity / duration / ease / z
    for (const grp of ['radius', 'opacity', 'duration', 'ease', 'z']) {
      if (!data.primitives[grp]) continue;
      for (const k in data.primitives[grp]) {
        const t = data.primitives[grp][k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-${grp}-${k}`, renderValue(data, t.$value, 'light'));
      }
    }
    // L1 — shadow primitives (focus → ring rename)
    if (data.primitives.shadow) {
      for (const name in data.primitives.shadow) {
        const t = data.primitives.shadow[name];
        if (!t || !t.$value) continue;
        const out = SHADOW_L1_RENAME[name] || name;
        push(rootDecls, `--lb-shadow-${out}`, renderShadow(data, t.$value, 'light'));
      }
    }

    // L2 — semantic colors per theme (light → :root, dark → [data-theme="dark"])
    const colorGroups = ['fg', 'bg', 'border', 'data', 'code'];
    for (const themeName of ['light', 'dark']) {
      const node = data.semantic[themeName];
      if (!node) continue;
      const bucket = themeName === 'light' ? rootDecls : darkDecls;
      for (const grp of colorGroups) {
        if (!node[grp]) continue;
        for (const name in node[grp]) {
          const t = node[grp][name];
          if (t && t.$value !== undefined) push(bucket, `--lb-${grp}-${name}`, renderValue(data, t.$value, themeName));
        }
      }
    }

    // L2 — typography family aliases (phase 2.1) — one per role.
    // Composite tokens reference these via {typography.family.<role>}.
    const tFamily = data.semantic.typography && data.semantic.typography.family;
    if (tFamily) {
      for (const role in tFamily) {
        const t = tFamily[role];
        if (t && t.$value !== undefined) {
          push(rootDecls, `--lb-typography-family-${role}`, renderValue(data, t.$value, 'light'));
        }
      }
    }

    // L2 — typography composites (theme-agnostic)
    // Collect per-token $modes overrides while walking composites, emit
    // as @media blocks after the main :root block closes. Same shape as
    // scripts/build-tokens.js so editor + static theme.css stay aligned.
    const MODE_BREAKPOINTS_TE = {
      S: '(max-width: 600px)',
      M: '(min-width: 601px) and (max-width: 1023px)',
      L: '(min-width: 1024px)',
    };
    const TYPO_MODE_OVERRIDES = {}; // { mode: [{ base, props }] }
    const text = data.semantic.typography && data.semantic.typography.text;
    if (text) {
      for (const grp of ['display', 'heading', 'body', 'action', 'label', 'caption']) {
        if (!text[grp]) continue;
        for (const sz in text[grp]) {
          const t = text[grp][sz];
          if (!t || !t.$value) continue;
          const v = t.$value;
          const base = `--lb-t-${grp}-${sz}`;
          if (v.fontFamily)    push(rootDecls, `${base}-font-family`,    renderValue(data, v.fontFamily,    'light'));
          if (v.fontSize)      push(rootDecls, `${base}-font-size`,      renderValue(data, v.fontSize,      'light'));
          if (v.fontWeight)    push(rootDecls, `${base}-font-weight`,    renderValue(data, v.fontWeight,    'light'));
          if (v.lineHeight)    push(rootDecls, `${base}-line-height`,    renderValue(data, v.lineHeight,    'light'));
          if (v.letterSpacing) push(rootDecls, `${base}-letter-spacing`, renderValue(data, v.letterSpacing, 'light'));

          // Collect $modes overrides for @media emission below
          if (t.$modes && typeof t.$modes === 'object') {
            for (const modeName of Object.keys(t.$modes)) {
              const props = t.$modes[modeName];
              if (!props || typeof props !== 'object' || Object.keys(props).length === 0) continue;
              if (!TYPO_MODE_OVERRIDES[modeName]) TYPO_MODE_OVERRIDES[modeName] = [];
              TYPO_MODE_OVERRIDES[modeName].push({ base, props });
            }
          }
        }
      }
    }

    // L2 — radius / opacity / border-width / stroke (theme-agnostic)
    const semGroups = {
      'radius.radius': 'radius',
      'opacity.opacity': 'opacity',
      'border-width.border-width': 'border-width',
      'stroke.stroke': 'stroke',
    };
    for (const [src, prefix] of Object.entries(semGroups)) {
      const node = getByPath(data.semantic, src);
      if (!node) continue;
      for (const k in node) {
        const t = node[k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-${prefix}-${k}`, renderValue(data, t.$value, 'light'));
      }
    }
    // L2 — component-size, shadow, animation
    if (data.semantic['component-size']) {
      for (const k in data.semantic['component-size']) {
        const t = data.semantic['component-size'][k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-component-size-${k}`, renderValue(data, t.$value, 'light'));
      }
    }
    if (data.semantic.shadow && data.semantic.shadow.shadow) {
      for (const k in data.semantic.shadow.shadow) {
        const t = data.semantic.shadow.shadow[k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-shadow-${k}`, renderValue(data, t.$value, 'light'));
      }
    }
    if (data.semantic.animation) {
      for (const grp in data.semantic.animation) {
        const g = data.semantic.animation[grp];
        if (g.$value !== undefined) push(rootDecls, `--lb-animation-${grp}`, renderValue(data, g.$value, 'light'));
        else if (typeof g === 'object') {
          for (const k in g) {
            const t = g[k];
            if (t.$value !== undefined) push(rootDecls, `--lb-animation-${grp}-${k}`, renderValue(data, t.$value, 'light'));
          }
        }
      }
    }

    // L3 — component
    for (const area of ['action', 'field', 'surface']) {
      const node = data.component[area];
      if (!node) continue;
      for (const k in node) {
        const t = node[k];
        if (t && t.$value !== undefined) push(rootDecls, `--lb-${area}-${k}`, renderValue(data, t.$value, 'light'));
      }
    }

    // Use `:root[data-theme="dark"]` (specificity 0,1,1) instead of plain
    // `[data-theme="dark"]` (0,1,0) so we match theme.css's higher-
    // specificity media-query rule `@media (prefers-color-scheme: dark)
    // { :root:not([data-theme="light"]) { … } }`. Without this bump, when
    // the OS prefers dark, theme.css's rule wins on specificity and the
    // editor's brand overrides never show in dark mode.
    // Emit two parallel blocks per mode for any $modes overrides:
    //
    //   1. @media (mode-breakpoint) :root { ... }
    //      Auto-applied when the actual viewport falls in that range.
    //
    //   2. html[data-typo-preview="<mode>"] { ... }
    //      Force-applied when the Theme editor's Viewport switcher pins
    //      that mode. Higher specificity than :root so it wins regardless
    //      of which @media is matching. Without this, clicking 'M' on a
    //      desktop viewport (≥1024px) keeps showing the L override because
    //      the L @media still matches the real viewport width.
    //
    // Both blocks emit identical declarations. The S force-mode block in
    // gallery.css is now redundant for editor-driven overrides but stays
    // in place for pages opened without the editor active (e.g. static
    // demo links).
    const mediaBlocks = [];
    for (const modeName of Object.keys(TYPO_MODE_OVERRIDES)) {
      const mq = MODE_BREAKPOINTS_TE[modeName];
      if (!mq) continue;
      const entries = TYPO_MODE_OVERRIDES[modeName];
      if (!entries.length) continue;

      const declLines = [];
      for (const { base, props } of entries) {
        if (props.fontFamily)    declLines.push(`    ${base}-font-family: ${renderValue(data, props.fontFamily, 'light')};`);
        if (props.fontSize)      declLines.push(`    ${base}-font-size: ${renderValue(data, props.fontSize, 'light')};`);
        if (props.fontWeight)    declLines.push(`    ${base}-font-weight: ${renderValue(data, props.fontWeight, 'light')};`);
        if (props.lineHeight)    declLines.push(`    ${base}-line-height: ${renderValue(data, props.lineHeight, 'light')};`);
        if (props.letterSpacing) declLines.push(`    ${base}-letter-spacing: ${renderValue(data, props.letterSpacing, 'light')};`);
      }

      // @media block — auto-matching viewport. Selector is
      // html:not([data-typo-preview]) so the rule applies ONLY when no
      // force-mode is active. Force-mode rules below replace the
      // viewport-driven cascade entirely (which is the right mental
      // model for a preview switcher).
      const mediaLines = [];
      mediaLines.push(`@media ${mq} {`);
      mediaLines.push(`  html:not([data-typo-preview]) {`);
      for (const l of declLines) mediaLines.push(l);
      mediaLines.push(`  }`);
      mediaLines.push(`}`);
      mediaBlocks.push(mediaLines.join('\n'));

      // Force-mode block — preview override via data-typo-preview attribute.
      // Declarations are stripped of one indent level since they sit at
      // the html[...] rule (not nested in @media :root).
      const forceLines = [];
      forceLines.push(`html[data-typo-preview="${modeName}"] {`);
      for (const l of declLines) forceLines.push(l.replace(/^    /, '  '));
      forceLines.push(`}`);
      mediaBlocks.push(forceLines.join('\n'));
    }

    // SECTION-SCOPING FIX (mirrors scripts/build-tokens.js, finding V8):
    // custom properties substitute var() refs at the DECLARING element,
    // so aliases declared only in :root (the L3 action/field/surface
    // tokens routing through L2) resolve to LIGHT values there and a
    // section-scoped [data-theme="dark"] subtree inherits them pre-
    // resolved. Re-declare every :root alias whose var() chain touches a
    // dark-overridden token (transitively) inside the dark block so the
    // browser re-substitutes at the dark-scoped element. Identical var()
    // values — no new tokens; root-level dark output is unchanged.
    if (darkDecls.length) {
      const declRe = /^\s*(--lb-[a-z0-9-]+):\s*(.+);$/i;
      const rootMap = new Map();
      for (const l of rootDecls) {
        const m = l.match(declRe);
        if (m) rootMap.set(m[1], m[2]);
      }
      const darkSet = new Set();
      for (const l of darkDecls) {
        const m = l.match(declRe);
        if (m) darkSet.add(m[1]);
      }
      const refsIn = (v) => (v.match(/var\(\s*(--lb-[a-z0-9-]+)/gi) || [])
        .map(s => s.replace(/^var\(\s*/i, ''));
      const affected = new Set();
      let grew = true;
      while (grew) {
        grew = false;
        for (const [name, value] of rootMap) {
          if (darkSet.has(name) || affected.has(name)) continue;
          if (refsIn(value).some(d => darkSet.has(d) || affected.has(d))) {
            affected.add(name);
            grew = true;
          }
        }
      }
      for (const l of rootDecls) {
        const m = l.match(declRe);
        if (m && affected.has(m[1])) darkDecls.push(l);
      }
    }

    return `:root {\n${rootDecls.join('\n')}\n}\n`
      + (darkDecls.length ? `:root[data-theme="dark"] {\n${darkDecls.join('\n')}\n}\n` : '')
      + (mediaBlocks.length ? '\n' + mediaBlocks.join('\n') + '\n' : '');
  }

  // ════════════════════════════════════════════════════════════
  //   3. JSON merge utilities
  // ════════════════════════════════════════════════════════════

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /**
   * Deep-merge plain objects right-into-left, returning a new object.
   * Arrays and primitives from the right replace the left.
   * Used to combine canonical → baseline → overrides.
   */
  function deepMerge(...sources) {
    const out = {};
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      mergeInto(out, src);
    }
    return out;
  }
  function mergeInto(target, src) {
    for (const k in src) {
      const sv = src[k];
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) {
          target[k] = {};
        }
        mergeInto(target[k], sv);
      } else {
        target[k] = sv;
      }
    }
  }
  function leaf(value, type, description) {
    return description ? { $value: value, $type: type, $description: description } : { $value: value, $type: type };
  }

  // ════════════════════════════════════════════════════════════
  //   4. Override → JSON patch transformations
  // ════════════════════════════════════════════════════════════

  /**
   * Build a partial DTCG JSON that, when merged on top of `base`, applies
   * all current knob overrides. This is the heart of the rewrite —
   * everything that was previously inline-style writes is now data.
   *
   * `base` is consulted only for the WCAG fg picker (which needs to know
   * the background hex against which to choose fg.inverse vs fg.default).
   */
  function computeOverrideJson(base, overrides) {
    const patch = { primitives: {}, semantic: { light: {}, dark: {} }, component: {} };
    let lastBrandInfo = null;

    // ── Brand color ──
    if (overrides.brand) {
      const palette = generatePalette(overrides.brand);
      const oklchB = rgbToOklch(hexToRgb(overrides.brand));
      const primaryPlan = planBrandPrimary(palette, snapToStep(oklchB.L));
      patch.primitives.brand = {};
      for (const step of Object.keys(palette)) {
        patch.primitives.brand[step] = leaf(palette[step], 'color',
          `Generated brand palette step ${step} from theme editor.`);
      }

      const oklch = rgbToOklch(hexToRgb(overrides.brand));
      const emphasisStep = snapToStep(oklch.L);

      // Emit accent remaps for BOTH light + dark themes so dark-mode
      // toggle picks up the correct palette without re-running.
      for (const themeMode of ['light', 'dark']) {
        const remap = computeAccentRemap(emphasisStep, themeMode);
        // Interaction steps come from the measured plan, not structure.
        remap['bg-accent'] = primaryPlan[themeMode].steps.default;
        remap['bg-accent-strong'] = primaryPlan[themeMode].steps.strong;
        remap['bg-accent-bolder'] = primaryPlan[themeMode].steps.bolder;
        const themeBucket = patch.semantic[themeMode];
        for (const [key, step] of Object.entries(remap)) {
          // key is e.g. 'bg-accent-subtle' or 'bg-accent' → split on first dash group prefix.
          const dashIdx = key.indexOf('-');
          const grp = key.slice(0, dashIdx);              // 'bg' / 'fg' / 'border'
          const name = key.slice(dashIdx + 1);            // 'accent' or 'accent-subtle' etc.
          if (!themeBucket[grp]) themeBucket[grp] = {};
          themeBucket[grp][name] = leaf(`{brand.${step}}`, 'color',
            `Theme editor brand remap → brand.${step} (${themeMode}).`);
        }

        // bg.accent-value — the value-display fill (slider/progress/spinner).
        // A ROLE tuned against the neutral TRACK at 3:1, not an intensity
        // step, so its ramp step is PICKED per theme by measurement (the
        // yellow.700 lesson: some hues need an extra step). Track hexes are
        // the canonical neutrals the editor never remaps — same idiom as
        // the hardcoded inverse/default text hexes above this block.
        {
          const pick = computeValueFillStep(palette, themeMode);
          themeBucket.bg['accent-value'] = leaf(`{brand.${pick}}`, 'color',
            `Theme editor brand remap → brand.${pick} (${themeMode}) — value fill, measured vs track.`);
        }
      }

      // fg picks are computed for BOTH modes at once — component-tier action
      // tokens are single-bucket, so a ref must resolve correctly in both.
      // (The old picker ran only for the ACTIVE theme; exports baked one
      // mode's picks and the other mode shipped unmeasured — the 7-of-8
      // preset failures the plugin's canonical audit caught.)
      const activeMode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      function resolveBgHex(mode, varTokenPath) {
        const node = getByPath(base, varTokenPath);
        if (!node || !node.$value) return null;
        let val = node.$value;
        const m = String(val).match(/^\{([^}]+)\}$/);
        if (m) {
          const ref = m[1];
          const refNode = getByPath(base, `primitives.${ref}`)
                       || getByPath(base, `semantic.${mode}.${ref}`)
                       || getByPath(base, `semantic.${ref}`);
          val = refNode && refNode.$value;
        }
        return typeof val === 'string' && val.startsWith('#') ? val : null;
      }
      const ctx = {};
      for (const mode of ['light', 'dark']) {
        const rm = computeAccentRemap(emphasisStep, mode, palette);
        ctx[mode] = {
          bgDefault: resolveBgHex(mode, `semantic.${mode}.bg.default`) || (mode === 'dark' ? '#060504' : '#f7f5f1'),
          bgSubtle: resolveBgHex(mode, `semantic.${mode}.bg.subtle`) || (mode === 'dark' ? '#272522' : '#edebe6'),
          bgMuted: resolveBgHex(mode, `semantic.${mode}.bg.muted`) || (mode === 'dark' ? '#272522' : '#dfdcd7'),
          accent: palette[primaryPlan[mode].steps.default],
          accentSubtle: palette[rm['bg-accent-subtle']],
          accentMuted: palette[rm['bg-accent-muted']],
        };
      }
      const inkHexFor = (ref, mode) => {
        if (ref === '{fg.inverse-strong}') return '#f7f5f1';
        if (ref === '{fg.inverse}') return mode === 'dark' ? '#13110e' : '#f7f5f1';
        return mode === 'dark' ? '#f7f5f1' : '#13110e'; // {fg.default}
      };
      // Pick the ref whose WORST ratio across both modes (and every listed
      // bg) is highest — a single token that holds up everywhere it's used.
      function pickRefBoth(bgKeys) {
        let best = null;
        for (const ref of ['{fg.default}', '{fg.inverse}', '{fg.inverse-strong}']) {
          let worst = Infinity;
          for (const mode of ['light', 'dark']) {
            for (const k of bgKeys) worst = Math.min(worst, contrastRatio(ctx[mode][k], inkHexFor(ref, mode)));
          }
          if (!best || worst > best.ratio) best = { ref, ratio: worst };
        }
        return best;
      }

      const primaryRef = { ref: primaryPlan.ref, ratio: primaryPlan.minRatio };
      const secondaryDefault = pickRefBoth(['bgDefault']);
      const secondaryHover   = pickRefBoth(['accentSubtle']);
      const secondaryPressed = pickRefBoth(['accentMuted']);
      const ghostDefault = pickRefBoth(['bgDefault']);
      const ghostHover   = pickRefBoth(['bgSubtle']);
      const ghostPressed = pickRefBoth(['bgMuted']);
      const linkDefault  = pickRefBoth(['bgDefault']);
      const selectedPair = pickRefBoth(['bgDefault', 'accent']);

      const action = patch.component.action = {};
      const cset = (k, v) => { action[k] = leaf(v, 'color', 'Theme editor brand-aware fg pick.'); };
      cset('fg-primary-default',   primaryRef.ref);
      cset('fg-primary-hover',     primaryRef.ref);
      cset('fg-primary-pressed',   primaryRef.ref);
      cset('fg-secondary-default', secondaryDefault.ref);
      cset('fg-secondary-hover',   secondaryHover.ref);
      cset('fg-secondary-pressed', secondaryPressed.ref);
      cset('fg-ghost-default',     ghostDefault.ref);
      cset('fg-ghost-hover',       ghostHover.ref);
      cset('fg-ghost-pressed',     ghostPressed.ref);
      cset('fg-link-default',      linkDefault.ref);
      cset('fg-link-hover',        linkDefault.ref);
      cset('fg-link-pressed',      linkDefault.ref);
      cset('fg-selected',          selectedPair.ref);

      const activePlan = primaryPlan[activeMode];
      lastBrandInfo = {
        hex: overrides.brand,
        emphasisStep,
        pairUsed: primaryPlan.ref === '{fg.inverse-strong}' ? 'inverse-strong' : 'inverse',
        contrast: activePlan.ratios.default,
        contrastHover: activePlan.ratios.strong,
        contrastPressed: activePlan.ratios.bolder,
        passesAA: primaryPlan.minRatio >= 4.5,
        passesAALarge: primaryPlan.minRatio >= 3,
      };
    }

    // ── Extra accent slots (accent-2 / accent-3) ──
    // Same measured engine as the brand knob, run against a family prefix.
    // Filled slot: generate brand-N ramp, re-point ONLY the accent-N family
    // (both themes) + pick the variant's text by worst-ratio across modes.
    // Dormant slot while slot 1 is branded: MIRROR accent's fresh refs (and
    // primary's text picks) so the accent-N button keeps rendering identical
    // to primary — the shipped canonical mirrors only the factory violet.
    // border-focus never follows extra slots (focus belongs to accent alone).
    const ACC_FAMILY_RE = /^accent(-[a-z]+)*$/;
    for (const slotN of [2, 3]) {
      const hexN = overrides['brand' + slotN];
      const famPrefix = 'accent-' + slotN;
      const palKey = 'brand-' + slotN;
      if (hexN) {
        const paletteN = generatePalette(hexN);
        const oklchN = rgbToOklch(hexToRgb(hexN));
        const stepN = snapToStep(oklchN.L);
        const planN = planBrandPrimary(paletteN, stepN);
        patch.primitives[palKey] = {};
        for (const step of Object.keys(paletteN)) {
          patch.primitives[palKey][step] = leaf(paletteN[step], 'color',
            `Generated ${palKey} palette step ${step} (accent slot ${slotN}).`);
        }
        for (const themeMode of ['light', 'dark']) {
          const remap = computeAccentRemap(stepN, themeMode, paletteN);
          remap['bg-accent'] = planN[themeMode].steps.default;
          remap['bg-accent-strong'] = planN[themeMode].steps.strong;
          remap['bg-accent-bolder'] = planN[themeMode].steps.bolder;
          delete remap['border-focus'];
          const themeBucket = patch.semantic[themeMode];
          for (const [key, step] of Object.entries(remap)) {
            const dashIdx = key.indexOf('-');
            const grp = key.slice(0, dashIdx);
            const name = key.slice(dashIdx + 1).replace('accent', famPrefix);
            if (!themeBucket[grp]) themeBucket[grp] = {};
            themeBucket[grp][name] = leaf(`{${palKey}.${step}}`, 'color',
              `Theme editor slot-${slotN} remap → ${palKey}.${step} (${themeMode}).`);
          }
          // Value fill — measured vs the canonical tracks, same idiom as slot 1.
          const pick = computeValueFillStep(paletteN, themeMode);
          themeBucket.bg[famPrefix + '-value'] = leaf(`{${palKey}.${pick}}`, 'color',
            `Theme editor slot-${slotN} remap → ${palKey}.${pick} (${themeMode}) — value fill, measured vs track.`);
        }
        const action = patch.component.action = patch.component.action || {};
        for (const st of ['default', 'hover', 'pressed']) {
          action[`fg-${famPrefix}-${st}`] = leaf(planN.ref, 'color',
            `Theme editor slot-${slotN} text pick (worst-ratio across both modes).`);
        }
      } else if (overrides.brand) {
        // Dormant mirror: copy the accent-family refs the slot-1 block just
        // wrote (snapshot first — we add keys to the same buckets).
        for (const themeMode of ['light', 'dark']) {
          const themeBucket = patch.semantic[themeMode];
          for (const axis of ['fg', 'bg', 'border']) {
            const bucket = themeBucket[axis];
            if (!bucket) continue;
            const entries = Object.entries(bucket).filter(([n]) => ACC_FAMILY_RE.test(n));
            for (const [n, node] of entries) {
              bucket[n.replace('accent', famPrefix)] = leaf(node.$value, 'color',
                `Dormant slot ${slotN} mirrors accent (${themeMode}).`);
            }
          }
        }
        const action = patch.component.action;
        if (action) {
          for (const st of ['default', 'hover', 'pressed']) {
            const src = action[`fg-primary-${st}`];
            if (src) {
              action[`fg-${famPrefix}-${st}`] = leaf(src.$value, 'color',
                `Dormant slot ${slotN} mirrors primary text (${st}).`);
            }
          }
        }
      }
    }

    // ── Radius preset ──
    if (overrides.radius != null) {
      const preset = RADIUS_PRESETS[overrides.radius];
      if (preset) {
        const r = patch.semantic.radius = patch.semantic.radius || {};
        r.radius = r.radius || {};
        for (const alias of ['interactive', 'field', 'surface', 'overlay', 'media', 'full', 'badge']) {
          r.radius[alias] = leaf(`{${preset[alias]}}`, 'dimension', `Theme editor radius preset "${preset.name}".`);
        }
      }
    }

    // ── Stroke action — rewrite L1 size.theme to a literal px ──
    if (overrides.strokeAction != null && Number.isFinite(overrides.strokeAction)) {
      const clamped = Math.max(ACTION_STROKE_MIN, Math.min(ACTION_STROKE_MAX, overrides.strokeAction));
      patch.primitives.size = patch.primitives.size || {};
      patch.primitives.size.theme = leaf(clamped + 'px', 'dimension', 'Theme editor action stroke (px).');
    }

    // ── Stroke decorative — relink L2 border-width.thin ──
    if (overrides.strokeDecorative != null) {
      const preset = STROKE_DECORATIVE_PRESETS[overrides.strokeDecorative];
      if (preset) {
        const bw = patch.semantic['border-width'] = patch.semantic['border-width'] || {};
        bw['border-width'] = bw['border-width'] || {};
        bw['border-width'].thin = leaf(`{${preset.ref}}`, 'dimension', `Theme editor decorative stroke "${preset.name}".`);
      }
    }

    // ── Stroke icon — relink L2 stroke.icon ──
    if (overrides.strokeIcon != null) {
      const preset = STROKE_ICON_PRESETS[overrides.strokeIcon];
      if (preset) {
        const sk = patch.semantic.stroke = patch.semantic.stroke || {};
        sk.stroke = sk.stroke || {};
        sk.stroke.icon = leaf(`{${preset.ref}}`, 'dimension', `Theme editor icon stroke "${preset.name}".`);
      }
    }

    // ── Phase 2.1 typography — per-slot families ──
    // overrides.fontSlots: { '1': 'DM Sans', '2': null, '3': null }
    if (overrides.fontSlots && typeof overrides.fontSlots === 'object') {
      patch.primitives.font = patch.primitives.font || {};
      patch.primitives.font.family = patch.primitives.font.family || {};
      for (const slot of ['1', '2', '3']) {
        const name = overrides.fontSlots[slot];
        if (!name) continue;
        const value = buildFamilyValue(name);
        if (!value) continue;
        patch.primitives.font.family[slot] = leaf(
          value, 'fontFamily',
          `Theme editor — slot ${slot} font (${name}).`
        );
      }
    }

    // ── Phase 2.1 typography — per-mode base font sizes ──
    // overrides.baseSizes: { S: 16, M: 17, L: 18 } | null
    //
    // Two effects:
    //  1. Update the L1 primitives.font.base.{S,M,L} variables (visible
    //     in the editor's L1 view if the plugin exposes them).
    //  2. Walk every L2 typography composite and write $modes.{mode}.fontSize
    //     + $modes.{mode}.lineHeight scaled by slider/16. This is what
    //     actually drives the visible scaling at each @media breakpoint,
    //     via jsonToCss emitting $modes as @media blocks. Critical:
    //     keeping the scaling in $modes (not buildModeScaling at render
    //     time) makes it survive saveAsBaseline — the baseline absorbs
    //     the patch like every other knob.
    if (overrides.baseSizes && typeof overrides.baseSizes === 'object') {
      patch.primitives.font = patch.primitives.font || {};
      patch.primitives.font.base = patch.primitives.font.base || {};
      for (const mode of ['S', 'M', 'L']) {
        const size = overrides.baseSizes[mode];
        if (size == null || !Number.isFinite(size)) continue;
        patch.primitives.font.base[mode] = leaf(
          size + 'px', 'dimension',
          `Theme editor — ${mode} base font size.`
        );
      }

      // Per-mode L2 composite scaling
      const textBase = (base.semantic && base.semantic.typography && base.semantic.typography.text) || null;
      if (textBase) {
        // Helper: resolve a {font.size.X} or {font.line-height.X} ref
        // to a number of pixels, reading the effective primitives.
        const resolvePxFromRef = (ref) => {
          if (typeof ref !== 'string') return null;
          const m = ref.match(/^\{font\.(size|line-height)\.([^}]+)\}$/);
          if (!m) {
            // Maybe it's already a literal like "16px"
            const lit = parseFloat(ref);
            return Number.isFinite(lit) ? lit : null;
          }
          const [, kind, key] = m;
          const node = base.primitives && base.primitives.font && base.primitives.font[kind] && base.primitives.font[kind][key];
          if (!node || node.$value == null) return null;
          const px = parseFloat(node.$value);
          return Number.isFinite(px) ? px : null;
        };

        const txtPatch = patch.semantic.typography = patch.semantic.typography || {};
        const txtTextPatch = txtPatch.text = txtPatch.text || {};

        for (const mode of ['S', 'M', 'L']) {
          const sliderVal = overrides.baseSizes[mode];
          if (sliderVal == null) continue;
          // IMPORTANT: do NOT skip when sliderVal === 16. The baseline may
          // hold a baked $modes.{mode}.fontSize from a previous save (e.g.
          // 18px). If we skip, the override never overwrites the baked
          // value, and the slider shows 16 while the page renders at 18.
          // Writing factor=1.0 values explicitly resets every composite's
          // $modes.{mode} block to canonical sizes.
          const factor = sliderVal / 16;

          for (const role of Object.keys(textBase)) {
            const sizes = textBase[role];
            if (!sizes || typeof sizes !== 'object') continue;
            for (const sz of Object.keys(sizes)) {
              const tok = sizes[sz];
              if (!tok || !tok.$value) continue;
              // Always scale from $value.fontSize (pristine no-mode default),
              // NEVER from $modes.{mode}.fontSize. The mode override is a
              // derived value — reading it back as the source would compound
              // each save cycle (slider 18 -> save -> slider 18 again reads
              // the saved 18 as the new "base", multiplies, gives 20.25 -> 20).
              // Reading from $value keeps the math stable across save cycles.
              const fontSizeRef   = tok.$value.fontSize;
              const lineHeightRef = tok.$value.lineHeight;
              const fsPx = resolvePxFromRef(fontSizeRef);
              const lhPx = resolvePxFromRef(lineHeightRef);
              if (fsPx == null && lhPx == null) continue;

              txtTextPatch[role] = txtTextPatch[role] || {};
              txtTextPatch[role][sz] = txtTextPatch[role][sz] || { $modes: {} };
              const tokenPatch = txtTextPatch[role][sz];
              tokenPatch.$modes = tokenPatch.$modes || {};
              tokenPatch.$modes[mode] = tokenPatch.$modes[mode] || {};
              if (fsPx != null) tokenPatch.$modes[mode].fontSize   = Math.round(fsPx * factor) + 'px';
              if (lhPx != null) tokenPatch.$modes[mode].lineHeight = Math.round(lhPx * factor) + 'px';
            }
          }
        }
      }
    }

    // ── Phase 2.1 typography — role → slot mapping ──
    // overrides.familyMap: { action: 2, body: 1, ... } | null
    if (overrides.familyMap && typeof overrides.familyMap === 'object') {
      const typo = patch.semantic.typography = patch.semantic.typography || {};
      typo.family = typo.family || {};
      for (const role of TYPO_ROLES) {
        const slot = overrides.familyMap[role];
        if (slot == null) continue;
        typo.family[role] = leaf(
          `{font.family.${slot}}`, 'fontFamily',
          `Theme editor — ${role} role mapped to slot ${slot}.`
        );
      }
    }

    // Persist the seed hexes into the export ($extensions is DTCG-legal and
    // ignored by shape-only consumers). Exports bake derived values; without
    // the seed a theme can't be re-derived after an engine fix — the item-29
    // follow-up lesson.
    const seeds = {};
    if (overrides.brand)  seeds.brand    = overrides.brand;
    if (overrides.brand2) seeds['brand-2'] = overrides.brand2;
    if (overrides.brand3) seeds['brand-3'] = overrides.brand3;
    if (Object.keys(seeds).length) {
      patch.$extensions = { 'design.letbe': { seeds } };
    }

    return { patch, lastBrandInfo };
  }

  // ── In-editor contrast audit of the accent families ─────────
  // Evaluates the shipped $schema.wcag_pairs entries that involve the
  // accent / accent-2 / accent-3 families against the CURRENT merged theme,
  // both modes — the same pairs scripts/audit-contrast.js grades at build
  // time, now run live after a slot fill or an import so a failing theme
  // can never leave the editor silently (item-29 follow-up ask 2).
  function auditAccentPairs() {
    if (!canonical) return { rows: [], fails: [] };
    const pairs = (canonical.$schema && canonical.$schema.wcag_pairs) || [];
    return _engineAuditAccentPairs(pairs, buildExportJson());
  }

  // Debounced runner — fires after brand-knob changes and imports; surfaces
  // failures as a danger toast + console table, silence when green.
  let _auditTimer = 0;
  function _scheduleAccentAudit(sourceLabel) {
    clearTimeout(_auditTimer);
    _auditTimer = setTimeout(() => {
      try {
        const { fails } = auditAccentPairs();
        if (fails.length) {
          console.warn(`[letbe theme editor] Contrast check after ${sourceLabel} — ${fails.length} failing pair(s):`);
          if (console.table) console.table(fails);
          _showToast('danger', 'Contrast check failed',
            `${fails.length} accent pair(s) below WCAG after ${sourceLabel} — details in the console. Adjust the seed before exporting.`);
        }
      } catch (e) { /* audit is advisory — never block the edit */ }
    }, 350);
  }

  // ════════════════════════════════════════════════════════════
  //   5. State
  // ════════════════════════════════════════════════════════════

  function freshOverrides() {
    return {
      brand: null,
      // Extra accent slots (accent-2 / accent-3) — seed hex | null (dormant,
      // mirrors accent). Same engine as the brand knob, run per family.
      brand2: null,
      brand3: null,
      radius: null,
      strokeDecorative: null,
      strokeAction: null,
      strokeIcon: null,
      // NEW phase 2.1 typography overrides:
      // fontSlots[N] = font name (string) | null  — null = inherit base
      // baseSizes[mode] = px (number) | null     — null = inherit base
      // familyMap[role] = 1 | 2 | 3 | null       — null = inherit base
      fontSlots: null,
      baseSizes: null,
      familyMap: null,
      // Viewport preview mode — 'auto' | 'S' | 'M' | 'L'. Not a token
      // override; a global preview switch that sets data-typo-preview
      // on <html>. Persists across sessions like any other knob.
      viewportMode: 'auto',
    };
  }

  // Migrate legacy keys (fontFamily / baseSize / density / contrast)
  // from older theme-editor.js versions. Translates what's safely
  // recoverable then drops the rest with a one-time console warning.
  // Pre-phase-2.1 baseSize was a scalar applied to all sizes; we map
  // it to baseSizes.S (mobile anchor). Density / contrast were scalar
  // multipliers that no longer have a home in the new model — discarded.
  function migrateLegacyOverrides(o) {
    if (!o || typeof o !== 'object') return o;
    let changed = false;
    if (o.baseSize != null && o.baseSizes == null) {
      o.baseSizes = { S: o.baseSize, M: o.baseSize, L: o.baseSize };
      changed = true;
    }
    if (o.fontFamily) {
      // Best-effort: pre-2.1 fontFamily was a CSS font-family string.
      // Try to match the first listed family against GOOGLE_FONTS.
      const first = String(o.fontFamily).split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (_findFont(first)) {
        o.fontSlots = o.fontSlots || {};
        if (!o.fontSlots['1']) o.fontSlots['1'] = first;
        changed = true;
      }
    }
    if ((o.fontFamily != null || o.baseSize != null || o.density != null || o.contrast != null) && changed) {
      console.warn('Theme editor: migrated legacy typography overrides (fontFamily / baseSize) to phase 2.1 shape. density / contrast knobs are removed in phase 2.1.');
    }
    delete o.fontFamily; delete o.baseSize; delete o.density; delete o.contrast;
    return o;
  }

  function freshState() { return { baseline: null, overrides: freshOverrides() }; }

  let state = loadState();
  let canonical = null;
  let _lastBrandInfo = null;
  let _refreshFeedback = null;
  let _panel = null;
  // Guard: while syncPanel is pushing values into the Color Picker,
  // any lb-color-change event the picker emits is a SYNC echo, not a
  // user edit. The handler reads this flag and skips setKnob to break
  // the syncPanel → picker.setValue → emit → setKnob → render → syncPanel
  // loop that previously corrupted state.overrides.brand on every render.
  let _syncingPicker = false;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const overrides = migrateLegacyOverrides({ ...freshOverrides(), ...(saved.overrides || {}) });
        return {
          baseline: saved.baseline || null,
          overrides,
        };
      }
    } catch {}
    return freshState();
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // ════════════════════════════════════════════════════════════
  //   6. The single render() function
  // ════════════════════════════════════════════════════════════

  function ensureStyleEl() {
    let el = document.getElementById(STYLE_EL_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_EL_ID;
      document.head.appendChild(el);
    }
    return el;
  }

  // The most-recent effective JSON merged from canonical + baseline + patch.
  // syncPanel reads this for fallback values when state.overrides is null
  // (e.g. immediately after saveAsBaseline, the user's last chosen font
  // lives in baseline.primitives.font.family.X.$value, not in overrides).
  let _lastEffective = null;

  // Compute the baseline-only (override-free) base font size for a mode.
  // Used by slider handlers to decide whether the user has reached the
  // "no override needed" position. Default 16 when no baseline / canonical
  // declares the mode.
  function baselineBasePxFor(mode) {
    const src = state.baseline
      ? deepMerge(canonical, state.baseline)
      : canonical;
    const node = src && src.primitives && src.primitives.font
      && src.primitives.font.base && src.primitives.font.base[mode];
    if (node && node.$value) {
      const px = parseFloat(node.$value);
      if (Number.isFinite(px)) return px;
    }
    return BASE_SIZE_DEFAULT;
  }

  // ── Viewport preview application ──
  // Reads state.overrides.viewportMode and applies it to <html>.
  // 'auto' uses matchMedia to detect the actual viewport class then
  // applies the same data-typo-preview attribute. Anything else forces
  // that mode. Same behaviour as the (now-removed) typography page
  // implementation; lives here so it's globally applied across pages.
  function _detectViewportMode() {
    if (typeof window === 'undefined') return 'L';
    if (window.matchMedia('(max-width: 600px)').matches) return 'S';
    if (window.matchMedia('(max-width: 1023px)').matches) return 'M';
    return 'L';
  }
  function _applyViewportPreview(mode) {
    const html = document.documentElement;
    if (mode === 'L') {
      // L has no overrides today — match the "no attribute" base state
      html.removeAttribute('data-typo-preview');
    } else {
      html.setAttribute('data-typo-preview', mode);
    }
  }
  function _updateViewportIndicator() {
    const ind = _panel && _panel.querySelector('#te-viewport-indicator');
    if (!ind) return;
    const w = window.innerWidth;
    ind.textContent = w + 'px → ' + _detectViewportMode();
  }
  // Apply the user's chosen mode (or auto-detect). Called on every
  // viewportMode change AND on every resize when in 'auto'.
  function _syncViewportPreview() {
    const userMode = state.overrides.viewportMode || 'auto';
    const effective = userMode === 'auto' ? _detectViewportMode() : userMode;
    _applyViewportPreview(effective);
    _updateViewportIndicator();
  }

  function render() {
    if (!canonical) return;  // pre-bootstrap; render() will be called again post-fetch
    const base = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
    const { patch, lastBrandInfo } = computeOverrideJson(base, state.overrides);
    _lastBrandInfo = lastBrandInfo;
    const effective = deepMerge(canonical, state.baseline || {}, patch);
    _lastEffective = effective;
    ensureStyleEl().textContent = jsonToCss(effective);
    if (typeof _refreshFeedback === 'function') _refreshFeedback();
    if (_panel) syncPanel(_panel);
  }

  // ════════════════════════════════════════════════════════════
  //   7. Actions — every user gesture is a state mutation + render()
  // ════════════════════════════════════════════════════════════

  function setKnob(name, value) {
    state.overrides[name] = value;
    persist();
    render();
    // Live contrast guard: any accent-affecting knob re-runs the shipped
    // manifest pairs for the accent families (fill AND clear — clears can
    // re-expose a bad baseline underneath).
    if (name === 'brand' || name === 'brand2' || name === 'brand3') {
      _scheduleAccentAudit(value ? 'slot fill' : 'slot clear');
    }
  }

  // ── Preset application ──
  // Replaces the knob set with the preset's values (a preset is a starting
  // point, so stale knobs from a previous exploration must not bleed in);
  // baseline and viewport preview are preserved. Fonts load on apply.
  function applyPreset(idx, panel) {
    const p = THEME_PRESETS[idx];
    if (!p) return;
    const keepViewport = state.overrides.viewportMode;
    state.overrides = Object.assign(freshOverrides(), { viewportMode: keepViewport });
    // The factory card returns to the true canonical theme, which means the
    // saved/imported baseline goes too — knobs alone can't undo a baseline.
    if (p.factory) state.baseline = null;
    for (const [k, v] of Object.entries(p.knobs)) {
      state.overrides[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
    }
    if (p.knobs.fontSlots) {
      Object.values(p.knobs.fontSlots).forEach((n) => { if (n) loadGoogleFont(n); });
    }
    state.lastPreset = p.name;
    persist();
    render();
    if (panel) {
      panel.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.classList.toggle('theme-editor__preset--active',
          Number(btn.dataset.preset) === idx);
      });
    }
  }
  function resetAllKnobs() {
    state.overrides = freshOverrides();
    state.lastPreset = null;
    persist();
    render();
  }
  function resetGroup(groupId) {
    const KEYS = {
      color:  ['brand', 'brand2', 'brand3'],
      typo:   ['fontSlots', 'baseSizes', 'familyMap'],
      stroke: ['strokeAction', 'strokeDecorative', 'strokeIcon'],
      radius: ['radius'],
    };
    for (const k of (KEYS[groupId] || [])) state.overrides[k] = null;
    persist();
    render();
  }
  // Old exports (pre accent-slot vocabulary) carry a branded accent family
  // but no accent-2/-3 keys — merged over canonical they'd leave the extra
  // slots on factory violet, silently diverging from primary. Normalize on
  // every import: if a slot's brand-N ramp is absent (slot dormant in the
  // imported theme), mirror the import's accent refs (and primary text
  // picks) onto the slot family so dormant slots track the imported brand.
  // ── Slot fill-state — STRUCTURAL detection, not substring presence ──
  // A slot is FILLED only when its accent-N family actually wears its own
  // identity: any ref referencing {brand-N.…}, or refs that diverge from
  // BOTH the accent family and the canonical factory positions (a deliberate
  // hand-retarget, e.g. accent-2 → orange). A hand-made brand-N palette with
  // zero retargets is NOT filled (the old blob.includes test called it
  // filled, hid Clear, and suppressed dormant normalization); a stale
  // pre-fix export whose accent-N sits at factory violet under a branded
  // accent is NOT filled either — that's exactly what normalization repairs.
  function _slotFillState(json, slotN) {
    if (!json || typeof json !== 'object') return 'dormant';
    const fam = 'accent-' + slotN;
    let sawAny = false, divergesAccent = false, divergesFactory = false;
    for (const mode of ['light', 'dark']) {
      const t = json.semantic && json.semantic[mode];
      if (!t) continue;
      for (const axis of ['fg', 'bg', 'border']) {
        const bucket = t[axis];
        if (!bucket) continue;
        for (const [k, node] of Object.entries(bucket)) {
          if (k !== fam && !k.startsWith(fam + '-')) continue;
          const val = node && node.$value;
          if (typeof val !== 'string') continue;
          sawAny = true;
          if (val.includes('{brand-' + slotN + '.')) return 'filled';
          const accKey = k.replace(fam, 'accent');
          // Compare against the EFFECTIVE accent value: the json's own if
          // present, else canonical — a hand-retarget json often carries
          // only the accent-N key, and its divergence is measured against
          // what accent actually resolves to underneath.
          const accNode = bucket[accKey]
            || (canonical && canonical.semantic && canonical.semantic[mode]
                && canonical.semantic[mode][axis] && canonical.semantic[mode][axis][accKey]);
          const accVal = accNode && accNode.$value;
          if (accVal !== undefined && accVal !== val) divergesAccent = true;
          const canonNode = canonical && canonical.semantic && canonical.semantic[mode]
            && canonical.semantic[mode][axis] && canonical.semantic[mode][axis][k];
          if (canonNode && canonNode.$value !== val) divergesFactory = true;
        }
      }
    }
    if (sawAny && divergesAccent && divergesFactory) return 'filled'; // deliberate hand-retarget
    return 'dormant';
  }

  function _normalizeDormantSlots(json) {
    try {
      if (!json || typeof json !== 'object') return json;
      const FAMILY_RE = /^accent(-[a-z]+)*$/;
      for (const slotN of [2, 3]) {
        if (_slotFillState(json, slotN) === 'filled') continue;
        const sem = json.semantic || {};
        for (const mode of ['light', 'dark']) {
          const t = sem[mode];
          if (!t) continue;
          for (const axis of ['fg', 'bg', 'border']) {
            const bucket = t[axis];
            if (!bucket) continue;
            const entries = Object.entries(bucket).filter(([n]) => FAMILY_RE.test(n));
            for (const [n, node] of entries) {
              if (node && node.$value !== undefined) {
                bucket[n.replace('accent', 'accent-' + slotN)] =
                  { ...node, $description: `Dormant slot ${slotN} mirrors accent (import-normalized).` };
              }
            }
          }
        }
        const act = json.component && json.component.action;
        if (act) {
          for (const st of ['default', 'hover', 'pressed']) {
            const src = act['fg-primary-' + st];
            if (src && src.$value !== undefined) {
              act[`fg-accent-${slotN}-${st}`] = { ...src };
            }
          }
        }
      }
    } catch { /* malformed import → leave as-is; importJson's consumers cope */ }
    return json;
  }

  function importJson(json) {
    state.baseline = _normalizeDormantSlots(json);
    state.overrides = freshOverrides();
    persist();
    loadBaselineFonts(json);
    render();
    // Imports carry BAKED values — a theme exported by an older engine can
    // hold failing picks the import preserves verbatim. Audit on arrival.
    _scheduleAccentAudit('import');
  }
  function saveAsBaseline() {
    if (!canonical) return;
    const base = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
    const { patch } = computeOverrideJson(base, state.overrides);
    const merged = deepMerge(canonical, state.baseline || {}, patch);
    state.baseline = merged;
    state.overrides = freshOverrides();
    persist();
    loadBaselineFonts(merged);
    render();
  }
  function factoryReset() {
    // Wipe persisted state then reload. Reload is the bulletproof
    // mechanism: every cached/in-memory piece of editor state lives
    // only in the page's lifetime, so a fresh page IS the canonical
    // theme by definition. Same code path as a first-time visit.
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    location.reload();
  }

  function buildExportJson() {
    if (!canonical) throw new Error('Canonical tokens not loaded yet.');
    const base = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
    const { patch } = computeOverrideJson(base, state.overrides);
    return deepMerge(canonical, state.baseline || {}, patch);
  }

  // Share link — the theme as a DIFF against canonical (baseline + knob
  // patch, no canonical), base64url-encoded into the #theme= hash that
  // _consumeThemeLink() already understands. Same payload shape the Figma
  // plugin generates, so links from either side open identically. Kept
  // small on purpose: a full export is ~500 tokens, a diff is the handful
  // the user actually changed.
  function buildShareLink() {
    if (!canonical) throw new Error('Canonical tokens not loaded yet.');
    const base = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
    const { patch } = computeOverrideJson(base, state.overrides);
    const diff = deepMerge(state.baseline || {}, patch);
    const json = JSON.stringify(diff);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // "Default" means no token-affecting change — the viewport preview
    // switch is a knob but not a theme choice, so it must not count.
    const hasThemeChange = !!state.baseline
      || Object.entries(state.overrides).some(([k, v]) => k !== 'viewportMode' && v != null
          && !(typeof v === 'object' && Object.values(v).every((x) => x == null)));
    // Share the ROOT of the site — a theme is site-wide, and the landing
    // page is the right place to receive someone into it.
    const base0 = document.body.getAttribute('data-lb-base');
    const rootUrl = new URL((base0 ? base0 + '/' : './'), location.href);
    return { url: rootUrl.href.replace(/[?#].*$/, '') + '#theme=' + b64, bytes: json.length, isDefault: !hasThemeChange };
  }

  // ════════════════════════════════════════════════════════════
  //   8. UI — panel building, syncing, events
  //
  //   Markup is preserved from v1 so theme-editor.css doesn't need
  //   changes. The only structural change is removing the
  //   "Reset changes" group buttons (kept) and the data-* hooks
  //   for events (kept). Sync NEVER triggers state changes.
  // ════════════════════════════════════════════════════════════

  const HELP_CONTENT = `
          <p>The Theme editor sits in three layers, top wins:</p>
          <ol class="theme-editor__help-list">
            <li><strong>Knob overrides</strong> — your edits in the accordions below. Counted by the badges.</li>
            <li><strong>Active baseline</strong> — the imported (or saved) token JSON. Acts as the new "zero overrides" state.</li>
            <li><strong>Factory theme</strong> — the canonical letbe-ds tokens shipped with the gallery.</li>
          </ol>
          <p><strong>Footer actions</strong> (Save baseline + Reset to default appear only when you have unsaved changes)</p>
          <ul class="theme-editor__help-list">
            <li><strong>Save baseline</strong> — locks current overrides in as the new baseline. Badges drop to 0; further edits are measured from this state. Non-destructive.</li>
            <li><strong>Reset to default</strong> — clears your overrides. Reveals whatever baseline was active.</li>
            <li><strong>Factory reset</strong> — discards everything (overrides + baseline) and returns to the canonical letbe-ds theme.</li>
          </ul>
          <p><strong>Import / Export</strong></p>
          <ul class="theme-editor__help-list">
            <li><strong>Import</strong> — load a Figma-plugin JSON export. The file becomes the active baseline; existing overrides are cleared.</li>
            <li><strong>Export</strong> — download a JSON merging canonical + baseline + overrides. Importable back into the plugin or back here.</li>
            <li><strong>Share link</strong> — copies a URL that opens this exact theme for anyone: <code>#theme=…</code> carries the theme as a small diff against the defaults, so links stay short. The <a class="lb-link" href="https://www.figma.com/community/plugin/1671570185456177314/letbe-tokens">letbe tokens plugin</a> generates the same links; opening one imports it automatically.</li>
            <li><strong>Copy / Paste</strong> — the same JSON without the file dance: Copy puts the merged theme on the clipboard; Paste reads the clipboard and applies it as the new baseline (browsers that block clipboard reads will ask you to press Ctrl/⌘+V instead).</li>
          </ul>
          <p class="theme-editor__help-note">
            Edits live only in this browser tab. Source files on disk
            (<code>tokens/source-tokens.json</code>) are never modified
            by the editor; persist a tweak by exporting + saving the
            file, then running <code>node scripts/build-tokens.js</code>.
          </p>
`;

  // Help lives in a real Modal (dogfooding .lb-modal) appended to <body>
  // once, so it layers above the panel instead of confusingly expanding
  // inline outside its accordion.
  function _ensureHelpModal() {
    let el = document.getElementById('theme-editor-help');
    if (el) return el;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="lb-modal-backdrop" id="theme-editor-help" data-lb-modal style="display:none;" role="dialog" aria-modal="true" aria-labelledby="theme-editor-help-title">
        <div class="lb-modal lb-modal--medium">
          <div class="lb-modal__header">
            <div class="lb-modal__header-title">
              <h3 class="lb-modal__title" id="theme-editor-help-title">How the Theme editor works</h3>
            </div>
            <button class="lb-modal__close" aria-label="Close"><span data-lb-icon="x" style="width: 1.5rem; height: 1.5rem;">&times;</span></button>
          </div>
          <div class="lb-modal__body theme-editor__help">
${HELP_CONTENT}
          </div>
        </div>
      </div>`;
    el = wrap.firstElementChild;
    document.body.appendChild(el);
    if (window.LB) {
      if (window.LB.init) window.LB.init(document.body);
      if (window.LB.initIcons) window.LB.initIcons(el);
    }
    return el;
  }

  function _sectionIO() {
    // Two paired rows: file transport on top, clipboard transport below —
    // Paste sits under Import, Copy under Export.
    return `
      <div class="theme-editor__section">
        <div class="theme-editor__io">
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" id="token-import-btn" title="Import a letbe-ds plugin JSON export. Becomes the new baseline.">
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="download"></span>
            Import
          </button>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" id="token-export-btn" title="Download current state (canonical + baseline + overrides merged) as JSON">
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="upload"></span>
            Export
          </button>
        </div>
        <div class="theme-editor__io">
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" id="token-paste-btn" title="Paste theme JSON from the clipboard and apply it as the new baseline">
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="clipboard"></span>
            Paste
          </button>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" id="token-copy-btn" title="Copy the current theme JSON to the clipboard">
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="copy"></span>
            Copy
          </button>
        </div>
        <div class="theme-editor__io">
          <button type="button" class="lb-btn lb-btn--primary lb-btn--small" id="token-share-btn" title="Copy a link that opens this exact theme for anyone">
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="share-2"></span>
            Share link
          </button>
        </div>
        <div class="theme-editor__help-link-row">
          <button type="button" class="lb-link theme-editor__help-link" data-help-toggle>How it works?</button>
        </div>
        <p class="theme-editor__io-note">Round-trips with the <a class="lb-link" href="https://www.figma.com/community/plugin/1671570185456177314/letbe-tokens">letbe tokens</a> plugin for Figma.</p>
      </div>`;
  }

  function _sectionPresets() {
    return `
      <div class="theme-editor__section">
        <div class="theme-editor__presets">
          ${THEME_PRESETS.map((p, i) => `
            <button type="button" class="theme-editor__preset${state.lastPreset === p.name ? ' theme-editor__preset--active' : ''}" data-preset="${i}">
              <span class="theme-editor__preset-dot" style="background:${p.dot}"></span>
              <span class="theme-editor__preset-name">${p.name}</span>
            </button>`).join('')}
        </div>
        <div class="theme-editor__hint">Starting points, not skins — a preset fills the knobs below (brand, radius, strokes, fonts). Tweak anything, then Export. Contrast is pre-measured: AA everywhere, Ink at AAA.</div>
      </div>`;
  }

  function _sectionColor() {
    const slotRow = (n) => `
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Accent-${n} <span class="theme-editor__hint-inline" id="te-brand-${n}-status">· slot ${n} · dormant</span></h4>
        <div class="theme-editor__row">
          <div data-lb-color-picker
               data-lb-popover
               data-lb-presets="#a36200,#2563EB,#059669,#E11D48,#EA580C,#0891B2"
               id="te-brand-${n}"
               data-lb-value="#7C3AED"></div>
          <button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" id="te-brand-${n}-clear" title="Clear — back to dormant" aria-label="Clear accent-${n} slot" hidden>
            <span class="lb-icon-btn__icon" data-lb-icon="x"></span>
          </button>
        </div>
      </div>`;
    return `
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Accent <span class="theme-editor__hint-inline">· slot 1</span></h4>
        <div class="theme-editor__row">
          <div data-lb-color-picker
               data-lb-popover
               data-lb-presets="#7C3AED,#2563EB,#059669,#E11D48,#EA580C,#0891B2"
               id="te-brand"
               data-lb-value="#7C3AED"></div>
        </div>
        <div class="theme-editor__hint">Worn by: primary button · links · selected states · washes. Creates a new <code>brand.*</code> L1 palette and remaps L2 accent tokens to reference it. L1 violet is preserved.</div>
        <div class="theme-editor__feedback" id="te-brand-feedback" hidden></div>
      </div>
      ${slotRow(2)}
      ${slotRow(3)}
      <div class="theme-editor__section">
        <div class="theme-editor__hint" style="margin-bottom: var(--lb-size-2x);">Extra signal slots: one seed color each — ramp, roles and button text are derived and contrast-measured, worn by <code>.lb-btn--accent-2</code> / <code>--accent-3</code>. Dormant slots inherit Accent and render identical to Primary:</div>
        <div class="theme-editor__row" style="flex-wrap: wrap; gap: var(--lb-size-2x);">
          <button type="button" class="lb-btn lb-btn--primary lb-btn--small"><span class="lb-btn__label">Primary</span></button>
          <button type="button" class="lb-btn lb-btn--accent-2 lb-btn--small"><span class="lb-btn__label">Accent-2</span></button>
          <button type="button" class="lb-btn lb-btn--accent-3 lb-btn--small"><span class="lb-btn__label">Accent-3</span></button>
        </div>
      </div>
    `;
  }
  function _fontOptions(category) {
    // Build <option> list filtered by category (sans-serif / serif / mono).
    // Featured fonts first, then alphabetical within remainder.
    // Kept for legacy callers (none after Slice 2 — fontpicker uses the
    // full catalog via _attachFontpickerHandlers).
    const filtered = GOOGLE_FONTS.filter(f => !category || f.category === category);
    const featured = filtered.filter(f => f.featured);
    const rest     = filtered.filter(f => !f.featured).sort((a, b) => a.name.localeCompare(b.name));
    const items = [...featured, ...rest];
    return items.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
  }

  // Slice 2: font-slot picker uses the letbe-ds Dropdown component
  // (.lb-dropdown-wrap + LB.Dropdown). _attachFontpickerHandlers
  // instantiates one LB.Dropdown per slot and feeds it the Google
  // Fonts catalog as soon as it loads. Filter, ranking, in-face
  // previews, and grouped sections (Recently/Featured/All) land in
  // Slices 3–5 — vanilla LB.Dropdown already covers substring filter
  // and keyboard nav.
  function _fontpickerMarkup(slot, roleHint) {
    const id = 'te-font-slot-' + slot;
    return `
      <div class="theme-editor__row theme-editor__row--stack" data-typo-slot="${slot}">
        <label class="theme-editor__sublabel" for="${id}">Slot ${slot} <span class="theme-editor__hint-inline" id="te-slot-caption-${slot}">${roleHint}</span></label>
        <div class="lb-dropdown-wrap">
          <input
            type="text"
            id="${id}"
            class="lb-dropdown lb-dropdown--small"
            placeholder="— default —"
            autocomplete="off"
            spellcheck="false"
          >
          <span class="lb-dropdown-wrap__chevron" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </div>
      </div>
    `;
  }
  function _slotOptionsHTML(role) {
    return [1, 2, 3].map(n => `<option value="${n}">Slot ${n}</option>`).join('');
  }
  function _sectionTypo() {
    return `
      <!-- ── Family slots ── -->
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Family slots</h4>
        <div class="theme-editor__hint" style="margin-bottom: var(--lb-size-2x);">Pick the font for each of the three L1 family slots. Roles inherit their slot via the role map below. Fonts lazy-load from Google Fonts on selection.</div>

        <!-- Opt-in font previews — off by default so the dropdown opens
             fast over the full 1934-font catalog. Preference persists in
             localStorage. Uses the .lb-checkbox-wrap component as-is; the
             wrap handles top alignment between glyph and label text. -->
        <label class="lb-checkbox-wrap" style="margin-bottom: var(--lb-size-2x);">
          <input type="checkbox" class="lb-checkbox" id="te-font-preview-toggle"${_fontPreviewEnabled() ? ' checked' : ''}>
          <span>Show font previews in the list</span>
        </label>

        ${_fontpickerMarkup(1, '— body, action, label, caption')}
        ${_fontpickerMarkup(2, '— display, heading')}
        ${_fontpickerMarkup(3, '— code')}
      </div>

      <!-- ── Role map (which slot each text role wears) ── -->
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Role map</h4>
        <div class="theme-editor__hint" style="margin-bottom: var(--lb-size-2x);">Each text role maps to one of the three family slots — the slot captions above update as you remap. Overline follows Label. Code also covers monospace micro-UI (timestamps, hex inputs). Default: display + heading on slot 2 (the headline face), other text roles on slot 1, code on slot 3.</div>
        ${TYPO_ROLES.map(role => `
          <div class="theme-editor__row theme-editor__row--rolemap">
            <label class="theme-editor__sublabel" for="te-rolemap-${role}" style="min-width: 80px; text-transform: capitalize;">${role}</label>
            <select id="te-rolemap-${role}" class="lb-select lb-select--small" data-typo-rolemap="${role}">
              ${_slotOptionsHTML(role)}
            </select>
          </div>
        `).join('')}
      </div>

      <!-- ── Base size per mode ── -->
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Base font size</h4>
        <div class="theme-editor__hint" style="margin-bottom: var(--lb-size-2x);">One slider per responsive mode. All sizes scale proportionally from these bases. Default 16px across all modes.</div>

        <div class="theme-editor__row">
          <span class="theme-editor__sublabel" style="min-width: 36px;">S</span>
          <input type="range" id="te-base-S" min="${BASE_SIZE_MIN}" max="${BASE_SIZE_MAX}" step="1" value="${BASE_SIZE_DEFAULT}" data-typo-base="S">
          <span class="theme-editor__value" id="te-base-S-value">${BASE_SIZE_DEFAULT}px</span>
        </div>
        <div class="theme-editor__row">
          <span class="theme-editor__sublabel" style="min-width: 36px;">M</span>
          <input type="range" id="te-base-M" min="${BASE_SIZE_MIN}" max="${BASE_SIZE_MAX}" step="1" value="${BASE_SIZE_DEFAULT}" data-typo-base="M">
          <span class="theme-editor__value" id="te-base-M-value">${BASE_SIZE_DEFAULT}px</span>
        </div>
        <div class="theme-editor__row">
          <span class="theme-editor__sublabel" style="min-width: 36px;">L</span>
          <input type="range" id="te-base-L" min="${BASE_SIZE_MIN}" max="${BASE_SIZE_MAX}" step="1" value="${BASE_SIZE_DEFAULT}" data-typo-base="L">
          <span class="theme-editor__value" id="te-base-L-value">${BASE_SIZE_DEFAULT}px</span>
        </div>
      </div>

    `;
  }

  // ── Font preview orchestration (Slice 4) ────────────────────────────
  // Lazy-loads weight-400 of fonts whose option rows are currently visible
  // in a slot dropdown so each label renders in its own typeface. Bounded
  // by:
  //   - 250 ms debounce after filter changes (don't spam loads while user types)
  //   - 8 simultaneous in-flight loads (drop tail into a queue, drain later)
  //   - 30-option visibility cap (default-open with 1934 fonts skips previews)
  //   - 80-font LRU eviction (committed slot fonts are pinned)
  // Distinct from `loadGoogleFont`: previews use a single weight + a
  // separate <link id="gfont-preview-…"> so eviction sweeps can find them
  // without touching the committed-font links.

  const PREVIEW_DEBOUNCE_MS    = 250;
  const PREVIEW_INFLIGHT_CAP   = 8;
  const PREVIEW_LRU_CAP        = 80;
  // Default OFF — previews are pretty but writing inline font-family
  // and registering an IntersectionObserver entry for each of 1934
  // rows during _render adds enough work to make first-open feel
  // sluggish. User opts in via a checkbox above the slot pickers.
  const PREVIEW_PREF_KEY       = 'letbe-ds.fontPreviewEnabled';
  function _fontPreviewEnabled() {
    try { return localStorage.getItem(PREVIEW_PREF_KEY) === '1'; }
    catch { return false; }
  }
  function _setFontPreviewEnabled(on) {
    try { localStorage.setItem(PREVIEW_PREF_KEY, on ? '1' : '0'); } catch {}
  }
  // IntersectionObserver rootMargin: start loading a row's face ~80 px
  // before it scrolls into the visible area, so by the time the user's
  // arrow-key navigation reaches it, the swap has either landed or is
  // imminent. 80 px ≈ 2 rows of headroom.
  const PREVIEW_ROOT_MARGIN    = '80px 0px';
  const _previewState = {
    loaded:   new Set(),  // font names with a preview <link> currently in DOM
    inflight: new Set(),  // font names with a load in progress
    queue:    [],         // names waiting for an in-flight slot
    lru:      [],         // names ordered oldest-first (eviction order)
    debounceT: null,
  };

  function _previewLinkId(name) {
    return 'gfont-preview-' + name.replace(/[^\w]+/g, '-');
  }

  function _bumpPreviewLRU(name) {
    _previewState.lru = _previewState.lru.filter(n => n !== name);
    _previewState.lru.push(name);
  }

  function _committedFontSet() {
    // Pin currently-committed slot fonts so eviction doesn't yank them.
    const s = new Set();
    for (const slot of ['1', '2', '3']) {
      const n = _committedSlotLabel(slot);
      if (n) s.add(n);
    }
    return s;
  }

  function _enforcePreviewLRU() {
    if (_previewState.lru.length <= PREVIEW_LRU_CAP) return;
    const pinned = _committedFontSet();
    while (_previewState.lru.length > PREVIEW_LRU_CAP) {
      // Evict oldest non-pinned entry. If all entries are pinned (very
      // unlikely at LRU=80 vs 3 slots) just stop.
      let evictedIdx = -1;
      for (let i = 0; i < _previewState.lru.length; i++) {
        if (!pinned.has(_previewState.lru[i])) { evictedIdx = i; break; }
      }
      if (evictedIdx === -1) break;
      const name = _previewState.lru.splice(evictedIdx, 1)[0];
      const link = document.getElementById(_previewLinkId(name));
      if (link && link.parentNode) link.parentNode.removeChild(link);
      _previewState.loaded.delete(name);
    }
  }

  function _drainPreviewQueue() {
    while (_previewState.queue.length && _previewState.inflight.size < PREVIEW_INFLIGHT_CAP) {
      _startPreviewLoad(_previewState.queue.shift());
    }
  }

  function _startPreviewLoad(name) {
    if (_previewState.loaded.has(name) || _previewState.inflight.has(name)) {
      _bumpPreviewLRU(name);
      return;
    }
    const id = _previewLinkId(name);
    if (document.getElementById(id)) {
      _previewState.loaded.add(name);
      _bumpPreviewLRU(name);
      return;
    }
    _previewState.inflight.add(name);
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name) + '&display=swap';
    link.dataset.lbFontpreview = '1';
    const finish = () => {
      _previewState.inflight.delete(name);
      _previewState.loaded.add(name);
      _bumpPreviewLRU(name);
      _enforcePreviewLRU();
      _drainPreviewQueue();
    };
    link.onload  = finish;
    link.onerror = finish;
    document.head.appendChild(link);
  }

  function _queuePreviewLoad(name) {
    if (_previewState.loaded.has(name) || _previewState.inflight.has(name)) {
      _bumpPreviewLRU(name);
      return;
    }
    _previewState.queue.push(name);
  }

  function _onSlotDropdownRender(listEl, options) {
    // Previews are opt-in via the "Show font previews in the list"
    // checkbox above the slots — wiring an IntersectionObserver entry
    // and an inline font-family per row across 1934 options costs
    // noticeably on first open. Bail when off; bail also when previously-
    // observed observer hangs around so a toggle-off cleanly stops
    // any in-flight load scheduling.
    if (!_fontPreviewEnabled()) {
      if (listEl._lbPreviewObserver) {
        listEl._lbPreviewObserver.disconnect();
        listEl._lbPreviewObserver = null;
      }
      return;
    }

    // 1) Decorate each option's label with its own font-family up front.
    //    Until that font is loaded the fallback chain renders the row,
    //    so labels stay legible during streaming swap-in.
    const items = listEl.querySelectorAll('.lb-list__item');
    options.forEach((opt, i) => {
      if (!opt.value) return;                      // skip "— default —"
      const li = items[i];
      if (!li) return;
      const label = li.querySelector('.lb-list__label');
      if (!label) return;
      const meta = _findFont(opt.value);
      if (!meta) return;
      const fallbacks = (FONT_FALLBACKS[meta.category] || FONT_FALLBACKS['sans-serif'])
        .map(f => f.replace(/^"|"$/g, ''));
      label.style.fontFamily = ["'" + opt.value + "'", ...fallbacks].join(', ');
      li.dataset.lbFontName = opt.value;           // for the observer
    });

    // 2) Lazy-load each row's preview face on demand. IntersectionObserver
    //    fires when a row enters (or is about to enter) the listbox's
    //    visible area, so arrow-key navigation and scrolling both prefetch
    //    naturally. The 8-in-flight cap now targets what the user is
    //    actually looking at instead of the top of the filtered set.
    //
    //    The observer is per-listbox and persists across chunked appends
    //    so we only need to observe newly-added rows. observe() is
    //    idempotent on an already-watched node, but checking via a
    //    dataset marker avoids the redundant call.
    let observer = listEl._lbPreviewObserver;
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        let queuedAny = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const name = entry.target.dataset.lbFontName;
          if (!name) continue;
          _queuePreviewLoad(name);
          queuedAny = true;
          observer.unobserve(entry.target);          // load each row's face once
        }
        if (!queuedAny) return;
        clearTimeout(_previewState.debounceT);
        _previewState.debounceT = setTimeout(_drainPreviewQueue, PREVIEW_DEBOUNCE_MS);
      }, { root: listEl, rootMargin: PREVIEW_ROOT_MARGIN, threshold: 0.01 });
      listEl._lbPreviewObserver = observer;
    }
    items.forEach((li) => {
      if (!li.dataset.lbFontName) return;
      if (li.dataset.lbPreviewObserved === '1') return;
      li.dataset.lbPreviewObserved = '1';
      observer.observe(li);
    });
  }

  // ── Font picker (Slice 2) ───────────────────────────────────────────
  // Consumes the letbe-ds Dropdown component (.lb-dropdown-wrap +
  // LB.Dropdown). Each slot gets one LB.Dropdown instance with a
  // "(default)" option pinned at the top to clear the override, and
  // the full Google Fonts catalog appended after.
  //
  // Slice 2 deliberately uses LB.Dropdown's stock filter (substring,
  // unranked) and flat option list. Slice 3 swaps in prefix→substring
  // ranking + grouped sections (Recently / Featured / All), Slice 4
  // adds in-face previews, Slice 5 adds polish (× clear icon, soft
  // toasts, etc.). Until then the "(default)" option doubles as the
  // clear UI.

  const _slotDropdowns = {};   // slot → LB.Dropdown instance

  // Build the [{ value, label }] list LB.Dropdown wants.
  // value '' is the "no override" option; label has a visible em-dash
  // sentinel so the user understands picking it clears the slot.
  function _slotOptions() {
    const opts = [{ value: '', label: '— default —' }];
    for (const f of fontCatalog()) opts.push({ value: f.name, label: f.name });
    return opts;
  }

  function _attachFontpickerHandlers(panel) {
    // Previous panel render may have left stale LB.Dropdown instances
    // whose DOM is gone. Destroy them before re-instantiating so their
    // outside-click handlers stop firing.
    for (const slot of Object.keys(_slotDropdowns)) {
      try { _slotDropdowns[slot].destroy(); } catch {}
      delete _slotDropdowns[slot];
    }
    panel.querySelectorAll('[data-typo-slot]').forEach(root => {
      const slot = root.dataset.typoSlot;
      const dd = new LB.Dropdown(root, {
        onChange: (value) => commitFontSlot(slot, value || null),
        // Prefix-only filter. With a 1934-font catalog, substring
        // matching surfaces too much noise (typing "ro" returns
        // "Aboreto" etc.).
        filterFn: (opt, q) => !q || opt.label.toLowerCase().startsWith(q),
        // Lazy chunked rendering. First open lays down ~80 rows, the
        // rest stream in on scroll. The full 1934-font catalog rendered
        // up-front was the remaining source of first-open lag after
        // _findFont became O(1).
        chunkSize: 80,
        // In-face previews: each option renders in its own typeface.
        // Loads are debounced and bounded — see _onSlotDropdownRender.
        // Decorates only the slice currently in the DOM.
        onRender: _onSlotDropdownRender,
      });
      _slotDropdowns[slot] = dd;
      dd.setOptions(_slotOptions());

      // Blur-restore: LB.Dropdown leaves whatever the user typed in the
      // input on blur without re-validating against the option list. Snap
      // it back to the committed value so the field never shows stale
      // typed-but-not-selected text.
      dd.input.addEventListener('blur', () => {
        setTimeout(() => {                       // wait one tick for option click
          if (dd._open) return;                  // a select is in progress
          const committed = _committedSlotLabel(slot);
          if (dd.input.value !== committed) dd.input.value = committed;
        }, 100);
      });
    });

    // If the catalog hadn't resolved yet at render time, refresh the
    // option lists once it does. This is a no-op if already populated
    // with the full catalog.
    loadFontCatalog().then(() => {
      for (const slot of Object.keys(_slotDropdowns)) {
        _slotDropdowns[slot].setOptions(_slotOptions());
      }
    });
  }

  // Returns the label that should be visible in the slot's input field
  // for the currently-committed font (after overrides + baseline merge).
  function _committedSlotLabel(slot) {
    const fontSlots = state.overrides.fontSlots || {};
    let name = fontSlots[slot];
    if (!name && _lastEffective) {
      const node = _lastEffective.primitives && _lastEffective.primitives.font
        && _lastEffective.primitives.font.family && _lastEffective.primitives.font.family[slot];
      if (node && node.$value) {
        const first = Array.isArray(node.$value) ? node.$value[0] : String(node.$value).split(',')[0];
        const cleaned = String(first).trim().replace(/^["']|["']$/g, '');
        if (_findFont(cleaned)) name = cleaned;
      }
    }
    return name || '';
  }

  // State writer — same logic that the old <select> change handler used.
  // Reused by click, Enter, Tab, and Reset(×) paths.
  function commitFontSlot(slot, name) {
    if (name) loadGoogleFont(name);
    const fontSlots = { ...(state.overrides.fontSlots || {}) };
    const baselineSrc = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
    const baselineNode = baselineSrc && baselineSrc.primitives && baselineSrc.primitives.font
      && baselineSrc.primitives.font.family && baselineSrc.primitives.font.family[slot];
    let baselineName = null;
    if (baselineNode && baselineNode.$value) {
      const first = Array.isArray(baselineNode.$value) ? baselineNode.$value[0] : String(baselineNode.$value).split(',')[0];
      baselineName = String(first).trim().replace(/^["']|["']$/g, '');
    }
    if (name && name === baselineName) delete fontSlots[slot];
    else if (name)                     fontSlots[slot] = name;
    else                               delete fontSlots[slot];
    setKnob('fontSlots', Object.keys(fontSlots).length ? fontSlots : null);
  }

  function _sectionStroke() {
    return `
      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Action stroke</h4>
        <div class="theme-editor__row">
          <div class="lb-number-wrap lb-number-wrap--sm" style="flex: 1;">
            <input type="number" class="lb-number" id="te-stroke-action"
                   min="0" max="3" step="0.1" placeholder="1.6">
            <span class="lb-number__suffix" aria-hidden="true">px</span>
          </div>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" id="te-stroke-action-reset" title="Reset to default (1.6px)">Reset</button>
        </div>
        <div class="theme-editor__hint">Interactive elements — buttons, inputs, chips, checkboxes, radios, switches. Mutates L1 <code>size.theme</code> directly. Default 1.6px.</div>
      </div>

      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Icon stroke</h4>
        <div class="lb-segmented lb-segmented--full-width lb-segmented--sm" data-lb-segmented role="radiogroup" aria-label="Icon stroke" id="te-stroke-icon">
          <button type="button" class="lb-segmented__item" data-lb-value="0">Thin</button>
          <button type="button" class="lb-segmented__item" data-lb-value="1">Brand</button>
          <button type="button" class="lb-segmented__item" data-lb-value="2">Bold</button>
        </div>
        <div class="theme-editor__hint">All <code>[data-lb-icon]</code> glyphs across the gallery — badges, banners, toasts, buttons, validation hints. Relinks L2 <code>stroke.icon</code>.</div>
      </div>

      <div class="theme-editor__section">
        <h4 class="theme-editor__label">Decorative stroke</h4>
        <div class="lb-segmented lb-segmented--full-width lb-segmented--sm" data-lb-segmented role="radiogroup" aria-label="Decorative stroke" id="te-stroke-decorative">
          <button type="button" class="lb-segmented__item" data-lb-value="0">None</button>
          <button type="button" class="lb-segmented__item" data-lb-value="1">Thin</button>
          <button type="button" class="lb-segmented__item" data-lb-value="2">Medium</button>
        </div>
        <div class="theme-editor__hint">Non-interactive borders — cards, dividers, banners, popup panels, modal/sheet outlines, table borders. Relinks L2 <code>border-width.thin</code>.</div>
      </div>
    `;
  }
  function _sectionRadius() {
    return `
      <div class="theme-editor__section">
        <div class="lb-segmented lb-segmented--full-width lb-segmented--sm" data-lb-segmented role="radiogroup" aria-label="Radius" id="te-radius">
          <button type="button" class="lb-segmented__item" data-lb-value="0">Square</button>
          <button type="button" class="lb-segmented__item" data-lb-value="1">Soft</button>
          <button type="button" class="lb-segmented__item" data-lb-value="2">Rounded</button>
          <button type="button" class="lb-segmented__item" data-lb-value="3">Pill</button>
        </div>
        <div class="theme-editor__hint">Remaps L2 radius aliases (interactive/field/surface/overlay/full/badge) to different L1 primitives.</div>
      </div>
    `;
  }
  function _accItem({ id, icon, label, body, open }) {
    const expanded = open ? 'true' : 'false';
    const chevronCls = open ? 'lb-accordion__chevron lb-accordion__chevron--open' : 'lb-accordion__chevron';
    const panelHidden = open ? '' : 'hidden';
    return `
      <div class="lb-accordion__item" data-lb-id="te-${id}">
        <button class="lb-accordion__trigger" aria-expanded="${expanded}" type="button">
          <span class="lb-accordion__icon" aria-hidden="true" data-lb-icon="${icon}"></span>
          <span class="lb-accordion__trigger-label">${label}</span>
          <span class="lb-accordion__indicators">
            <span class="lb-counter" data-te-count="${id}"></span>
            <span class="${chevronCls}" aria-hidden="true" data-lb-icon="chevron-down" style="width: 1.5rem; height: 1.5rem;"></span>
          </span>
        </button>
        <div class="lb-accordion__panel" ${panelHidden}>
          <div class="lb-accordion__panel-inner">
            ${body}
            <button type="button"
                    class="lb-btn lb-btn--secondary lb-btn--small theme-editor__group-reset"
                    data-reset-group="${id}" hidden>
              Reset changes
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function buildPanel() {
    const panel = document.createElement('aside');
    panel.className = 'theme-editor';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('inert', '');
    panel.innerHTML = `
      <div class="theme-editor__header">
        <h2 class="theme-editor__title">Theme editor</h2>
        <button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" aria-label="Close" data-close>
          <span data-lb-icon="x" aria-hidden="true"></span>
        </button>
      </div>

      <!-- Viewport switcher — global preview tool. Sets data-typo-preview
           on <html> which the gallery CSS reads to apply S/M/L mode
           overrides regardless of actual viewport width. Always visible
           at the top so it stays accessible during any edit below. -->
      <div class="theme-editor__viewport">
        <span class="theme-editor__viewport-label">Viewport</span>
        <div class="theme-editor__viewport-group" role="radiogroup" aria-label="Force responsive mode">
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-typo-mode="auto" aria-pressed="true">Auto</button>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-typo-mode="S" aria-pressed="false">S</button>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-typo-mode="M" aria-pressed="false">M</button>
          <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-typo-mode="L" aria-pressed="false">L</button>
        </div>
        <code class="theme-editor__viewport-indicator" id="te-viewport-indicator">—</code>
      </div>

      <div class="theme-editor__body">

        <div class="lb-accordion" data-lb-accordion>
          ${_accItem({ id: 'io',     icon: 'refresh-cw',      label: 'Import / Export', body: _sectionIO(), open: false })}
          ${_accItem({ id: 'presets', icon: 'sparkles',       label: 'Presets', body: _sectionPresets(), open: true })}
          ${_accItem({ id: 'color',  icon: 'palette',         label: 'Color',  body: _sectionColor(),  open: false })}
          ${_accItem({ id: 'typo',   icon: 'type',            label: 'Typo',   body: _sectionTypo(),   open: false })}
          ${_accItem({ id: 'stroke', icon: 'pencil',          label: 'Stroke', body: _sectionStroke(), open: false })}
          ${_accItem({ id: 'radius', icon: 'square-rounded',  label: 'Radius', body: _sectionRadius(), open: false })}
        </div>
      </div>

      <div class="theme-editor__footer">
        <button type="button" class="lb-btn lb-btn--primary lb-btn--small" data-save-baseline hidden
                title="Lock in current overrides as the new baseline. Badges drop to 0; further changes are measured from this state.">
          Save baseline
        </button>
        <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-reset hidden>
          Reset to default
          <span class="lb-counter lb-counter--on-btn" data-te-count-total></span>
        </button>
        <button type="button" class="lb-btn lb-btn--ghost lb-btn--small" data-factory-reset
                title="Discard the imported tokens + every knob override and return to the canonical letbe-ds theme.">
          Factory reset
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    if (window.LB && typeof window.LB.Accordion === 'function') {
      const accEl = panel.querySelector('[data-lb-accordion]');
      if (accEl && !accEl._lbAccordion) {
        accEl._lbAccordion = new window.LB.Accordion(accEl);
      }
    }
    return panel;
  }

  function _groupValues() {
    // Phase 2.1 typography overrides are object-shaped (fontSlots,
    // baseSizes, familyMap), each a map of slot/mode/role → value.
    // Flatten the inner values so the counter still counts individual
    // user-set knobs (e.g. "Slot 2 = DM Sans" + "Base S = 18" → 2).
    const fs = state.overrides.fontSlots || {};
    const bs = state.overrides.baseSizes || {};
    const fm = state.overrides.familyMap || {};
    return {
      color:  [state.overrides.brand, state.overrides.brand2, state.overrides.brand3],
      typo:   [
        fs['1'], fs['2'], fs['3'],
        bs.S,    bs.M,    bs.L,
        fm.display, fm.heading, fm.body, fm.action, fm.label, fm.caption, fm.code,
      ],
      stroke: [state.overrides.strokeAction, state.overrides.strokeDecorative, state.overrides.strokeIcon],
      radius: [state.overrides.radius],
    };
  }

  function syncPanel(panel) {
    // Each knob's UI reflects the EFFECTIVE state (override → baseline
    // → canonical), so an imported file's brand color shows in the
    // picker even when no user override is set. Override wins; if no
    // override, read whatever the baseline (or canonical) says and map
    // back to the preset table.
    // Color picker. Override wins. Otherwise read effective brand.500
    // from the baseline (if any). Falls back to canonical default
    // violet '#7C3AED' if no brand palette exists.
    const color = panel.querySelector('#te-brand');
    if (color && color._lbColorPicker) {
      const baselineBrand500 = (state.baseline?.primitives?.brand?.['500']?.$value) || null;
      const baselineBrandSeed = (state.baseline?.$extensions?.['design.letbe']?.seeds?.brand) || null;
      const want = state.overrides.brand || baselineBrandSeed || baselineBrand500 || '#7C3AED';
      if ((color.dataset.lbValue || '').toLowerCase() !== want.toLowerCase()) {
        _syncingPicker = true;
        try { color._lbColorPicker.setValue(want, false); }
        finally { _syncingPicker = false; }
      }
    }
    // Extra accent slots — picker value + filled/dormant status + clear
    // visibility. Filled = knob set OR the baseline's accent-N family
    // structurally wears its own identity (_slotFillState — a hand-made
    // brand-N ramp with zero retargets is NOT filled). Picker prefills from
    // the stored SEED ($extensions["design.letbe"].seeds) when present —
    // the brand-N.500 hex is the snapped step, not the seed.
    for (const slotN of [2, 3]) {
      const el = panel.querySelector('#te-brand-' + slotN);
      const baselineSeed = (state.baseline?.$extensions?.['design.letbe']?.seeds?.['brand-' + slotN]) || null;
      const baselineFilled = state.baseline ? _slotFillState(state.baseline, slotN) === 'filled' : false;
      const baselineHex = baselineFilled
        ? (baselineSeed || (state.baseline?.primitives?.['brand-' + slotN]?.['500']?.$value) || null)
        : null;
      const knobHex = state.overrides['brand' + slotN] || null;
      const filled = !!(knobHex || baselineFilled);
      if (el && el._lbColorPicker) {
        const want = knobHex || baselineHex || '#7C3AED';
        if ((el.dataset.lbValue || '').toLowerCase() !== want.toLowerCase()) {
          _syncingPicker = true;
          try { el._lbColorPicker.setValue(want, false); }
          finally { _syncingPicker = false; }
        }
      }
      const status = panel.querySelector(`#te-brand-${slotN}-status`);
      if (status) status.textContent = `· slot ${slotN} · ${filled ? 'filled' : 'dormant'}`;
      const clear = panel.querySelector(`#te-brand-${slotN}-clear`);
      if (clear) clear.hidden = !knobHex;
    }

    // Radius — match the effective semantic.radius.radius.interactive
    // ref against RADIUS_PRESETS' interactive entries.
    const eff = (canonical && state.baseline) ? deepMerge(canonical, state.baseline) : (canonical || {});
    const readEff = (dotted) => {
      const node = getByPath(eff, dotted);
      return (node && node.$value !== undefined) ? node.$value : null;
    };
    const refOf = (v) => (typeof v === 'string' && /^\{.+\}$/.test(v)) ? v.slice(1, -1) : null;
    const findPresetIdx = (presets, prop, ref) =>
      presets.findIndex(p => p[prop] === ref);
    // Helper: drive an lb-segmented group from a known idx (or fallback
    // index when unset). Sets aria-checked on the matching item AND
    // moves roving tabindex to the active item so keyboard focus enters
    // on the selection (matches what Segmented.js does on user select).
    const syncSegmented = (groupId, idx, fallbackIdx) => {
      const group = panel.querySelector(`#${groupId}`);
      if (!group) return;
      const target = idx != null ? String(idx) : String(fallbackIdx);
      group.querySelectorAll('.lb-segmented__item').forEach(item => {
        const isActive = item.dataset.lbValue === target;
        item.setAttribute('aria-checked', isActive ? 'true' : 'false');
        item.tabIndex = isActive ? 0 : -1;
      });
    };

    let radiusIdx = state.overrides.radius;
    if (radiusIdx == null) {
      const ref = refOf(readEff('semantic.radius.radius.interactive'));
      if (ref) radiusIdx = findPresetIdx(RADIUS_PRESETS, 'interactive', ref);
      if (radiusIdx === -1) radiusIdx = null;
    }
    syncSegmented('te-radius', radiusIdx, 2);

    // Stroke decorative — match effective semantic.border-width.border-width.thin
    let strokeDecIdx = state.overrides.strokeDecorative;
    if (strokeDecIdx == null) {
      const ref = refOf(readEff('semantic.border-width.border-width.thin'));
      if (ref) strokeDecIdx = findPresetIdx(STROKE_DECORATIVE_PRESETS, 'ref', ref);
      if (strokeDecIdx === -1) strokeDecIdx = null;
    }
    syncSegmented('te-stroke-decorative', strokeDecIdx, 1);

    // Stroke action — input shows override OR effective primitives.size.theme
    // if it's a literal px (custom user value baked into baseline).
    const sa = panel.querySelector('#te-stroke-action');
    if (sa) {
      if (state.overrides.strokeAction != null) {
        sa.value = state.overrides.strokeAction;
      } else {
        const v = readEff('primitives.size.theme');
        // Literal "1.6px" → 1.6; ref "{...}" → blank (default placeholder)
        if (typeof v === 'string' && /^[\d.]+px$/.test(v)) {
          const num = parseFloat(v);
          // Only show if it differs from the canonical default (1.6px);
          // otherwise leave blank so the placeholder shows.
          sa.value = num !== 1.6 ? String(num) : '';
        } else {
          sa.value = '';
        }
      }
    }

    // Stroke icon — match effective semantic.stroke.stroke.icon
    let strokeIconIdx = state.overrides.strokeIcon;
    if (strokeIconIdx == null) {
      const ref = refOf(readEff('semantic.stroke.stroke.icon'));
      if (ref) strokeIconIdx = findPresetIdx(STROKE_ICON_PRESETS, 'ref', ref);
      if (strokeIconIdx === -1) strokeIconIdx = null;
    }
    syncSegmented('te-stroke-icon', strokeIconIdx, 1);

    // Viewport switcher — sync aria-pressed on the four buttons.
    const vpMode = state.overrides.viewportMode || 'auto';
    panel.querySelectorAll('[data-typo-mode]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.typoMode === vpMode ? 'true' : 'false');
    });
    _updateViewportIndicator();

    // Phase 2.1 typography — family slot pickers.
    // Read order: override → baseline (in _lastEffective) → '' (empty
    // = "default"). After saveAsBaseline, the user's last choice lives
    // in baseline.primitives.font.family.X, not in overrides — so we
    // fall through to the effective JSON to keep the dropdown caption
    // truthful. Programmatic .value + explicit option.selected for the
    // WebKit caption-sync quirk.
    // Family slot pickers — LB.Dropdown instances own the input value.
    // _committedSlotLabel resolves overrides → baseline → '' for the
    // visible field text. setValue keeps the × clear-button visibility
    // in sync with the committed value.
    for (const slot of ['1', '2', '3']) {
      const dd = _slotDropdowns[slot];
      if (!dd) continue;
      dd.setValue(_committedSlotLabel(slot));
    }

    // Phase 2.1 typography — per-mode base sliders.
    // Read order: override → baseline primitives.font.base.X → 16px default.
    // After saveAsBaseline, the user's slider position lives in
    // baseline.primitives.font.base.X.$value (e.g. "18px"), not in
    // overrides — so the fallback reads there to keep the slider position
    // truthful.
    const baseSizes = state.overrides.baseSizes || {};
    for (const mode of ['S', 'M', 'L']) {
      const slider = panel.querySelector('#te-base-' + mode);
      const label  = panel.querySelector('#te-base-' + mode + '-value');
      let v = baseSizes[mode];
      if (v == null && _lastEffective) {
        const baseNode = _lastEffective.primitives && _lastEffective.primitives.font
          && _lastEffective.primitives.font.base && _lastEffective.primitives.font.base[mode];
        if (baseNode && baseNode.$value) {
          const px = parseFloat(baseNode.$value);
          if (Number.isFinite(px)) v = px;
        }
      }
      if (v == null) v = BASE_SIZE_DEFAULT;
      if (slider) slider.value = v;
      if (label)  label.textContent = v + 'px';
    }

    // Phase 2.1 typography — role → slot map.
    // Read order: override → effective baseline (semantic.typography.family.<role>
    // points at {font.family.N}, extract N) → DEFAULT_SLOT_ROLES fallback.
    // After saveAsBaseline, the choice lives in baseline so we need the
    // baseline read to keep the dropdown caption truthful.
    const fmap = state.overrides.familyMap || {};
    const effectiveSlot = {};   // role → slot, for the dynamic slot captions below
    for (const role of TYPO_ROLES) {
      const sel = panel.querySelector('#te-rolemap-' + role);
      if (!sel) continue;
      let want = fmap[role];
      if (want == null && _lastEffective) {
        const famNode = _lastEffective.semantic && _lastEffective.semantic.typography
          && _lastEffective.semantic.typography.family && _lastEffective.semantic.typography.family[role];
        if (famNode && famNode.$value) {
          const m = String(famNode.$value).match(/\{font\.family\.(\d+)\}/);
          if (m) want = parseInt(m[1], 10);
        }
      }
      if (want == null) {
        for (const slot of [1, 2, 3]) {
          if ((DEFAULT_SLOT_ROLES[slot] || []).includes(role)) { want = slot; break; }
        }
        if (want == null) want = 1;
      }
      effectiveSlot[role] = want;
      const wantStr = String(want);
      sel.value = wantStr;
      for (const opt of sel.options) opt.selected = (opt.value === wantStr);
    }
    // Dynamic slot captions — each slot picker lists the roles that
    // currently wear it (override → baseline → default, same read order
    // as the dropdowns), so remapping a role updates the captions live.
    for (const slot of [1, 2, 3]) {
      const cap = panel.querySelector('#te-slot-caption-' + slot);
      if (!cap) continue;
      const roles = TYPO_ROLES.filter((r) => effectiveSlot[r] === slot);
      cap.textContent = roles.length ? '— ' + roles.join(', ') : '— unused';
    }

    // Badges + button-disabled state
    const groups = _groupValues();
    let total = 0;
    for (const [groupId, values] of Object.entries(groups)) {
      const count = values.filter((v) => v != null).length;
      total += count;
      const badge = panel.querySelector(`[data-te-count="${groupId}"]`);
      if (badge) badge.textContent = count > 0 ? String(count) : '';
      const reset = panel.querySelector(`[data-reset-group="${groupId}"]`);
      if (reset) reset.hidden = count === 0;
    }
    const totalBadge = panel.querySelector('[data-te-count-total]');
    if (totalBadge) totalBadge.textContent = total > 0 ? String(total) : '';
    const resetAllBtn = panel.querySelector('[data-reset]');
    if (resetAllBtn) resetAllBtn.hidden = total === 0;
    const saveBtn = panel.querySelector('[data-save-baseline]');
    if (saveBtn) saveBtn.hidden = total === 0;
  }

  function _syncOpenState(panel) {
    if (!panel) return;
    const open = panel.classList.contains('theme-editor--open');
    if (open) {
      panel.setAttribute('aria-hidden', 'false');
      panel.removeAttribute('inert');
    } else {
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('inert', '');
    }
  }

  function wireEvents(panel) {
    panel.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => {
        panel.classList.remove('theme-editor--open');
        _syncOpenState(panel);
      });
    });

    // Viewport mode buttons (Auto / S / M / L) — set state.overrides.viewportMode
    // then apply. setKnob persists + triggers a normal render (which also
    // calls syncPanel to update aria-pressed on the buttons). We pass 'auto'
    // as the default sentinel rather than null so the counter logic doesn't
    // mistake it for an override.
    panel.querySelectorAll('[data-typo-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        setKnob('viewportMode', btn.dataset.typoMode);
        _syncViewportPreview();
      });
    });

    const helpBtn = panel.querySelector('[data-help-toggle]');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        const m = _ensureHelpModal();
        if (m && m._lbModal) m._lbModal.open();
      });
    }

    // Brand color picker — user input. Skip if the event was triggered
    // by syncPanel's setValue() echo (see _syncingPicker flag).
    const brandPicker = panel.querySelector('#te-brand');
    if (brandPicker) {
      brandPicker.addEventListener('lb-color-change', (e) => {
        if (_syncingPicker) return;
        setKnob('brand', e.detail.hex.toUpperCase());
      });
    }
    // Extra accent slots — same picker idiom, one knob per slot + a clear
    // control that returns the slot to dormant (mirror-of-accent).
    for (const slotN of [2, 3]) {
      const picker = panel.querySelector('#te-brand-' + slotN);
      if (picker) {
        picker.addEventListener('lb-color-change', (e) => {
          if (_syncingPicker) return;
          // Consent note: a pre-existing brand-N palette in the baseline
          // (hand-made or imported) is regenerated wholesale from the seed.
          const hadRamp = !!(state.baseline && state.baseline.primitives
            && state.baseline.primitives['brand-' + slotN]);
          const hadKnob = !!state.overrides['brand' + slotN];
          setKnob('brand' + slotN, e.detail.hex.toUpperCase());
          if (hadRamp && !hadKnob) {
            _showToast('warning', 'Palette regenerated',
              `The theme's existing brand-${slotN} palette is replaced — all 11 steps re-derived from the new seed.`);
          }
        });
      }
      const clear = panel.querySelector(`#te-brand-${slotN}-clear`);
      if (clear) {
        clear.addEventListener('click', () => setKnob('brand' + slotN, null));
      }
    }

    // Five segmented controls (Radius, Stroke icon, Stroke decorative,
    // Density, Contrast) all use the lb-segmented component. Each one
    // dispatches lb-segmented-change with detail.value (string).
    const wireSegmented = (groupId, knobName) => {
      const group = panel.querySelector(`#${groupId}`);
      if (!group) return;
      group.addEventListener('lb-segmented-change', (e) => {
        const v = e.detail && e.detail.value;
        setKnob(knobName, v == null ? null : parseInt(v, 10));
      });
    };
    wireSegmented('te-radius',             'radius');
    wireSegmented('te-stroke-decorative',  'strokeDecorative');
    wireSegmented('te-stroke-icon',        'strokeIcon');

    const sa = panel.querySelector('#te-stroke-action');
    if (sa) {
      sa.addEventListener('input', (e) => {
        const raw = e.target.value;
        setKnob('strokeAction', raw === '' ? null : parseFloat(raw));
      });
    }
    const saReset = panel.querySelector('#te-stroke-action-reset');
    if (saReset) saReset.addEventListener('click', () => setKnob('strokeAction', null));

    // ── Phase 2.1 typography handlers ──
    // Family slot pickers (3) — combobox shell over the full Google Fonts
    // catalog. _attachFontpickerHandlers handles all open/close/keyboard
    // logic and ends in commitFontSlot() for state writes.
    _attachFontpickerHandlers(panel);

    // Font preview opt-in checkbox. On toggle, persist + force the next
    // dropdown render to honour the new flag. Currently-open dropdowns
    // won't visually swap mid-session — but the next time the user
    // opens one (the common case) it picks up the new preference.
    const previewToggle = panel.querySelector('#te-font-preview-toggle');
    if (previewToggle) {
      previewToggle.addEventListener('change', (e) => {
        _setFontPreviewEnabled(e.target.checked);
        // Strip inline font-family overrides we may have written on any
        // currently-rendered slot dropdown list so disabling previews
        // takes effect immediately without re-opening.
        for (const slot of Object.keys(_slotDropdowns)) {
          const dd = _slotDropdowns[slot];
          if (!dd || !dd._list) continue;
          if (!e.target.checked) {
            dd._list.querySelectorAll('.lb-list__label').forEach(l => {
              l.style.fontFamily = '';
            });
            if (dd._list._lbPreviewObserver) {
              dd._list._lbPreviewObserver.disconnect();
              dd._list._lbPreviewObserver = null;
            }
          } else {
            // Force a re-render so labels get inline font-family + observer.
            dd._render && dd._render();
          }
        }
      });
    }

    // Per-mode base sliders (3) — write to state.overrides.baseSizes[mode].
    // "No override needed" detection: if slider value equals the BASELINE
    // value for this mode (NOT just 16), drop the override. Otherwise the
    // user can't move the slider back to baseline's value after saveAsBaseline.
    panel.querySelectorAll('[data-typo-base]').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const mode = e.target.dataset.typoBase;
        const v = parseInt(e.target.value);
        const label = panel.querySelector('#te-base-' + mode + '-value');
        if (label) label.textContent = v + 'px';
        const baselineV = baselineBasePxFor(mode);  // baseline-only, ignores overrides
        const baseSizes = { ...(state.overrides.baseSizes || {}) };
        if (v === baselineV) delete baseSizes[mode]; else baseSizes[mode] = v;
        setKnob('baseSizes', Object.keys(baseSizes).length ? baseSizes : null);
      });
    });

    // Role-map dropdowns (6) — write to state.overrides.familyMap[role].
    panel.querySelectorAll('[data-typo-rolemap]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const role = e.target.dataset.typoRolemap;
        const slot = parseInt(e.target.value, 10);
        // Compute baseline-only effective slot for this role. If user
        // picks the same slot, drop the override. Otherwise we'd strand
        // the user after saveAsBaseline (can't reset to baseline value).
        const baselineSrc = state.baseline ? deepMerge(canonical, state.baseline) : canonical;
        let baselineSlot = null;
        const famNode = baselineSrc && baselineSrc.semantic && baselineSrc.semantic.typography
          && baselineSrc.semantic.typography.family && baselineSrc.semantic.typography.family[role];
        if (famNode && famNode.$value) {
          const m = String(famNode.$value).match(/\{font\.family\.(\d+)\}/);
          if (m) baselineSlot = parseInt(m[1], 10);
        }
        if (baselineSlot == null) {
          // Fallback to canonical default mapping
          for (const s of [1, 2, 3]) {
            if ((DEFAULT_SLOT_ROLES[s] || []).includes(role)) { baselineSlot = s; break; }
          }
          if (baselineSlot == null) baselineSlot = 1;
        }
        const familyMap = { ...(state.overrides.familyMap || {}) };
        if (slot === baselineSlot) delete familyMap[role]; else familyMap[role] = slot;
        setKnob('familyMap', Object.keys(familyMap).length ? familyMap : null);
      });
    });

    panel.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => applyPreset(Number(btn.dataset.preset), panel));
    });
    panel.querySelector('[data-reset]').addEventListener('click', () => {
      resetAllKnobs();
      panel.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('theme-editor__preset--active'));
    });
    panel.querySelectorAll('[data-reset-group]').forEach(btn => {
      btn.addEventListener('click', () => resetGroup(btn.dataset.resetGroup));
    });

    panel.querySelector('[data-save-baseline]').addEventListener('click', () => {
      saveAsBaseline();
      _showToast('success', 'Baseline saved', 'Current overrides absorbed. Further changes are measured from this state.');
    });

    panel.querySelector('[data-factory-reset]').addEventListener('click', async () => {
      const hasBaseline = !!state.baseline;
      const message = hasBaseline
        ? 'This will discard the imported token JSON and clear every knob override (brand, typography, stroke, radius). Returns to the canonical letbe-ds theme. Source files on disk are not modified.'
        : 'This will clear every knob override (brand, typography, stroke, radius) and return to the canonical letbe-ds theme. Source files on disk are not modified.';
      const confirmed = window.LB && typeof window.LB.alert === 'function'
        ? await window.LB.alert({
            title: 'Factory reset?',
            message,
            confirmText: 'Reset to factory',
            cancelText: 'Cancel',
            danger: true,
            icon: 'circle-alert',
          })
        : window.confirm('Factory reset will discard the imported tokens and every knob override. Continue?');
      if (!confirmed) return;
      // factoryReset() reloads — nothing after it executes. The visual
      // snap-back to the canonical theme on reload IS the feedback.
      factoryReset();
    });
  }

  function _showToast(variant, title, message) {
    try {
      if (window.LB && typeof window.LB.ToastManager === 'function') {
        window._lbToast = window._lbToast || new window.LB.ToastManager();
        window._lbToast.show({ variant, title, message });
      }
    } catch {}
  }

  function ensurePanel() {
    if (_panel) return _panel;
    _panel = buildPanel();
    if (window.LB && typeof window.LB.init === 'function') window.LB.init(_panel);
    else if (window.LB && typeof window.LB.initIcons === 'function') window.LB.initIcons(_panel);
    wireEvents(_panel);
    syncPanel(_panel);
    setupFeedback(_panel);
    return _panel;
  }

  function setupFeedback(panel) {
    const el = panel.querySelector('#te-brand-feedback');
    if (!el) return;
    _refreshFeedback = () => {
      if (!_lastBrandInfo) { el.hidden = true; return; }
      const info = _lastBrandInfo;
      const wcag = info.passesAA ? '<span class="theme-editor__badge theme-editor__badge--ok">AA ✓</span>'
        : info.passesAALarge ? '<span class="theme-editor__badge theme-editor__badge--warn">AA Large ✓</span>'
        : '<span class="theme-editor__badge theme-editor__badge--fail">Fails AA ✗</span>';
      el.innerHTML = `
        <div class="theme-editor__feedback-row"><span>Maps to step</span><strong>${info.emphasisStep}</strong></div>
        <div class="theme-editor__feedback-row"><span>Text on accent</span><strong>${info.pairUsed === 'inverse' ? 'white' : 'black'}</strong></div>
        <div class="theme-editor__feedback-row"><span>Contrast</span><span>${info.contrast.toFixed(1)}:1 ${wcag}</span></div>
      `;
      el.hidden = false;
    };
    _refreshFeedback();
  }

  // ════════════════════════════════════════════════════════════
  //   9. Bootstrap — fetch canonical, then render
  // ════════════════════════════════════════════════════════════

  function _resolveCanonicalUrl() {
    const link = document.querySelector('link[rel="stylesheet"][href*="tokens/theme.css"]');
    if (link) return link.href.replace(/theme\.css(\?.*)?$/, 'source-tokens.json');
    // Fallback: derive from data-lb-base on <body>
    const baseAttr = document.body && document.body.getAttribute('data-lb-base');
    const prefix = baseAttr ? baseAttr.replace(/\/$/, '') + '/' : '';
    return prefix + 'tokens/source-tokens.json';
  }

  async function bootstrap() {
    // Pre-load any fonts the user picked in previous sessions so this
    // page boots with the correct face instead of flashing fallback.
    preloadRecentFonts();

    // Also pre-load fonts referenced by the rehydrated baseline (if any).
    // Without this, refreshing a page that has an imported theme would
    // show fallback fonts until the user re-picks them: importJson loads
    // the fonts, but on next page load loadState() restores the baseline
    // from localStorage without triggering any font fetch. Mirrors what
    // importJson now does at import time.
    if (state.baseline) loadBaselineFonts(state.baseline);

    // Kick off the Google Fonts catalog load eagerly. The picker degrades
    // gracefully to the curated 22-font list if this fails or hasn't
    // resolved by the time the panel opens — but in practice 16 KB
    // gzipped finishes long before the user clicks "open editor".
    loadFontCatalog();

    // Apply the persisted viewport mode immediately (don't wait for
    // editor panel to open). And re-detect on resize when in 'auto'.
    _syncViewportPreview();
    let _vpResizeT;
    window.addEventListener('resize', () => {
      clearTimeout(_vpResizeT);
      _vpResizeT = setTimeout(_syncViewportPreview, 100);
    });

    // Clean up legacy artifacts from the previous editor
    const oldEl = document.getElementById('lb-imported-tokens');
    if (oldEl) oldEl.remove();
    // Sweep any inline --lb-* left on :root by older sessions
    const inlineToRemove = [];
    for (let i = 0; i < root.style.length; i++) {
      const n = root.style[i];
      if (n && n.startsWith('--lb-')) inlineToRemove.push(n);
    }
    for (const n of inlineToRemove) root.style.removeProperty(n);

    // Fetch canonical
    try {
      const res = await fetch(_resolveCanonicalUrl(), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      canonical = await res.json();
    } catch (err) {
      console.error('Theme editor: could not load canonical tokens —', err);
      return;
    }

    _consumeThemeLink();

    render();
  }

  // ── Theme-link intake ──
  // The Figma plugin (and anyone sharing a theme) opens
  //   <site>/#theme=<base64url of a partial DTCG patch>
  // — the same deepMerge patch importJson() accepts. Runs once after
  // canonical loads; malformed input fails silently to a normal page load.
  // On success the hash is cleared so a reload doesn't re-import and the
  // URL stays clean. Side effect by design: themes are shareable links.
  function _consumeThemeLink() {
    try {
      const h = location.hash || '';
      if (!h.startsWith('#theme=')) return;
      let b64 = h.slice('#theme='.length).replace(/-/g, '+').replace(/_/g, '/');
      b64 += '='.repeat((4 - (b64.length % 4)) % 4);
      const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!json || typeof json !== 'object' || Array.isArray(json)) return;
      importJson(json);
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* malformed link → normal page load */ }
  }

  // Re-render on dark/light toggle so brand fg-pickers reflect the
  // currently visible bg colors.
  new MutationObserver(() => {
    if (state.overrides.brand) render();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // ════════════════════════════════════════════════════════════
  //   10. Public API
  // ════════════════════════════════════════════════════════════

  function toggle() {
    const panel = ensurePanel();
    panel.classList.toggle('theme-editor--open');
    _syncOpenState(panel);
  }

  window.LetbeThemeEditor = {
    toggle,
    open:  () => { const p = ensurePanel(); p.classList.add('theme-editor--open'); _syncOpenState(p); },
    close: () => { if (!_panel) return; _panel.classList.remove('theme-editor--open'); _syncOpenState(_panel); },
    importJson,
    buildExportJson,
    buildShareLink,
    auditAccentPairs,
    factoryReset,
    saveAsBaseline,
    resetAllKnobs,
    setKnob,
    getState: () => deepClone(state),
    isReady: () => canonical != null,
    // Math utilities re-exposed for compatibility
    generatePalette,
    snapToStep,
    contrastRatio,
    PALETTE_STEPS,
    RADIUS_PRESETS,
    STROKE_DECORATIVE_PRESETS,
  };
})();
