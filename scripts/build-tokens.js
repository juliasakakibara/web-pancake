#!/usr/bin/env node
/**
 * build-tokens.js — letbe-ds Token Build Script
 *
 * Reads tokens/source-tokens.json (letbe plugin export, W3C DTCG format)
 * Outputs tokens/theme.css with:
 *   - :root  → primitives + L2 light semantics + L3 component tokens + typography/radius/shadow
 *   - Dark overrides under `[data-theme="dark"]` AND `@media (prefers-color-scheme: dark)`
 *
 * Naming convention for CSS variables:
 *   L1 primitives:  --lb-{group}-{name}      (e.g. --lb-neutral-900, --lb-size-4x)
 *   L2 semantic:    --lb-{role}-{variant}    (e.g. --lb-fg-default, --lb-bg-accent-strong)
 *   L3 component:   --lb-{area}-{role}       (e.g. --lb-action-bg-primary-default)
 *   Typography:     --lb-t-{role}-{size}-{prop}  (e.g. --lb-t-action-m-font-size)
 *
 * References like {neutral.900} or {fg.default} are resolved to var(--lb-*) at build time.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'tokens', 'source-tokens.json');
const OUT = path.join(__dirname, '..', 'tokens', 'theme.css');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// ─── Validation ─────────────────────────────────────────────
// Verifies the JSON has the structure letbe-ds components expect.
// If a required path is missing, we fail loudly so the user knows
// the Figma export is incompatible with current components.

const REQUIRED_PATHS = [
  // Top-level groups
  'primitives', 'semantic', 'component',
  // Color palettes used by components
  'primitives.neutral', 'primitives.red', 'primitives.green',
  'primitives.yellow', 'primitives.blue', 'primitives.violet',
  // L1 groups
  'primitives.size', 'primitives.font.family', 'primitives.font.size',
  'primitives.font.weight', 'primitives.font.line-height',
  'primitives.font.letter-spacing', 'primitives.radius',
  // L2 semantic (both themes)
  'semantic.light.fg', 'semantic.light.bg', 'semantic.light.border',
  'semantic.dark.fg', 'semantic.dark.bg', 'semantic.dark.border',
  'semantic.typography.text', 'semantic.radius.radius',
  'semantic.border-width.border-width',
  // L3 component tokens
  'component.action', 'component.field', 'component.surface',
];

const REQUIRED_TYPOGRAPHY = [
  'display.xl', 'display.l', 'display.m', 'display.s', 'display.xs',
  'heading.xl', 'heading.l', 'heading.m', 'heading.s',
  'body.xl', 'body.l', 'body.m', 'body.s', 'body.xs',
  'action.l', 'action.m', 'action.s',
  'label.l', 'label.m', 'label.s',
  'caption.m', 'caption.s',
];

function pathExists(root, dotted) {
  return dotted.split('.').reduce((cur, p) => (cur && cur[p] !== undefined) ? cur[p] : undefined, root) !== undefined;
}

const errors = [];
const warnings = [];

for (const p of REQUIRED_PATHS) {
  if (!pathExists(data, p)) errors.push(`Missing required path: ${p}`);
}

for (const t of REQUIRED_TYPOGRAPHY) {
  if (!pathExists(data, `semantic.typography.text.${t}`)) {
    warnings.push(`Missing typography token: semantic.typography.text.${t}`);
  }
}

// Component tokens used by components.css — warn if removed/renamed
const REQUIRED_COMPONENT_KEYS = {
  action: ['bg-primary-default', 'bg-primary-hover', 'bg-primary-pressed', 'bg-primary-disabled',
           'fg-primary-default', 'border-primary-default',
           'bg-secondary-default', 'fg-secondary-default', 'border-secondary-default',
           'bg-ghost-default', 'bg-ghost-hover', 'fg-ghost-default',
           'fg-link-default', 'fg-link-hover',
           'bg-selected', 'fg-selected', 'border-selected', 'border-focus'],
  field: ['fg-default', 'fg-placeholder', 'fg-label', 'fg-hint', 'fg-error', 'fg-success', 'fg-disabled',
          'bg-default', 'bg-disabled',
          'border-default', 'border-focus', 'border-error', 'border-success', 'border-disabled'],
  surface: ['bg-default', 'bg-elevated', 'bg-overlay', 'border-default', 'border-overlay'],
};

for (const [area, keys] of Object.entries(REQUIRED_COMPONENT_KEYS)) {
  for (const key of keys) {
    if (!pathExists(data, `component.${area}.${key}`)) {
      warnings.push(`Missing component token: component.${area}.${key}`);
    }
  }
}

if (errors.length > 0) {
  console.error('\n✗ Token validation FAILED — build aborted:');
  errors.forEach(e => console.error('  - ' + e));
  console.error('\nThe imported JSON is missing required top-level structure.');
  console.error('Check that the Figma plugin export includes all 3 layers (primitives/semantic/component).');
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('\n⚠ Token validation WARNINGS:');
  warnings.forEach(w => console.warn('  - ' + w));
  console.warn(`\n  (${warnings.length} warnings) — components referencing these tokens may render with fallback values.\n`);
}

// ─── Path helpers ───────────────────────────────────────────

function getByPath(root, dottedPath) {
  const parts = dottedPath.split('.');
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Convert a JSON path to a CSS variable name.
// Examples:
//   primitives.neutral.900      -> --lb-neutral-900
//   primitives.size.4x          -> --lb-size-4x
//   primitives.font.size.m      -> --lb-font-size-m
//   primitives.radius.4         -> --lb-radius-4
//   semantic.light.fg.default   -> --lb-fg-default
//   semantic.typography.text.action.m -> handled separately (composite)
//   semantic.radius.radius.field -> --lb-radius-field (strip the double "radius")
//   component.action.bg-primary-default -> --lb-action-bg-primary-default
function pathToCssVar(dottedPath, themeMode) {
  const parts = dottedPath.split('.');

  // Strip top-level "primitives"/"semantic"/"component"
  if (parts[0] === 'primitives' || parts[0] === 'semantic' || parts[0] === 'component') {
    parts.shift();
  }

  // Strip "light"/"dark" theme qualifier (semantic.light.fg.default → fg.default)
  if (parts[0] === 'light' || parts[0] === 'dark') parts.shift();

  // Strip doubled group names like semantic.radius.radius.field → radius.field
  // and semantic.opacity.opacity.faint etc.
  if (parts.length >= 2 && parts[0] === parts[1]) parts.shift();

  // Strip "text" in semantic.typography.text.* → typography.*
  if (parts[0] === 'typography' && parts[1] === 'text') {
    parts.splice(1, 1);
  }

  return '--lb-' + parts.join('-').replace(/_/g, '-');
}

// ─── Reference resolution ───────────────────────────────────

// A reference like {fg.default} or {neutral.900} or {font.family.sans}
// needs to resolve to a var(--lb-*) reference, and we also need to know
// whether the target exists in the JSON for sanity.
//
// Strategy: try multiple candidate paths in order.
function resolveRefToCssVar(ref, themeMode) {
  // ref is like "{fg.default}" — strip braces
  const refPath = ref.replace(/^\{/, '').replace(/\}$/, '');
  const parts = refPath.split('.');

  // Candidate paths to search:
  const candidates = [
    `primitives.${refPath}`,
    `semantic.${themeMode}.${refPath}`,
    `semantic.${refPath}`,
    `component.${refPath}`,
  ];

  for (const cand of candidates) {
    const node = getByPath(data, cand);
    if (node && typeof node === 'object' && '$value' in node) {
      // Special-case: L1 primitives.shadow.focus is renamed to avoid collision
      if (cand === 'primitives.shadow.focus') return `var(--lb-shadow-ring)`;
      return `var(${pathToCssVar(cand, themeMode)})`;
    }
  }

  // Could not find — return the reference as-is (will appear as broken CSS, good signal)
  console.warn(`  ⚠ could not resolve reference: ${ref}`);
  return ref;
}

// Convert any value: string (possibly with refs), number, array (font family), object (shadow/typography)
function renderValue(val, themeMode) {
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    // font family list — quote names with spaces
    return val.map(f => /\s/.test(f) ? `"${f}"` : f).join(', ');
  }
  if (typeof val === 'string') {
    // Replace every {...} with var(...)
    return val.replace(/\{[^}]+\}/g, (m) => resolveRefToCssVar(m, themeMode));
  }
  return String(val);
}

// Render a shadow object as a CSS box-shadow string
function renderShadow(shadowVal, themeMode) {
  const { x, y, blur, spread, color, opacity } = shadowVal;
  const resolvedColor = typeof color === 'string' && color.startsWith('{')
    ? resolveRefToCssVar(color, themeMode)
    : color;
  // Use rgb(var(--..) / opacity)? Not all browsers support — safer to use a drop-shadow with fixed color.
  // Since our primitive colors are hex, we can't directly apply opacity via var(). So we fall back to:
  // Use the resolved CSS var but with color-mix() to blend with transparent, OR output a plain hex if possible.
  // Simplest: output `color-mix(in srgb, <color> <opacity*100>%, transparent)`
  const opacityPct = Math.round((opacity || 1) * 100);
  const colorExpr = `color-mix(in srgb, ${resolvedColor} ${opacityPct}%, transparent)`;
  return `${x} ${y} ${blur} ${spread} ${colorExpr}`;
}

// ─── CSS emission ──────────────────────────────────────────

const lines = [];

function heading(txt) {
  lines.push('');
  lines.push('  /* ─── ' + txt + ' ─── */');
}

