#!/usr/bin/env node
/**
 * split-pages.js — one-time migration
 *
 * Reads the existing monolithic index.html (with 35 <section> blocks)
 * and splits each section into its own /<id>/index.html page.
 * Also rewrites the landing index.html as a component index grid.
 *
 * Run once after meta.json and gallery-layout.js exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'meta.json'), 'utf8'));

const src = fs.readFileSync(SRC, 'utf8');

// Extract <section class="gallery-section" id="..."> ... </section>
const sectionRe = /<section class="gallery-section" id="([^"]+)">([\s\S]*?)<\/section>/g;
const sections = {};
let m;
while ((m = sectionRe.exec(src)) !== null) {
  const id = m[1];
  let body = m[2].trim();
  // Rewrite the duplicated <h2 class="gallery-section__title">{Name}</h2>
  // (from the old single-page section heading) to "{Name} Demo" and strip
  // any redundant short description paragraph immediately after it. The
  // component's real description already lives in the <h1> + <p> built by
  // the page template.
  const info = META.items[id];
  if (info) {
    const name = info.name;
    const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(
      new RegExp(`<h2 class="gallery-section__title">${nameEscaped}</h2>`),
      `<h2 class="gallery-section__title">${name} Demo</h2>`
    );
    body = body.replace(
      new RegExp(`(<h2 class="gallery-section__title">${nameEscaped} Demo</h2>)\\s*\\n\\s*<p class="gallery-section__desc">[^<]*</p>\\s*\\n(\\s*<div class="gallery-(label|row))`),
      '$1\n$2'
    );
  }
  sections[id] = { id, body };
}

console.log(`Found ${Object.keys(sections).length} sections in index.html`);

// ─── Page template ──
function makePage(id, sectionBody) {
  const info = META.items[id];
  if (!info) throw new Error(`No meta entry for ${id}`);
  const title = info.name;
  const description = info.description || '';
  const usage = info.usage || '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <!-- theme-preamble:v1 -->
  <script>(function(){try{var t=localStorage.getItem('letbe-ds-dark-mode');if(t==='1')document.documentElement.setAttribute('data-theme','dark');else if(t==='0')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta data-lb-page="${id}">
  <title>${title} — letbe-ds</title>
  <link rel="stylesheet" href="../tokens/theme.css">
  <link rel="stylesheet" href="../components/components.css">
  <link rel="stylesheet" href="../components/theme-editor.css">
  <link rel="stylesheet" href="../components/gallery.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Roboto+Mono:wght@400;500;600&family=Noto+Serif:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body data-lb-base="..">

<main class="gallery-main">
  <section class="gallery-section" id="${id}">
    <h1 class="gallery-section__title" style="font-size: var(--lb-t-heading-l-font-size); line-height: var(--lb-t-heading-l-line-height);">${title}</h1>
    <p class="gallery-section__desc">${description}</p>
${usage ? `    <p class="gallery-section__desc" style="margin-top: calc(-1 * var(--lb-size-4x)); margin-bottom: var(--lb-size-6x);"><strong>Usage:</strong> ${usage}</p>` : ''}
    <hr class="gallery-desc-divider">
${sectionBody}
  </section>
</main>

<script src="../js/lb.js"></script>
<script src="../js/token-applier.js"></script>
<script src="../js/token-exporter.js"></script>
<script src="../js/theme-editor.js"></script>
<script src="../js/gallery-layout.js"></script>
</body>
</html>
`;
}

// ─── Write each component + foundation page ──
let written = 0;
for (const group of META.groups) {
  for (const id of group.items) {
    // Some IDs don't have a section in old index.html (foundation items like typography, colors, icons do).
    // Use an empty body if not present.
    const body = sections[id] ? sections[id].body : `    <p style="color: var(--lb-fg-muted);">Content coming soon.</p>`;
    const html = makePage(id, body);
    const dir = path.join(ROOT, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    written++;
  }
}
console.log(`Wrote ${written} component pages`);

// ─── Landing page: grid of cards ──
const foundationLinks = META.groups.find(g => g.id === 'foundation').items;
const componentLinks = META.groups.find(g => g.id === 'components').items;

const landingGridCSS = `
    /* Landing-specific styles */
    .landing-intro { max-width: 48rem; margin: 0 auto var(--lb-size-12x); text-align: center; padding-top: var(--lb-size-8x); }
    .landing-intro__title { font-family: var(--lb-t-display-xs-font-family); font-size: var(--lb-t-display-xs-font-size); font-weight: var(--lb-t-display-xs-font-weight); line-height: var(--lb-t-display-xs-line-height); letter-spacing: var(--lb-t-display-xs-letter-spacing); margin: 0 0 var(--lb-size-3x); }
    .landing-intro__lead { font-size: var(--lb-t-body-l-font-size); line-height: var(--lb-t-body-l-line-height); color: var(--lb-fg-muted); margin: 0; }

    .landing-section { margin-bottom: var(--lb-size-12x); }
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

function cardFor(id) {
  const info = META.items[id];
  if (!info) return '';
  // Short description — first 120 chars
  const short = (info.description || '').slice(0, 160);
  return `  <a class="landing-card" href="${id}/">
    <h3 class="landing-card__name">${info.name}</h3>
    <p class="landing-card__desc">${short}</p>
  </a>`;
}

const landing = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <!-- theme-preamble:v1 -->
  <script>(function(){try{var t=localStorage.getItem('letbe-ds-dark-mode');if(t==='1')document.documentElement.setAttribute('data-theme','dark');else if(t==='0')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta data-lb-page="">
  <title>letbe-ds — component gallery</title>
  <link rel="stylesheet" href="tokens/theme.css">
  <link rel="stylesheet" href="components/components.css">
  <link rel="stylesheet" href="components/theme-editor.css">
  <link rel="stylesheet" href="components/gallery.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Roboto+Mono:wght@400;500;600&family=Noto+Serif:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>${landingGridCSS}</style>
</head>
<body data-lb-base="">

<main class="gallery-main">
  <div class="landing-intro">
    <h1 class="landing-intro__title">letbe-ds</h1>
    <p class="landing-intro__lead">A framework-agnostic design system driven by letbe Figma plugin tokens. Vanilla CSS and JavaScript, no build step, single source of truth.</p>
  </div>

  <section class="landing-section">
    <h2 class="landing-section__title">Foundation</h2>
    <div class="landing-grid">
${foundationLinks.map(cardFor).join('\n')}
    </div>
  </section>

  <section class="landing-section">
    <h2 class="landing-section__title">Components</h2>
    <div class="landing-grid">
${componentLinks.map(cardFor).join('\n')}
    </div>
  </section>
</main>

<script src="js/lb.js"></script>
<script src="js/token-applier.js"></script>
<script src="js/token-exporter.js"></script>
<script src="js/theme-editor.js"></script>
<script src="js/gallery-layout.js"></script>
</body>
</html>
`;
fs.writeFileSync(SRC, landing);
console.log('Rewrote landing index.html');
