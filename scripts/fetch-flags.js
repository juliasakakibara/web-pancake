#!/usr/bin/env node
/**
 * fetch-flags.js — One-off vendoring script.
 *
 * Downloads circle-flag SVGs for every country listed in
 * PHONE_COUNTRIES (parsed live from js/lb.js) into assets/flags/{iso}.svg.
 *
 * Source: https://github.com/HatScripts/circle-flags (MIT)
 * Credit preserved in THIRD-PARTY-LICENSES.md + assets/flags/LICENSE.txt.
 *
 * Usage: node scripts/fetch-flags.js [--force]
 *   --force   re-download even if the file already exists
 */
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'js', 'lb.js');
const DEST = path.join(ROOT, 'assets', 'flags');
const BASE = 'https://hatscripts.github.io/circle-flags/flags/';
const CONCURRENCY = 8;
const force = process.argv.includes('--force');

async function main() {
  const lb = await fs.readFile(SRC, 'utf8');
  // Parse the PHONE_COUNTRIES block — entries look like `{ iso: 'xx', ... }`
  const phoneBlockStart = lb.indexOf('PHONE_COUNTRIES');
  const phoneBlockEnd   = lb.indexOf('];', phoneBlockStart);
  if (phoneBlockStart < 0 || phoneBlockEnd < 0) {
    console.error('Could not locate PHONE_COUNTRIES in js/lb.js');
    process.exit(1);
  }
  const block = lb.slice(phoneBlockStart, phoneBlockEnd);
  const isos = Array.from(block.matchAll(/\{\s*iso:\s*'([a-z]{2,3})'/g)).map(m => m[1]);
  const unique = [...new Set(isos)];
  console.log(`Found ${unique.length} ISO codes in PHONE_COUNTRIES.`);

  await fs.mkdir(DEST, { recursive: true });

  const toFetch = [];
  for (const iso of unique) {
    const file = path.join(DEST, `${iso}.svg`);
    if (!force) {
      try { await fs.access(file); continue; } catch {}
    }
    toFetch.push(iso);
  }
  console.log(`${toFetch.length} to download${force ? ' (--force)' : ' (skipping existing)'}.`);
  if (!toFetch.length) { console.log('Nothing to do.'); return; }

  let done = 0;
  const failed = [];
  async function fetchOne(iso) {
    try {
      const res = await fetch(`${BASE}${iso}.svg`);
      if (!res.ok) { failed.push({ iso, reason: `HTTP ${res.status}` }); return; }
      const svg = await res.text();
      await fs.writeFile(path.join(DEST, `${iso}.svg`), svg);
      done++;
    } catch (e) {
      failed.push({ iso, reason: e.message });
    }
  }

  const queue = toFetch.slice();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const iso = queue.shift();
      await fetchOne(iso);
    }
  });
  const tick = setInterval(() => process.stdout.write(`  ${done}/${toFetch.length}\r`), 500);
  await Promise.all(workers);
  clearInterval(tick);
  process.stdout.write(`  ${done}/${toFetch.length}\n`);

  console.log(`\n✓ Downloaded ${done} flags.`);
  if (failed.length) {
    console.log(`✗ ${failed.length} failed:`);
    failed.forEach(f => console.log(`    ${f.iso} — ${f.reason}`));
    process.exit(1);
  }
}
main();