// ── :root block ──
lines.push('/**');
lines.push(' * letbe-ds — Theme tokens');
lines.push(' * GENERATED FILE — edit tokens/source-tokens.json and run `node scripts/build-tokens.js`');
lines.push(' */');
lines.push('');
lines.push(':root {');

// ── L1 Primitives ──
// Color hue palettes — order chosen so the generated CSS lists hues
// in a predictable, stable order (neutral first as foundation, then
// status hues, then brand violet, then categorical hues orange + cyan).
// Adding a new hue palette to source-tokens.json means appending it here.
//
// 'brand' is OPTIONAL — emitted only when the JSON contains a brand
// palette. The Figma plugin export does include one (default violet);
// canonical letbe-ds source-tokens.json historically did not (brand was
// runtime-only via the theme editor). Either case is supported.
const COLOR_HUE_PALETTES = ['neutral', 'red', 'green', 'yellow', 'blue', 'violet', 'orange', 'cyan'];
const COLOR_HUE_PALETTES_OPTIONAL = ['brand', 'brand-2', 'brand-3'];
heading('L1 — Color primitives');
for (const palette of [...COLOR_HUE_PALETTES, ...COLOR_HUE_PALETTES_OPTIONAL]) {
  const scales = data.primitives[palette];
  if (!scales) continue;
  for (const step of Object.keys(scales)) {
    const tok = scales[step];
    if (!tok.$value) continue;
    lines.push(`  ${pathToCssVar(`primitives.${palette}.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
  }
}

heading('L1 — Size primitives (spacing)');
for (const step of Object.keys(data.primitives.size)) {
  const tok = data.primitives.size[step];
  lines.push(`  ${pathToCssVar(`primitives.size.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Font primitives');
// font.family
for (const name of Object.keys(data.primitives.font.family)) {
  const tok = data.primitives.font.family[name];
  lines.push(`  ${pathToCssVar(`primitives.font.family.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}
// font.size
for (const name of Object.keys(data.primitives.font.size)) {
  const tok = data.primitives.font.size[name];
  lines.push(`  ${pathToCssVar(`primitives.font.size.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}
// font.weight
for (const name of Object.keys(data.primitives.font.weight)) {
  const tok = data.primitives.font.weight[name];
  lines.push(`  ${pathToCssVar(`primitives.font.weight.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}
// font.line-height
for (const name of Object.keys(data.primitives.font['line-height'])) {
  const tok = data.primitives.font['line-height'][name];
  lines.push(`  ${pathToCssVar(`primitives.font.line-height.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}
// font.letter-spacing
for (const name of Object.keys(data.primitives.font['letter-spacing'])) {
  const tok = data.primitives.font['letter-spacing'][name];
  lines.push(`  ${pathToCssVar(`primitives.font.letter-spacing.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

// font.base.{S,M,L} — per-mode base font sizes (typography refactor v2)
if (data.primitives.font.base) {
  for (const mode of ['S', 'M', 'L']) {
    const tok = data.primitives.font.base[mode];
    if (!tok) continue;
    lines.push(`  --lb-font-base-${mode}: ${renderValue(tok.$value, 'light')};`);
  }
}

// font.scale-ratio.{S,M,L} — per-mode type-scale ratios (typography refactor v2)
if (data.primitives.font['scale-ratio']) {
  for (const mode of ['S', 'M', 'L']) {
    const tok = data.primitives.font['scale-ratio'][mode];
    if (!tok) continue;
    lines.push(`  --lb-font-scale-ratio-${mode}: ${tok.$value};`);
  }
}

// ─── Step alias emission (typography refactor v2) ───
// Step aliases are BUILD-EMITTED L1 tokens computed from base × ratio^n.
// L2 typography composite tokens reference step aliases (e.g.
// {font.size.step.0}) instead of the deprecated hand-tuned sizes.
//
// Slice 1: emit step aliases for mode S only (anchor mode). Slices 3 and 4
// will repoint L2 composites at these aliases and add M / L @media blocks.
//
// Line-height calculation: 4px-grid snap by default. The lhRatioForStep
// table preserves the current typography vibe — large headings tighten
// progressively, body text stays around 1.5×, captions tight at 1.33×.
const LH_RATIO_BY_STEP = {
  '-2': 1.33,
  '-1': 1.33,
  '0':  1.5,
  '1':  1.45,
  '2':  1.40,
  '3':  1.30,
  '4':  1.20,
  '5':  1.12,
  '6':  1.10,
  '7':  1.08,
  '8':  1.07
};

function computeStepTable(mode) {
  if (!data.primitives.font.base || !data.primitives.font['scale-ratio']) return null;
  const baseTok  = data.primitives.font.base[mode];
  const ratioTok = data.primitives.font['scale-ratio'][mode];
  if (!baseTok || !ratioTok) return null;

  // Parse base value (e.g. "16px") to number
  const baseStr = String(baseTok.$value);
  const basePx  = parseFloat(baseStr);
  if (!Number.isFinite(basePx)) return null;

  const ratio = Number(ratioTok.$value);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const lhMethod = (data.primitives.font['line-height-method']
    && data.primitives.font['line-height-method'].$value) || '4px-grid';

  const table = {};
  for (let n = -2; n <= 8; n++) {
    const size = Math.round(basePx * Math.pow(ratio, n));
    const lhRatio = LH_RATIO_BY_STEP[String(n)] || 1.4;
    const lhRaw = size * lhRatio;
    const lh = lhMethod === '4px-grid'
      ? Math.max(4, Math.round(lhRaw / 4) * 4)
      : Math.round(lhRaw);
    table[n] = { size, lh };
  }
  return table;
}

// CSS var-safe step suffix (negative steps become "n1", "n2" to avoid the
// minus sign in CSS custom property names which is legal but easier to
// read this way).
function stepSuffix(n) {
  return n < 0 ? `n${Math.abs(n)}` : String(n);
}

const stepTableS = computeStepTable('S');
if (stepTableS) {
  lines.push('  /* Step aliases — derived from font.base.S × font.scale-ratio.S */');
  for (let n = -2; n <= 8; n++) {
    const { size, lh } = stepTableS[n];
    lines.push(`  --lb-font-size-step-${stepSuffix(n)}: ${size}px;`);
    lines.push(`  --lb-font-line-height-step-${stepSuffix(n)}: ${lh}px;`);
  }
}

heading('L1 — Radius primitives');
for (const step of Object.keys(data.primitives.radius)) {
  const tok = data.primitives.radius[step];
  lines.push(`  ${pathToCssVar(`primitives.radius.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Opacity primitives');
for (const step of Object.keys(data.primitives.opacity)) {
  const tok = data.primitives.opacity[step];
  lines.push(`  ${pathToCssVar(`primitives.opacity.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Duration primitives');
for (const step of Object.keys(data.primitives.duration)) {
  const tok = data.primitives.duration[step];
  lines.push(`  ${pathToCssVar(`primitives.duration.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Ease primitives');
for (const step of Object.keys(data.primitives.ease)) {
  const tok = data.primitives.ease[step];
  lines.push(`  ${pathToCssVar(`primitives.ease.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Z-index primitives');
for (const step of Object.keys(data.primitives.z)) {
  const tok = data.primitives.z[step];
  lines.push(`  ${pathToCssVar(`primitives.z.${step}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L1 — Shadow primitives');
// Map for name overrides to avoid L1↔L2 collisions (e.g. primitives.shadow.focus vs semantic.shadow.shadow.focus)
const SHADOW_L1_RENAME = { focus: 'ring' };
for (const name of Object.keys(data.primitives.shadow)) {
  const tok = data.primitives.shadow[name];
  if (!tok.$value) continue;
  const outName = SHADOW_L1_RENAME[name] || name;
  lines.push(`  --lb-shadow-${outName}: ${renderShadow(tok.$value, 'light')};`);
}

// ── L2 Semantic (light) ──
// Color L2 groups inside semantic.<theme> are emitted in fixed order:
// fg, bg, border, then any "Extras" categorical groups (data, code) that
// the plugin sidebar groups under a separate "Extras" header. Adding a
// new categorical group means adding the key here.
const COLOR_L2_GROUPS = ['fg', 'bg', 'border', 'data', 'code'];
for (const grp of COLOR_L2_GROUPS) {
  if (!data.semantic.light[grp]) continue;
  heading(`L2 — Semantic light: ${grp}`);
  for (const name of Object.keys(data.semantic.light[grp])) {
    const tok = data.semantic.light[grp][name];
    lines.push(`  ${pathToCssVar(`semantic.light.${grp}.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
  }
}

// ── L2 Typography family aliases (typography refactor v2) ──
// One alias per L2 role pointing at a font.family.{N} slot. Composite
// tokens reference these aliases instead of font.family.1 directly so
// the family is remappable per-role at runtime via the theme editor.
heading('L2 — Typography family aliases');
if (data.semantic.typography.family) {
  for (const role of Object.keys(data.semantic.typography.family)) {
    const tok = data.semantic.typography.family[role];
    if (!tok || !tok.$value) continue;
    lines.push(`  --lb-typography-family-${role}: ${renderValue(tok.$value, 'light')};`);
  }
}

// ── L2 Typography (composite — flattened to individual vars) ──
heading('L2 — Typography (flattened per property)');
const TYPO_GROUPS = ['display', 'heading', 'body', 'action', 'label', 'caption', 'overline', 'code'];
// Responsive mode collector: each entry is { base, mode, v } so we can emit
// @media blocks after the main :root block closes.
const TYPO_MODES = {};  // { modeName: [{ base, props }] }
for (const grp of TYPO_GROUPS) {
  const groupNode = data.semantic.typography.text[grp];
  if (!groupNode) continue;
  // Single-voice groups (overline) ARE the style — no size tier, vars
  // emit as --lb-t-<group>-*; tiered groups emit --lb-t-<group>-<size>-*.
  const entries = groupNode.$value
    ? [['', groupNode]]
    : Object.keys(groupNode).map((sz) => [sz, groupNode[sz]]);
  for (const [sz, tok] of entries) {
    if (!tok.$value) continue;
    const v = tok.$value;
    const base = sz ? `--lb-t-${grp}-${sz}` : `--lb-t-${grp}`;
    if (v.fontFamily)    lines.push(`  ${base}-font-family: ${renderValue(v.fontFamily, 'light')};`);
    if (v.fontSize)      lines.push(`  ${base}-font-size: ${renderValue(v.fontSize, 'light')};`);
    if (v.fontWeight)    lines.push(`  ${base}-font-weight: ${renderValue(v.fontWeight, 'light')};`);
    if (v.lineHeight)    lines.push(`  ${base}-line-height: ${renderValue(v.lineHeight, 'light')};`);
    if (v.letterSpacing) lines.push(`  ${base}-letter-spacing: ${renderValue(v.letterSpacing, 'light')};`);

    // Responsive modes — collect for later emission as media queries.
    // Schema: tok.$modes = { S: { fontSize: "{...}", ... }, M: {}, L: {} }
    // Empty {} means "inherit $value" — declared but no override. Plugin
    // sees the mode exists for variable-mode creation; CSS skips emission.
    if (tok.$modes && typeof tok.$modes === 'object') {
      for (const modeName of Object.keys(tok.$modes)) {
        const modeProps = tok.$modes[modeName];
        if (!modeProps || typeof modeProps !== 'object') continue;
        // Skip empty mode blocks at CSS emission time — they're declared
        // for plugin/Figma awareness but produce no CSS override.
        if (Object.keys(modeProps).length === 0) continue;
        if (!TYPO_MODES[modeName]) TYPO_MODES[modeName] = [];
        TYPO_MODES[modeName].push({ base, props: modeProps });
      }
    }
  }
}

// ── L2 Radius / Opacity / Animation / Shadow / Border-width / Component-size / Elevation ──
heading('L2 — Radius semantic');
for (const name of Object.keys(data.semantic.radius.radius)) {
  const tok = data.semantic.radius.radius[name];
  lines.push(`  ${pathToCssVar(`semantic.radius.radius.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L2 — Opacity semantic');
for (const name of Object.keys(data.semantic.opacity.opacity)) {
  const tok = data.semantic.opacity.opacity[name];
  lines.push(`  ${pathToCssVar(`semantic.opacity.opacity.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L2 — Animation semantic');
for (const grp of Object.keys(data.semantic.animation)) {
  const group = data.semantic.animation[grp];
  if (group.$value !== undefined) {
    lines.push(`  ${pathToCssVar(`semantic.animation.${grp}`, 'light')}: ${renderValue(group.$value, 'light')};`);
  } else if (typeof group === 'object') {
    for (const name of Object.keys(group)) {
      const tok = group[name];
      if (tok.$value !== undefined) {
        lines.push(`  ${pathToCssVar(`semantic.animation.${grp}.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
      }
    }
  }
}

heading('L2 — Border-width semantic');
for (const name of Object.keys(data.semantic['border-width']['border-width'])) {
  const tok = data.semantic['border-width']['border-width'][name];
  lines.push(`  ${pathToCssVar(`semantic.border-width.border-width.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L2 — Stroke semantic');
if (data.semantic.stroke && data.semantic.stroke.stroke) {
  for (const name of Object.keys(data.semantic.stroke.stroke)) {
    const tok = data.semantic.stroke.stroke[name];
    if (tok.$value !== undefined) {
      lines.push(`  ${pathToCssVar(`semantic.stroke.stroke.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
    }
  }
}

heading('L2 — Component-size semantic');
if (data.semantic['component-size']) {
  for (const name of Object.keys(data.semantic['component-size'])) {
    const tok = data.semantic['component-size'][name];
    if (tok.$value !== undefined) {
      lines.push(`  ${pathToCssVar(`semantic.component-size.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
    }
  }
}

heading('L2 — Elevation semantic');
if (data.semantic.elevation) {
  for (const name of Object.keys(data.semantic.elevation)) {
    const tok = data.semantic.elevation[name];
    if (tok.$value !== undefined) {
      lines.push(`  ${pathToCssVar(`semantic.elevation.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
    }
  }
}

heading('L2 — Shadow semantic');
for (const name of Object.keys(data.semantic.shadow.shadow)) {
  const tok = data.semantic.shadow.shadow[name];
  lines.push(`  ${pathToCssVar(`semantic.shadow.shadow.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

// ── L3 Component tokens (action / field / surface) ──
heading('L3 — Action');
for (const name of Object.keys(data.component.action)) {
  const tok = data.component.action[name];
  lines.push(`  ${pathToCssVar(`component.action.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L3 — Field');
for (const name of Object.keys(data.component.field)) {
  const tok = data.component.field[name];
  lines.push(`  ${pathToCssVar(`component.field.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

heading('L3 — Surface');
for (const name of Object.keys(data.component.surface)) {
  const tok = data.component.surface[name];
  lines.push(`  ${pathToCssVar(`component.surface.${name}`, 'light')}: ${renderValue(tok.$value, 'light')};`);
}

lines.push('}');

// ── Dark mode overrides ──
// Generate a block that overrides L2 semantic (fg/bg/border) for dark theme.
// Applied under both [data-theme="dark"] selector AND @media (prefers-color-scheme: dark) at :root level.
//
// SECTION-SCOPING FIX (Vatroslav finding V8, 2026-07-15):
// CSS custom properties substitute their var() references at the element
// they are DECLARED on. Alias tokens declared only in :root (e.g.
// --lb-surface-bg-default: var(--lb-bg-default), or the L3 action/field
// tokens that route through L2) therefore resolve against the LIGHT
// values at :root — and a section-scoped [data-theme="dark"] subtree
// inherits that already-resolved light value even though it re-declares
// the underlying L2 token. Net effect: per-section dark zones got light
// component surfaces (light-on-light).
//
// Fix: compute every :root declaration whose var() dependency chain
// touches a dark-overridden token (transitively), and RE-DECLARE those
// aliases (same var() value) inside both dark blocks. Re-declaring makes
// the browser re-substitute the reference at the dark-scoped element,
// where the L2 overrides are in effect. Root-level dark is unaffected
// (same computed values); section-scoped dark now resolves correctly.

// 1. Collect all :root declarations (the first block in `lines`).
const rootDecls = new Map(); // cssVarName -> value
for (const line of lines) {
  if (line === '}') break; // end of :root block
  const m = line.match(/^\s*(--lb-[a-z0-9-]+):\s*(.+);$/i);
  if (m) rootDecls.set(m[1], m[2]);
}

// 2. The set of vars the dark blocks override directly.
const darkSet = new Set();
for (const grp of COLOR_L2_GROUPS) {
  if (!data.semantic.dark[grp]) continue;
  for (const name of Object.keys(data.semantic.dark[grp])) {
    darkSet.add(pathToCssVar(`semantic.light.${grp}.${name}`, 'dark'));
  }
}

// 3. Transitive closure: aliases affected by dark overrides.
function varRefsIn(value) {
  const out = [];
  const re = /var\(\s*(--lb-[a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(value)) !== null) out.push(m[1]);
  return out;
}
const affected = new Set();
let changed = true;
while (changed) {
  changed = false;
  for (const [name, value] of rootDecls) {
    if (darkSet.has(name) || affected.has(name)) continue;
    const deps = varRefsIn(value);
    if (deps.some(d => darkSet.has(d) || affected.has(d))) {
      affected.add(name);
      changed = true;
    }
  }
}
// Preserve :root declaration order for readable output.
const affectedAliases = [...rootDecls.keys()].filter(n => affected.has(n));
console.log(`  ✓ dark blocks re-declare ${affectedAliases.length} dependent aliases (section-scoped dark fix)`);

function emitDarkBlock(selector, indent = '') {
  lines.push('');
  lines.push(`${indent}${selector} {`);
  for (const grp of COLOR_L2_GROUPS) {
    if (!data.semantic.dark[grp]) continue;
    for (const name of Object.keys(data.semantic.dark[grp])) {
      const tok = data.semantic.dark[grp][name];
      lines.push(`${indent}  ${pathToCssVar(`semantic.light.${grp}.${name}`, 'dark')}: ${renderValue(tok.$value, 'dark')};`);
    }
  }
  if (affectedAliases.length > 0) {
    lines.push('');
    lines.push(`${indent}  /* Re-declared aliases — force re-substitution against the dark L2`);
    lines.push(`${indent}     values above so SECTION-SCOPED dark theming works (not just :root).`);
    lines.push(`${indent}     Same var() references as :root; no new tokens. */`);
    for (const name of affectedAliases) {
      lines.push(`${indent}  ${name}: ${rootDecls.get(name)};`);
    }
  }
  lines.push(`${indent}}`);
}

lines.push('');
lines.push('/* ─── Dark mode: manual override via data-theme attribute ─── */');
emitDarkBlock('[data-theme="dark"]');

lines.push('');
lines.push('/* ─── Dark mode: automatic via OS preference (when no data-theme set) ─── */');
lines.push('@media (prefers-color-scheme: dark) {');
emitDarkBlock(':root:not([data-theme="light"])', '  ');
lines.push('}');
lines.push('');

// ─── Responsive typography: emit collected $modes as media queries ──
// Mode → breakpoint map. Only known modes are emitted; unknown are skipped
// with a warning so a future named mode would be opt-in.
//
// Naming convention: S/M/L matches the rest of the design system T-shirt
// vocabulary (size, radius, icon all use s/m/l). S is the small/mobile
// viewport, M is tablet, L is desktop. Plugin (letbe-tokens-figma) reads
// these mode names directly and creates Figma variable modes from them.
//
// Backwards compat: the legacy "mobile" mode is still accepted (alias of S)
// for any tokens that haven't been migrated yet. Logged with a warning so
// the migration shows up in build output.
const MODE_BREAKPOINTS = {
  S:      '(max-width: 600px)',
  M:      '(min-width: 601px) and (max-width: 1023px)',
  L:      '(min-width: 1024px)',
  mobile: '(max-width: 600px)',
};

for (const modeName of Object.keys(TYPO_MODES)) {
  const mq = MODE_BREAKPOINTS[modeName];
  if (!mq) {
    console.warn(`  ⚠ Unknown typography mode "${modeName}" — no breakpoint mapping; skipped.`);
    continue;
  }
  if (modeName === 'mobile') {
    console.warn(`  ⚠ Typography mode "mobile" is deprecated — use "S" instead.`);
  }
  const entries = TYPO_MODES[modeName];
  if (entries.length === 0) continue;

  lines.push(`/* ─── Responsive typography: ${modeName} (${mq}) ─── */`);
  lines.push(`@media ${mq} {`);
  // Gated by html:not([data-typo-preview]) so a force-mode preview
  // (set by the Theme editor's Viewport switcher) blocks the natural
  // @media cascade. Without the gate, clicking Force-L at a real S
  // viewport would still apply S's display/heading shrinks because
  // this @media is matching the real width.
  lines.push('  html:not([data-typo-preview]) {');
  for (const { base, props } of entries) {
    if (props.fontFamily)    lines.push(`    ${base}-font-family: ${renderValue(props.fontFamily, 'light')};`);
    if (props.fontSize)      lines.push(`    ${base}-font-size: ${renderValue(props.fontSize, 'light')};`);
    if (props.fontWeight)    lines.push(`    ${base}-font-weight: ${renderValue(props.fontWeight, 'light')};`);
    if (props.lineHeight)    lines.push(`    ${base}-line-height: ${renderValue(props.lineHeight, 'light')};`);
    if (props.letterSpacing) lines.push(`    ${base}-letter-spacing: ${renderValue(props.letterSpacing, 'light')};`);
  }
  lines.push('  }');
  lines.push('}');
  lines.push('');
}

// ─── Write ─────────────────────────────────────────────────

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

// Summary report
const n = {
  colorPrimitives: 0,
  sizePrimitives: Object.keys(data.primitives.size).length,
  fontPrimitives:
    Object.keys(data.primitives.font.family).length +
    Object.keys(data.primitives.font.size).length +
    Object.keys(data.primitives.font.weight).length +
    Object.keys(data.primitives.font['line-height']).length +
    Object.keys(data.primitives.font['letter-spacing']).length,
  fgLight: Object.keys(data.semantic.light.fg).length,
  bgLight: Object.keys(data.semantic.light.bg).length,
  borderLight: Object.keys(data.semantic.light.border).length,
  action: Object.keys(data.component.action).length,
  field: Object.keys(data.component.field).length,
  surface: Object.keys(data.component.surface).length,
};
for (const palette of ['neutral', 'red', 'green', 'yellow', 'blue', 'violet']) {
  n.colorPrimitives += Object.keys(data.primitives[palette]).length;
}

console.log('✓ Built tokens/theme.css');
console.log(`  Color primitives: ${n.colorPrimitives}`);
console.log(`  Size primitives:  ${n.sizePrimitives}`);
console.log(`  Font primitives:  ${n.fontPrimitives}`);
console.log(`  L2 light fg/bg/border: ${n.fgLight}/${n.bgLight}/${n.borderLight}`);
console.log(`  L3 action/field/surface: ${n.action}/${n.field}/${n.surface}`);
console.log(`  Output lines: ${lines.length}`);
