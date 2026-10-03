#!/usr/bin/env node
/**
 * add-theme-preamble.js — idempotent injector
 *
 * Every gallery HTML page has <html lang="en" data-theme="dark"> hardcoded
 * (dark is the default for first-time visitors). The preamble corrects
 * data-theme based on localStorage BEFORE any stylesheet paints, avoiding
 * a FOUC for users who toggled to light mode.
 *
 * The script reads localStorage 'letbe-ds-dark-mode' — '1' for dark, '0' for
 * light. Any other value (null, malformed) leaves the baked default alone
 * (dark) so fresh visitors see dark mode.
 *
 * Run: node scripts/add-theme-preamble.js
 *
 * Safe to re-run — the script detects the preamble marker and skips pages
 * that already have it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Unique marker comment so re-runs are no-ops
const MARKER = '<!-- theme-preamble:v1 -->';
const PREAMBLE = `
  ${MARKER}
  <script>(function(){try{var t=localStorage.getItem('letbe-ds-dark-mode');if(t==='1')document.documentElement.setAttribute('data-theme','dark');else if(t==='0')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();</script>`;

// Find every HTML file under the repo (excluding node_modules, .git).
function findHtmlPages(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'flags' || entry.name === 'icons') continue;
      findHtmlPages(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function inject(file) {
  const content = fs.readFileSync(file, 'utf8');

  // Skip if already has the preamble marker
  if (content.includes(MARKER)) return { file, status: 'skipped' };

  // Must contain <head> to be a valid HTML page
  if (!/<head[^>]*>/i.test(content)) return { file, status: 'no-head' };

  // Insert right AFTER the opening <head> tag — runs before any stylesheet
  const updated = content.replace(/<head([^>]*)>/i, (match) => match + PREAMBLE);
  if (updated === content) return { file, status: 'no-change' };

  fs.writeFileSync(file, updated, 'utf8');
  return { file, status: 'injected' };
}

function main() {
  const pages = findHtmlPages(ROOT);
  let injected = 0, skipped = 0, issues = 0;
  for (const page of pages) {
    const result = inject(page);
    const rel = path.relative(ROOT, page);
    if (result.status === 'injected') { injected++; console.log(`  ✓ ${rel}`); }
    else if (result.status === 'skipped') skipped++;
    else { issues++; console.warn(`  ⚠ ${rel} — ${result.status}`); }
  }
  console.log(`\nInjected: ${injected}, skipped (already had preamble): ${skipped}, issues: ${issues}`);
}

main();
