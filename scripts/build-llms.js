#!/usr/bin/env node
/**
 * build-llms.js — regenerate /llms.txt from components/meta.json
 *
 * llms.txt is the AI-legibility entry point (https://llmstxt.org): a single
 * markdown file an agent can read to understand the whole system without
 * crawling the gallery. Everything component-shaped is generated from
 * meta.json so it can never drift from the landing page; the fixed sections
 * (tokens, vendor manifest, principles) mirror the README's claims.
 *
 * Run after any meta.json change, alongside build-landing.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'llms.txt');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'meta.json'), 'utf8'));

const lines = [];
const push = (s = '') => lines.push(s);

push('# letbe-ds');
push();
push('> Application-grade UI in plain CSS + JS — no build, no dependencies, no');
push('> framework. Tokens → components → templates, MIT.');
push();
push('letbe-ds is a complete design system in three plain files — design tokens,');
push('component styles, one JavaScript runtime. No build step, no dependencies,');
push('no framework: link the files and you own the entire stack. A three-tier');
push('DTCG token architecture drives everything. From buttons, forms and cards');
push('it scales to the application tier: data tables, dashboards, kanban boards,');
push('calendars, media players, AI chat. Interactions are accessibility-first;');
push('heavy engines (data layers, virtualizers, streaming, AI models) are');
push('deliberately the consumer\'s choice. MIT-licensed, demo media included');
push('(brand and third-party assets excluded — see NOTICE).');
push();
push('## Runtime — three files, then opt-in modules');
push();
push('Load order: `tokens/theme.css` → `components/components.css` → `js/lb.js`.');
push('Components auto-initialise from `data-lb-*` attributes on DOMContentLoaded.');
push('Heavier controllers are opt-in modules loaded AFTER `lb.js` (header, shell,');
push('board, chat, media, timeline, selection — see the README vendor manifest');
push('for the exact file list). If a `data-lb-*` root has no controller loaded,');
push('`lb.js` logs a console warning naming the missing script.');
push();
push('Class combos are contracts: copy the full combo from each demo (base +');
push('variant + size, e.g. `lb-btn lb-btn--secondary lb-btn--medium`; every table');
push('cell carries `lb-table__cell`). Base classes alone render unstyled.');
push();
push('## Tokens — DTCG source, generated CSS');
push();
push('`tokens/source-tokens.json` is authored in the W3C Design Tokens Community');
push('Group (DTCG) format — `$value`/`$type`, aliases as `{path.to.token}` — and');
push('is the single source of truth. `node scripts/build-tokens.js` generates');
push('`tokens/theme.css` (never edit it by hand). Three tiers: L1 primitives →');
push('L2 semantic (`--lb-bg-*`, `--lb-fg-*`, `--lb-surface-*`) → L3 component');
push('(`--lb-action-*`, `--lb-field-*`). L2/L3 never hold raw values, only');
push('references. Role prefixes name what the pixel IS, not the CSS property:');
push('`bg-*` = surfaces/fills (incl. value-display fills), `fg-*` = ink — text');
push('AND icons (icons draw with currentColor), `border-*` = boundaries and');
push('focus only; cross-role binding is forbidden outside documented cases.');
push('Native light/dark themes (`[data-theme="dark"]`), responsive');
push('S/M/L typography modes, ~500 tokens. The same tokens round-trip into Figma');
push('variables through the letbe tokens plugin, published on Figma Community');
push('(https://www.figma.com/community/plugin/1671570185456177314/letbe-tokens);');
push('the Figma component library built on those variables is published at');
push('https://www.figma.com/community/file/1672532598361033237');
push();
push('Theming: layer your own stylesheet after `theme.css` and re-declare token');
push('values — the whole system re-themes, both modes, zero forks. Text on');
push('saturated fills uses `--lb-fg-inverse-strong` (theme-stable on-color role).');

const SECTION_NOTES = {
  foundation: 'Token-level pages — vocabulary and scales, not classed components.',
  charts: 'Hand-rolled SVG / pure CSS. No charting library; data via `data-lb-*` attributes or JS options.',
  components: 'Each page documents markup, variants, a11y behavior and JS API.',
  templates: 'Composed screens built exclusively from the components above — copy as starting points.',
};

for (const group of META.groups) {
  push();
  push(`## ${group.name} (${group.items.length})`);
  push();
  if (SECTION_NOTES[group.id]) { push(SECTION_NOTES[group.id]); push(); }
  for (const id of group.items) {
    const info = META.items[id];
    if (!info) continue;
    const status = info.status ? ` [${info.status}]` : '';
    push(`- [${info.name}](/${id}/)${status}: ${info.description}`);
  }
}

push();
push('## Accessibility');
push();
push('Every interactive component ships its interaction model: WCAG 2.5.7-first');
push('kanban (menu-move, pointer drag, keyboard grab-and-move + live-region');
push('announcements), APG-patterned tables (`role=table`, `aria-sort`), focus-');
push('trapped modal drawers, labelled comboboxes, `prefers-reduced-motion`');
push('opt-outs. Each gallery page carries an "a11y (built in)" paragraph stating');
push('exactly what the code does — claims are verified against the source.');
push();
push('## Files');
push();
push('- [README.md](/README.md): positioning, vendor manifest, theming guide, versioning policy');
push('- [CHANGELOG.md](/CHANGELOG.md): versioned changes; token NAMES are API (renames = major)');
push('- [LICENSE](/LICENSE) + [NOTICE](/NOTICE): MIT incl. demo media; brand + third-party excluded');
push('- [tokens/source-tokens.json](/tokens/source-tokens.json): DTCG token source');
push('- [components/meta.json](/components/meta.json): machine-readable component inventory (this file is generated from it)');
push('- [privacy/](/privacy/): what the site does with visitor data — no cookies, no cross-site tracking; cookieless EU-hosted page analytics (Plausible) on letbe.design only; three device-local preferences; self-hosted fonts');
push();

fs.writeFileSync(DEST, lines.join('\n'));
console.log(`✓ Wrote llms.txt (${lines.length} lines, ${META.groups.reduce((n, g) => n + g.items.length, 0)} inventory entries)`);
