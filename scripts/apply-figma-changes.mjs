#!/usr/bin/env node
/**
 * apply-figma-changes.mjs — bring Figma edits back into a theme, as mapping.
 *
 *   pbpaste | node scripts/apply-figma-changes.mjs themes/pancake
 *   node scripts/apply-figma-changes.mjs themes/pancake changes.json
 *   … --dry-run                                  show what would change
 *
 * Input: the changes Syrup copies with "Update GitHub" ({ source, exportedAt,
 * changes: [{ collection, name, mode, value }] }). Each change names a Figma
 * variable in the letbe collections; this finds the token path it came from and
 * writes it into <theme>/map.json under "set", with "edited in Figma" as the
 * reason. map.json stays the theme's only source: source-tokens.json, theme.css
 * and DIFF.md are then rebuilt by import-theme.mjs.
 *
 * Name rules are the reverse of Syrup's letbe profile (widget-src/profiles/letbe.ts
 * in the Syrup repo); keep the two in step.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const [dir, file] = args.filter((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: pbpaste | node scripts/apply-figma-changes.mjs <theme-dir> [changes.json] [--dry-run]');
  process.exit(1);
}
const themeDir = resolve(dir);
const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
let input;
try {
  input = JSON.parse(raw);
} catch {
  console.error(`This isn't the changes from Syrup (it starts with: ${JSON.stringify(raw.trim().slice(0, 40))}).`);
  console.error('In Figma: Sync panel → Update GitHub → Copy changes. Then run this again.');
  process.exit(1);
}
const changes = Array.isArray(input) ? input : input.changes;
if (!Array.isArray(changes)) throw new Error('Expected the JSON from Syrup "Update GitHub" ({ changes: [...] }).');
const themeName = dir.replace(/\/$/, '').split('/').pop();
if (input.source && !input.source.includes(`/themes/${themeName}/`)) {
  console.warn(`⚠️  These changes came from ${input.source}, not from themes/${themeName}. Check the theme folder.`);
}

const mapPath = join(themeDir, 'map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
// Paths are looked up in the base system: a theme has exactly the same token paths.
const base = JSON.parse(readFileSync(join(ROOT, 'tokens', 'source-tokens.json'), 'utf8'));
const theme = JSON.parse(readFileSync(join(themeDir, 'source-tokens.json'), 'utf8'));

// ─── forward rules (same as the profile), then reversed ──────────────────
const isToken = (n) => n && typeof n === 'object' && '$value' in n;
function* tokens(node, path = []) {
  if (isToken(node)) return yield [path, node];
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) yield* tokens(v, [...path, k]);
}
function place(path) {
  const [tier, ...rest] = path;
  if (tier === 'primitives') return { collection: 'letbe/Core', name: rest.join('/'), modes: ['Default'] };
  if (tier === 'component') {
    const [group, key] = rest;
    const [role, ...tail] = key.split('-');
    return { collection: 'letbe/Component', name: [group, role, tail.join('-')].filter(Boolean).join('/'), modes: ['Default'] };
  }
  if (tier === 'semantic') {
    if (rest[0] === 'light' || rest[0] === 'dark') return { collection: 'letbe/Semantic', name: rest.slice(1).join('/'), modes: [rest[0] === 'light' ? 'Light' : 'Dark'] };
    if (rest[0] === 'typography' && rest[1] === 'text') return null; // text styles: see below
    if (rest[0] === 'shadow' || rest[0] === 'animation') return null;
    let q = rest;
    if (q.length > 1 && q[0] === q[1]) q = q.slice(1);
    if (q[0] === 'component-size' && q[1] === 'component') q = q.slice(1);
    return { collection: 'letbe/Semantic', name: q.join('/'), modes: ['Light', 'Dark'] };
  }
  return null;
}
const pathOf = new Map(); // "collection::name::mode" → { path, type, shared }
const aliasOf = new Map(); // Figma variable name → letbe alias "{…}"
for (const [path, t] of tokens(base)) {
  const p = place(path);
  if (!p) continue;
  for (const mode of p.modes) pathOf.set(`${p.collection}::${p.name}::${mode}`, { path: path.join('.'), type: t.$type, shared: p.modes.length > 1 });
  // letbe aliases leave out the top group (and the light/dark segment).
  const short = path[0] === 'semantic' && (path[1] === 'light' || path[1] === 'dark') ? path.slice(2) : path.slice(1);
  if (!aliasOf.has(p.name)) aliasOf.set(p.name, `{${short.join('.')}}`);
}
const at = (obj, path) => path.split('.').reduce((n, k) => n?.[k], obj);

// ─── values back to letbe's format ────────────────────────────────────────
const hex2 = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
function toSource(value, { path, type }) {
  if (value && typeof value === 'object' && 'alias' in value) {
    const alias = aliasOf.get(value.alias);
    if (!alias) throw new Error(`alias target ${value.alias} is not a letbe token`);
    return alias;
  }
  if (value && typeof value === 'object' && 'color' in value) {
    const h = value.color.toLowerCase();
    return (value.alpha ?? 1) >= 1 ? h : h + hex2(value.alpha);
  }
  if (typeof value === 'number') {
    if (path.startsWith('primitives.opacity.')) return Math.round(value * 100) / 10000;
    if (type === 'dimension') return value === 0 ? '0' : `${Math.round(value * 1000) / 1000}px`;
    if (type === 'duration') return `${value}ms`;
    return value;
  }
  return value;
}

// ─── apply ────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const applied = [];
const skipped = [];
const pending = new Map(); // path → { value, modes }
for (const c of changes) {
  const label = `${c.collection} · ${c.name}${c.mode && !['Default'].includes(c.mode) ? ` (${c.mode})` : ''}`;
  if (c.collection === 'letbe/Typography') {
    skipped.push(`${label}: text styles are edited in code (the type scale drives them)`);
    continue;
  }
  const hit = pathOf.get(`${c.collection}::${c.name}::${c.mode}`);
  if (!hit) {
    skipped.push(`${label}: no letbe token has this name`);
    continue;
  }
  let value;
  try {
    value = toSource(c.value, hit);
  } catch (err) {
    skipped.push(`${label}: ${err.message}`);
    continue;
  }
  const prev = pending.get(hit.path);
  if (prev && JSON.stringify(prev.value) !== JSON.stringify(value)) {
    // A token with one value in code, edited differently in Light and Dark.
    skipped.push(`${label}: ${hit.path} has one value for both modes in code, and Figma has two different ones`);
    pending.delete(hit.path);
    continue;
  }
  pending.set(hit.path, { value, modes: [...(prev?.modes ?? []), c.mode], shared: hit.shared });
}
map.set = map.set ?? {};
for (const [path, { value, modes, shared }] of pending) {
  const current = at(theme, path)?.$value;
  if (JSON.stringify(current) === JSON.stringify(value)) {
    skipped.push(`${path}: already ${JSON.stringify(value)}`);
    continue;
  }
  // Keep the earlier reason: the history of a decision is part of the mapping.
  const before = map.set[path]?.why;
  const why = `edited in Figma ${today}${shared ? ' (one value for both modes)' : ''}${before ? ` · before: ${before}` : ''}`;
  map.set[path] = { value, why };
  applied.push(`${path}: ${JSON.stringify(current)} → ${JSON.stringify(value)}${shared && modes.length === 1 ? `  (edited in ${modes[0]}, applies to both modes)` : ''}`);
}

console.log(`${DRY ? 'Would write' : 'Wrote'} ${applied.length} change(s) to ${join(dir, 'map.json')}:`);
for (const a of applied) console.log(`  ${a}`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  ${s}`);
}
if (DRY || !applied.length) process.exit(0);

writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
console.log('\nRebuilding the theme…');
execFileSync(process.execPath, [join(ROOT, 'scripts', 'import-theme.mjs'), dir], { stdio: 'inherit' });
console.log('\nNext: review DIFF.md, then commit map.json and the rebuilt files.');
