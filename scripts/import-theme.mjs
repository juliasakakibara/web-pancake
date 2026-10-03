#!/usr/bin/env node
/**
 * import-theme.mjs — turn a brand's tokens into a Pancake 2 theme, and say how.
 *
 *   node scripts/import-theme.mjs <theme-dir>
 *
 * <theme-dir>/map.json says how the brand fills the system: neutral anchors,
 * accent mode, shadows, and a "set" table of token → value with a reason. The script:
 *   1. reads the base system (tokens/source-tokens.json) and the brand's DTCG
 *      tokens.json (Refero Styles exports this format),
 *   2. builds the neutral ramp from the brand's anchors (missing steps are
 *      interpolated in OKLab), applies the accent mode and every "set" entry,
 *   3. writes <theme-dir>/source-tokens.json, the same shape as the base, so the
 *      build and Syrup read it unchanged,
 *   4. builds <theme-dir>/theme.css with the base system's own build script,
 *   5. writes <theme-dir>/DIFF.md: every token that changed and where its value
 *      came from (brand, generated, mapped), contrast warnings, and what the
 *      brand did not provide.
 *
 * Accessibility is a warning, never a blocker: the theme is always written.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/import-theme.mjs <theme-dir>   (the folder holding map.json)');
  process.exit(1);
}
const themeDir = resolve(dir);
const map = JSON.parse(readFileSync(join(themeDir, 'map.json'), 'utf8'));
const base = JSON.parse(readFileSync(join(ROOT, 'tokens', 'source-tokens.json'), 'utf8'));
const brand = JSON.parse(readFileSync(resolve(themeDir, map.source), 'utf8'));
const out = structuredClone(base);

// ─── paths and values ──────────────────────────────────────────────────────
const at = (obj, path) => path.reduce((n, k) => n?.[k], obj);
const isToken = (n) => n && typeof n === 'object' && '$value' in n;
function* tokens(node, path = []) {
  if (isToken(node)) return yield [path, node];
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) yield* tokens(v, [...path, k]);
}
const split = (p) => p.split('.');
const brandValue = (ref) => {
  const t = at(brand, split(ref));
  if (!isToken(t)) throw new Error(`map.json points at "${ref}", which is not a token in ${map.source}`);
  used.add(ref);
  return t.$value;
};
const used = new Set();
const origin = new Map(); // "a.b.c" → { kind, why }

/** "@color.x" = a brand token, anything else is taken as written ("{neutral.950}", "0px", 300). */
function setToken(path, raw, kind, why) {
  const t = at(out, split(path));
  if (!isToken(t)) throw new Error(`"${path}" is not a token in the base system`);
  t.$value = typeof raw === 'string' && raw.startsWith('@') ? brandValue(raw.slice(1)) : raw;
  origin.set(path, { kind: typeof raw === 'string' && raw.startsWith('@') ? 'brand' : kind, why });
}

// letbe aliases leave out the top group: {neutral.50}, {bg.default}, {radius.0}.
function resolveAlias(value, mode, depth = 0) {
  if (typeof value !== 'string' || !/^\{.+\}$/.test(value) || depth > 10) return value;
  const p = split(value.slice(1, -1));
  const tries = [['primitives', ...p], ['semantic', mode, ...p], ['semantic', ...p], ['semantic', p[0], ...p], ['component', ...p]];
  for (const t of tries) {
    const node = at(out, t);
    if (isToken(node)) return resolveAlias(node.$value, mode, depth + 1);
  }
  return value;
}

// ─── colour maths: OKLab for ramps, WCAG for contrast ─────────────────────
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]) {
  [r, g, b] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0')).join('');
}
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ─── 1. ramps ─────────────────────────────────────────────────────────────
/** Fill primitives.<palette> from brand anchors; steps between anchors are interpolated in OKLab. */
function buildRamp(palette, anchorMap) {
  const steps = Object.keys(base.primitives[palette]).filter((k) => !k.startsWith('$'));
  const anchors = Object.entries(anchorMap)
    .map(([step, ref]) => ({ i: steps.indexOf(step), step, ref: ref.replace(/^@/, '') }))
    .map((a) => ({ ...a, lab: rgbToOklab(hexToRgb(brandValue(a.ref))) }))
    .sort((a, b) => a.i - b.i);
  if (anchors.some((a) => a.i < 0)) throw new Error(`${palette} steps must be among ${steps.join(', ')}`);
  steps.forEach((step, i) => {
    const exact = anchors.find((a) => a.i === i);
    if (exact) return setToken(`primitives.${palette}.${step}`, `@${exact.ref}`, 'brand', 'anchor');
    const lo = [...anchors].reverse().find((a) => a.i < i);
    const hi = anchors.find((a) => a.i > i);
    // Outside the anchors: keep the base step (nothing to interpolate towards).
    if (!lo || !hi) return;
    const t = (i - lo.i) / (hi.i - lo.i);
    setToken(`primitives.${palette}.${step}`, oklabToHex(lo.lab.map((v, k) => v + (hi.lab[k] - v) * t)), 'generated', `between ${lo.step} and ${hi.step}`);
  });
}
if (map.neutral) buildRamp('neutral', map.neutral);

