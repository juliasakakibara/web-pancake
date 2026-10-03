#!/usr/bin/env node
/**
 * fetch-google-fonts-catalog.js
 *
 * Build-time tool that pulls the Google Fonts catalog from the
 * Developer API and writes a slim JSON snapshot at
 * `tokens/google-fonts-catalog.json`. The Theme editor's font picker
 * reads that snapshot at runtime — never the live API.
 *
 * Why a snapshot instead of a runtime fetch:
 *   - No runtime API key, no CORS surface, no quota.
 *   - Works offline, deterministic for users.
 *   - Editor can lazy-render previews from a known dataset.
 *
 * Run (no key — uses the public metadata endpoint fonts.google.com uses):
 *   node scripts/fetch-google-fonts-catalog.js
 *
 * Or with the official Developer API (slightly more stable schema):
 *   GOOGLE_FONTS_API_KEY=… node scripts/fetch-google-fonts-catalog.js
 *   Get a key at:
 *   https://developers.google.com/fonts/docs/developer_api#APIKey
 *
 * Frequency: quarterly. If a user reports a missing font, refresh and
 * re-bundle.
 *
 * Preserves `featured` flags from the previous snapshot so curated
 * anchors (Inter, DM Sans, IBM Plex, etc.) stay featured across runs.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH    = path.join(__dirname, '..', 'tokens', 'google-fonts-catalog.json');
const API_URL     = 'https://www.googleapis.com/webfonts/v1/webfonts?sort=alpha';
const PUBLIC_URL  = 'https://fonts.google.com/metadata/fonts';

// Map fonts.google.com category labels → Developer API category labels.
// Picker code expects the API labels.
const CATEGORY_MAP = {
  'Sans Serif':   'sans-serif',
  'Serif':        'serif',
  'Display':      'display',
  'Handwriting':  'handwriting',
  'Monospace':    'monospace',
};

// Letbe-curated anchors — kept featured across snapshot refreshes.
// Editing this list is the only manual maintenance step.
const FEATURED_DEFAULTS = [
  'Inter', 'DM Sans', 'Plus Jakarta Sans', 'Manrope', 'Outfit',
  'Public Sans', 'Source Sans 3', 'Work Sans', 'IBM Plex Sans',
  'Roboto', 'Open Sans',
  'Lora', 'Source Serif 4', 'Fraunces', 'Playfair Display',
  'Space Grotesk', 'Bricolage Grotesque',
  'Roboto Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono',
];

// --- Fetchers ---------------------------------------------------------------
// Two paths to the same slim shape { name, category, weights }:
//   1. Developer API (needs key, official, stable)
//   2. fonts.google.com metadata endpoint (no key, public, what the website
//      itself consumes — shape may shift if Google reworks fonts.google.com)
// The script auto-picks based on env: key present → API, else → public.

async function fetchViaApi(key) {
  const res = await fetch(`${API_URL}&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data.items)) throw new Error('Unexpected response shape — no .items[] array.');
  return data.items.map((it) => {
    // Variants: "regular", "500", "italic", "500italic" → numeric weights
    const weights = Array.from(new Set(
      (it.variants || [])
        .map((v) => {
          if (v === 'regular' || v === 'italic') return 400;
          const m = v.match(/^(\d{3})/);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter((w) => w != null)
    )).sort((a, b) => a - b);
    return { name: it.family, category: it.category, weights };
  });
}

async function fetchViaPublic() {
  const res = await fetch(PUBLIC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const arr = data.familyMetadataList;
  if (!Array.isArray(arr)) throw new Error('Unexpected response shape — no .familyMetadataList[] array.');
  return arr.map((it) => {
    const category = CATEGORY_MAP[it.category] || it.category.toLowerCase();
    // fonts is keyed by weight strings: "400", "400i", "700", "700i". Strip "i", dedupe.
    const weights = Array.from(new Set(
      Object.keys(it.fonts || {})
        .map((k) => parseInt(k.replace(/i$/, ''), 10))
        .filter((w) => Number.isFinite(w))
    )).sort((a, b) => a - b);
    return { name: it.family, category, weights };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const key = process.env.GOOGLE_FONTS_API_KEY;

  // Load previous snapshot to preserve `featured` flags & detect deltas
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch {}
  const prevSet  = new Set(previous ? previous.fonts.map(f => f.name) : []);
  const featSet  = new Set([
    ...FEATURED_DEFAULTS,
    ...(previous ? previous.fonts.filter(f => f.featured).map(f => f.name) : []),
  ]);

  // Fetch
  let raw;
  if (key) {
    console.log('→ Fetching via Developer API (key present)…');
    try { raw = await fetchViaApi(key); }
    catch (e) { console.error('✗', e.message); process.exit(1); }
  } else {
    console.log('→ No GOOGLE_FONTS_API_KEY — using public metadata endpoint.');
    console.log('  (For the official key path, see https://developers.google.com/fonts/docs/developer_api#APIKey)');
    try { raw = await fetchViaPublic(); }
    catch (e) { console.error('✗', e.message); process.exit(1); }
  }

  // Apply featured flag and emit final shape
  const fonts = raw.map((f) => {
    const out = { name: f.name, category: f.category, weights: f.weights };
    if (featSet.has(f.name)) out.featured = true;
    return out;
  });

  // Stats
  const added   = fonts.filter(f => !prevSet.has(f.name)).map(f => f.name);
  const removed = previous ? previous.fonts.filter(f => !fonts.find(g => g.name === f.name)).map(f => f.name) : [];

  // Write
  const snapshot = {
    $generated: new Date().toISOString(),
    $source: 'Google Fonts Developer API v1 — https://developers.google.com/fonts/docs/developer_api',
    fonts,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  Families:   ${fonts.length}`);
  console.log(`  Featured:   ${fonts.filter(f => f.featured).length}`);
  if (previous) {
    console.log(`  + Added:    ${added.length}${added.length ? ' (' + added.slice(0, 5).join(', ') + (added.length > 5 ? ', …' : '') + ')' : ''}`);
    console.log(`  − Removed:  ${removed.length}${removed.length ? ' (' + removed.slice(0, 5).join(', ') + (removed.length > 5 ? ', …' : '') + ')' : ''}`);
  }
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
