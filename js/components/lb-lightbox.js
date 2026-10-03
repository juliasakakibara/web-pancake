/* ─────────────────────────────────────────────────────────────
 * LB.Lightbox — image viewer built on LB.Modal (opt-in module)
 * ─────────────────────────────────────────────────────────────
 * Load js/lb.js first, then this file. Any <a href="image" data-lb-lightbox>
 * opens in a modal image viewer instead of navigating. Everything is the
 * canonical lb-modal anatomy — backdrop, dialog, header, body, footer —
 * with lightbox chrome on top; LB.Modal owns open/close, focus trap,
 * scroll lock, Esc and backdrop-click.
 *
 * What it does:
 *   - Grouped navigation: prev/next buttons + ←/→ arrow keys walk the
 *     group, wrapping at the ends; a 1-of-N counter sits in the footer.
 *     The group is: links sharing this link's data-lb-lightbox VALUE
 *     (e.g. data-lb-lightbox="press") — or, for bare attributes, the
 *     links inside the closest [data-lb-gallery] container — or, with
 *     neither, every bare data-lb-lightbox link on the page.
 *   - Caption: headline + optional subline under the header title.
 *     Sources, in order: data-lb-caption (+ data-lb-caption-sub) on the
 *     link, the closest <figure>'s <figcaption>, the thumbnail's alt.
 *   - The dialog hugs the image: each step sizes the <img> explicitly to
 *     the largest fit inside the viewport caps (mirrored in the
 *     .lb-lightbox CSS), so the chrome wraps the picture instead of
 *     letterboxing it; steps cross-fade (skipped under
 *     prefers-reduced-motion), neighbours are preloaded, and a resize
 *     refits the current image.
 *   - Full screen on phones (the CSS ≤640px block), blurred backdrop.
 *
 * Modifier clicks (cmd/ctrl/shift/middle) fall through to the browser so
 * open-in-new-tab keeps working. The engine boundary: this is chrome +
 * state only — images are plain <a href>/<img>, no loader, no zoom
 * library; bring your own if you need one.
 */
