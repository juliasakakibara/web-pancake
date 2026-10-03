#!/usr/bin/env node
/**
 * import-tokens.js — Import a fresh letbe plugin token export
 *
 * Usage:
 *   node scripts/import-tokens.js path/to/new-export.json
 *
 * What it does:
 *   1. Validates the incoming JSON has the required structure
 *   2. Backs up current tokens/source-tokens.json to tokens/source-tokens.bak.json
 *   3. Copies the new file into tokens/source-tokens.json
 *   4. Runs build-tokens.js to regenerate theme.css
 *   5. Reports what changed (added/removed tokens)
 *
 * The source-tokens.json file is NEVER edited manually — it is always a
 * byte-exact copy of a Figma plugin export.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'tokens', 'source-tokens.json');
const BACKUP = path.join(ROOT, 'tokens', 'source-tokens.bak.json');

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node scripts/import-tokens.js <path-to-new-export.json>');
  process.exit(1);
}

const SRC = path.resolve(args[0]);

if (!fs.existsSync(SRC)) {
  console.error(`✗ File not found: ${SRC}`);
  process.exit(1);
}

// ─── Parse + sanity check ──────────────────────────────────
let incoming;
try {
  incoming = JSON.parse(fs.readFileSync(SRC, 'utf8'));
} catch (e) {
  console.error(`✗ Could not parse JSON: ${e.message}`);
  process.exit(1);
}

if (!incoming.primitives || !incoming.semantic || !incoming.component) {
  console.error('✗ Invalid token file — must have top-level keys: primitives, semantic, component');
  console.error('  (This does not look like a letbe plugin export)');
  process.exit(1);
}

// ─── Diff vs current ───────────────────────────────────────
function flattenTokens(obj, prefix = '', out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  if ('$value' in obj) { out[prefix] = obj; return out; }
  for (const [key, val] of Object.entries(obj)) {
    flattenTokens(val, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

let currentFlat = {};
if (fs.existsSync(DEST)) {
  try {
    currentFlat = flattenTokens(JSON.parse(fs.readFileSync(DEST, 'utf8')));
  } catch {}
}
const incomingFlat = flattenTokens(incoming);

const currentPaths = new Set(Object.keys(currentFlat));
const incomingPaths = new Set(Object.keys(incomingFlat));
const added = [...incomingPaths].filter(p => !currentPaths.has(p));
const removed = [...currentPaths].filter(p => !incomingPaths.has(p));

console.log(`\nImporting from: ${SRC}`);
console.log(`  Current tokens: ${currentPaths.size}`);
console.log(`  New tokens:     ${incomingPaths.size}`);
if (added.length)   console.log(`  + Added:   ${added.length}`);
if (removed.length) console.log(`  - Removed: ${removed.length}`);

if (removed.length > 0 && removed.length < 20) {
  console.log('\n  Removed paths:');
  removed.forEach(p => console.log(`    - ${p}`));
}

// ─── Backup + copy ─────────────────────────────────────────
if (fs.existsSync(DEST)) {
  fs.copyFileSync(DEST, BACKUP);
  console.log(`\n  ✓ Backed up current source-tokens.json → source-tokens.bak.json`);
}

fs.copyFileSync(SRC, DEST);
console.log(`  ✓ Copied new export → tokens/source-tokens.json`);

// ─── Rebuild CSS ───────────────────────────────────────────
console.log(`\nRebuilding theme.css...`);
try {
  execSync('node ' + path.join(__dirname, 'build-tokens.js'), { stdio: 'inherit' });
  console.log('\n✓ Import complete. Review changes and commit if happy.');
  if (removed.length > 0) {
    console.log('\n⚠ Some tokens were removed. If components.css referenced them, those components may now render incorrectly.');
    console.log('  Check the validation warnings above and update components.css if needed.');
  }
} catch (e) {
  console.error('\n✗ Build failed after import. Restoring backup...');
  if (fs.existsSync(BACKUP)) fs.copyFileSync(BACKUP, DEST);
  console.error('  Backup restored. Investigate the build error and try again.');
  process.exit(1);
}
