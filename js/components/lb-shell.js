/**
 * lb-shell.js — letbe-ds application shell (Stage 4 of the shells program)
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register(). The "inverted L" dashboard skeleton: full-height
 * sidebar + content column (topbar + scrollable content), with:
 *
 *   - Collapse modes (data-lb-shell-collapse): "icon" (default rail),
 *     "offcanvas" (fully hidden), "none".
 *   - Toggle buttons: [data-lb-shell-toggle] — button + aria-expanded
 *     (+ aria-controls) per the APG disclosure pattern.
 *   - Keyboard shortcut: ctrl/cmd+B (modifier-based, so WCAG 2.1.4
 *     single-key rules don't apply).
 *   - State persistence: localStorage under data-lb-shell-key
 *     (default "lb-shell"); stores collapsed flag + sidebar width.
 *   - Mobile (≤768px): the sidebar becomes a modal drawer (role=dialog,
 *     aria-modal, focus trap, Esc, scroll-lock, scrim, return focus —
 *     the same spec as LB.Header's drawer), UNLESS the shell opts into
 *     the bottom-bar pattern with .lb-shell--mobile-bar + a
 *     .lb-shell__bottombar nav (one-handed reach on mobile).
 *   - Opt-in drag-resize (data-lb-shell-resizable): a thin drag layer
 *     on the sidebar edge — clamps 14–22rem, drag-to-edge collapses,
 *     arrow keys resize (role=separator semantics,
 *     consistent with LB.Resizable's handle), width persisted.
 *     (LB.Resizable itself is percentage-based — wrong model for a
 *     fixed-width sidebar — so the shell reuses its handle semantics,
 *     not its engine.)
 *   - Nested nav groups: [data-lb-shell-sub] disclosure buttons toggle
 *     their sibling .lb-shell__sub (one level, chevron rotates via CSS).
 *
 * a11y notes baked into the DEMO markup (not JS): sidebar nav is
 * <nav aria-label>, content column is <main tabindex="-1"> (skip-link
 * target must receive focus programmatically), the topbar is NOT a
 * banner landmark (nested headers lose the role by spec — intentional).
 *
 * Dependencies — public LB API only (LB.register, LB.initIcons).
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-shell] LB is not defined — load js/lb.js before js/components/lb-shell.js');
    return;
  }
  const LB = window.LB;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const MIN_W = 14; // rem — verified resize clamp convention
  const MAX_W = 22; // rem
  const EDGE_COLLAPSE_W = 9; // rem — drag below this collapses (drag-to-edge)

  // Self-contained focus trap (same deliberate duplication as lb-header —
  // component modules stay dependency-light on lb.js internals).
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

  class Shell {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-shell');

      this._sidebar = el.querySelector('.lb-shell__sidebar');
      // The content pane is the shell's scroll container — keyboard users
      // need a tab stop to scroll it.
      const scroller = el.querySelector('.lb-shell__main');
      if (scroller && !scroller.hasAttribute('tabindex')) scroller.setAttribute('tabindex', '0');
      this._toggles = Array.from(el.querySelectorAll('[data-lb-shell-toggle]'));
      this._collapseMode = el.dataset.lbShellCollapse || 'icon';
      if (!el.dataset.lbShellCollapse) el.dataset.lbShellCollapse = this._collapseMode;
      this._key = el.dataset.lbShellKey || 'lb-shell';
      this._mobileBar = el.classList.contains('lb-shell--mobile-bar');

      // ── Restore persisted state ──
      // A saved boolean wins in BOTH directions (a markup-default
      // .lb-shell--collapsed must un-collapse if the user expanded it
      // last session); no saved value keeps the markup default.
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this._key)) || {}; } catch (e) { /* ignore */ }
      if (this._collapseMode !== 'none' && typeof saved.collapsed === 'boolean') {
        this.el.classList.toggle('lb-shell--collapsed', saved.collapsed);
      }
      if (saved.width) this._setWidth(saved.width, false);

      // ── Toggle buttons ──
      const sidebarId = this._sidebar ? (this._sidebar.id || this._uid('shell-sidebar')) : null;
      if (this._sidebar) this._sidebar.id = sidebarId;
      this._toggles.forEach((btn) => {
        btn.setAttribute('aria-expanded', String(!this.isCollapsed()));
        if (sidebarId) btn.setAttribute('aria-controls', sidebarId);
        btn.addEventListener('click', () => {
          if (this._isMobile() && !this._mobileBar) this.toggleDrawer();
          else this.toggle();
        });
      });

      // ── ctrl/cmd+B ──
      this._onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          if (this._isMobile() && !this._mobileBar) this.toggleDrawer();
          else this.toggle();
        } else if (e.key === 'Escape' && this._drawerOpen) {
          this.closeDrawer();
        }
      };
      document.addEventListener('keydown', this._onKey);

      // ── Nested nav disclosure ──
      el.querySelectorAll('[data-lb-shell-sub]').forEach((btn) => {
        const sub = btn.parentElement ? btn.parentElement.querySelector('.lb-shell__sub') : null;
        if (!sub) return;
        const subId = sub.id || this._uid('shell-sub');
        sub.id = subId;
        const startOpen = btn.getAttribute('aria-expanded') === 'true';
        sub.hidden = !startOpen;
        btn.setAttribute('aria-expanded', String(startOpen));
        btn.setAttribute('aria-controls', subId);
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          sub.hidden = open;
        });
      });

      // ── Mobile drawer wiring (skip in bottom-bar mode) ──
      this._drawerOpen = false;
      this._releaseTrap = null;
      this._prevFocus = null;
      if (this._sidebar && !this._mobileBar) {
        this._scrim = el.querySelector('[data-lb-shell-scrim]');
        if (!this._scrim) {
          this._scrim = document.createElement('div');
          this._scrim.className = 'lb-shell__scrim';
          this._scrim.setAttribute('data-lb-shell-scrim', '');
          this._scrim.hidden = true;
          el.appendChild(this._scrim);
        }
        this._scrim.addEventListener('click', () => this.closeDrawer());
        this._sidebar.addEventListener('click', (e) => {
          if (this._drawerOpen && e.target.closest('a[href]')) this.closeDrawer();
        });
        this._onResize = () => { if (this._drawerOpen && !this._isMobile()) this.closeDrawer(); };
        window.addEventListener('resize', this._onResize);
      }

      // ── Opt-in drag-resize ──
      if (this._sidebar && el.hasAttribute('data-lb-shell-resizable') && this._collapseMode !== 'none') {
        this._buildResizeHandle();
      }

      if (LB.initIcons) LB.initIcons(this.el);
    }

    _uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8); }
    _isMobile() { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
    _remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }

    _persist(patch) {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this._key)) || {}; } catch (e) { /* ignore */ }
      try { localStorage.setItem(this._key, JSON.stringify(Object.assign(saved, patch))); } catch (e) { /* ignore */ }
    }

    _setWidth(rem, persist = true) {
      const clamped = Math.min(MAX_W, Math.max(MIN_W, rem));
      this.el.style.setProperty('--lb-shell-sidebar-w', clamped + 'rem');
      if (this._resizeHandle) this._resizeHandle.setAttribute('aria-valuenow', String(Math.round(clamped * 10) / 10));
      if (persist) this._persist({ width: clamped });
    }

    // ── Collapse (desktop) ──
    isCollapsed() { return this.el.classList.contains('lb-shell--collapsed'); }
    setCollapsed(collapsed) {
      if (this._collapseMode === 'none') return;
      this.el.classList.toggle('lb-shell--collapsed', collapsed);
      this._toggles.forEach((b) => b.setAttribute('aria-expanded', String(!collapsed)));
      this._persist({ collapsed });
      this.el.dispatchEvent(new CustomEvent('lb-shell-collapse', { bubbles: true, detail: { collapsed } }));
    }
    toggle() { this.setCollapsed(!this.isCollapsed()); }

    // ── Mobile drawer (modal — same spec as the header drawer) ──
    openDrawer() {
      if (this._drawerOpen || !this._sidebar || this._mobileBar) return;
      this._prevFocus = document.activeElement;
      this.el.classList.add('lb-shell--drawer-open');
      this._scrim.hidden = false;
      this._sidebar.setAttribute('role', 'dialog');
      this._sidebar.setAttribute('aria-modal', 'true');
      if (!this._sidebar.hasAttribute('aria-label')) this._sidebar.setAttribute('aria-label', 'Navigation');
      document.documentElement.classList.add('lb-scroll-locked');
      this._toggles.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      this._drawerOpen = true;
      this._releaseTrap = trapFocus(this._sidebar);
      const target = this._sidebar.querySelector(FOCUSABLE);
      if (target) target.focus();
      this.el.dispatchEvent(new CustomEvent('lb-shell-drawer-open', { bubbles: true }));
    }
    closeDrawer() {
      if (!this._drawerOpen) return;
      this.el.classList.remove('lb-shell--drawer-open');
      this._scrim.hidden = true;
      this._sidebar.removeAttribute('role');
      this._sidebar.removeAttribute('aria-modal');
      document.documentElement.classList.remove('lb-scroll-locked');
      this._toggles.forEach((b) => b.setAttribute('aria-expanded', String(!this.isCollapsed())));
      this._drawerOpen = false;
      if (this._releaseTrap) { this._releaseTrap(); this._releaseTrap = null; }
      if (this._prevFocus && this._prevFocus.focus) this._prevFocus.focus();
      this.el.dispatchEvent(new CustomEvent('lb-shell-drawer-close', { bubbles: true }));
    }
    toggleDrawer() { this._drawerOpen ? this.closeDrawer() : this.openDrawer(); }

    // ── Drag-resize (consumes LB.Resizable's separator semantics) ──
    _buildResizeHandle() {
      const handle = document.createElement('div');
      handle.className = 'lb-shell__resize';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', 'Resize sidebar');
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('aria-valuemin', String(MIN_W));
      handle.setAttribute('aria-valuemax', String(MAX_W));
      const currentW = parseFloat(getComputedStyle(this.el).getPropertyValue('--lb-shell-sidebar-w')) || MIN_W;
      handle.setAttribute('aria-valuenow', String(Math.min(MAX_W, Math.max(MIN_W, currentW))));
      this._sidebar.appendChild(handle);
      this._resizeHandle = handle;

      let startX = 0, startW = 0, dragging = false;
      const rightSide = this.el.classList.contains('lb-shell--right');

      const onMove = (e) => {
        if (!dragging) return;
        const dx = (e.clientX - startX) * (rightSide ? -1 : 1);
        const rem = (startW + dx) / this._remPx();
        if (rem < EDGE_COLLAPSE_W) { // drag-to-edge collapses (Nuxt UI pattern)
          if (!this.isCollapsed()) this.setCollapsed(true);
          return;
        }
        if (this.isCollapsed()) this.setCollapsed(false);
        this._setWidth(rem, false);
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!this.isCollapsed()) {
          const w = parseFloat(getComputedStyle(this.el).getPropertyValue('--lb-shell-sidebar-w'));
          if (Number.isFinite(w)) this._persist({ width: w });
        }
      };
      handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        startX = e.clientX;
        startW = this._sidebar.getBoundingClientRect().width;
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        e.preventDefault();
      });
      // Arrow keys resize; Enter/Space toggles collapse (separator convention).
      handle.addEventListener('keydown', (e) => {
        const cur = parseFloat(getComputedStyle(this.el).getPropertyValue('--lb-shell-sidebar-w')) || 16;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const dir = (e.key === 'ArrowRight' ? 1 : -1) * (rightSide ? -1 : 1);
          if (this.isCollapsed()) { if (dir > 0) this.setCollapsed(false); return; }
          this._setWidth(cur + dir * 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggle();
        }
      });
    }

    destroy() {
      document.removeEventListener('keydown', this._onKey);
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      if (this._releaseTrap) this._releaseTrap();
      document.documentElement.classList.remove('lb-scroll-locked');
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Shell = Shell;
  LB.register('shell', Shell, '[data-lb-shell]');
})();