// ─── 2. accent ────────────────────────────────────────────────────────────
// "monochrome": the first accent follows the neutrals. accent-2 / accent-3 are left alone.
if (map.accent === 'monochrome') {
  const mono = {
    light: { accent: 950, 'accent-strong': 800, 'accent-bolder': 700, 'accent-subtle': 100, 'accent-muted': 200, 'accent-value': 950 },
    dark: { accent: 50, 'accent-strong': 100, 'accent-bolder': 200, 'accent-subtle': 900, 'accent-muted': 800, 'accent-value': 50 },
  };
  // Primary button labels use fg.inverse-strong, which stays light in dark mode. With a
  // light accent in dark mode they must flip: point only the primary labels at fg.inverse.
  for (const state of ['default', 'hover', 'pressed']) {
    setToken(`component.action.fg-primary-${state}`, '{fg.inverse}', 'mapped', 'label follows the monochrome accent in both modes');
  }
  for (const mode of ['light', 'dark']) {
    for (const [path] of tokens(base.semantic[mode], ['semantic', mode])) {
      const role = path.at(-1);
      if (!/^accent(-|$)/.test(role) || /^accent-[23]/.test(role)) continue;
      const step = mono[mode][role] ?? mono[mode].accent;
      setToken(path.join('.'), `{neutral.${step}}`, 'mapped', 'monochrome accent');
    }
  }
}
// { "palette": "blue", "steps": { "600": "color.brand.blue.600", … } }: the accent roles
// (accent-2 / accent-3 included: they mirror the primary until a brand fills them) move from
// the base accent hue to <palette>, and <palette> is rebuilt from the brand's ramp.
if (map.accent && typeof map.accent === 'object') {
  const { palette, steps, from = 'violet' } = map.accent;
  if (steps) buildRamp(palette, steps);
  for (const mode of ['light', 'dark']) {
    for (const [path, t] of tokens(base.semantic[mode], ['semantic', mode])) {
      if (!/^accent/.test(path.at(-1)) || typeof t.$value !== 'string' || !t.$value.startsWith(`{${from}.`)) continue;
      setToken(path.join('.'), t.$value.replace(`{${from}.`, `{${palette}.`), 'mapped', `accent hue: ${from} → ${palette}`);
    }
  }
}

// ─── 3. explicit mapping ──────────────────────────────────────────────────
for (const [path, entry] of Object.entries(map.set ?? {})) {
  const { value, why } = typeof entry === 'object' && entry !== null && 'value' in entry ? entry : { value: entry, why: '' };
  setToken(path, value, 'mapped', why);
}
if (map.shadows === 'none') {
  for (const [path, t] of tokens(out.primitives.shadow, ['primitives', 'shadow'])) {
    if (path.at(-1) === 'focus') continue; // the focus ring stays: it is how keyboard users see where they are
    // Zero size as well as zero opacity: the base build reads opacity 0 as 1.
    t.$value = { ...t.$value, x: '0', y: '0', blur: '0', spread: '0', opacity: 0 };
    origin.set(path.join('.'), { kind: 'mapped', why: 'brand uses no shadows (focus ring kept)' });
  }
}

// ─── 4. contrast (warnings only) ──────────────────────────────────────────
const PAIRS = [
  ['fg.default', 'bg.default', 4.5, 'body text'],
  ['fg.muted', 'bg.default', 4.5, 'secondary text'],
  ['fg.subtle', 'bg.default', 4.5, 'subtle text'],
  ['fg.default', 'bg.strong', 4.5, 'text on raised surfaces'],
  ['fg.inverse', 'bg.inverse', 4.5, 'text on inverted bands'],
  ['fg.accent', 'bg.default', 4.5, 'accent text and links'],
  ['action.fg-primary-default', 'bg.accent', 4.5, 'text on primary buttons'],
  ['action.fg-danger-default', 'bg.danger', 4.5, 'text on danger buttons'],
  ['fg.accent', 'bg.strong', 4.5, 'links on raised surfaces'],
  ['border.strong', 'bg.default', 3, 'control borders'],
  ['border.focus', 'bg.default', 3, 'focus ring'],
];
const warnings = [];
const checks = [];
for (const mode of ['light', 'dark']) {
  for (const [fg, bg, min, label] of PAIRS) {
    const a = resolveAlias(`{${fg}}`, mode);
    const b = resolveAlias(`{${bg}}`, mode);
    if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) continue;
    const ratio = contrast(a, b);
    checks.push({ mode, fg, bg, ratio, min, label, a, b });
    if (ratio < min) warnings.push(`**${mode}** · ${label}: \`${fg}\` ${a} on \`${bg}\` ${b} = **${ratio.toFixed(2)}:1** (needs ${min}:1)`);
  }
}

