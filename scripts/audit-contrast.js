#!/usr/bin/env node
/**
 * audit-contrast.js — measure WCAG contrast for the shipped theme, both modes.
 *
 * Parses tokens/theme.css (the generated truth), resolves var() chains to flat
 * hexes, and measures a CURATED manifest of role pairings — every pair states
 * its purpose and threshold (4.5 text / 3.0 non-text UI), disabled states are
 * listed but WCAG-exempt (1.4.3), and non-flat values (color-mix) are reported
 * as unmeasurable rather than silently skipped.
 *
 * Output: tokens/CONTRAST.md (the public receipt) + console summary.
 * Exit code 1 if any required pair fails — safe for a release gate.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'tokens', 'theme.css'), 'utf8');

// ── Extract variable maps for light (:root) and dark ([data-theme="dark"]) ──
function blockVars(re) {
  const out = {};
  let m;
  const rx = new RegExp(re.source, 'g');
  while ((m = rx.exec(css))) {
    const body = m[1];
    for (const [, name, value] of body.matchAll(/--lb-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[name] = value.trim();
    }
  }
  return out;
}
const lightVars = blockVars(/:root\s*\{([\s\S]*?)\n\}/);
const darkVars = { ...lightVars, ...blockVars(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) };

function resolve(vars, name, depth = 0) {
  if (depth > 12) return { kind: 'cycle' };
  const raw = vars[name];
  if (raw == null) return { kind: 'missing' };
  const ref = raw.match(/^var\(--lb-([a-z0-9-]+)\)$/);
  if (ref) return resolve(vars, ref[1], depth + 1);
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return { kind: 'hex', hex: raw };
  if (/^#[0-9a-fA-F]{8}$/.test(raw)) return { kind: 'alpha', hex: raw.slice(0, 7), a: parseInt(raw.slice(7), 16) / 255 };
  if (raw === 'transparent') return { kind: 'transparent' };
  const rgba = raw.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/);
  if (rgba) {
    const hex = '#' + [rgba[1], rgba[2], rgba[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
    return rgba[4] != null && +rgba[4] < 1 ? { kind: 'alpha', hex, a: +rgba[4] } : { kind: 'hex', hex };
  }
  return { kind: 'computed', raw };
}

// ── WCAG math ──
const chan = (h, i) => parseInt(h.slice(i, i + 2), 16) / 255;
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lum = (h) => 0.2126 * lin(chan(h, 1)) + 0.7152 * lin(chan(h, 3)) + 0.0722 * lin(chan(h, 5));
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (top, a, bot) => {
  const mix = (i) => Math.round((chan(top, i) * a + chan(bot, i) * (1 - a)) * 255);
  return '#' + [1, 3, 5].map(i => mix(i).toString(16).padStart(2, '0')).join('');
};

// ── The manifest ──
// { fg, bg, over?, what, min, status? } — `over` composites a transparent/alpha
// bg onto a real surface first. status 'exempt' = WCAG 1.4.3 disabled
// exception; 'advisory' = no normative requirement, tracked anyway.
const T = 4.5, UI = 3.0;
const PAIRS = [
  // Body text on every surface it sits on
  { fg: 'fg-default', bg: 'bg-default', what: 'body text', min: T },
  { fg: 'fg-default', bg: 'surface-bg-default', what: 'body text on card', min: T },
  { fg: 'fg-default', bg: 'surface-bg-elevated', what: 'body text on elevated surface', min: T },
  { fg: 'fg-default', bg: 'bg-strong', what: 'text on tinted fill (code chip)', min: T },
  { fg: 'fg-muted', bg: 'bg-default', what: 'muted text', min: T },
  { fg: 'fg-muted', bg: 'surface-bg-default', what: 'muted text on card', min: T },
  { fg: 'fg-muted', bg: 'surface-bg-elevated', what: 'muted text on elevated surface', min: T },
  { fg: 'fg-subtle', bg: 'bg-default', what: 'subtle text (captions, counts)', min: T },
  { fg: 'fg-inverse', bg: 'bg-inverse', what: 'inverse text on inverse surface', min: T },
  { fg: 'fg-default', bg: 'surface-bg-elevated', what: 'neutral toast text + action chip on its pill', min: T },

  // Accent as text + selection surfaces
  { fg: 'fg-accent', bg: 'bg-default', what: 'links / accent text', min: T },
  { fg: 'fg-accent', bg: 'bg-accent-subtle', what: 'accent text on faint wash', min: T },
  { fg: 'fg-accent', bg: 'bg-accent-muted', what: 'selected-state text (chips, nav)', min: T },
  { fg: 'fg-accent-muted', bg: 'bg-default', what: 'muted accent text', min: T },

  // Second/third accent slots — dormant mirrors of accent, so these pairs
  // hold by construction until a slot is filled; after a fill the theme
  // editor re-measures live (same engine as the brand knob).
  { fg: 'fg-accent-2', bg: 'bg-default', what: 'accent-2 text', min: T },
  { fg: 'fg-accent-2', bg: 'bg-accent-2-subtle', what: 'accent-2 text on its wash', min: T },
  { fg: 'action-fg-accent-2-default', bg: 'action-bg-accent-2-default', what: 'accent-2 button', min: T },
  { fg: 'action-fg-accent-2-hover', bg: 'action-bg-accent-2-hover', what: 'accent-2 button hover', min: T },
  { fg: 'action-fg-accent-2-pressed', bg: 'action-bg-accent-2-pressed', what: 'accent-2 button pressed', min: T },
  { fg: 'bg-accent-2-value', bg: 'bg-bolder', what: 'accent-2 value fill vs track', min: UI },
  { fg: 'bg-accent-2', bg: 'bg-default', what: 'accent-2 fill vs page', min: UI, status: 'advisory' },
  { fg: 'fg-accent-3', bg: 'bg-default', what: 'accent-3 text', min: T },
  { fg: 'fg-accent-3', bg: 'bg-accent-3-subtle', what: 'accent-3 text on its wash', min: T },
  { fg: 'action-fg-accent-3-default', bg: 'action-bg-accent-3-default', what: 'accent-3 button', min: T },
  { fg: 'action-fg-accent-3-hover', bg: 'action-bg-accent-3-hover', what: 'accent-3 button hover', min: T },
  { fg: 'action-fg-accent-3-pressed', bg: 'action-bg-accent-3-pressed', what: 'accent-3 button pressed', min: T },
  { fg: 'bg-accent-3-value', bg: 'bg-bolder', what: 'accent-3 value fill vs track', min: UI },
  { fg: 'bg-accent-3', bg: 'bg-default', what: 'accent-3 fill vs page', min: UI, status: 'advisory' },

  // Status text — on the page and on its own tint (banner/badge pattern)
  { fg: 'fg-danger', bg: 'bg-default', what: 'danger text', min: T },
  { fg: 'fg-danger', bg: 'bg-danger-subtle', what: 'danger text on danger tint', min: T },
  { fg: 'fg-success', bg: 'bg-default', what: 'success text', min: T },
  { fg: 'fg-success', bg: 'bg-success-subtle', what: 'success text on success tint', min: T },
  { fg: 'fg-warning', bg: 'bg-default', what: 'warning text', min: T },
  { fg: 'fg-warning', bg: 'bg-warning-subtle', what: 'warning text on warning tint', min: T },
  { fg: 'fg-info', bg: 'bg-default', what: 'info text', min: T },
  { fg: 'fg-info', bg: 'bg-info-subtle', what: 'info text on info tint', min: T },
  { fg: 'fg-inverse-strong', bg: 'bg-danger', what: 'text on solid danger fill', min: T },

  // Actions — every variant, every non-disabled state
  { fg: 'action-fg-primary-default', bg: 'action-bg-primary-default', what: 'primary button', min: T },
  { fg: 'action-fg-primary-hover', bg: 'action-bg-primary-hover', what: 'primary button hover', min: T },
  { fg: 'action-fg-primary-pressed', bg: 'action-bg-primary-pressed', what: 'primary button pressed', min: T },
  { fg: 'action-fg-secondary-default', bg: 'action-bg-secondary-default', over: 'bg-default', what: 'secondary button', min: T },
  { fg: 'action-fg-secondary-hover', bg: 'action-bg-secondary-hover', over: 'bg-default', what: 'secondary button hover', min: T },
  { fg: 'action-fg-secondary-pressed', bg: 'action-bg-secondary-pressed', over: 'bg-default', what: 'secondary button pressed', min: T },
  { fg: 'action-fg-ghost-default', bg: 'action-bg-ghost-default', over: 'bg-default', what: 'ghost button', min: T },
  { fg: 'action-fg-ghost-hover', bg: 'action-bg-ghost-hover', over: 'bg-default', what: 'ghost button hover', min: T },
  { fg: 'action-fg-ghost-pressed', bg: 'action-bg-ghost-pressed', over: 'bg-default', what: 'ghost button pressed', min: T },
  { fg: 'action-fg-danger-default', bg: 'action-bg-danger-default', what: 'danger button', min: T },
  { fg: 'action-fg-danger-hover', bg: 'action-bg-danger-hover', what: 'danger button hover', min: T },
  { fg: 'action-fg-danger-pressed', bg: 'action-bg-danger-pressed', what: 'danger button pressed', min: T },
  { fg: 'action-fg-link-default', bg: 'bg-default', what: 'link action', min: T },
  { fg: 'action-fg-link-hover', bg: 'bg-default', what: 'link action hover', min: T },
  { fg: 'action-fg-selected', bg: 'action-bg-selected', over: 'bg-default', what: 'selected action (chip, segment)', min: T },

  // Fields
  { fg: 'field-fg-default', bg: 'field-bg-default', what: 'field input text', min: T },
  { fg: 'field-fg-default', bg: 'field-bg-hover', what: 'field input text on hover', min: T },
  { fg: 'field-fg-placeholder', bg: 'field-bg-default', what: 'placeholder text', min: T },
  { fg: 'field-fg-label', bg: 'bg-default', what: 'field label', min: T },
  { fg: 'field-fg-hint', bg: 'bg-default', what: 'field hint', min: T },
  { fg: 'field-fg-error', bg: 'bg-default', what: 'field error text', min: T },

  // Focus + functional boundaries (non-text, 3:1)
  { fg: 'border-focus', bg: 'bg-default', what: 'focus ring on page', min: UI },
  { fg: 'border-focus', bg: 'surface-bg-default', what: 'focus ring on card', min: UI },
  { fg: 'field-border-focus', bg: 'bg-default', what: 'field focus border', min: UI },
  { fg: 'field-border-default', bg: 'bg-default', what: 'field boundary', min: UI },
  { fg: 'field-border-error', bg: 'bg-default', what: 'field error border', min: UI },
  { fg: 'action-border-secondary-default', bg: 'bg-default', what: 'secondary button outline', min: UI },
  { fg: 'action-bg-primary-default', bg: 'bg-default', what: 'primary fill vs page (labeled control — shape only)', min: UI, status: 'advisory' },
  { fg: 'bg-accent-value', bg: 'border-muted', what: 'value fill vs slider track', min: UI },
  { fg: 'bg-accent-value', bg: 'bg-bolder', what: 'value fill vs progress track', min: UI },
  { fg: 'bg-success-value', bg: 'bg-bolder', what: 'success progress fill vs track', min: UI },
  { fg: 'bg-warning-value', bg: 'bg-bolder', what: 'warning progress fill vs track', min: UI },
  { fg: 'bg-danger-value', bg: 'bg-bolder', what: 'danger progress fill vs track', min: UI },
  { fg: 'fg-inverse-strong', bg: 'bg-danger', what: 'now-pill text on danger fill', min: T },
  { fg: 'bg-accent', bg: 'bg-default', what: 'accent fill vs page', min: UI, status: 'advisory' },

  // Disabled — listed for honesty, exempt under WCAG 1.4.3
  { fg: 'action-fg-primary-disabled', bg: 'action-bg-primary-disabled', what: 'disabled primary button', min: T, status: 'exempt' },
  { fg: 'field-fg-disabled', bg: 'field-bg-disabled', what: 'disabled field', min: T, status: 'exempt' },
  { fg: 'fg-disabled', bg: 'bg-default', what: 'disabled text', min: T, status: 'exempt' },

  // Advisory — no normative requirement, tracked so drift is visible
  { fg: 'border-default', bg: 'bg-default', what: 'decorative separators', min: UI, status: 'advisory' },
  { fg: 'data-1', bg: 'surface-bg-default', what: 'chart series 1 vs card', min: UI, status: 'advisory' },
  { fg: 'data-2', bg: 'surface-bg-default', what: 'chart series 2 vs card', min: UI, status: 'advisory' },
];

function evaluate(vars, themeName) {
  const rows = [];
  for (const p of PAIRS) {
    const fg = resolve(vars, p.fg);
    let bg = resolve(vars, p.bg);
    let note = '';
    if ((bg.kind === 'transparent' || bg.kind === 'alpha') && p.over) {
      const base = resolve(vars, p.over);
      if (base.kind === 'hex') {
        bg = bg.kind === 'transparent' ? base : { kind: 'hex', hex: over(bg.hex, bg.a, base.hex) };
        note = `over ${p.over}`;
      }
    }
    if (fg.kind !== 'hex' || bg.kind !== 'hex') {
      rows.push({ ...p, ratio: null, pass: null, note: `unmeasurable (${fg.kind}/${bg.kind})` });
      continue;
    }
    const r = Math.round(ratio(fg.hex, bg.hex) * 100) / 100;
    rows.push({ ...p, fgHex: fg.hex, bgHex: bg.hex, ratio: r, pass: r >= p.min, note });
  }
  return rows;
}

const results = { light: evaluate(lightVars, 'light'), dark: evaluate(darkVars, 'dark') };

// ── Report ──
const lines = ['# letbe-ds — measured contrast (generated by scripts/audit-contrast.js)', '',
  'Every meaningful token pairing in the shipped theme, measured per WCAG 2.x',
  '(4.5:1 normal text, 3:1 non-text UI). Disabled pairs are listed and marked',
  'exempt (WCAG 1.4.3 exception); advisory rows have no normative requirement',
  'but are tracked so drift stays visible. Regenerate after any token change.', ''];
let failures = 0;
for (const [theme, rows] of Object.entries(results)) {
  lines.push(`## ${theme[0].toUpperCase() + theme.slice(1)} theme`, '',
    '| status | pair | purpose | ratio | min |', '|---|---|---|---|---|');
  for (const r of rows) {
    let status;
    if (r.ratio == null) status = '≈';
    else if (r.status === 'exempt') status = 'exempt';
    else if (r.status === 'advisory') status = r.pass ? 'adv ✓' : 'adv ✗';
    else if (r.pass) status = '✓';
    else { status = '✗ FAIL'; failures++; }
    const pair = `\`${r.fg}\` on \`${r.bg}\`${r.note && !r.note.startsWith('unmeasurable') ? ` (${r.note})` : ''}`;
    lines.push(`| ${status} | ${pair} | ${r.what} | ${r.ratio ?? r.note} | ${r.min} |`);
  }
  lines.push('');
}
fs.writeFileSync(path.join(ROOT, 'tokens', 'CONTRAST.md'), lines.join('\n'));

for (const [theme, rows] of Object.entries(results)) {
  for (const r of rows) {
    if (r.pass === false && !r.status) console.log(`FAIL [${theme}] ${r.fg} on ${r.bg} (${r.what}): ${r.ratio} < ${r.min}  [${r.fgHex} / ${r.bgHex}]`);
    if (r.pass === false && r.status === 'advisory') console.log(`adv  [${theme}] ${r.fg} on ${r.bg} (${r.what}): ${r.ratio} < ${r.min}`);
    if (r.ratio == null) console.log(`??   [${theme}] ${r.fg} on ${r.bg}: ${r.note}`);
  }
}
// ── Sync $schema.wcag_pairs into source-tokens.json ─────────────
// The plugin's audit engine consumes this manifest so its badge counts
// equal CONTRAST.md by construction. Generated HERE, from the same PAIRS
// array that produced the numbers above — the two can never drift.
// Transform: CSS-var stems → slash token paths (L3 concepts split at the
// first dash; L2 splits after the group name). Mode-agnostic — the plugin
// resolves per mode.
function tokenPath(stem) {
  for (const l3 of ['action', 'field', 'surface']) {
    if (stem.startsWith(l3 + '-')) return l3 + '/' + stem.slice(l3.length + 1);
  }
  for (const grp of ['fg', 'bg', 'border', 'data', 'code']) {
    if (stem.startsWith(grp + '-')) return grp + '/' + stem.slice(grp.length + 1);
  }
  return stem;
}
const manifest = PAIRS.map((p) => {
  const e = { fg: tokenPath(p.fg), bg: tokenPath(p.bg) };
  if (p.over) e.over = tokenPath(p.over);
  e.what = p.what;
  e.min = p.min;
  if (p.status) e.status = p.status;
  return e;
});
const srcPath = path.join(ROOT, 'tokens', 'source-tokens.json');
let src = fs.readFileSync(srcPath, 'utf8');
const block = '"wcag_pairs": [\n'
  + manifest.map((e) => '      ' + JSON.stringify(e)).join(',\n')
  + '\n    ],';
if (src.includes('"wcag_pairs": [')) {
  // Replace the existing array block by bracket counting from its opener.
  const start = src.indexOf('"wcag_pairs": [');
  let i = src.indexOf('[', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (!depth) break; }
  }
  const end = src[i + 1] === ',' ? i + 2 : i + 1;
  src = src.slice(0, start) + block + src.slice(end);
} else {
  src = src.replace('    "editor_rows": [', '    ' + block + '\n    "editor_rows": [');
}
fs.writeFileSync(srcPath, src);
JSON.parse(fs.readFileSync(srcPath, 'utf8'));
console.log(`✓ $schema.wcag_pairs synced (${manifest.length} entries)`);

console.log(`\n${failures} required failures → tokens/CONTRAST.md written`);
process.exit(failures ? 1 : 0);