(function () {
  'use strict';
  if (!window.LB) { console.warn('[letbe-ds] lb-lightbox.js needs js/lb.js loaded first.'); return; }

  const SEL = 'a[data-lb-lightbox]';
  const IMG_RE = /\.(avif|webp|jpe?g|png|gif|svg)(\?.*)?$/i;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  function tokenMs(token) {
    if (reduced()) return 0;
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000) || 0;
  }

  class Lightbox {
    constructor() {
      this._items = [];
      this._index = 0;
      this._switching = 0;
      this._open = false;
      this._build();
    }

    _build() {
      const host = document.createElement('div');
      host.innerHTML =
        '<div class="lb-modal-backdrop lb-lightbox" data-lb-modal style="display:none;" role="dialog" aria-modal="true" aria-labelledby="lb-lightbox-title">' +
          '<div class="lb-modal lb-modal--large lb-lightbox__dialog">' +
            '<div class="lb-modal__header">' +
              '<div class="lb-modal__header-title lb-lightbox__titles">' +
                '<h3 class="lb-modal__title" id="lb-lightbox-title"></h3>' +
                '<p class="lb-lightbox__sub"></p>' +
              '</div>' +
              '<button class="lb-modal__close" aria-label="Close"><span data-lb-icon="x"></span></button>' +
            '</div>' +
            '<div class="lb-modal__body lb-lightbox__body"><img class="lb-lightbox__img" alt=""></div>' +
            '<div class="lb-modal__footer lb-lightbox__footer">' +
              '<span class="lb-lightbox__count" aria-live="polite"></span>' +
              '<span class="lb-lightbox__nav">' +
                '<button class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--medium" type="button" data-lb-lightbox-prev aria-label="Previous image"><span data-lb-icon="chevron-left"></span></button>' +
                '<button class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--medium" type="button" data-lb-lightbox-next aria-label="Next image"><span data-lb-icon="chevron-right"></span></button>' +
              '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      this.el = host.firstChild;
      document.body.appendChild(this.el);
      if (LB.initIcons) LB.initIcons(this.el);

      this._img = this.el.querySelector('.lb-lightbox__img');
      this._title = this.el.querySelector('#lb-lightbox-title');
      this._sub = this.el.querySelector('.lb-lightbox__sub');
      this._count = this.el.querySelector('.lb-lightbox__count');
      this._nav = this.el.querySelector('.lb-lightbox__nav');

      this.el.querySelector('[data-lb-lightbox-prev]').addEventListener('click', () => this.show(this._index - 1));
      this.el.querySelector('[data-lb-lightbox-next]').addEventListener('click', () => this.show(this._index + 1));

      // open-state tracked via Modal's own events — never its inline styles
      this.el.addEventListener('lb-modal-open', () => { this._open = true; });
      this.el.addEventListener('lb-modal-close', () => { this._open = false; });

      this._onKey = (e) => {
        if (!this._open) return;
        if (e.key === 'ArrowRight') this.show(this._index + 1);
        if (e.key === 'ArrowLeft') this.show(this._index - 1);
      };
      document.addEventListener('keydown', this._onKey);

      let t;
      this._onResize = () => {
        if (!this._open) return;
        clearTimeout(t);
        t = setTimeout(() => this.show(this._index, true), 120);
      };
      window.addEventListener('resize', this._onResize);
    }

    _caption(link) {
      const head = link.getAttribute('data-lb-caption');
      if (head) return { head, sub: link.getAttribute('data-lb-caption-sub') || '' };
      const fig = link.closest('figure');
      const cap = fig && fig.querySelector('figcaption');
      if (cap) return { head: cap.textContent.trim(), sub: link.getAttribute('data-lb-caption-sub') || '' };
      const im = link.querySelector('img');
      return { head: (im && im.alt) || '', sub: '' };
    }

    _group(link) {
      const name = link.getAttribute('data-lb-lightbox');
      let links;
      if (name) links = document.querySelectorAll(`a[data-lb-lightbox="${CSS.escape(name)}"]`);
      else {
        const scope = link.closest('[data-lb-gallery]') || document;
        links = Array.from(scope.querySelectorAll(SEL)).filter((a) => !a.getAttribute('data-lb-lightbox'));
      }
      return Array.from(links).filter((a) => IMG_RE.test(a.getAttribute('href') || '')).map((a) => {
        const c = this._caption(a);
        const im = a.querySelector('img');
        return { href: a.getAttribute('href'), alt: (im && im.alt) || c.head, head: c.head, sub: c.sub };
      });
    }

    // Largest size for a natural w×h inside the viewport caps. The
    // numbers mirror the .lb-lightbox CSS: dialog max-width
    // min(96vw, 90rem) minus ~3rem chrome; height minus ~14rem of
    // header/footer chrome (11rem in the ≤640px full-screen layout).
    _fit(natW, natH) {
      const vw = window.innerWidth, vh = window.innerHeight, r = rem();
      const mobile = vw <= 640;
      const maxW = mobile ? vw : Math.min(vw * 0.96, 90 * r) - 3 * r;
      const maxH = mobile ? vh - 11 * r : vh - 14 * r;
      const s = Math.min(maxW / natW, maxH / natH, 1);
      return { w: Math.round(natW * s), h: Math.round(natH * s) };
    }

    _load(src) {
      return new Promise((resolve) => {
        const p = new Image();
        p.onload = () => resolve({ w: p.naturalWidth, h: p.naturalHeight });
        p.onerror = () => resolve({ w: 1600, h: 1000 }); // broken image: a sane frame, alt text shows
        p.src = src;
      });
    }

    _place(it, size) {
      this._img.style.width = size.w + 'px';
      this._img.style.height = size.h + 'px';
      this._img.src = it.href;
      this._img.alt = it.alt;
      this._title.textContent = it.head;
      this._sub.textContent = it.sub;
      this._sub.hidden = !it.sub;
      this._count.textContent = `${this._index + 1} of ${this._items.length}`;
    }

    show(i, instant) {
      if (!this._items.length) return;
      this._index = (i + this._items.length) % this._items.length;
      const it = this._items[this._index];
      const ticket = ++this._switching;
      this._load(it.href).then((nat) => {
        if (ticket !== this._switching) return;
        const size = this._fit(nat.w, nat.h);
        if (instant || reduced()) {
          this._place(it, size);
          this._img.classList.remove('lb-lightbox__img--switching');
          return;
        }
        this._img.classList.add('lb-lightbox__img--switching');
        setTimeout(() => {
          if (ticket !== this._switching) return;
          this._place(it, size);
          setTimeout(() => {
            if (ticket === this._switching) this._img.classList.remove('lb-lightbox__img--switching');
          }, tokenMs('--lb-animation-dur-gentle'));
        }, tokenMs('--lb-animation-dur-normal'));
      });
      // warm the neighbours
      if (this._items.length > 1) {
        [1, -1].forEach((d) => {
          const n = this._items[(this._index + d + this._items.length) % this._items.length];
          const p = new Image(); p.src = n.href;
        });
      }
    }

    open(link) {
      this._items = this._group(link);
      if (!this._items.length) return;
      const href = link.getAttribute('href');
      const start = this._items.findIndex((it) => it.href === href);
      this._nav.hidden = this._items.length < 2;
      this.show(start < 0 ? 0 : start, true);
      LB.Modal.open(this.el);
    }

    destroy() {
      document.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      this.el.remove();
    }
  }

  // Singleton chrome, built lazily on first open.
  let _instance = null;
  function instance() {
    if (!_instance) _instance = new Lightbox();
    return _instance;
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest(SEL);
    if (!link || !IMG_RE.test(link.getAttribute('href') || '')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    instance().open(link);
  });

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  // Programmatic surface: LB.Lightbox.open(linkEl). No auto-init
  // selector — the viewer is a delegated singleton, not per-element.
  LB.Lightbox = { open: (link) => instance().open(link), instance };
  if (LB.register) LB.register('lightbox', Lightbox);
})();