// ─── 5. write the theme, build its CSS, write the diff ───────────────────
// Name the theme for tools that read it (Syrup shows it when a Figma file links here).
out.$extensions = { ...(out.$extensions ?? {}), 'pancake.theme': { name: map.name ?? 'Theme' } };
writeFileSync(join(themeDir, 'source-tokens.json'), JSON.stringify(out, null, 2) + '\n');
// The base build reads fixed paths, so run it on a scratch copy.
const tmp = mkdtempSync(join(tmpdir(), 'pancake-theme-'));
mkdirSync(join(tmp, 'scripts'));
mkdirSync(join(tmp, 'tokens'));
copyFileSync(join(ROOT, 'scripts', 'build-tokens.js'), join(tmp, 'scripts', 'build-tokens.js'));
copyFileSync(join(themeDir, 'source-tokens.json'), join(tmp, 'tokens', 'source-tokens.json'));
execFileSync(process.execPath, [join(tmp, 'scripts', 'build-tokens.js')], { stdio: 'ignore' });
copyFileSync(join(tmp, 'tokens', 'theme.css'), join(themeDir, 'theme.css'));
rmSync(tmp, { recursive: true, force: true });

const flat = (obj) => new Map([...tokens(obj)].map(([p, t]) => [p.join('.'), JSON.stringify(t.$value)]));
const before = flat(base);
const after = flat(out);
const changed = [...after].filter(([p, v]) => before.get(p) !== v);
const unused = [...tokens(brand)].map(([p]) => p.join('.')).filter((p) => !used.has(p));
const count = (kind) => changed.filter(([p]) => origin.get(p)?.kind === kind).length;
const short = (v) => (v.length > 48 ? v.slice(0, 45) + '…' : v);

const md = [
  `# ${map.name ?? 'Theme'} — import diff`,
  '',
  `Generated by \`scripts/import-theme.mjs\` from \`${map.source}\`${brand.$extensions?.['com.refero.extraction'] ? ` (Refero extraction of ${brand.$extensions['com.refero.extraction'].url}, ${brand.$extensions['com.refero.extraction'].extractedAt.slice(0, 10)})` : ''}. Base: ${[...before].length} tokens.`,
  '',
  `**${changed.length} tokens changed**: ${count('brand')} from the brand · ${count('generated')} generated · ${count('mapped')} mapped. Everything else keeps the base value.`,
  '',
  '## Contrast',
  '',
  warnings.length ? `⚠️ ${warnings.length} warning(s). The theme is written anyway; fix in map.json if the brand allows.\n\n${warnings.map((w) => `- ${w}`).join('\n')}` : '✅ All checked pairs pass.',
  '',
  '<details><summary>All checked pairs</summary>',
  '',
  '| Mode | Pair | Ratio | Needs |',
  '| --- | --- | --- | --- |',
  ...checks.map((c) => `| ${c.mode} | ${c.label} (\`${c.fg}\` on \`${c.bg}\`) | ${c.ratio.toFixed(2)} ${c.ratio < c.min ? '⚠️' : '✅'} | ${c.min} |`),
  '',
  '</details>',
  '',
  '## What changed',
  '',
  '| Token | Base | Theme | From | Why |',
  '| --- | --- | --- | --- | --- |',
  ...changed.map(([p, v]) => {
    const o = origin.get(p) ?? { kind: '?', why: '' };
    return `| \`${p}\` | \`${short(before.get(p))}\` | \`${short(v)}\` | ${o.kind} | ${o.why ?? ''} |`;
  }),
  '',
  '## Not used from the brand',
  '',
  unused.length ? unused.map((p) => `- \`${p}\``).join('\n') : 'Everything was used.',
  '',
  ...(map.notes?.length ? ['## Notes', '', ...map.notes.map((n) => `- ${n}`), ''] : []),
].join('\n');
writeFileSync(join(themeDir, 'DIFF.md'), md);

console.log(`${map.name}: ${changed.length} tokens changed (${count('brand')} brand, ${count('generated')} generated, ${count('mapped')} mapped).`);
console.log(warnings.length ? `⚠️  ${warnings.length} contrast warning(s), see DIFF.md` : '✅ contrast: all checked pairs pass');
console.log(`Unused brand tokens: ${unused.length}. Wrote source-tokens.json, theme.css and DIFF.md in ${dir}`);
