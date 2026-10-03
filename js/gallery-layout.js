/**
 * gallery-layout.js — shared layout for every gallery page
 *
 * Every page of the component gallery has the same header + sidebar +
 * theme editor. Instead of duplicating that markup in 38 pages, this
 * script injects it at runtime.
 *
 * HOW A PAGE USES THIS
 *   <html>
 *     <head>
 *       <meta data-lb-page="button">  ← declares which component this page is
 *       <link rel="stylesheet" href="...">
 *     </head>
 *     <body data-lb-base="">           ← optional: relative path to site root ('..' from /button/)
 *       <!-- page-specific content only -->
 *       <main class="gallery-main">
 *         <h1>Button</h1>
 *         ...
 *       </main>
 *       <script src="../js/lb.js"></script>
 *       <script src="../js/gallery-layout.js"></script>
 *       ...
 *     </body>
 *   </html>
 *
 * The script reads data-lb-page + data-lb-base, fetches meta.json for
 * all sidebar entries, and injects header, sidebar, and the theme editor
 * panel. It also highlights the active sidebar link and wires up
 * Import/Export/Edit buttons.
 */
(function () {
  'use strict';

  // ─── Configuration from the page itself ──────────────────
  const meta = document.querySelector('meta[data-lb-page]');
  const PAGE_ID = meta ? meta.getAttribute('data-lb-page') : '';
  // data-lb-base tells us how to reach site root — empty for /index.html,
  // ".." for /button/index.html, etc. Defaults to auto-detect from URL depth.
  const BASE = document.body.getAttribute('data-lb-base') ?? autoDetectBase();

  function autoDetectBase() {
    // Count path segments; root = "", nested = "..", etc.
    const segments = location.pathname.split('/').filter(Boolean);
    // Last segment might be a file name; treat it as a file if it contains "."
    const looksLikeFile = segments.length > 0 && segments[segments.length - 1].includes('.');
    const dirs = looksLikeFile ? segments.length - 1 : segments.length;
    return dirs > 0 ? Array(dirs).fill('..').join('/') : '';
  }

  const basePath = (p) => (BASE ? BASE + '/' : '') + p;

  // ─── Fetch the meta ──
  async function loadMeta() {
    const res = await fetch(basePath('components/meta.json'), { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load components/meta.json');
    return res.json();
  }

  // ─── Inject favicon links into <head> ──
  // Single point of truth: every gallery page includes gallery-layout.js,
  // so adding favicon here avoids editing 48 HTML files.
  function injectFavicons() {
    // Skip if already present (avoid duplicate link tags on re-init)
    if (document.querySelector('link[rel="icon"][data-lb-favicon]')) return;
    const brandBase = basePath('assets/brand');
    const links = [
      { rel: 'icon', type: 'image/svg+xml', href: `${brandBase}/letbe-logo-square.svg` },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${brandBase}/letbe-logo-32x32.png` },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${brandBase}/letbe-logo-16x16.png` },
    ];
    for (const attrs of links) {
      const link = document.createElement('link');
      link.setAttribute('data-lb-favicon', '');
      for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
      document.head.appendChild(link);
    }
  }

  // ─── Build header ──
  function buildHeader() {
    // Menu button lives OUTSIDE the header (it's position: fixed top-left, shown only on mobile)
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'gallery-menu-btn';
    menuBtn.id = 'menu-toggle';
    menuBtn.setAttribute('aria-label', 'Toggle menu');
    menuBtn.innerHTML = '<span data-lb-icon="menu" style="width: 1.5rem; height: 1.5rem;"></span>';
    document.body.insertBefore(menuBtn, document.body.firstChild);

    const brandMark = basePath('assets/brand/letbe-logo-square.svg');
    const hdr = document.createElement('header');
    hdr.className = 'gallery-header';
    // Header simplified: brand on left, theme switch + Theme Editor button on
    // right. Import / Export moved INTO the theme editor panel
    // (above the accordions) since they're configuration-side
    // actions, not gallery-navigation actions. The hidden file input
    // stays here so it remains addressable by id from anywhere.
    //
    // Order on desktop (right side): light/dark switch, then the Theme Editor button.
    // On mobile (≤768px) the dark toggle becomes a sun/moon icon
    // button (handled in CSS via .gallery-header__theme-icon-btn) and
    // the Theme Editor button drops its label, showing only the pencil
    // glyph (.lb-btn--mobile-icon-only modifier on the button itself).
    hdr.innerHTML = `
      <div class="gallery-header__brand">
        <a href="${basePath('')}" class="gallery-header__brand-link">
          <img src="${brandMark}" alt="" class="gallery-header__mark" aria-hidden="true">
          <span class="gallery-header__brand-text">letbe-ds</span>
        </a>
      </div>

      <input type="file" id="token-file-input" accept="application/json,.json" hidden>

      <a class="lb-link gallery-header__about-link" href="${basePath('about/')}">About</a>

      <!-- Desktop: switch with label. Mobile: icon-only via CSS. -->
      <label class="lb-switch-wrap gallery-header__theme-toggle">
        <input type="checkbox" class="lb-switch" role="switch" id="theme-toggle">
        <span class="lb-switch__label">Dark</span>
      </label>
      <!-- Mobile-only: same theme toggle as an icon button. JS keeps
           the two in sync via the same #theme-toggle change handler. -->
      <button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--medium gallery-header__theme-icon-btn" id="theme-icon-btn" aria-label="Toggle dark mode">
        <span class="lb-icon-btn__icon" data-lb-icon="moon"></span>
      </button>

      <button type="button" class="lb-btn lb-btn--primary lb-btn--small gallery-header__edit-theme" id="theme-edit-btn" title="Open theme editor" aria-label="Open theme editor">
        <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="pencil"></span>
        <span class="gallery-header__edit-theme-label">Theme Editor</span>
      </button>
    `;
    document.body.insertBefore(hdr, document.body.firstChild);
  }

  // ─── Build sidebar from meta.json ──
  // Eats our own dog food: the gallery sidebar is now a real
  // .lb-nav--vertical instance, the same component documented at
  // /navigation/. Active page gets the brand-tinted background +
  // left-bar marker for free. Foundation vs Components groups use
  // .lb-nav__group + .lb-nav__group-label.
  function buildSidebar(data) {
    const nav = document.createElement('nav');
    nav.className = 'gallery-sidebar lb-nav lb-nav--vertical';
    nav.id = 'gallery-sidebar';
    nav.setAttribute('aria-label', 'Component gallery navigation');

    const groupsMarkup = data.groups.map(group => {
      const items = group.items.map(id => {
        const item = data.items[id];
        if (!item) return '';
        const href = basePath(id + '/');
        const isActive = id === PAGE_ID;
        const cls = 'lb-nav__item' + (isActive ? ' lb-nav__item--active' : '');
        const aria = isActive ? ' aria-current="page"' : '';
        return `<a class="${cls}" href="${href}"${aria}><span class="lb-nav__item-label">${item.name}</span></a>`;
      }).join('\n');
      return `
        <li class="lb-nav__group">
          <span class="lb-nav__group-label">${group.name}</span>
          ${items}
        </li>
      `;
    }).join('\n');

    // Search field — pinned at top of the sidebar, filters the
    // navigation items by their label text. Reuses .lb-input + the
    // search-icon-start pattern from /input/ for visual consistency.
    const searchMarkup = `
      <div class="gallery-sidebar__search" data-lb-clearable>
        <div class="lb-input-wrap">
          <span class="lb-input-wrap__icon lb-input-wrap__icon--start" aria-hidden="true" data-lb-icon="search"></span>
          <input id="gallery-sidebar-search" class="lb-input lb-input--small lb-input--has-start" type="search" placeholder="Search letbe-ds" aria-label="Search letbe-ds component list" autocomplete="off">
        </div>
      </div>
    `;

    // Wrap the list in a separately-scrolling region so the search
    // stays pinned at the top of the sidebar even when the list is
    // long. The outer .gallery-sidebar locks height; .gallery-sidebar__list
    // takes overflow-y: auto so its scrollbar stays inside the list area
    // only.
    nav.innerHTML = searchMarkup + `
      <div class="gallery-sidebar__list">
        <ul class="lb-nav__list">${groupsMarkup}</ul>
      </div>
    `;

    // Overlay for mobile
    const overlay = document.createElement('div');
    overlay.className = 'gallery-overlay';
    overlay.id = 'menu-overlay';

    document.body.insertBefore(overlay, document.body.firstChild);
    document.body.insertBefore(nav, document.body.firstChild);

    // ─── Sidebar scroll persistence ──
    // Per-tab via sessionStorage. The sidebar lives on every gallery page,
    // so a full navigation rebuilds it from scratch and would otherwise
    // start at scrollTop=0 — frustrating when the user is browsing items
    // far down the list and clicks one.
    //
    // Restore happens immediately after the sidebar is inserted, before
    // the next paint, so there's no visible "snap from top" flash.
    // If the active item ends up out of view after restore (e.g. user
    // navigated via search or a deep link), gently scroll it into view.
    const SCROLL_KEY = 'letbe-ds-sidebar-scroll';
    const list = nav.querySelector('.gallery-sidebar__list');
    if (list) {
      // Restore — instant, no smooth-scroll (smoothing on load reads as a glitch)
      try {
        const saved = sessionStorage.getItem(SCROLL_KEY);
        if (saved != null) list.scrollTop = parseInt(saved, 10) || 0;
      } catch {}

      // Save on every scroll (rAF-throttled so we don't beat sessionStorage)
      let pending = false;
      list.addEventListener('scroll', () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          try { sessionStorage.setItem(SCROLL_KEY, String(list.scrollTop)); } catch {}
        });
      }, { passive: true });

      // Fallback: if the active item isn't visible after restore, nudge it.
      // Avoids the "I deep-linked to a page and don't know where I am in
      // the list" case, without overriding deliberate scroll memory.
      requestAnimationFrame(() => {
        const active = list.querySelector('.lb-nav__item--active');
        if (!active) return;
        const itemRect = active.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const out = itemRect.top < listRect.top || itemRect.bottom > listRect.bottom;
        if (out) active.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  // ─── Wire up header buttons (same logic as old index.html) ──
  function wireHeader() {
    // Lazy import of ToastManager; LB may still be initializing.
    let toastMgr = null;
    const getToast = () => toastMgr || (toastMgr = new LB.ToastManager());

    // Theme toggle — persisted to localStorage so the choice survives
    // page navigation. The FOUC-avoiding preamble (inline <script> in
    // every gallery page's <head>, injected via scripts/add-theme-
    // preamble.js) sets the attribute BEFORE CSS paints so there's no
    // light-flash on reload when dark mode is the saved preference.
    const DARK_MODE_KEY = 'letbe-ds-dark-mode';
    const themeToggle = document.getElementById('theme-toggle');
    const themeIconBtn = document.getElementById('theme-icon-btn');
    const themeIconSlot = themeIconBtn ? themeIconBtn.querySelector('[data-lb-icon]') : null;

    // Single source of truth for setting the theme; both controls call it.
    const setDarkMode = (isDark) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      try { localStorage.setItem(DARK_MODE_KEY, isDark ? '1' : '0'); } catch {}
      // Sync both controls to the same state
      if (themeToggle) themeToggle.checked = isDark;
      if (themeIconSlot) {
        // Show what you'd switch TO: in light mode → moon (go dark);
        // in dark mode → sun (go light)
        themeIconSlot.setAttribute('data-lb-icon', isDark ? 'sun' : 'moon');
        themeIconSlot._lbIconDone = false;        // force re-hydrate
        themeIconSlot.innerHTML = '';
        if (window.LB && window.LB.initIcons) window.LB.initIcons(themeIconBtn);
      }
      if (themeIconBtn) {
        themeIconBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      }
    };

    // Initialize from current attribute (set by the preamble in <head>)
    const initialDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setDarkMode(initialDark);

    if (themeToggle) {
      themeToggle.addEventListener('change', () => setDarkMode(themeToggle.checked));
    }
    if (themeIconBtn) {
      themeIconBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        setDarkMode(!isDark);
      });
    }

    // Theme edit
    const editBtn = document.getElementById('theme-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (window.LetbeThemeEditor) window.LetbeThemeEditor.toggle();
      });
    }

    // Import / Export — buttons live INSIDE the theme editor panel
    // (above the accordions). The panel is built lazily on first
    // open, so we use document-level event delegation by id rather
    // than querySelector at wire-time. The hidden file input still
    // lives in the page header so its DOM is always present.
    const fileInput = document.getElementById('token-file-input');

    document.addEventListener('click', (e) => {
      const importBtn = e.target.closest('#token-import-btn');
      if (importBtn && fileInput) {
        fileInput.click();
        return;
      }
      const exportBtn = e.target.closest('#token-export-btn');
      if (exportBtn) {
        (async () => {
          try {
            const { json, applied, skipped } = await window.LetbeTokenExporter.buildExport();
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `letbe-tokens-${timestamp}.json`;
            window.LetbeTokenExporter.downloadJson(json, filename);
            let msg = `Exported ${filename}`;
            if (applied.length > 0) msg += ` with ${applied.length} live override${applied.length === 1 ? '' : 's'}`;
            if (skipped.length > 0) msg += ` (${skipped.length} non-mappable skipped)`;
            getToast().show({ variant: 'success', title: 'Tokens exported', message: msg });
            if (skipped.length > 0) console.warn('Exported — non-mappable overrides skipped:', skipped);
          } catch (err) {
            getToast().show({ variant: 'danger', title: 'Export failed', message: err.message });
            console.error(err);
          }
        })();
        return;
      }

      // ── Copy / Paste — the clipboard round-trip (no file dance) ──
      const applyPastedTheme = (text, quiet) => {
        try {
          const json = JSON.parse(text);
          if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Not a token JSON object.');
          if (!window.LetbeThemeEditor.isReady()) throw new Error('Editor still loading — try again in a second.');
          window.LetbeThemeEditor.importJson(json);
          getToast().show({ variant: 'success', title: 'Theme applied', message: 'Pasted JSON is the new baseline — tweak or Export as usual.' });
          return true;
        } catch (err) {
          if (!quiet) getToast().show({ variant: 'danger', title: 'Paste failed', message: err.message });
          return false;
        }
      };

      const copyBtn = e.target.closest('#token-copy-btn');
      if (copyBtn) {
        (async () => {
          try {
            const { json } = await window.LetbeTokenExporter.buildExport();
            const text = JSON.stringify(json, null, 2);
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { /* fall through */ }
            if (!ok) {
              const ta = document.createElement('textarea');
              ta.value = text;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              ok = document.execCommand('copy');
              ta.remove();
            }
            if (!ok) throw new Error('Clipboard is unavailable in this browser context.');
            getToast().show({ variant: 'success', title: 'Theme copied', message: `${Math.max(1, Math.round(text.length / 1024))} KB of JSON on the clipboard.` });
          } catch (err) {
            getToast().show({ variant: 'danger', title: 'Copy failed', message: err.message });
          }
        })();
        return;
      }

      const shareBtn = e.target.closest('#token-share-btn');
      if (shareBtn) {
        (async () => {
          try {
            const { url, bytes, isDefault } = window.LetbeThemeEditor.buildShareLink();
            let ok = false;
            try { await navigator.clipboard.writeText(url); ok = true; } catch (_) { /* fallback */ }
            if (!ok) {
              const ta = document.createElement('textarea');
              ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
              document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
            }
            if (!ok) throw new Error('Clipboard is unavailable in this browser context.');
            getToast().show({
              variant: 'neutral',
              title: isDefault ? 'Link copied — default theme' : 'Theme link copied',
              message: isDefault
                ? 'You have no changes yet; this link opens the factory theme. Tweak something and share again.'
                : `Send it to anyone — the link opens the gallery with your theme applied (${Math.max(1, Math.round(bytes / 1024))} KB, nothing stored on a server).`,
              action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') },
            });
          } catch (err) {
            getToast().show({ variant: 'danger', title: 'Share failed', message: err.message });
          }
        })();
        return;
      }

      const pasteBtn = e.target.closest('#token-paste-btn');
      if (pasteBtn) {
        (async () => {
          // One-click path where the browser allows clipboard reads — raced
          // against a short timeout, because a pending permission prompt can
          // leave readText() hanging and the button must never feel dead.
          const clip = await new Promise((res) => {
            let done = false;
            const finish = (v) => { if (!done) { done = true; res(v); } };
            try { navigator.clipboard.readText().then(finish, () => finish(null)); }
            catch (_) { finish(null); }
            setTimeout(() => finish(null), 1200);
          });
          if (clip && clip.trim()) { applyPastedTheme(clip); return; }
          // …otherwise arm a one-shot Ctrl/⌘+V listener — the paste EVENT
          // needs no permission in any browser.
          getToast().show({ variant: 'info', title: 'Press Ctrl/⌘+V', message: 'Paste now to apply the copied theme JSON.' });
          const once = (ev) => {
            const text = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
            ev.preventDefault();
            window.removeEventListener('paste', once, true);
            clearTimeout(timer);
            applyPastedTheme(text);
          };
          const timer = setTimeout(() => window.removeEventListener('paste', once, true), 20000);
          window.addEventListener('paste', once, true);
        })();
      }
    });

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            // Hand off to the theme editor — it sets the imported file
            // as the new baseline, clears knob overrides, persists to
            // localStorage, and re-renders the page in one atomic step.
            const editor = window.LetbeThemeEditor;
            if (!editor) throw new Error('Theme editor not loaded.');
            editor.importJson(data);
            getToast().show({
              variant: 'success',
              title: 'Tokens imported',
              message: 'New baseline set. Existing knob overrides cleared. To persist: save this file to tokens/source-tokens.json and run node scripts/build-tokens.js.',
            });
          } catch (err) {
            getToast().show({ variant: 'danger', title: 'Import failed', message: err.message });
            console.error(err);
          }
        };
        reader.onerror = () => getToast().show({ variant: 'danger', title: 'Read error', message: 'Could not read file.' });
        reader.readAsText(file);
        fileInput.value = '';
      });
    }
  }

  // ─── Wire up sidebar + mobile menu ──
  function wireSidebar() {
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('gallery-sidebar');
    const overlay = document.getElementById('menu-overlay');
    if (!menuBtn || !sidebar || !overlay) return;

    const openSidebar = () => {
      sidebar.classList.add('gallery-sidebar--open');
      overlay.classList.add('gallery-overlay--visible');
    };
    const closeSidebar = () => {
      sidebar.classList.remove('gallery-sidebar--open');
      overlay.classList.remove('gallery-overlay--visible');
    };

    menuBtn.addEventListener('click', () => {
      sidebar.classList.contains('gallery-sidebar--open') ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);

    // Close sidebar on mobile after clicking any link
    sidebar.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });

    // Filter the component list as the user types in the sidebar search.
    // Matches against the item's label text (case-insensitive substring).
    // Hides whole groups when none of their items match — keeps the
    // empty group label from sitting alone with nothing under it.
    // Cmd/Ctrl-/ focuses the search from anywhere on the page.
    const searchInput = document.getElementById('gallery-sidebar-search');
    if (searchInput) {
      const groups = sidebar.querySelectorAll('.lb-nav__group');
      const filterList = () => {
        const q = searchInput.value.toLowerCase().trim();
        groups.forEach((group) => {
          let visible = 0;
          group.querySelectorAll('.lb-nav__item').forEach((item) => {
            const label = item.querySelector('.lb-nav__item-label');
            const text = (label ? label.textContent : item.textContent || '').toLowerCase();
            const match = !q || text.includes(q);
            item.hidden = !match;
            if (match) visible++;
          });
          // Hide the whole group (label + items) when nothing matches
          group.hidden = visible === 0;
        });
      };
      searchInput.addEventListener('input', filterList);

      // Global shortcut: Cmd/Ctrl-/ focuses the sidebar search.
      // (Cmd-K is owned by Command Palette; / alone collides with type-
      // to-find in some browsers; Ctrl-/ is unused and discoverable.)
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      });
    }
  }

  // ─── Code-snippet display ──
  //
  // Adds a collapsible "Show code" panel after every demo (.gallery-row).
  // Auto-extracts the demo's HTML, formats it readably, html-escapes
  // the angle brackets, and renders inside <pre><code> with a Copy
  // button. Hidden by default — click to expand.
  //
  // Note on icon hydration: by the time this runs, lb.js has already
  // injected SVGs into [data-lb-icon] spans. The formatter detects
  // those spans and treats them as empty ("self-closing") so the
  // rendered code shows the original <span data-lb-icon="…"></span>
  // markup the consumer would actually write, not the post-hydration
  // SVG mess.

  const VOID_TAGS = new Set([
    'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr',
  ]);

  // Build raw HTML-as-text. The output is set via textContent (NOT
  // innerHTML) downstream, so the browser renders the angle brackets
  // as visible characters instead of parsing them and creating phantom
  // rendered components inside the panel.
  function _formatNode(node, depth, lines) {
    const indent = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) lines.push(indent + text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    const attrs = [];
    for (const attr of node.attributes) {
      // Skip attributes lb.js adds at runtime so the snippet shows
      // original markup, not hydration artifacts.
      if (attr.name.startsWith('aria-controls') && /^lb-/.test(attr.value)) continue;
      if (attr.name.startsWith('aria-labelledby') && /^lb-/.test(attr.value)) continue;
      if (attr.name === 'aria-describedby' && /^tooltip-/.test(attr.value)) continue;
      if (attr.name === 'id' && /^lb-/.test(attr.value)) continue;
      attrs.push(`${attr.name}="${attr.value}"`);
    }
    const tagOpen = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;

    if (VOID_TAGS.has(tag)) {
      lines.push(indent + tagOpen);
      return;
    }

    // [data-lb-icon] spans get hydrated with SVG children at runtime.
    // Render them as empty so the snippet shows the original markup.
    const isIconSlot = node.hasAttribute('data-lb-icon');
    if (isIconSlot) {
      lines.push(indent + tagOpen + `</${tag}>`);
      return;
    }

    const children = Array.from(node.childNodes).filter((c) => {
      if (c.nodeType === Node.TEXT_NODE && !c.textContent.trim()) return false;
      return true;
    });

    if (children.length === 0) {
      lines.push(indent + tagOpen + `</${tag}>`);
      return;
    }

    // Inline single text child if it fits on one line
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
      const text = children[0].textContent.trim();
      if (text.length < 60 && !text.includes('\n')) {
        lines.push(indent + tagOpen + text + `</${tag}>`);
        return;
      }
    }

    lines.push(indent + tagOpen);
    children.forEach((child) => _formatNode(child, depth + 1, lines));
    lines.push(indent + `</${tag}>`);
  }

  function _extractCodeFromBlocks(blocks) {
    const lines = [];
    blocks.forEach((blk) => {
      if (blk.nodeType === Node.ELEMENT_NODE) {
        _formatNode(blk, 0, lines);
      }
    });
    return lines.join('\n');
  }

  // Skip patterns: not part of the demo, just the section's prose
  function _isProse(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.matches('p.gallery-section__desc')) return true;
    if (el.matches('hr.gallery-desc-divider')) return true;
    if (el.matches('.gallery-label')) return true;
    // Explicit opt-out: illustrative compositions (diagrams built from DS
    // components) are not copy-paste demos — no code panel for them.
    if (el.hasAttribute('data-lb-no-code')) return true;
    return false;
  }

  // Collect demo blocks for a single H2 section: everything between this
  // H2 and the next H2 (or end), minus the description/label prose.
  function _collectDemoBlocks(h2) {
    const blocks = [];
    let lastInsertAfter = h2;
    let cur = h2.nextElementSibling;
    while (cur && !cur.matches('h2.gallery-section__title')) {
      if (!_isProse(cur)) {
        blocks.push(cur);
        lastInsertAfter = cur;
      } else {
        // Description/label still moves the insert anchor forward —
        // we want the panel to come AFTER the last prose if no demo
        // blocks exist (rare but safe)
        if (!blocks.length) lastInsertAfter = cur;
      }
      cur = cur.nextElementSibling;
    }
    return { blocks, lastInsertAfter };
  }

  // Build a code panel using the .lb-accordion DS component.
  // Single-item accordion (one trigger + one panel) — inherits the
  // chevron animation, dividers, hover state, and aria-expanded
  // semantics from the DS, so this stays in lockstep with future
  // Accordion improvements without per-page maintenance.
  function _buildCodePanel(code) {
    const wrap = document.createElement('div');
    wrap.className = 'lb-accordion gallery-code';

    const item = document.createElement('div');
    item.className = 'lb-accordion__item';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lb-accordion__trigger';
    trigger.setAttribute('aria-expanded', 'false');
    // Leading code icon (Lucide </>). Same .lb-accordion__icon slot
    // pattern used by the theme editor accordions, so it inherits
    // sizing, color, and disabled-state cascade for free.
    trigger.innerHTML = `
      <span class="lb-accordion__icon" aria-hidden="true" data-lb-icon="code"></span>
      <span class="lb-accordion__trigger-label">Show code</span>
      <span class="lb-accordion__indicators">
        <span class="lb-accordion__chevron" aria-hidden="true" data-lb-icon="chevron-down" style="width: 1.25rem; height: 1.25rem;"></span>
      </span>
    `;
    item.appendChild(trigger);

    const panel = document.createElement('div');
    panel.className = 'lb-accordion__panel';
    panel.hidden = true;

    const inner = document.createElement('div');
    inner.className = 'lb-accordion__panel-inner gallery-code__body';

    const pre = document.createElement('pre');
    pre.className = 'gallery-code__pre';
    const codeEl = document.createElement('code');
    // textContent (not innerHTML) — angle brackets stay visible as
    // characters instead of being parsed into rendered components.
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    inner.appendChild(pre);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'lb-btn lb-btn--secondary lb-btn--small gallery-code__copy';
    copyBtn.innerHTML = `
      <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="copy"></span>
      Copy
    `;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.innerHTML = `
          <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="check"></span>
          Copied
        `;
        if (window.LB) window.LB.initIcons(copyBtn);
        setTimeout(() => {
          copyBtn.innerHTML = `
            <span class="lb-btn__icon" aria-hidden="true" data-lb-icon="copy"></span>
            Copy
          `;
          if (window.LB) window.LB.initIcons(copyBtn);
        }, 1800);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });
    inner.appendChild(copyBtn);

    panel.appendChild(inner);
    item.appendChild(panel);
    wrap.appendChild(item);

    // Mount the Accordion behaviour. LB.Accordion handles aria-expanded,
    // hidden toggle, chevron rotation via the component's own CSS, and
    // single-open mode within this single-item wrap.
    if (window.LB && typeof window.LB.Accordion === 'function') {
      new window.LB.Accordion(wrap);
    }

    return wrap;
  }

  function buildCodePanels() {
    // One code panel per H2-headed demo section. This catches every
    // page consistently — those that wrap demos in .gallery-row AND
    // those (Menu, Card, Select, …) that put bare lb-* elements right
    // after the heading.
    document.querySelectorAll('main h2.gallery-section__title').forEach((h2) => {
      if (h2.dataset.lbCodeDone) return;
      h2.dataset.lbCodeDone = '1';

      const { blocks, lastInsertAfter } = _collectDemoBlocks(h2);
      if (!blocks.length) return;

      const code = _extractCodeFromBlocks(blocks);
      if (!code.trim()) return;

      const panel = _buildCodePanel(code);
      lastInsertAfter.parentNode.insertBefore(panel, lastInsertAfter.nextSibling);
    });

    // Hydrate the freshly-injected icon spans (caret, copy)
    if (window.LB && typeof window.LB.initIcons === 'function') {
      window.LB.initIcons(document);
    }
  }

  // ─── Main ──
  // Component init is now handled by lb.js on DOMContentLoaded. This script
  // only has to build the shared header + sidebar. If meta.json fails to
  // load, components still work — only the chrome is missing.
  async function init() {
    // Favicon can be injected before anything else — doesn't depend on meta.json
    injectFavicons();
    // Reveal body immediately so the user sees content, even if meta fetch fails
    document.body.classList.add('gallery-ready');

    try {
      const data = await loadMeta();
      buildHeader();
      buildSidebar(data);
      wireSidebar();
      wireHeader();
      // Hydrate [data-lb-icon] elements in the injected header + sidebar,
      // and re-run full init for any other DS components living inside them
      // (safe to call twice — each element stores its instance).
      if (window.LB) {
        if (typeof window.LB.initIcons === 'function') window.LB.initIcons();
        if (typeof window.LB.init === 'function') window.LB.init();
      }
      // Add code panels after demos. Has to run after LB.init() so we
      // can detect [data-lb-icon] spans (and treat them as empty).
      buildCodePanels();
    } catch (err) {
      console.error('Gallery layout init failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Site analytics (letbe.design only) ─────────────────
  // Plausible Analytics — cookieless, no localStorage, no persistent
  // identifier, EU-hosted; what it records is stated on /privacy/.
  // Injected here (site chrome) rather than in 86 <head>s or in lb.js so
  // (a) the DS runtime people vendor never carries analytics code and
  // (b) it runs ONLY on the published domain: local previews, the
  // *.pages.dev alias and forks of this repo send nothing. This is the
  // exact snippet Plausible issues for the site; keep it in sync there.
  (function siteAnalytics() {
    const host = location.hostname;
    if (host !== 'letbe.design' && host !== 'www.letbe.design') return;
    if (document.querySelector('script[src^="https://plausible.io/js/"]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://plausible.io/js/pa-mqXTmiAwFs8vkp3Wvxwml.js';
    document.head.appendChild(s);
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    window.plausible.init = window.plausible.init || function (i) { window.plausible.o = i || {}; };
    // Strip the URL fragment from analytics: #theme= carries the visitor's
    // theme diff and must never reach plausible.io (per the plugin's
    // security disclosure — the server never sees fragments; analytics
    // shouldn't either).
    window.plausible.init({ transformRequest: function (p) { if (p && p.u) p.u = p.u.split('#')[0]; return p; } });
  })();
})();
