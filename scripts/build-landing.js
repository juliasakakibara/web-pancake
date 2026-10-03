#!/usr/bin/env node
/**
 * build-landing.js — regenerate ONLY the landing /index.html from meta.json
 *
 * Safe to run any time you add/remove/rename a foundation or component
 * entry in components/meta.json. Does NOT touch the per-component pages
 * (that's scripts/split-pages.js's job, intended for one-time migration).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'index.html');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'meta.json'), 'utf8'));

// Generic: one landing section per meta.json group, in meta.json order
// (Foundation, Charts, Components, Templates, …future groups).
if (!Array.isArray(META.groups) || !META.groups.length) {
  console.error('✗ meta.json has no groups');
  process.exit(1);
}

// Escape characters that would break HTML if we slice into the middle of
// a tag (descriptions contain examples like `<fieldset>`, `<input>`, `<div>`).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Truncate at a word boundary + ellipsis so we never chop mid-word or
// mid-entity — independent of HTML escaping above.
function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

function cardFor(id) {
  const info = META.items[id];
  if (!info) {
    console.warn(`  ⚠ No meta entry for "${id}" — skipping`);
    return '';
  }
  const desc = truncate(info.description || '', 160);
  return `  <a class="landing-card" href="${id}/">
    <h3 class="landing-card__name">${escapeHtml(info.name)}</h3>
    <p class="landing-card__desc">${escapeHtml(desc)}</p>
  </a>`;
}

// One line under each group heading so a first-time visitor can scan the
// page structure without reading 79 cards.
const GROUP_BLURBS = {
  foundation: 'The vocabulary — color, type, size, radius, shadow, motion. Everything below is built from these tokens.',
  charts: 'Hand-rolled SVG and pure CSS data viz — no charting library.',
  components: 'The working set, from form atoms to data tables, boards and media. Each page documents markup, variants, a11y and the JS API.',
  templates: 'Composed screens built entirely from the components above — copy them as starting points.',
};

const landingGridCSS = `
    /* Landing-specific styles */
    .landing-hero {
      display: grid;
      grid-template-columns: 1fr minmax(320px, 480px);
      gap: var(--lb-size-10x);
      align-items: center;
      margin: 0 0 var(--lb-size-10x);
      padding-top: var(--lb-size-8x);
    }
    .landing-hero__title { font-family: var(--lb-t-display-xs-font-family); font-size: var(--lb-t-display-xs-font-size); font-weight: var(--lb-t-display-xs-font-weight); line-height: var(--lb-t-display-xs-line-height); letter-spacing: var(--lb-t-display-xs-letter-spacing); margin: 0 0 var(--lb-size-3x); }
    .landing-hero__lead { font-size: var(--lb-t-body-l-font-size); line-height: var(--lb-t-body-l-line-height); color: var(--lb-fg-muted); margin: 0 0 var(--lb-size-6x); max-width: 40rem; }
    .landing-hero__facts { font-size: var(--lb-t-body-s-font-size); color: var(--lb-fg-subtle); margin: 0 0 var(--lb-size-6x); }
    .landing-hero__actions { display: flex; flex-wrap: wrap; gap: var(--lb-size-2x); }
    .landing-hero__media img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: var(--lb-radius-media);
      border: var(--lb-border-width-thin) solid var(--lb-surface-border-default);
    }
    @media (max-width: 768px) {
      .landing-hero { grid-template-columns: 1fr; }
      .landing-hero__media { max-width: 420px; }
    }

    .landing-section { margin-bottom: var(--lb-size-12x); scroll-margin-top: var(--lb-size-16x); }
    .landing-section__blurb { font-size: var(--lb-t-body-s-font-size); line-height: 1.5; color: var(--lb-fg-muted); margin: calc(-1 * var(--lb-size-2x)) 0 var(--lb-size-4x); max-width: 44rem; }
    .landing-section__count { color: var(--lb-fg-subtle); font-weight: var(--lb-font-weight-regular); }
    .landing-section__title { font-family: var(--lb-t-heading-l-font-family); font-size: var(--lb-t-heading-l-font-size); font-weight: var(--lb-t-heading-l-font-weight); line-height: var(--lb-t-heading-l-line-height); margin: 0 0 var(--lb-size-4x); }

    .landing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--lb-size-3x); }
    .landing-card {
      display: block;
      padding: var(--lb-size-4x);
      background: var(--lb-surface-bg-default);
      border: var(--lb-border-width-thin) solid var(--lb-surface-border-default);
      border-radius: var(--lb-radius-surface);
      text-decoration: none;
      transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
    }
    .landing-card:hover { border-color: var(--lb-border-accent); transform: translateY(-2px); }
    .landing-card:focus-visible { outline: var(--lb-border-width-medium) solid var(--lb-border-focus); outline-offset: var(--lb-size-0-5x); }
    .landing-card__name { font-family: var(--lb-t-label-m-font-family); font-size: var(--lb-t-label-m-font-size); font-weight: var(--lb-font-weight-semibold); color: var(--lb-fg-default); margin: 0 0 var(--lb-size-1x); }
    .landing-card__desc { font-size: var(--lb-t-body-s-font-size); line-height: 1.5; color: var(--lb-fg-muted); margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
`;

const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <!-- theme-preamble:v1 -->
  <script>(function(){try{var t=localStorage.getItem('letbe-ds-dark-mode');if(t==='1')document.documentElement.setAttribute('data-theme','dark');else if(t==='0')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta data-lb-page="">
  <title>letbe-ds — component gallery</title>
  <link rel="stylesheet" href="tokens/theme.css">
  <link rel="stylesheet" href="tokens/fonts.css">
  <link rel="stylesheet" href="components/components.css">
  <link rel="stylesheet" href="components/theme-editor.css">
  <link rel="stylesheet" href="components/gallery.css">
  <style>${landingGridCSS}</style>
</head>
<body data-lb-base="">

<main class="gallery-main">
  <div class="landing-hero">
    <div>
      <h1 class="landing-hero__title">letbe-ds</h1>
      <p class="landing-hero__lead">A complete design system in three plain files — no build step, no dependencies, no framework. Tokens drive everything: retune a handful of values and the whole system wears your brand, light and dark. From buttons and forms to data tables, dashboards, kanban boards and AI chat. MIT.</p>
      <p class="landing-hero__facts">${META.groups.reduce((n, g) => n + g.items.length, 0)} pages · 3-file runtime · DTCG tokens · Figma round-trip</p>
      <div class="landing-hero__actions">
${META.groups.map(g => `        <a class="lb-btn lb-btn--secondary lb-btn--small" href="#${g.id}"><span class="lb-btn__label">${escapeHtml(g.name)}</span><span class="lb-counter lb-counter--small lb-counter--subtle">${g.items.length}</span></a>`).join('\n')}
        <a class="lb-btn lb-btn--ghost lb-btn--small" href="about/"><span class="lb-btn__label">About</span></a>
      </div>
    </div>
    <div class="landing-hero__media">
      <img src="assets/media/letbe-design-hero.jpg" alt="Gold bust — half sculpted face, half skull — under the white letbe mark" fetchpriority="high">
    </div>
  </div>

${META.groups.map(group => `  <section class="landing-section" id="${group.id}">
    <h2 class="landing-section__title">${escapeHtml(group.name)} <span class="landing-section__count">· ${group.items.length}</span></h2>
    ${GROUP_BLURBS[group.id] ? `<p class="landing-section__blurb">${GROUP_BLURBS[group.id]}</p>` : ''}
    <div class="landing-grid">
${group.items.map(cardFor).filter(Boolean).join('\n')}
    </div>
  </section>`).join('\n\n')}
</main>

<script src="js/lb.js"></script>
<script src="js/slot-engine.js"></script>
<script src="js/theme-editor.js"></script>
<script src="js/token-exporter.js"></script>
<script src="js/gallery-layout.js"></script>
</body>
</html>
`;

fs.writeFileSync(DEST, html);
console.log(`✓ Rewrote landing index.html`);
META.groups.forEach(g => console.log(`  ${g.name}: ${g.items.length} entries`));
