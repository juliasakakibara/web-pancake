/**
 * lb-header.js — letbe-ds site/app navigation header
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register(). One composed "block" covering the three base header
 * compositions the 2026 research converged on:
 *   - contained bar   (default)     — logo · nav · actions
 *   - mega-menu        (--mega items) — categorized full-width panels
 *   - floating pill    (--floating)  — centered rounded container
 *
 * Behaviour (all a11y-correct per W3C ARIA APG / WCAG, from the Stage-1
 * research):
 *   - Mega-menu items are DISCLOSURE widgets (button + aria-expanded),
 *     NOT role=menu — preserves link semantics. Escape closes the panel
 *     and returns focus to the trigger. Outside-click closes. One open
 *     at a time.
 *   - Mobile drawer is a real modal: role=dialog + aria-modal=true +
 *     focus trap + scroll-lock + Escape + return-focus.
 *   - Scroll state: a rAF-throttled listener toggles `--scrolled` past a
 *     threshold, driving transparent→solid and shrink. Only attached
 *     when the header opts into `--transparent` or `--shrink`.
 *   - CSS gotcha handled in docs, not here: a sticky header must be a
 *     direct child of the scroll root.
 *
 * Dependencies — public LB API only (LB.register, LB.init, LB.initIcons).
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-header] LB is not defined — load js/lb.js before js/components/lb-header.js');
    return;
  }
  const LB = window.LB;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Small self-contained focus trap — keeps Tab / Shift+Tab inside `el`.
  // Returns a release fn. (Header module stays dependency-light.)
  function trapFocus(el) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(el.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }

  class Header {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-header');

      // ── Elements ──
      this._inner   = el.querySelector('[data-lb-header-inner]') || el.querySelector('.lb-header__inner');
      this._toggle  = el.querySelector('[data-lb-header-toggle]');
      this._drawer  = el.querySelector('[data-lb-header-drawer]');
      this._drawerClose = el.querySelector('[data-lb-header-drawer-close]');
      this._megaBtns = Array.from(el.querySelectorAll('[data-lb-header-mega]'));

      // ── Mobile drawer wiring ──
      this._drawerOpen = false;
      this._releaseTrap = null;
      this._prevFocus = null;
      if (this._toggle && this._drawer) {
        this._drawer.setAttribute('role', 'dialog');
        this._drawer.setAttribute('aria-modal', 'true');
        if (!this._drawer.hasAttribute('aria-label') && !this._drawer.hasAttribute('aria-labelledby')) {
          this._drawer.setAttribute('aria-label', 'Menu');
        }
        this._drawer.hidden = true;
        this._toggle.setAttribute('aria-haspopup', 'dialog');
        this._toggle.setAttribute('aria-expanded', 'false');
        this._toggle.addEventListener('click', () => this.toggleDrawer());
        if (this._drawerClose) this._drawerClose.addEventListener('click', () => this.closeDrawer());
        // Scrim (auto-injected) closes on click.
        this._scrim = el.querySelector('[data-lb-header-scrim]');
        if (!this._scrim) {
          this._scrim = document.createElement('div');
          this._scrim.className = 'lb-header__scrim';
          this._scrim.setAttribute('data-lb-header-scrim', '');
          this._scrim.hidden = true;
          el.appendChild(this._scrim);
        }
        this._scrim.addEventListener('click', () => this.closeDrawer());
        // Close drawer when a link inside it is followed.
        this._drawer.addEventListener('click', (e) => {
          if (e.target.closest('a[href]')) this.closeDrawer();
        });
        // Close on resize up to desktop so state can't get stuck open.
        this._onResize = () => { if (this._drawerOpen && !this._isMobile()) this.closeDrawer(); };
        window.addEventListener('resize', this._onResize);
      }

      // ── Mega-menu disclosure wiring ──
      this._openMega = null;
      this._megaBtns.forEach((btn) => {
        const panel = this._megaPanelFor(btn);
        if (!panel) return;
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        if (panel.id) btn.setAttribute('aria-controls', panel.id);
        panel.hidden = true;
        btn.addEventListener('click', (e) => { e.preventDefault(); this.toggleMega(btn); });
      });
      if (this._megaBtns.length) {
        this._onMegaOutside = (e) => {
          if (this._openMega && !this._openMega.btn.parentElement.contains(e.target)) this.closeMega();
        };
        document.addEventListener('click', this._onMegaOutside);
      }

      // ── Shared Escape handler (drawer + mega) ──
      this._onKey = (e) => {
        if (e.key !== 'Escape') return;
        if (this._drawerOpen) { this.closeDrawer(); }
        else if (this._openMega) { const t = this._openMega.btn; this.closeMega(); t.focus(); }
      };
      document.addEventListener('keydown', this._onKey);

      // ── Scroll state (only if the header reacts to scroll) ──
      this._reactsToScroll = el.classList.contains('lb-header--transparent') || el.classList.contains('lb-header--shrink');
      if (this._reactsToScroll) {
        this._threshold = parseInt(el.dataset.lbScrollThreshold, 10);
        if (!Number.isFinite(this._threshold)) this._threshold = 8;
        this._raf = null;
        this._onScroll = () => {
          if (this._raf) return;
          this._raf = requestAnimationFrame(() => {
            this._raf = null;
            const scrolled = window.scrollY > this._threshold;
            this.el.classList.toggle('lb-header--scrolled', scrolled);
          });
        };
        window.addEventListener('scroll', this._onScroll, { passive: true });
        this._onScroll(); // set initial state
      }

      if (LB.initIcons) LB.initIcons(this.el);
    }

    _megaPanelFor(btn) {
      // Panel is the sibling [data-lb-header-mega-panel] within the same item.
      const item = btn.closest('.lb-header__item') || btn.parentElement;
      return item ? item.querySelector('[data-lb-header-mega-panel]') : null;
    }

    _isMobile() {
      return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    // ── Mobile drawer ──
    openDrawer() {
      if (this._drawerOpen || !this._drawer) return;
      this._prevFocus = document.activeElement;
      this._drawer.hidden = false;
      this._scrim.hidden = false;
      this.el.classList.add('lb-header--drawer-open');
      document.documentElement.classList.add('lb-scroll-locked');
      this._toggle.setAttribute('aria-expanded', 'true');
      this._drawerOpen = true;
      this._releaseTrap = trapFocus(this._drawer);
      // Focus the first focusable (close button or first link).
      const target = this._drawerClose || this._drawer.querySelector(FOCUSABLE);
      if (target) target.focus();
      this.el.dispatchEvent(new CustomEvent('lb-header-drawer-open', { bubbles: true }));
    }
    closeDrawer() {
      if (!this._drawerOpen) return;
      this._drawer.hidden = true;
      this._scrim.hidden = true;
      this.el.classList.remove('lb-header--drawer-open');
      document.documentElement.classList.remove('lb-scroll-locked');
      this._toggle.setAttribute('aria-expanded', 'false');
      this._drawerOpen = false;
      if (this._releaseTrap) { this._releaseTrap(); this._releaseTrap = null; }
      if (this._prevFocus && this._prevFocus.focus) this._prevFocus.focus();
      this.el.dispatchEvent(new CustomEvent('lb-header-drawer-close', { bubbles: true }));
    }
    toggleDrawer() { this._drawerOpen ? this.closeDrawer() : this.openDrawer(); }
    isDrawerOpen() { return this._drawerOpen; }

    // ── Mega-menu ──
    openMega(btn) {
      const panel = this._megaPanelFor(btn);
      if (!panel) return;
      if (this._openMega && this._openMega.btn !== btn) this.closeMega();
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.closest('.lb-header__item')?.classList.add('lb-header__item--open');
      this._openMega = { btn, panel };
      this.el.dispatchEvent(new CustomEvent('lb-header-mega-open', { bubbles: true, detail: { trigger: btn } }));
    }
    closeMega() {
      if (!this._openMega) return;
      const { btn, panel } = this._openMega;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.closest('.lb-header__item')?.classList.remove('lb-header__item--open');
      this._openMega = null;
      this.el.dispatchEvent(new CustomEvent('lb-header-mega-close', { bubbles: true }));
    }
    toggleMega(btn) {
      const isOpen = this._openMega && this._openMega.btn === btn;
      if (isOpen) this.closeMega(); else this.openMega(btn);
    }

    destroy() {
      document.removeEventListener('keydown', this._onKey);
      if (this._onMegaOutside) document.removeEventListener('click', this._onMegaOutside);
      if (this._onScroll) window.removeEventListener('scroll', this._onScroll);
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      if (this._releaseTrap) this._releaseTrap();
      document.documentElement.classList.remove('lb-scroll-locked');
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Header = Header;
  LB.register('header', Header, '[data-lb-header]');
})();
