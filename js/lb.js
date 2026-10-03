/**
 * letbe-ds — Interactive Component Library
 * Production-ready vanilla JS for all letbe-ds interactive components.
 *
 * Usage:
 *   <script src="js/lb.js"></script>
 *   <script>LB.init();</script>
 *   — or —
 *   new LB.Accordion(element, options);
 *
 * Auto-init: elements with data-lb-* attributes are initialized automatically
 * when LB.init() is called. Manual instantiation is always available.
 */

const LB = (() => {
  // ─── Shared Utilities ──────────────────────────────────────
  let _uid = 0;
  const uid = (prefix = 'lb') => `${prefix}-${++_uid}`;

  const SVG_CHEVRON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const SVG_CLOSE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const SVG_CALENDAR = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';
  const SVG_CLOCK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const SVG_ARROW_LEFT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
  const SVG_ARROW_RIGHT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

  function onClickOutside(el, callback) {
    const handler = (e) => {
      if (!el.contains(e.target)) callback(e);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }

  function trapFocus(container) {
    // Only elements the browser will actually Tab to can be trap edges:
    // a display:none / [hidden] / visibility:hidden candidate (e.g. the
    // lightbox's prev/next in a single-image group) is skipped by the
    // browser, so using it as first/last lets focus walk out of the
    // dialog. Edges are re-resolved on every Tab, since visibility can
    // change while the trap is live.
    const tabbable = () => Array.from(container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const initial = tabbable();
    if (!initial.length) return;
    initial[0].focus();
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const list = tabbable();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }

  // ─── POINTER DRAG ──────────────────────────────────────────
  // Shared lifecycle helper for pointer-event drags. Replaces the
  // hand-rolled pointerdown / setPointerCapture / pointermove / pointerup
  // boilerplate previously duplicated across Resizable, Color Picker,
  // Media playlist reorder, and Timeline (in/out handles + playhead +
  // click-on-lane). Standardises:
  //   - Primary-button-only filter (skip non-primary unless opted out)
  //   - preventDefault on pointerdown
  //   - setPointerCapture so the drag survives the cursor leaving the
  //     captured element's hit area (critical for the timeline's 4px
  //     handle bar + 16px hit area pattern)
  //   - Optional `dragging` class on a target element while drag is
  //     active (Timeline handles, Media playlist row)
  //   - Single rect snapshot on start (callers needing fresh rects
  //     during the drag can call ctx.refreshRect())
  //   - Cleanup of all three terminators (pointerup, pointercancel,
  //     lostpointercapture) so a dropped capture doesn't leak listeners
  //
  // Usage:
  //   pointerDrag(handle, {
  //     onStart(e, ctx) { … return false to cancel },
  //     onMove(e, ctx) { … },
  //     onEnd(e, ctx) { … },
  //     draggingClass: 'lb-timeline__handle--dragging', // optional
  //   });
  //
  // The shared `ctx` object lives across one drag and is passed to each
  // callback. It carries:
  //   ctx.startRect      — captureEl.getBoundingClientRect() on start
  //   ctx.startX, ctx.startY — pointer coords on start (clientX/Y)
  //   ctx.pointerId      — captured pointer id
  //   ctx.refreshRect()  — re-snapshot startRect (rare; layout-shifting
  //                        gestures may need it)
  //   ctx[anything]      — consumer-set state (e.g. dragSrc, srcIdx)
  //
  // The function returns a cleanup `() => void` that removes the
  // pointerdown listener — useful if a consumer needs to teardown.
  function pointerDrag(captureEl, opts) {
    const o = opts || {};
    const onStart = o.onStart;
    const onMove  = o.onMove;
    const onEnd   = o.onEnd;
    const primaryOnly = o.primaryOnly !== false; // default true
    const preventDefaultOnStart = o.preventDefault !== false; // default true
    const draggingClass = o.draggingClass || null;
    const draggingClassTarget = o.draggingClassTarget || captureEl;
    const rectFrom = typeof o.rectFrom === 'function'
      ? o.rectFrom
      : (el) => el.getBoundingClientRect();

    function onPointerDown(e) {
      if (primaryOnly && e.button !== undefined && e.button !== 0) return;
      const ctx = {
        startRect: rectFrom(captureEl),
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        refreshRect: () => { ctx.startRect = rectFrom(captureEl); return ctx.startRect; },
      };
      // onStart can return false to cancel — useful for consumers that
      // need to gate the drag based on hit area or other conditions
      // (e.g. ignoring drag on a nested actions button inside a draggable
      // row).
      if (onStart && onStart(e, ctx) === false) return;
      if (preventDefaultOnStart) e.preventDefault();
      try { captureEl.setPointerCapture(e.pointerId); } catch (_) {}
      if (draggingClass) draggingClassTarget.classList.add(draggingClass);

      function handleMove(ev) {
        if (ev.pointerId !== ctx.pointerId) return;
        if (onMove) onMove(ev, ctx);
      }
      function handleEnd(ev) {
        if (ev && ev.pointerId !== undefined && ev.pointerId !== ctx.pointerId) return;
        if (onEnd) onEnd(ev, ctx);
        try { captureEl.releasePointerCapture(ctx.pointerId); } catch (_) {}
        if (draggingClass) draggingClassTarget.classList.remove(draggingClass);
        captureEl.removeEventListener('pointermove', handleMove);
        captureEl.removeEventListener('pointerup', handleEnd);
        captureEl.removeEventListener('pointercancel', handleEnd);
        captureEl.removeEventListener('lostpointercapture', handleEnd);
      }
      captureEl.addEventListener('pointermove', handleMove);
      captureEl.addEventListener('pointerup', handleEnd);
      captureEl.addEventListener('pointercancel', handleEnd);
      captureEl.addEventListener('lostpointercapture', handleEnd);
    }
    captureEl.addEventListener('pointerdown', onPointerDown);
    return () => captureEl.removeEventListener('pointerdown', onPointerDown);
  }

  /* Edge auto-scroll companion for pointerDrag: while a drag is active,
     scrolls `scroller` whenever the pointer sits within `edge` px of its
     bounds, calling onTick after each frame so consumers re-evaluate
     drop targets as content slides under a stationary pointer. One axis
     per instance ('y' default, 'x' opt-in); a two-axis surface (kanban:
     board rail x + column body y) composes two instances. setScroller()
     retargets a cross-container drag mid-gesture. Extracted from the
     media playlist reorder when the board became its second consumer. */
  function edgeAutoScroll(opts) {
    const o = opts || {};
    const edge = o.edge || 36;   // px activation zone
    const speed = o.speed || 6;  // px/frame ≈ 360 px/s at 60fps
    const axis = o.axis === 'x' ? 'x' : 'y';
    let scroller = o.scroller || null;
    let delta = 0;
    let raf = null;
    function tick() {
      if (!delta || !scroller) { raf = null; return; }
      const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop';
      const before = scroller[prop];
      scroller[prop] = before + delta;
      if (scroller[prop] === before) { raf = null; return; } // hit bound
      if (o.onTick) o.onTick();
      raf = requestAnimationFrame(tick);
    }
    return {
      setScroller(s) { if (s !== scroller) { scroller = s; } },
      update(clientX, clientY) {
        delta = 0;
        if (scroller) {
          const r = scroller.getBoundingClientRect();
          const pos = axis === 'x' ? clientX : clientY;
          const lo = axis === 'x' ? r.left : r.top;
          const hi = axis === 'x' ? r.right : r.bottom;
          if (pos < lo + edge) delta = -speed;
          else if (pos > hi - edge) delta = speed;
        }
        if (delta && !raf) raf = requestAnimationFrame(tick);
        if (!delta && raf) { cancelAnimationFrame(raf); raf = null; }
      },
      stop() { if (raf) cancelAnimationFrame(raf); raf = null; delta = 0; },
    };
  }

  // ─── ACCORDION ─────────────────────────────────────────────

  class Accordion {
    constructor(el, options = {}) {
      this.el = el;
      this.allowMultiple = options.allowMultiple ?? el.dataset.lbAllowMultiple === 'true';
      this._openIds = new Set();
      this._init();
    }

    _init() {
      const items = this.el.querySelectorAll('.lb-accordion__item');
      items.forEach((item) => {
        const trigger = item.querySelector('.lb-accordion__trigger');
        const panel = item.querySelector('.lb-accordion__panel');
        if (!trigger || !panel) return;

        const triggerId = trigger.id || uid('acc-trigger');
        const panelId = panel.id || uid('acc-panel');
        trigger.id = triggerId;
        panel.id = panelId;
        trigger.setAttribute('aria-controls', panelId);
        panel.setAttribute('aria-labelledby', triggerId);
        panel.setAttribute('role', 'region');

        const isOpen = !panel.hasAttribute('hidden');
        trigger.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) this._openIds.add(item.dataset.lbId || triggerId);

        trigger.addEventListener('click', () => this._toggle(item));
      });
    }

    _toggle(item) {
      const trigger = item.querySelector('.lb-accordion__trigger');
      const panel = item.querySelector('.lb-accordion__panel');
      const chevron = item.querySelector('.lb-accordion__chevron');
      if (trigger.disabled) return;

      const id = item.dataset.lbId || trigger.id;
      const opening = panel.hasAttribute('hidden');

      if (opening && !this.allowMultiple) {
        this._openIds.forEach((openId) => {
          if (openId !== id) this._close(openId);
        });
      }

      if (opening) {
        panel.removeAttribute('hidden');
        trigger.setAttribute('aria-expanded', 'true');
        if (chevron) chevron.classList.add('lb-accordion__chevron--open');
        this._openIds.add(id);
      } else {
        panel.setAttribute('hidden', '');
        trigger.setAttribute('aria-expanded', 'false');
        if (chevron) chevron.classList.remove('lb-accordion__chevron--open');
        this._openIds.delete(id);
      }

      this.el.dispatchEvent(new CustomEvent('lb-accordion-change', { detail: { id, open: opening } }));
    }

    _close(id) {
      const items = this.el.querySelectorAll('.lb-accordion__item');
      items.forEach((item) => {
        const trigger = item.querySelector('.lb-accordion__trigger');
        const itemId = item.dataset.lbId || trigger?.id;
        if (itemId === id) {
          const panel = item.querySelector('.lb-accordion__panel');
          const chevron = item.querySelector('.lb-accordion__chevron');
          panel?.setAttribute('hidden', '');
          trigger?.setAttribute('aria-expanded', 'false');
          chevron?.classList.remove('lb-accordion__chevron--open');
          this._openIds.delete(id);
        }
      });
    }
  }

  // ─── TABS ──────────────────────────────────────────────────

  class Tabs {
    constructor(el, options = {}) {
      this.el = el;
      this.onChange = options.onChange || null;
      this._init();
    }

    _init() {
      this.tabList = this.el.querySelector('[role="tablist"]') || this.el.querySelector('.lb-tab-list');
      this.tabs = Array.from(this.el.querySelectorAll('.lb-tab'));
      this.panels = Array.from(this.el.querySelectorAll('.lb-tab-panel'));

      this.tabs.forEach((tab, i) => {
        const tabId = tab.id || uid('tab');
        const panelId = this.panels[i]?.id || uid('tabpanel');
        tab.id = tabId;
        tab.setAttribute('role', 'tab');
        // A tab inside a <form> would otherwise default to submit.
        if (tab.tagName === 'BUTTON' && !tab.hasAttribute('type')) tab.type = 'button';
        if (this.panels[i]) {
          this.panels[i].id = panelId;
          this.panels[i].setAttribute('role', 'tabpanel');
          this.panels[i].setAttribute('aria-labelledby', tabId);
          tab.setAttribute('aria-controls', panelId);
        }
        tab.addEventListener('click', () => this.select(i));
      });

      if (this.tabList) {
        this.tabList.setAttribute('role', 'tablist');
        this.tabList.addEventListener('keydown', (e) => this._onKeydown(e));
      }

      const activeIndex = this.tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      this.select(activeIndex >= 0 ? activeIndex : 0);
    }

    select(index) {
      this.tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (this.panels[i]) {
          this.panels[i].hidden = !active;
        }
      });
      if (this.onChange) this.onChange(this.tabs[index]?.id);
      this.el.dispatchEvent(new CustomEvent('lb-tab-change', { detail: { index, id: this.tabs[index]?.id } }));
    }

    _onKeydown(e) {
      const current = this.tabs.indexOf(document.activeElement);
      if (current < 0) return;
      let next = current;

      if (e.key === 'ArrowRight') next = (current + 1) % this.tabs.length;
      else if (e.key === 'ArrowLeft') next = (current - 1 + this.tabs.length) % this.tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = this.tabs.length - 1;
      else return;

      e.preventDefault();
      while (this.tabs[next]?.disabled && next !== current) {
        next = e.key === 'ArrowLeft' || e.key === 'Home'
          ? (next - 1 + this.tabs.length) % this.tabs.length
          : (next + 1) % this.tabs.length;
      }
      this.tabs[next]?.focus();
      this.select(next);
    }
  }

  // ─── MODAL ─────────────────────────────────────────────────

  class Modal {
    constructor(el, options = {}) {
      this.backdrop = el;
      this.modal = el.querySelector('.lb-modal');
      this.onClose = options.onClose || null;
      this._previousFocus = null;
      this._releaseTrap = null;
      this._init();
    }

    _init() {
      const closeBtn = this.modal?.querySelector('.lb-modal__close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());

      this.backdrop.addEventListener('click', (e) => {
        if (e.target === this.backdrop && !this.modal?.classList.contains('lb-modal--alert')) {
          this.close();
        }
      });

      this.backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    open() {
      this._previousFocus = document.activeElement;
      this.backdrop.style.display = 'flex';
      this.backdrop.setAttribute('aria-modal', 'true');
      document.body.style.overflow = 'hidden';
      this._releaseTrap = trapFocus(this.modal);
      this.backdrop.dispatchEvent(new CustomEvent('lb-modal-open'));
    }

    close() {
      this.backdrop.style.display = 'none';
      document.body.style.overflow = '';
      if (this._releaseTrap) this._releaseTrap();
      if (this._previousFocus) this._previousFocus.focus();
      if (this.onClose) this.onClose();
      this.backdrop.dispatchEvent(new CustomEvent('lb-modal-close'));
    }

    static open(el) {
      const instance = el._lbModal || new Modal(el);
      el._lbModal = instance;
      instance.open();
      return instance;
    }
  }

  // ─── ALERT DIALOG — convenience API ────────────────────────
  // Programmatic short-form for destructive confirmations. Builds an
  // alertdialog-structured modal DOM, opens it, and cleans up after
  // the user's choice. Returns a Promise<boolean> — true = confirmed.
  //
  // LB.alert({
  //   title: 'Delete item?',
  //   message: 'This cannot be undone.',
  //   confirmText: 'Delete',           // default 'Confirm'
  //   cancelText: 'Cancel',            // default 'Cancel'
  //   danger: true,                    // red confirm button + red icon
  //   icon: 'circle-alert',            // 'circle-alert' | 'triangle' | custom SVG string | false
  // }).then(ok => { ... })

  const ALERT_ICONS = {
    'circle-alert': '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 6a1 1 0 0 1 2 0v5a1 1 0 0 1-2 0V8Zm1 10a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"/></svg>',
    'triangle':     '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2.5a2 2 0 0 1 1.74 1.01l9 15.5A2 2 0 0 1 21 22H3a2 2 0 0 1-1.74-3l9-15.49A2 2 0 0 1 12 2.5Zm0 6a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0v-5a1 1 0 0 0-1-1Zm0 10.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"/></svg>',
  };

  function alertDialog(opts = {}) {
    const title        = opts.title || 'Are you sure?';
    const message      = opts.message || '';
    const confirmText  = opts.confirmText || 'Confirm';
    const cancelText   = opts.cancelText || 'Cancel';
    const danger       = opts.danger === true;
    const iconOpt      = opts.icon === undefined ? (danger ? 'circle-alert' : false) : opts.icon;

    const iconSvg = iconOpt === false ? '' : (ALERT_ICONS[iconOpt] || iconOpt);

    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'lb-modal-backdrop';
      backdrop.setAttribute('role', 'alertdialog');
      backdrop.setAttribute('aria-modal', 'true');
      const titleId = uid('alert-title');
      const bodyId  = uid('alert-body');
      backdrop.setAttribute('aria-labelledby', titleId);
      if (message) backdrop.setAttribute('aria-describedby', bodyId);

      backdrop.innerHTML = `
        <div class="lb-modal lb-modal--small lb-modal--alert">
          <div class="lb-modal__header">
            <div class="lb-modal__header-title">
              ${iconSvg ? `<span class="lb-modal__alert-icon">${iconSvg}</span>` : ''}
              <h3 class="lb-modal__title" id="${titleId}">${escapeHtml(title)}</h3>
            </div>
          </div>
          ${message ? `<div class="lb-modal__body" id="${bodyId}">${escapeHtml(message)}</div>` : ''}
          <div class="lb-modal__footer">
            <button type="button" class="lb-btn lb-btn--secondary lb-btn--medium" data-lb-alert-action="cancel">${escapeHtml(cancelText)}</button>
            <button type="button" class="lb-btn lb-btn--${danger ? 'danger' : 'primary'} lb-btn--medium" data-lb-alert-action="confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const instance = new Modal(backdrop);
      backdrop._lbModal = instance;

      // Track whether we've resolved via an explicit button click. The
      // ESC / backdrop path goes through instance.close() which we
      // override to call resolve(false), but a button click ALSO calls
      // instance.close() — without the flag, the override would lock
      // the Promise to `false` BEFORE the explicit resolve(result) line
      // runs, so confirm clicks would be reported as cancellations.
      // Bug from the original implementation; the fix is purely the
      // ordering / guard.
      let _resolved = false;
      const safeResolve = (result) => {
        if (_resolved) return;
        _resolved = true;
        resolve(result);
      };
      const finish = (result) => {
        // Resolve FIRST so a confirm-click can't be clobbered by the
        // override's resolve(false) inside instance.close().
        safeResolve(result);
        instance.close();
        // Wait for close animation / focus restore, then remove from DOM
        setTimeout(() => backdrop.remove(), 0);
      };

      backdrop.querySelector('[data-lb-alert-action="cancel"]').addEventListener('click', () => finish(false));
      backdrop.querySelector('[data-lb-alert-action="confirm"]').addEventListener('click', () => finish(true));
      // ESC / backdrop close: resolve as "cancel" if no explicit click already won.
      const origClose = instance.close.bind(instance);
      instance.close = () => { origClose(); safeResolve(false); };

      instance.open();
      // Focus the confirm button (industry default — user can Enter to confirm,
      // Tab to Cancel)
      requestAnimationFrame(() => backdrop.querySelector('[data-lb-alert-action="confirm"]').focus());
    });
  }

  // Safe HTML escape for programmatic titles/messages
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ─── SHEET ─────────────────────────────────────────────────

  class Sheet {
    constructor(el, options = {}) {
      this.root = el;
      this.sheet = el.querySelector('.lb-sheet');
      this.overlay = el.querySelector('.lb-sheet-overlay');
      this.onClose = options.onClose || null;
      this._previousFocus = null;
      this._init();
    }

    _init() {
      const closeBtn = this.sheet?.querySelector('.lb-sheet__close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (this.overlay) this.overlay.addEventListener('click', () => this.close());
      this.root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    open() {
      this._previousFocus = document.activeElement;
      this.root.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      const closeBtn = this.sheet?.querySelector('.lb-sheet__close');
      if (closeBtn) closeBtn.focus();
      this.root.dispatchEvent(new CustomEvent('lb-sheet-open'));
    }

    close() {
      this.root.style.display = 'none';
      document.body.style.overflow = '';
      if (this._previousFocus) this._previousFocus.focus();
      if (this.onClose) this.onClose();
      this.root.dispatchEvent(new CustomEvent('lb-sheet-close'));
    }
  }

  // ─── DROPDOWN (Combobox) ───────────────────────────────────

  class Dropdown {
    constructor(el, options = {}) {
      this.field = el;
      this.input = el.querySelector('.lb-dropdown');
      this.wrap = el.querySelector('.lb-dropdown-wrap');
      this.onChange = options.onChange || null;
      this.allowCustom = options.allowCustom ?? el.dataset.lbAllowCustom === 'true';
      // Optional custom match predicate. Receives (option, queryLowerCase)
      // and returns truthy to include the option in the filtered list.
      // Default is substring on label (case-insensitive). Useful when a
      // consumer wants prefix-only or fuzzy matching instead.
      this.filterFn = typeof options.filterFn === 'function' ? options.filterFn : null;
      // Optional callback fired after the listbox is rendered with the
      // current filtered options. Receives (listElement, filteredOptions).
      // Consumers use this to decorate option rows (e.g. inline styles,
      // icons, or to schedule background work like lazy font loads).
      this.onRender = typeof options.onRender === 'function' ? options.onRender : null;
      // When true, inject a × button inside the field that clears the
      // input value and fires onChange(''). Consumers also get a
      // `setValue()` method to keep the button visibility in sync when
      // they assign input.value programmatically.
      this.clearable = options.clearable === true || el.dataset.lbClearable === 'true';
      // Lazy chunked rendering. When > 0, _render lays down only the
      // first `chunkSize` rows; the rest are appended when the user
      // scrolls near the bottom of the listbox or arrow-keys past
      // what's already rendered. 0 = render everything immediately
      // (legacy behaviour — unchanged for existing consumers).
      this.chunkSize = (options.chunkSize | 0) || 0;
      this._renderedCount = 0;
      this._options = [];
      this._filtered = [];
      this._activeIndex = -1;
      this._open = false;
      this._list = null;
      this._init();
    }

    _init() {
      // Parse options from data attribute or child script
      const optData = this.field.dataset.lbOptions;
      if (optData) {
        try { this._options = JSON.parse(optData); } catch (e) { /* ignore */ }
      }

      this._filtered = [...this._options];

      const listId = uid('dd-list');
      this.input.setAttribute('role', 'combobox');
      this.input.setAttribute('aria-autocomplete', 'list');
      this.input.setAttribute('aria-expanded', 'false');
      this.input.setAttribute('aria-controls', listId);
      this._listId = listId;

      this.input.addEventListener('input', () => {
        // Typing should re-open the listbox if it was closed (e.g. just
        // after a commit, where the input keeps focus). Otherwise the
        // user has to click or press ↓ to see results match what they
        // just typed.
        if (!this._open) this._show();
        this._filter();
        this._syncClear();
      });
      this.input.addEventListener('focus', () => this._show());
      this.input.addEventListener('keydown', (e) => this._onKeydown(e));

      this._removeClickOutside = onClickOutside(this.field, () => this._hide());

      this._initClear();
    }

    // Injects a × button inside the field that clears the input value
    // and fires onChange(''). Only runs when `clearable` is on.
    _initClear() {
      if (!this.clearable) return;
      this.input.classList.add('lb-dropdown--clearable');
      let btn = this.wrap.querySelector('.lb-dropdown-wrap__clear');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lb-dropdown-wrap__clear';
        btn.setAttribute('aria-label', 'Clear');
        btn.tabIndex = -1;
        btn.textContent = '×';
        const chev = this.wrap.querySelector('.lb-dropdown-wrap__chevron');
        if (chev) chev.parentNode.insertBefore(btn, chev);
        else this.wrap.appendChild(btn);
      }
      this.clearBtn = btn;
      this._syncClear();
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.input.value = '';
        this._syncClear();
        if (this._open) this._filter();
        if (this.onChange) this.onChange('');
        this.field.dispatchEvent(new CustomEvent('lb-dropdown-change', { detail: { value: '', label: '' } }));
      });
    }

    _syncClear() {
      if (this.clearBtn) this.clearBtn.hidden = !this.input.value;
    }

    // Programmatic value setter — keeps clear-button visibility in sync
    // without triggering onChange. Use this instead of `dd.input.value = …`.
    setValue(value) {
      this.input.value = value || '';
      this._syncClear();
    }

    setOptions(options) {
      this._options = options;
      this._filtered = [...options];
    }

    _filter() {
      const q = this.input.value.toLowerCase();
      const match = this.filterFn
        ? (o) => !o.disabled && this.filterFn(o, q)
        : (o) => !o.disabled && o.label.toLowerCase().includes(q);
      this._filtered = this._options.filter(match);
      this._activeIndex = -1;
      this._render();
    }

    _show() {
      if (this._open) return;
      this._open = true;
      this._filtered = [...this._options];
      // If the input already holds a committed option label (typical after
      // a selection — input keeps focus, dropdown reopens via ↓ or click),
      // highlight that option so keyboard navigation continues from where
      // the user left off instead of jumping back to the top of the list.
      const v = this.input.value;
      this._activeIndex = v
        ? this._filtered.findIndex((o) => o.label === v)
        : -1;
      this._render();
      this.input.setAttribute('aria-expanded', 'true');
      const chev = this.wrap.querySelector('.lb-dropdown-wrap__chevron');
      if (chev) chev.classList.add('lb-dropdown-wrap__chevron--open');
      // Sync aria-activedescendant + scroll into view after _render so
      // assistive tech and the visual viewport both land on the right row.
      if (this._activeIndex >= 0) this._highlightActive();
    }

    _hide() {
      this._open = false;
      if (this._list) { this._list.remove(); this._list = null; }
      this.input.setAttribute('aria-expanded', 'false');
      this.input.removeAttribute('aria-activedescendant');
      const chev = this.wrap.querySelector('.lb-dropdown-wrap__chevron');
      if (chev) chev.classList.remove('lb-dropdown-wrap__chevron--open');
    }

    _select(option) {
      this.input.value = option.label;
      this._syncClear();
      this._hide();
      if (this.onChange) this.onChange(option.value);
      this.field.dispatchEvent(new CustomEvent('lb-dropdown-change', { detail: option }));
    }

    // Move active index forward (dir=+1) or back (dir=-1), skipping any
    // disabled options (used for section headers / footers). Returns the
    // new index, or the original start if no enabled neighbour exists.
    _nextEnabled(start, dir) {
      let i = start + dir;
      while (i >= 0 && i < this._filtered.length) {
        if (!this._filtered[i].disabled) return i;
        i += dir;
      }
      return start;
    }
    _firstEnabled() {
      for (let i = 0; i < this._filtered.length; i++) {
        if (!this._filtered[i].disabled) return i;
      }
      return -1;
    }

    _render() {
      if (this._list) this._list.remove();
      if (!this._open || !this._filtered.length) { this._list = null; this._renderedCount = 0; return; }

      // Popup surface (lb-dropdown-list) + list primitive (lb-list) on one ul.
      // Surface class owns floating/position/overflow; lb-list owns item layout.
      this._list = document.createElement('ul');
      this._list.className = 'lb-dropdown-list lb-list';
      this._list.id = this._listId;
      this._list.setAttribute('role', 'listbox');

      // Initial slice. If chunked AND the highlighted index is past the
      // first chunk (e.g. opening on a committed selection halfway down
      // the list), grow the initial slice so the highlight is rendered.
      let initialCount = this._filtered.length;
      if (this.chunkSize > 0) {
        initialCount = Math.min(this.chunkSize, this._filtered.length);
        if (this._activeIndex >= initialCount) {
          initialCount = Math.min(this._activeIndex + 1, this._filtered.length);
        }
      }
      this._renderedCount = 0;
      this._appendRows(initialCount);

      this.wrap.appendChild(this._list);

      // Scroll-driven appending when chunked. 120 px lookahead so rows
      // are usually ready by the time the user scrolls onto them.
      if (this.chunkSize > 0 && this._renderedCount < this._filtered.length) {
        this._list.addEventListener('scroll', () => {
          const el = this._list;
          if (!el) return;
          if (this._renderedCount >= this._filtered.length) return;
          if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
          this._appendRows(this._renderedCount + this.chunkSize);
        });
      }

      if (this.onRender) {
        try { this.onRender(this._list, this._filtered.slice(0, this._renderedCount)); }
        catch (e) { console.error('[LB.Dropdown] onRender threw:', e); }
      }
    }

    // Append rows so the listbox covers options [0 .. count). Idempotent
    // — calling with a count ≤ current does nothing. Re-fires onRender
    // when new rows are appended so decorators (inline font-family,
    // observer.observe, etc.) can process the new slice.
    _appendRows(count) {
      if (!this._list) return;
      const target = Math.min(count, this._filtered.length);
      if (target <= this._renderedCount) return;
      for (let i = this._renderedCount; i < target; i++) {
        const opt = this._filtered[i];
        const li = document.createElement('li');
        li.className = 'lb-list__item';
        if (opt.disabled) li.classList.add('lb-list__item--disabled');
        if (i === this._activeIndex) li.classList.add('lb-list__item--active');
        li.id = uid('dd-opt');
        li.setAttribute('role', 'option');
        const label = document.createElement('span');
        label.className = 'lb-list__label';
        label.textContent = opt.label;
        li.appendChild(label);
        if (!opt.disabled) {
          // Capture the option index by closure; safer than reading
          // this._activeIndex via DOM lookup later.
          const idx = i;
          li.addEventListener('mousedown', (e) => { e.preventDefault(); this._select(opt); });
          li.addEventListener('mouseenter', () => {
            this._activeIndex = idx;
            this._highlightActive();
          });
        }
        this._list.appendChild(li);
      }
      this._renderedCount = target;
      // Notify consumers about the newly-rendered slice so they can
      // decorate (e.g. inline font-family per row). Pass the full
      // rendered slice — decorators are expected to be idempotent.
      if (this.onRender) {
        try { this.onRender(this._list, this._filtered.slice(0, this._renderedCount)); }
        catch (e) { console.error('[LB.Dropdown] onRender threw:', e); }
      }
    }

    _highlightActive() {
      if (!this._list) return;
      // Chunked rendering: if the keyboard pushed _activeIndex past the
      // rendered slice, grow the slice so we have a DOM row to highlight.
      if (this.chunkSize > 0 && this._activeIndex >= this._renderedCount) {
        this._appendRows(this._activeIndex + this.chunkSize);
      }
      const items = this._list.querySelectorAll('.lb-list__item');
      items.forEach((li, i) => {
        li.classList.toggle('lb-list__item--active', i === this._activeIndex);
      });
      if (items[this._activeIndex]) {
        this.input.setAttribute('aria-activedescendant', items[this._activeIndex].id);
        items[this._activeIndex].scrollIntoView({ block: 'nearest' });
      }
    }

    _onKeydown(e) {
      if (!this._open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { this._show(); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this._activeIndex < 0) this._activeIndex = this._firstEnabled();
        else this._activeIndex = this._nextEnabled(this._activeIndex, +1);
        this._highlightActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this._activeIndex < 0) this._activeIndex = this._firstEnabled();
        else this._activeIndex = this._nextEnabled(this._activeIndex, -1);
        this._highlightActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = this._activeIndex >= 0 ? this._filtered[this._activeIndex] : null;
        if (opt && !opt.disabled) this._select(opt);
      } else if (e.key === 'Escape') {
        this._hide();
      }
    }

    destroy() {
      this._hide();
      if (this._removeClickOutside) this._removeClickOutside();
    }
  }

  // ─── SELECT (Custom styled) ─────────────────────────────────

  class Select {
    constructor(el, options = {}) {
      this.field = el;
      this.size = options.size || el.dataset.lbSize || 'medium';
      this.placeholder = options.placeholder || el.dataset.lbPlaceholder || 'Select...';
      this.onChange = options.onChange || null;
      // Form integration: a name renders a hidden input that submits the
      // value like a native select; required is announced on the combobox.
      this.name = options.name || el.dataset.lbName || '';
      this.required = options.required ?? el.hasAttribute('data-lb-required');
      this._options = [];
      this._value = options.value || el.dataset.lbValue || '';
      this._initialValue = this._value;
      this._activeIndex = -1;
      this._open = false;
      this._init();
    }

    _init() {
      // Parse options from data attribute
      const optData = this.field.dataset.lbOptions;
      if (optData) {
        try { this._options = JSON.parse(optData); } catch (e) { /* ignore */ }
      }

      // Build trigger button if not present
      this.trigger = this.field.querySelector('.lb-select__trigger');
      if (!this.trigger) {
        this.trigger = document.createElement('button');
        this.trigger.type = 'button';
        this.trigger.className = `lb-select lb-select--${this.size}`;
        const label = this._options.find(o => o.value === this._value)?.label || this.placeholder;
        this.trigger.innerHTML = `<span class="lb-select__text${!this._value ? ' lb-select__text--placeholder' : ''}">${label}</span><span class="lb-select-wrap__chevron">${SVG_CHEVRON}</span>`;
        // Full label survives CSS truncation as a native tooltip.
        this.trigger.title = label;
        // Replace native select if present
        const nativeSelect = this.field.querySelector('select.lb-select');
        if (nativeSelect) nativeSelect.replaceWith(this.trigger);
        else {
          const wrap = this.field.querySelector('.lb-select-wrap');
          if (wrap) { wrap.innerHTML = ''; wrap.appendChild(this.trigger); }
          else this.field.appendChild(this.trigger);
        }
      }

      const triggerId = this.trigger.id || uid('sel-trigger');
      const listId = uid('sel-list');
      this.trigger.id = triggerId;
      this.trigger.setAttribute('role', 'combobox');
      this.trigger.setAttribute('aria-haspopup', 'listbox');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-controls', listId);
      this._listId = listId;

      // Adopt an external <label for="<field id>">: re-point it at the built
      // trigger and use it as the accessible name — the combobox's value is
      // its text content, so the label alone names it.
      if (this.field.id) {
        const lab = document.querySelector(`label[for="${this.field.id}"]`);
        if (lab) {
          if (!lab.id) lab.id = `${triggerId}-label`;
          lab.htmlFor = triggerId;
          this.trigger.setAttribute('aria-labelledby', lab.id);
        }
      }
      // combobox is a name-from-author role — its text content is the
      // VALUE, not the name. Without a label, the placeholder names it.
      if (!this.trigger.hasAttribute('aria-labelledby') && !this.trigger.hasAttribute('aria-label')) {
        this.trigger.setAttribute('aria-label', this.placeholder);
      }

      this.trigger.addEventListener('click', () => this._toggle());
      this.trigger.addEventListener('keydown', (e) => this._onTriggerKeydown(e));

      this._removeClickOutside = onClickOutside(this.field, () => {
        if (this._open) this._close();
      });

      // Form plumbing: hidden input mirror, required announcement, and a
      // reset hook so the field follows its form like a native control.
      if (this.name) {
        this._hidden = document.createElement('input');
        this._hidden.type = 'hidden';
        this._hidden.name = this.name;
        this._hidden.value = this._value;
        this.field.appendChild(this._hidden);
      }
      if (this.required) this.trigger.setAttribute('aria-required', 'true');
      this._form = this.field.closest('form');
      if (this._form) {
        this._onFormReset = () => { this.setValue(this._initialValue); this.clearError(); };
        this._form.addEventListener('reset', this._onFormReset);
      }
    }

    setOptions(options) {
      this._options = options;
    }

    _toggle() { this._open ? this._close() : this._show(); }

    _show() {
      this._open = true;
      this._activeIndex = this._options.findIndex(o => o.value === this._value);
      this._render();
      this.trigger.setAttribute('aria-expanded', 'true');
      const chev = this.trigger.querySelector('.lb-select-wrap__chevron');
      if (chev) chev.classList.add('lb-select-wrap__chevron--open');
    }

    _close() {
      this._open = false;
      if (this._list) { this._list.remove(); this._list = null; }
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.removeAttribute('aria-activedescendant');
      const chev = this.trigger.querySelector('.lb-select-wrap__chevron');
      if (chev) chev.classList.remove('lb-select-wrap__chevron--open');
      this.trigger.focus();
    }

    _select(option) {
      this._value = option.value;
      const textEl = this.trigger.querySelector('.lb-select__text');
      if (textEl) {
        textEl.textContent = option.label;
        textEl.classList.remove('lb-select__text--placeholder');
      }
      this.trigger.title = option.label;
      if (this._hidden) this._hidden.value = this._value;
      this.clearError();
      this._close();
      if (this.onChange) this.onChange(option.value);
      // bubbles so a form-level listener (LB.Form, analytics) can delegate
      this.field.dispatchEvent(new CustomEvent('lb-select-change', { detail: option, bubbles: true }));
    }

    _render() {
      if (this._list) this._list.remove();
      if (!this._open) { this._list = null; return; }

      // Popup surface (lb-dropdown-list) + list primitive (lb-list) on one ul.
      this._list = document.createElement('ul');
      this._list.className = 'lb-dropdown-list lb-list';
      this._list.id = this._listId;
      this._list.setAttribute('role', 'listbox');
      this._list.setAttribute('aria-labelledby', this.trigger.id);

      this._options.forEach((opt, i) => {
        const li = document.createElement('li');
        li.className = 'lb-list__item';
        if (opt.disabled) li.classList.add('lb-list__item--disabled');
        if (i === this._activeIndex) li.classList.add('lb-list__item--active');
        if (opt.value === this._value) li.classList.add('lb-list__item--selected');
        li.id = uid('sel-opt');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(opt.value === this._value));
        const label = document.createElement('span');
        label.className = 'lb-list__label';
        label.textContent = opt.label;
        li.appendChild(label);
        if (!opt.disabled) {
          li.addEventListener('mousedown', (e) => { e.preventDefault(); this._select(opt); });
          li.addEventListener('mouseenter', () => {
            this._activeIndex = i;
            this._highlightActive();
          });
        }
        this._list.appendChild(li);
      });

      // Position below trigger
      const wrap = this.trigger.closest('.lb-select-wrap') || this.trigger.parentElement;
      wrap.style.position = 'relative';
      wrap.appendChild(this._list);

      // Scroll active into view
      if (this._activeIndex >= 0) {
        const items = this._list.querySelectorAll('[role="option"]');
        items[this._activeIndex]?.scrollIntoView({ block: 'nearest' });
      }
    }

    _highlightActive() {
      if (!this._list) return;
      const items = this._list.querySelectorAll('[role="option"]');
      items.forEach((li, i) => {
        li.classList.toggle('lb-list__item--active', i === this._activeIndex);
      });
      if (items[this._activeIndex]) {
        this.trigger.setAttribute('aria-activedescendant', items[this._activeIndex].id);
        items[this._activeIndex].scrollIntoView({ block: 'nearest' });
      }
    }

    _onTriggerKeydown(e) {
      if (!this._open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._show();
        }
        return;
      }

      const enabledIndices = this._options.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
      if (!enabledIndices.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = enabledIndices.indexOf(this._activeIndex);
        this._activeIndex = enabledIndices[Math.min(cur + 1, enabledIndices.length - 1)];
        this._highlightActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const cur = enabledIndices.indexOf(this._activeIndex);
        this._activeIndex = enabledIndices[Math.max(cur - 1, 0)];
        this._highlightActive();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this._activeIndex = enabledIndices[0];
        this._highlightActive();
      } else if (e.key === 'End') {
        e.preventDefault();
        this._activeIndex = enabledIndices[enabledIndices.length - 1];
        this._highlightActive();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this._activeIndex >= 0 && this._options[this._activeIndex]) {
          this._select(this._options[this._activeIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._close();
      }
    }

    get value() { return this._value; }
    // The setter is programmatic: it updates UI + the hidden input and
    // fires nothing (mirrors LB.Dropdown.setValue) — user selection via
    // _select() is what emits lb-select-change / onChange.
    set value(v) { this.setValue(v); }

    getValue() { return this._value; }

    setValue(value) {
      const opt = this._options.find(o => o.value === value);
      // unknown non-empty value = no-op (the legacy setter's contract);
      // a falsy value explicitly clears back to the placeholder
      if (value && !opt) return;
      this._value = opt ? opt.value : '';
      const textEl = this.trigger.querySelector('.lb-select__text');
      if (textEl) {
        textEl.textContent = opt ? opt.label : this.placeholder;
        textEl.classList.toggle('lb-select__text--placeholder', !opt);
      }
      this.trigger.title = opt ? opt.label : this.placeholder;
      if (this._hidden) this._hidden.value = this._value;
    }

    // Error state on the existing skin: .lb-select--error border +
    // aria-invalid; a message renders as the shared .lb-field__error hint
    // (the alert icon arrives via the same injection pipeline the static
    // field hints use). clearError() runs automatically on selection.
    setError(message) {
      this.trigger.classList.add('lb-select--error');
      this.trigger.setAttribute('aria-invalid', 'true');
      if (message) {
        if (!this._errorEl) {
          this._errorEl = document.createElement('span');
          this._errorEl.className = 'lb-field__error';
          this._errorEl.id = uid('sel-err');
          this.field.appendChild(this._errorEl);
        }
        this._errorEl.textContent = message;
        initFieldHintIcons(this.field);
        initIcons(this.field);
        this._describedByBefore = this.trigger.getAttribute('aria-describedby');
        this.trigger.setAttribute('aria-describedby',
          [this._describedByBefore, this._errorEl.id].filter(Boolean).join(' '));
      }
    }

    clearError() {
      this.trigger.classList.remove('lb-select--error');
      this.trigger.removeAttribute('aria-invalid');
      if (this._errorEl) {
        this._errorEl.remove();
        this._errorEl = null;
        if (this._describedByBefore) this.trigger.setAttribute('aria-describedby', this._describedByBefore);
        else this.trigger.removeAttribute('aria-describedby');
      }
    }

    destroy() {
      this._close();
      if (this._removeClickOutside) this._removeClickOutside();
      if (this._form && this._onFormReset) this._form.removeEventListener('reset', this._onFormReset);
      if (this._hidden) this._hidden.remove();
      if (this._errorEl) this._errorEl.remove();
    }
  }

  // ─── MENU ──────────────────────────────────────────────────

  class Menu {
    constructor(el, options = {}) {
      this.wrapper = el;
      this.trigger = el.querySelector('.lb-menu__trigger');
      this.menu = el.querySelector('.lb-menu');
      this.onSelect = options.onSelect || null;
      this._open = false;
      this._init();
    }

    _init() {
      if (!this.trigger || !this.menu) return;

      const triggerId = this.trigger.id || uid('menu-trigger');
      const menuId = this.menu.id || uid('menu');
      this.trigger.id = triggerId;
      this.menu.id = menuId;
      this.trigger.setAttribute('aria-haspopup', 'menu');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-controls', menuId);
      this.menu.setAttribute('role', 'menu');
      this.menu.setAttribute('aria-labelledby', triggerId);

      // Items now use the shared List primitive classes (.lb-list__item etc.)
      // The outer <ul class="lb-menu"> keeps its surface styling.
      // data-lb-menu-mode="checkable|radio" upgrades rows to the stateful menu
      // item roles; aria-checked mirrors .lb-list__item--checked.
      const mode = this.wrapper.dataset.lbMenuMode;
      const itemRole = mode === 'checkable' ? 'menuitemcheckbox'
        : mode === 'radio' ? 'menuitemradio' : 'menuitem';
      this._syncChecked = () => {
        if (itemRole === 'menuitem') return;
        this.menu.querySelectorAll('.lb-list__item').forEach((it) => {
          it.setAttribute('aria-checked', it.classList.contains('lb-list__item--checked') ? 'true' : 'false');
        });
      };
      const items = this.menu.querySelectorAll('.lb-list__item');
      items.forEach((item) => {
        item.setAttribute('role', itemRole);
        if (item.classList.contains('lb-list__item--disabled')) {
          item.setAttribute('aria-disabled', 'true');
          item.tabIndex = -1;
        } else {
          item.tabIndex = -1;
          item.addEventListener('click', () => {
            if (this.onSelect) this.onSelect(item.dataset.lbId || item.textContent.trim());
            this.wrapper.dispatchEvent(new CustomEvent('lb-menu-select', { detail: { item } }));
            // Consumer handlers ran synchronously above and may have moved
            // .lb-list__item--checked — re-mirror before closing.
            this._syncChecked();
            this._close();
          });
        }
      });
      this._syncChecked();

      this.trigger.addEventListener('click', () => this._toggle());
      this.menu.addEventListener('keydown', (e) => this._onKeydown(e));

      this._removeClickOutside = onClickOutside(this.wrapper, () => {
        if (this._open) this._close();
      });

      this.menu.style.display = 'none';
    }

    _toggle() {
      this._open ? this._close() : this._openMenu();
    }

    _openMenu() {
      this._open = true;
      this.menu.style.display = '';
      this.menu.style.position = 'absolute';
      this.menu.style.top = '100%';
      this.menu.style.left = '0';
      this.trigger.setAttribute('aria-expanded', 'true');
      const first = this.menu.querySelector('.lb-list__item:not(.lb-list__item--disabled)');
      if (first) first.focus();
    }

    _close() {
      this._open = false;
      this.menu.style.display = 'none';
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.focus();
    }

    _onKeydown(e) {
      const items = Array.from(this.menu.querySelectorAll('.lb-list__item:not(.lb-list__item--disabled)'));
      const current = items.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') { e.preventDefault(); items[(current + 1) % items.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(current - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { this._close(); }
    }

    destroy() {
      if (this._removeClickOutside) this._removeClickOutside();
    }
  }

  // ─── POPOVER ───────────────────────────────────────────────

  class Popover {
    constructor(el, options = {}) {
      this.host = el;
      this.trigger = el.querySelector('.lb-popover-trigger');
      this.popover = el.querySelector('.lb-popover');
      this.onOpenChange = options.onOpenChange || null;
      this._open = false;
      this._init();
    }

    _init() {
      if (!this.trigger || !this.popover) return;

      const popoverId = this.popover.id || uid('popover');
      this.popover.id = popoverId;
      this.trigger.setAttribute('aria-haspopup', 'dialog');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-controls', popoverId);
      this.popover.setAttribute('role', 'dialog');
      this.popover.setAttribute('aria-modal', 'false');

      this.popover.style.display = 'none';

      this.trigger.addEventListener('click', () => this._toggle());
      this.host.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._open) this._close();
      });

      this._removeClickOutside = onClickOutside(this.host, () => {
        if (this._open) this._close();
      });
    }

    _toggle() { this._open ? this._close() : this._openPopover(); }

    _openPopover() {
      this._open = true;
      this.popover.style.display = '';
      // The CSS position variants center on the trigger; near a screen
      // edge that pushes the panel off-viewport (cut and unreachable on
      // phones). Clamp horizontally with margins so the CSS variant
      // still owns the base position: margin-left moves a left-anchored
      // box (--bottom/--top/--right), margin-right (negated) moves a
      // right-anchored one (--left) — setting both covers either anchor
      // without sniffing the variant. Gutter mirrors --lb-size-2x (8px),
      // the popover's own anchor gap.
      this.popover.style.marginLeft = '';
      this.popover.style.marginRight = '';
      const r = this.popover.getBoundingClientRect();
      const gutter = 8;
      const vw = document.documentElement.clientWidth;
      let shift = 0;
      if (r.left < gutter) shift = gutter - r.left;
      else if (r.right > vw - gutter) shift = (vw - gutter) - r.right;
      if (shift) {
        this.popover.style.marginLeft = `${shift}px`;
        this.popover.style.marginRight = `${-shift}px`;
      }
      this.trigger.setAttribute('aria-expanded', 'true');
      if (this.onOpenChange) this.onOpenChange(true);
    }

    _close() {
      this._open = false;
      this.popover.style.display = 'none';
      this.popover.style.marginLeft = '';
      this.popover.style.marginRight = '';
      this.trigger.setAttribute('aria-expanded', 'false');
      if (this.onOpenChange) this.onOpenChange(false);
    }

    destroy() {
      if (this._removeClickOutside) this._removeClickOutside();
    }
  }

  // ─── TOOLTIP ───────────────────────────────────────────────

  class Tooltip {
    constructor(el, options = {}) {
      this.wrap = el;
      this.tooltip = el.querySelector('.lb-tooltip');
      this._triggerEl = el.firstElementChild;
      // Show delay (mouse only). Keyboard focus shows instantly so
      // keyboard users don't wait for visual feedback. data-lb-tooltip-delay
      // overrides; default 300ms.
      const delayAttr = parseInt(el.dataset.lbTooltipDelay, 10);
      this.delay = Number.isFinite(delayAttr) ? delayAttr : (options.delay ?? 300);
      this._showTimer = null;
      this._init();
    }

    _init() {
      if (!this.tooltip || !this._triggerEl) return;

      const tooltipId = this.tooltip.id || uid('tooltip');
      this.tooltip.id = tooltipId;
      this._triggerEl.setAttribute('aria-describedby', tooltipId);
      this.tooltip.setAttribute('role', 'tooltip');

      this._triggerEl.addEventListener('mouseenter', () => this._showDelayed());
      this._triggerEl.addEventListener('mouseleave', () => this._hide());
      this._triggerEl.addEventListener('focus', () => this._showImmediate());
      this._triggerEl.addEventListener('blur', () => this._hide());
    }

    _showDelayed() {
      this._cancelTimer();
      this._showTimer = setTimeout(() => this._showImmediate(), this.delay);
    }

    _showImmediate() {
      this._cancelTimer();
      this.tooltip.classList.add('lb-tooltip--open');
    }

    _hide() {
      this._cancelTimer();
      this.tooltip.classList.remove('lb-tooltip--open');
    }

    _cancelTimer() {
      if (this._showTimer) {
        clearTimeout(this._showTimer);
        this._showTimer = null;
      }
    }
  }

  // ─── SLIDER ────────────────────────────────────────────────

  class Slider {
    constructor(el) {
      this.field = el;
      this.input = el.querySelector('.lb-slider');
      this.fill = el.querySelector('.lb-slider-track__fill');
      this.valueDisplay = el.querySelector('.lb-slider-field__value');
      this._init();
    }

    _init() {
      if (!this.input) return;
      this.input.addEventListener('input', () => this._update());
      this._update();
    }

    _update() {
      const min = parseFloat(this.input.min) || 0;
      const max = parseFloat(this.input.max) || 100;
      const val = parseFloat(this.input.value) || 0;
      const pct = ((val - min) / (max - min)) * 100;
      if (this.fill) this.fill.style.width = `${pct}%`;
      if (this.valueDisplay) this.valueDisplay.textContent = val;
      this.input.setAttribute('aria-valuenow', val);
      this.field.dispatchEvent(new CustomEvent('lb-slider-change', { detail: { value: val } }));
    }

    set value(v) {
      this.input.value = v;
      this._update();
    }

    get value() {
      return parseFloat(this.input.value);
    }
  }


  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }


  // ─── RATING ────────────────────────────────────────────────
  // Native radiogroup of icon items. Two modes:
  //   - "cumulative" (default) — star-style, 1→N items fill up to value
  //   - "select"               — pick-one, each item can have its own
  //                              icon; only the chosen item highlights
  // Filled state swaps to a paired `-filled` icon when one is bundled
  // (star, heart, thumbs-up/down); other icons (faces, etc.) rely on
  // accent color alone for the active state.

  const ICONS_WITH_FILLED = new Set([
    'star', 'heart', 'thumbs-up', 'thumbs-down',
    'circle-check', 'x-circle', 'info', 'alert-triangle',
    // Face icons use a soft tinted-circle treatment for the filled
    // variant — features stay readable on top of an accent-tinted
    // background. Lets emoji CSAT show a clear active state.
    'angry', 'frown', 'meh', 'smile', 'laugh'
  ]);

  class Rating {
    constructor(el) {
      this.el = el;
      this.mode = el.dataset.lbMode === 'select' ? 'select' : 'cumulative';
      const iconsAttr = el.dataset.lbIcons;
      this.icons = iconsAttr
        ? iconsAttr.split(',').map((s) => s.trim()).filter(Boolean)
        : null;
      // In select mode the icons array drives count when data-lb-count
      // isn't explicitly set — saves the consumer one attribute.
      const declaredCount = parseInt(el.dataset.lbCount, 10);
      this.count = Number.isFinite(declaredCount) && declaredCount > 0
        ? declaredCount
        : (this.icons ? this.icons.length : 5);
      this.value = parseInt(el.dataset.lbValue || '0', 10);
      this.readonly = el.hasAttribute('data-lb-readonly');
      this.disabled = el.hasAttribute('data-lb-disabled');
      this.clearable = el.hasAttribute('data-lb-clearable');
      this.iconName = el.dataset.lbIcon || 'star';
      // Strip data-lb-icon from the host element. The global initIcons
      // sweep treats any [data-lb-icon] node as a glyph slot and would
      // overwrite the rating's rendered children with a single icon SVG.
      // Rating renders its own per-item icon spans below.
      if (el.hasAttribute('data-lb-icon')) el.removeAttribute('data-lb-icon');
      this.size = el.dataset.lbSize || 'medium';
      this.name = el.dataset.lbName || `lb-rating-${++Rating._counter}`;
      this._render();
      if (!this.readonly && !this.disabled) this._bindEvents();
    }

    _iconForIndex(i) {
      return (this.icons && this.icons[i - 1]) || this.iconName;
    }

    _filledIconName(name) {
      return ICONS_WITH_FILLED.has(name) ? `${name}-filled` : name;
    }

    _isFilled(index, n) {
      return this.mode === 'select' ? (index === n) : (index <= n);
    }

    _humanLabel(name) {
      // "thumbs-down" → "Thumbs down" (per-radio aria-label fallback)
      const words = name.split('-');
      return words[0][0].toUpperCase() + words[0].slice(1)
        + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
    }

    _render() {
      this.el.classList.add('lb-rating');
      this.el.classList.add(`lb-rating--${this.size}`);
      this.el.classList.toggle('lb-rating--select', this.mode === 'select');
      if (this.readonly) this.el.classList.add('lb-rating--readonly');
      if (this.disabled) this.el.classList.add('lb-rating--disabled');
      // Read-only / display use is announced as an image with the rating
      // baked into its label; interactive keeps native radiogroup.
      this.el.setAttribute('role', this.readonly ? 'img' : 'radiogroup');
      this._setAriaLabel();
      this.el.innerHTML = '';
      this.items = [];

      for (let i = 1; i <= this.count; i++) {
        const item = document.createElement('label');
        item.className = 'lb-rating__item';
        const filled = this._isFilled(i, this.value);
        if (filled) item.classList.add('lb-rating__item--filled');

        const input = document.createElement('input');
        input.className = 'lb-rating__input';
        input.type = 'radio';
        input.name = this.name;
        input.value = i;
        const baseIcon = this._iconForIndex(i);
        input.setAttribute('aria-label', this.mode === 'select'
          ? this._humanLabel(baseIcon)
          : `${i} ${i === 1 ? 'star' : 'stars'}`);
        if (i === this.value) input.checked = true;
        if (this.readonly || this.disabled) input.disabled = true;

        const icon = document.createElement('span');
        icon.className = 'lb-rating__icon';
        icon.setAttribute('data-lb-icon',
          filled ? this._filledIconName(baseIcon) : baseIcon);
        icon.setAttribute('aria-hidden', 'true');

        item.append(input, icon);
        this.el.appendChild(item);
        this.items.push({ item, input, icon, index: i, baseIcon });
      }
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this.el);
    }

    _bindEvents() {
      // Bind click on the radio input itself, not the label. Listening on
      // the label fires twice per user click (once for the user's click
      // on the label, then again for the synthetic click the label
      // dispatches on its associated input). Listening on the input
      // captures both the direct click and the label's synthetic dispatch
      // exactly once. The change event covers keyboard activation too.
      this.items.forEach(({ item, input }) => {
        item.addEventListener('mouseenter', () => this._preview(parseInt(input.value, 10)));
        input.addEventListener('click', (e) => {
          const v = parseInt(input.value, 10);
          if (this.clearable && v === this.value && this.value > 0) {
            e.preventDefault();
            input.checked = false;
            this.setValue(0);
          } else {
            this.setValue(v);
          }
        });
      });
      this.el.addEventListener('mouseleave', () => this._preview(this.value));
      this.el.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains('lb-rating__input')) {
          this.setValue(parseInt(t.value, 10));
        }
      });
    }

    _preview(n) {
      this.items.forEach(({ item, icon, index, baseIcon }) => {
        const filled = this._isFilled(index, n);
        item.classList.toggle('lb-rating__item--filled', filled);
        const wantIcon = filled ? this._filledIconName(baseIcon) : baseIcon;
        if (icon.getAttribute('data-lb-icon') !== wantIcon) {
          icon.setAttribute('data-lb-icon', wantIcon);
          icon.innerHTML = '';
          icon._lbIconDone = false;
        }
      });
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this.el);
    }

    _setAriaLabel() {
      const existing = this.el.getAttribute('aria-label');
      if (existing && !/^Rating:/.test(existing)) return;
      let label;
      if (this.mode === 'select') {
        const sel = this.value > 0 ? this._iconForIndex(this.value) : null;
        label = sel ? `Rating: ${this._humanLabel(sel)}` : `Rating: ${this.count} options`;
      } else {
        label = `Rating: ${this.value} of ${this.count}`;
      }
      this.el.setAttribute('aria-label', label);
    }

    setValue(n) {
      const newVal = Math.max(0, Math.min(this.count, parseInt(n, 10) || 0));
      // Idempotent — click and change paths can both fire for the same
      // selection; only emit lb-rating-change when the value really moves.
      if (newVal === this.value) return;
      this.value = newVal;
      this.el.dataset.lbValue = this.value;
      this._preview(this.value);
      this._setAriaLabel();
      this.el.dispatchEvent(new CustomEvent('lb-rating-change', {
        detail: { value: this.value },
        bubbles: true
      }));
    }
  }
  Rating._counter = 0;


  // ─── RESIZABLE / SPLITTER ──────────────────────────────────
  // Flex container of panels with auto-injected drag handles between
  // them. Pointer events for mouse/touch/pen; native keyboard for
  // accessibility (arrow keys, PageUp/Down, Home/End). Sizes are kept
  // as % so the layout stays fluid when the parent resizes.

  class Resizable {
    constructor(el) {
      this.el = el;
      this.direction = el.dataset.lbDirection === 'vertical' ? 'vertical' : 'horizontal';
      // Snapshot real children — anything except <script>/<template>.
      this.panels = Array.from(el.children).filter((c) => {
        const t = c.tagName;
        return t !== 'SCRIPT' && t !== 'TEMPLATE';
      });
      if (this.panels.length < 2) return;
      this._setup();
    }

    _setup() {
      this.el.classList.add('lb-resizable', `lb-resizable--${this.direction}`);

      // Initial sizes — read data-lb-size from each panel; missing ones
      // share the remainder equally. Values are %.
      this.sizes = this._initialSizes();
      this.panels.forEach((p, i) => {
        p.classList.add('lb-resizable__panel');
        p.style.setProperty('--lb-resizable-size', `${this.sizes[i]}%`);
      });

      // Insert handles between each pair of adjacent panels.
      this.handles = [];
      for (let i = 1; i < this.panels.length; i++) {
        const handle = this._createHandle(i);
        this.el.insertBefore(handle, this.panels[i]);
        this.handles.push(handle);
      }
      this._updateAllAria();
    }

    _initialSizes() {
      const declared = this.panels.map((p) => {
        const v = parseFloat(p.dataset.lbSize);
        return Number.isFinite(v) ? v : null;
      });
      const declaredTotal = declared.reduce((a, b) => a + (b || 0), 0);
      const undeclaredCount = declared.filter((d) => d === null).length;
      const remainder = Math.max(0, 100 - declaredTotal);
      const eachUndeclared = undeclaredCount > 0 ? remainder / undeclaredCount : 0;
      return declared.map((d) => (d === null ? eachUndeclared : d));
    }

    _minFor(index) {
      const v = parseFloat(this.panels[index].dataset.lbMin);
      return Number.isFinite(v) ? v : 5; // default floor 5%
    }

    _createHandle(index) {
      const handle = document.createElement('div');
      handle.className = 'lb-resizable__handle';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation',
        this.direction === 'horizontal' ? 'vertical' : 'horizontal');
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('aria-label', `Resize panel ${index}`);
      handle.dataset.handleIndex = index;
      // Drag via shared LB.pointerDrag util — handles primary-button
      // filter, preventDefault, setPointerCapture, dragging-class on
      // the handle, and listener cleanup. Per-gesture state (the
      // container's rect + startSizes snapshot) lives in ctx so the
      // delta math is stable even if a floor pushes things around
      // mid-drag.
      const idx = index;
      const isHorz = this.direction === 'horizontal';
      pointerDrag(handle, {
        draggingClass: 'lb-resizable__handle--dragging',
        onStart: (e, ctx) => {
          ctx.containerRect = this.el.getBoundingClientRect();
          ctx.startSizes = this.sizes.slice();
          this.el.classList.add('lb-resizable--dragging');
        },
        onMove: (e, ctx) => {
          const containerSize = isHorz ? ctx.containerRect.width : ctx.containerRect.height;
          const cur = isHorz ? e.clientX : e.clientY;
          const start = isHorz ? ctx.startX : ctx.startY;
          const deltaPct = ((cur - start) / containerSize) * 100;
          this.sizes = ctx.startSizes.slice();
          this._resizeAt(idx, deltaPct);
        },
        onEnd: () => {
          this.el.classList.remove('lb-resizable--dragging');
          this._dispatchChange();
        },
      });
      handle.addEventListener('keydown', (e) => this._onKeyDown(handle, e));
      return handle;
    }

    _applySizes() {
      this.panels.forEach((p, i) => {
        p.style.setProperty('--lb-resizable-size', `${this.sizes[i]}%`);
      });
      this._updateAllAria();
    }

    _updateAllAria() {
      this.handles.forEach((h, hi) => {
        const idx = hi + 1; // index of right/bottom panel
        // valuenow reflects the boundary position from the start (0..100).
        const cumulative = this.sizes.slice(0, idx).reduce((a, b) => a + b, 0);
        h.setAttribute('aria-valuenow', Math.round(cumulative));
        h.setAttribute('aria-valuemin', '0');
        h.setAttribute('aria-valuemax', '100');
      });
    }

    _resizeAt(handleIndex, deltaPct) {
      // Resize the boundary between panels[handleIndex - 1] and panels[handleIndex].
      const i = handleIndex - 1;
      const j = handleIndex;
      const min1 = this._minFor(i);
      const min2 = this._minFor(j);
      let s1 = this.sizes[i] + deltaPct;
      let s2 = this.sizes[j] - deltaPct;
      // Apply floors — push the overflow back into the other side so the
      // sum of the two stays constant (other panels untouched).
      if (s1 < min1) { s2 -= (min1 - s1); s1 = min1; }
      if (s2 < min2) { s1 -= (min2 - s2); s2 = min2; }
      this.sizes[i] = s1;
      this.sizes[j] = s2;
      this._applySizes();
    }

    _onKeyDown(handle, e) {
      const isHorz = this.direction === 'horizontal';
      const idx = parseInt(handle.dataset.handleIndex, 10);
      const negKey = isHorz ? 'ArrowLeft' : 'ArrowUp';
      const posKey = isHorz ? 'ArrowRight' : 'ArrowDown';
      let delta = 0;
      if (e.key === negKey) delta = -5;
      else if (e.key === posKey) delta = 5;
      else if (e.key === 'PageUp')   delta = isHorz ? -10 : -10;
      else if (e.key === 'PageDown') delta = isHorz ?  10 :  10;
      else if (e.key === 'Home') delta = -100;
      else if (e.key === 'End')  delta =  100;
      else return;
      e.preventDefault();
      this._resizeAt(idx, delta);
      this._dispatchChange();
    }

    _dispatchChange() {
      this.el.dispatchEvent(new CustomEvent('lb-resizable-change', {
        detail: { sizes: this.sizes.slice() },
        bubbles: true
      }));
    }

    setSizes(sizes) {
      if (!Array.isArray(sizes) || sizes.length !== this.panels.length) return;
      this.sizes = sizes.slice();
      this._applySizes();
      this._dispatchChange();
    }
  }

  // ─── TREE ──────────────────────────────────────────────────
  // Hierarchical list. <ul data-lb-tree> with <li data-lb-node>
  // children. Each node's text content (excluding nested <ul>) becomes
  // its label; an optional data-lb-icon attribute on the node renders
  // a glyph (the attribute is stripped after read so the global
  // initIcons sweep doesn't clobber the rendered children).
  // Single-select; expanded state via aria-expanded.

  class Tree {
    constructor(el) {
      this.el = el;
      this.selected = null;     // currently selected row element
      this.activeRow = null;    // row holding the tab stop
      this._setup();
    }

    _setup() {
      this.el.classList.add('lb-tree');
      this.el.setAttribute('role', 'tree');
      // Recursive walk wraps each node at its correct depth so
      // aria-level is accurate. Wrapping is idempotent, but we don't
      // need a separate first pass.
      this._annotateLevels(this.el, 1);
      // First row gets the tab stop; the rest are tabindex=-1.
      const firstRow = this.el.querySelector('.lb-tree__row');
      if (firstRow) {
        firstRow.tabIndex = 0;
        this.activeRow = firstRow;
      }
      this.el.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _wrapNode(li, level) {
      if (li._lbTreeWrapped) return;
      li._lbTreeWrapped = true;
      li.classList.add('lb-tree__node');
      li.setAttribute('role', 'treeitem');

      // Children UL (only the FIRST direct-child UL counts as children).
      const childrenUl = Array.from(li.children).find((c) => c.tagName === 'UL');
      const hasChildren = !!childrenUl;
      const expanded = hasChildren && li.hasAttribute('data-lb-expanded');

      // Extract label: every direct child that isn't the children UL,
      // joined as text. Preserves accidental whitespace tolerantly.
      let label = '';
      Array.from(li.childNodes).forEach((n) => {
        if (n === childrenUl) return;
        if (n.nodeType === 3) label += n.textContent;
        else if (n.nodeType === 1) label += n.textContent;
      });
      label = label.trim();

      const iconName = li.getAttribute('data-lb-icon');
      // Strip — global initIcons would otherwise overwrite this li's
      // children with a single icon SVG (same trap as Rating).
      if (iconName) li.removeAttribute('data-lb-icon');
      const value = li.getAttribute('data-lb-value') || label;

      // Build the row.
      const row = document.createElement('div');
      row.className = 'lb-tree__row';
      row.tabIndex = -1;
      row.dataset.lbValue = value;
      li._lbRow = row;
      li._lbLabel = label;
      li._lbHasChildren = hasChildren;

      const chevron = document.createElement('span');
      chevron.className = 'lb-tree__chevron' + (hasChildren ? '' : ' lb-tree__chevron--leaf');
      if (hasChildren) {
        chevron.setAttribute('data-lb-icon', expanded ? 'chevron-down' : 'chevron-right');
      }
      chevron.setAttribute('aria-hidden', 'true');
      row.appendChild(chevron);

      if (iconName) {
        const icon = document.createElement('span');
        icon.className = 'lb-tree__icon';
        icon.setAttribute('data-lb-icon', iconName);
        icon.setAttribute('aria-hidden', 'true');
        row.appendChild(icon);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'lb-tree__label';
      labelSpan.textContent = label;
      row.appendChild(labelSpan);

      // Wipe the LI's text/leaf content but keep the children UL.
      Array.from(li.childNodes).forEach((n) => { if (n !== childrenUl) li.removeChild(n); });
      li.insertBefore(row, childrenUl || null);

      // Children container.
      if (childrenUl) {
        childrenUl.classList.add('lb-tree__children');
        childrenUl.setAttribute('role', 'group');
        if (!expanded) childrenUl.hidden = true;
        li.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }

      li.setAttribute('aria-level', level);

      // Wire interactions. Clicking a parent row toggles expand AND
      // selects in one gesture (file-explorer pattern). Leaves just
      // select. The chevron is no longer a separate hit target — the
      // entire row carries the same affordance, which keeps the UX
      // predictable and doesn't punish imprecise clicks on dense lists.
      row.addEventListener('click', () => {
        this._select(row);
        if (hasChildren) this._toggle(li);
      });
      row.addEventListener('focus', () => { this.activeRow = row; });

      if (window.LB && window.LB.initIcons) window.LB.initIcons(row);
    }

    _annotateLevels(scope, level) {
      Array.from(scope.children).forEach((child) => {
        if (child.tagName === 'LI' && child.hasAttribute('data-lb-node')) {
          this._wrapNode(child, level);
          const childrenUl = child.querySelector(':scope > .lb-tree__children');
          if (childrenUl) this._annotateLevels(childrenUl, level + 1);
        }
      });
    }

    _toggle(li) {
      const expanded = li.getAttribute('aria-expanded') === 'true';
      this._setExpanded(li, !expanded);
    }

    _setExpanded(li, expanded) {
      if (!li._lbHasChildren) return;
      const childrenUl = li.querySelector(':scope > .lb-tree__children');
      const chevron = li._lbRow.querySelector('.lb-tree__chevron');
      li.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (childrenUl) childrenUl.hidden = !expanded;
      if (chevron) {
        chevron.setAttribute('data-lb-icon', expanded ? 'chevron-down' : 'chevron-right');
        chevron.innerHTML = '';
        chevron._lbIconDone = false;
        if (window.LB && window.LB.initIcons) window.LB.initIcons(chevron.parentElement || chevron);
      }
      this.el.dispatchEvent(new CustomEvent('lb-tree-expand', {
        detail: { value: li._lbRow.dataset.lbValue, expanded }, bubbles: true
      }));
    }

    _select(row) {
      if (this.selected) this.selected.classList.remove('lb-tree__row--selected');
      this.selected = row;
      row.classList.add('lb-tree__row--selected');
      this._setActive(row);
      this.el.dispatchEvent(new CustomEvent('lb-tree-select', {
        detail: { value: row.dataset.lbValue, label: row.parentElement._lbLabel },
        bubbles: true
      }));
    }

    _setActive(row) {
      if (this.activeRow && this.activeRow !== row) this.activeRow.tabIndex = -1;
      row.tabIndex = 0;
      row.focus();
      this.activeRow = row;
    }

    _visibleRows() {
      // All rows whose ancestor chain has no collapsed group.
      return Array.from(this.el.querySelectorAll('.lb-tree__row')).filter((row) => {
        let cur = row.parentElement;        // li
        while (cur && cur !== this.el) {
          if (cur.tagName === 'UL' && cur.hidden) return false;
          cur = cur.parentElement;
        }
        return true;
      });
    }

    _onKeyDown(e) {
      const row = this.activeRow;
      if (!row) return;
      const li = row.parentElement;
      const visible = this._visibleRows();
      const idx = visible.indexOf(row);
      switch (e.key) {
        case 'ArrowDown':
          if (idx < visible.length - 1) this._setActive(visible[idx + 1]);
          e.preventDefault(); break;
        case 'ArrowUp':
          if (idx > 0) this._setActive(visible[idx - 1]);
          e.preventDefault(); break;
        case 'ArrowRight':
          if (li._lbHasChildren) {
            if (li.getAttribute('aria-expanded') === 'true') {
              // Move to first child if any.
              const firstChild = li.querySelector(':scope > .lb-tree__children > .lb-tree__node > .lb-tree__row');
              if (firstChild) this._setActive(firstChild);
            } else {
              this._setExpanded(li, true);
            }
          }
          e.preventDefault(); break;
        case 'ArrowLeft':
          if (li._lbHasChildren && li.getAttribute('aria-expanded') === 'true') {
            this._setExpanded(li, false);
          } else {
            // Move to parent row, if any.
            const parentLi = li.parentElement && li.parentElement.parentElement;
            if (parentLi && parentLi.classList && parentLi.classList.contains('lb-tree__node')) {
              this._setActive(parentLi._lbRow);
            }
          }
          e.preventDefault(); break;
        case 'Home':
          if (visible.length) this._setActive(visible[0]);
          e.preventDefault(); break;
        case 'End':
          if (visible.length) this._setActive(visible[visible.length - 1]);
          e.preventDefault(); break;
        case 'Enter':
          this._select(row);
          e.preventDefault(); break;
        case ' ':
          if (li._lbHasChildren) this._toggle(li);
          e.preventDefault(); break;
      }
    }

    // ── Public API ──
    expandAll() {
      this.el.querySelectorAll('li.lb-tree__node[aria-expanded]').forEach((li) => this._setExpanded(li, true));
    }
    collapseAll() {
      this.el.querySelectorAll('li.lb-tree__node[aria-expanded]').forEach((li) => this._setExpanded(li, false));
    }
    getSelected() { return this.selected ? this.selected.dataset.lbValue : null; }
    setSelected(value) {
      const row = this.el.querySelector(`.lb-tree__row[data-lb-value="${CSS.escape(value)}"]`);
      if (row) this._select(row);
    }
  }

  // ─── SPARKLINE ─────────────────────────────────────────────
  // Inline mini chart — line, area, bar. Hand-rolled SVG, no deps.
  // Renders into a viewBox of 0 0 100 H so it scales fluidly with
  // the host's CSS size (no resize observer needed).

  class Sparkline {
    constructor(el) {
      this.el = el;
      this.variant = el.dataset.lbVariant || 'line';
      this.dot = el.hasAttribute('data-lb-dot');
      this.color = el.dataset.lbColor || null;
      this.data = this._parseData();
      this.el.classList.add('lb-sparkline');
      this.el.setAttribute('role', 'img');
      if (this.color) this.el.style.setProperty('--color', this.color);
      // Build a stable SVG once; viewBox + contents update on every
      // resize so circles stay circles and stroke widths don't stretch.
      this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.el.appendChild(this._svg);
      this._renderContents();
      this._observeResize();
    }

    _parseData() {
      const raw = this.el.dataset.lbData;
      if (!raw) return [];
      return raw.split(',').map((n) => parseFloat(n.trim())).filter((n) => Number.isFinite(n));
    }

    _observeResize() {
      if (typeof ResizeObserver === 'undefined') return;
      let pending = false;
      this._ro = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; this._renderContents(); });
      });
      this._ro.observe(this._svg);
    }

    _renderContents() {
      this.el.setAttribute('aria-label', this._a11ySummary());
      // Empty / single-point fallback — nothing meaningful to draw.
      if (this.data.length < 2) { this._svg.innerHTML = ''; return; }

      // Real-pixel viewBox so the dot stays a circle (not an ellipse)
      // and stroke widths don't get squashed when the host stretches
      // wider than its natural aspect ratio.
      const rect = this._svg.getBoundingClientRect();
      const W = Math.max(20, Math.round(rect.width));
      const H = Math.max(8, Math.round(rect.height));
      this._svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const min = Math.min(...this.data);
      const max = Math.max(...this.data);
      const range = max - min || 1;
      const n = this.data.length;
      // Inner padding: 2px top/bottom keeps a flat line away from the
      // host's borders/edges; horizontal padding equal to dot radius
      // (3px) so the end-of-series dot doesn't get clipped.
      const padY = 2;
      const padX = 3;

      this._svg.innerHTML = this._renderInner(W, H, min, range, n, padX, padY);
    }

    _xy(i, n, v, min, range, W, H, padX, padY) {
      const x = n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX);
      const y = H - padY - ((v - min) / range) * (H - 2 * padY);
      return { x, y };
    }

    _renderInner(W, H, min, range, n, padX, padY) {
      if (this.variant === 'bar') {
        const gap = Math.max(1, Math.min(3, Math.floor(W / n / 4)));
        const bw = (W - gap * (n - 1)) / n;
        return this.data.map((v, i) => {
          const x = i * (bw + gap);
          const h = ((v - min) / range) * (H - 2 * padY);
          const y = H - padY - h;
          return `<rect class="lb-sparkline__bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}"/>`;
        }).join('');
      }
      // Line / area
      const points = this.data.map((v, i) => this._xy(i, n, v, min, range, W, H, padX, padY));
      const linePath = 'M ' + points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ');
      let out = '';
      if (this.variant === 'area') {
        const areaPath = `M ${points[0].x.toFixed(2)},${H} L ` +
          points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ') +
          ` L ${points[points.length - 1].x.toFixed(2)},${H} Z`;
        out += `<path class="lb-sparkline__area" d="${areaPath}"/>`;
      }
      out += `<path class="lb-sparkline__line" d="${linePath}"/>`;
      if (this.dot) {
        const last = points[points.length - 1];
        // 4px radius — visible at every host width since viewBox is
        // pixel-correct. Combined with overflow:visible on the parent
        // SVG so the dot can extend past the right edge without being
        // clipped by the SVG box.
        out += `<circle class="lb-sparkline__dot" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="4"/>`;
      }
      return out;
    }

    _a11ySummary() {
      if (!this.data.length) return 'Sparkline (no data)';
      const first = this.data[0];
      const last = this.data[this.data.length - 1];
      const trend = last > first ? 'rising' : last < first ? 'falling' : 'flat';
      return `Sparkline: ${this.data.length} points, ${trend} from ${first} to ${last}`;
    }

    setData(arr) {
      if (!Array.isArray(arr)) return;
      this.data = arr.filter((n) => Number.isFinite(n));
      this.el.dataset.lbData = this.data.join(',');
      this._renderContents();
    }
  }

  // ─── DONUT ─────────────────────────────────────────────────
  // SVG donut chart. Each segment is a same-radius circle with
  // stroke-dasharray cut to that segment's arc length, then rotated
  // around the center so the sum starts at 12 o'clock and walks
  // clockwise. Thickness is controlled by stroke-width via the
  // --thickness custom property (in viewBox units; 0..50).

  // L2 categorical data palette — 8 indexed colors. Charts walk this
  // list when a colors[] override is not supplied.
  const SHARED_DATA_PALETTE_VARS = [
    '--lb-data-1', '--lb-data-2', '--lb-data-3', '--lb-data-4',
    '--lb-data-5', '--lb-data-6', '--lb-data-7', '--lb-data-8'
  ];

  function _readJsonChild(el) {
    const script = el.querySelector(':scope > script[type="application/json"]');
    if (!script) return null;
    try { return JSON.parse(script.textContent); } catch { return null; }
  }

  function _seriesColor(i, override) {
    if (override && override[i]) return override[i];
    return `var(${SHARED_DATA_PALETTE_VARS[i % SHARED_DATA_PALETTE_VARS.length]})`;
  }

  class Donut {
    constructor(el) {
      this.el = el;
      const cfg = _readJsonChild(el) || {};
      this.data = Array.isArray(cfg.data) ? cfg.data : [];
      this.colors = Array.isArray(cfg.colors) ? cfg.colors : null;
      this.thickness = Number.isFinite(cfg.thickness) ? cfg.thickness : 14; // 0..50
      // Gap between adjacent slices — defaults to the global data-gap
      // token (px in chart space, 100-unit viewBox). Override via the
      // `gap` JSON config when a tighter look is wanted.
      this.gap = Number.isFinite(cfg.gap) ? cfg.gap : _dataGap(this.el);
      this._render();
    }

    _render() {
      this.el.classList.add('lb-donut');
      this.el.style.setProperty('--thickness', this.thickness);
      const total = this.data.reduce((a, d) => a + (d.value || 0), 0);
      // Empty donut — render the track only.
      const cx = 50, cy = 50;
      const r = 50 - this.thickness / 2; // stroke is centered on the path; half goes outside, half inside
      const C = 2 * Math.PI * r;
      const trackSvg = `<circle class="lb-donut__track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${this.thickness}"/>`;

      let segs = '';
      if (total > 0) {
        // Per segment: arc length = (value/total) * C, minus the gap
        // for visual breathing. Rotate so the segment starts where the
        // previous one ended. Start angle -90° puts 0 at 12 o'clock.
        let cumulative = 0;
        this.data.forEach((d, i) => {
          const v = d.value || 0;
          if (v <= 0) return;
          const fraction = v / total;
          const arc = fraction * C;
          const dash = Math.max(0, arc - this.gap);
          const offset = -cumulative; // dashoffset shifts dasharray START
          const rotate = -90 + (cumulative / C) * 360;
          const color = _seriesColor(i, this.colors);
          segs += `<circle class="lb-donut__seg" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${this.thickness}" stroke="${color}" stroke-dasharray="${dash} ${C}" transform="rotate(${rotate.toFixed(2)} ${cx} ${cy})"><title>${d.label || ''}: ${v}</title></circle>`;
          cumulative += arc;
        });
      }

      const svg = `<svg viewBox="0 0 100 100" role="img" aria-label="${this._a11ySummary(total)}">${trackSvg}${segs}</svg>`;
      // Preserve a center slot if it already exists in the DOM.
      const existingCenter = this.el.querySelector(':scope > .lb-donut__center');
      this.el.innerHTML = svg;
      if (existingCenter) this.el.appendChild(existingCenter);
    }

    _a11ySummary(total) {
      if (!this.data.length) return 'Donut chart (no data)';
      const parts = this.data.map((d) => `${d.label || ''}: ${d.value}`).join(', ');
      return `Donut chart of ${total}: ${parts}`;
    }

    setData(data) {
      this.data = Array.isArray(data) ? data : [];
      this._render();
    }
  }

  // ─── CHART HELPERS ─────────────────────────────────────────
  // Shared math for Bar/Line charts. niceTicks generates round-number
  // ticks for an axis; niceMax gives the upper bound after rounding.
  // Port of d3-array's logic, ~30 lines instead of pulling the dep.

  function _niceStep(range, count) {
    const step0 = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    return step;
  }
  function niceTicks(min, max, count = 5) {
    if (min === max) return [min];
    const step = _niceStep(max - min, count);
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = start; v <= end + 1e-9; v += step) ticks.push(parseFloat(v.toPrecision(12)));
    return ticks;
  }
  function fmtTick(v) {
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1000)    return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }
  function _ensureChartTooltip(host) {
    let tip = host.querySelector(':scope > .lb-chart-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'lb-chart-tooltip';
      host.appendChild(tip);
    }
    return tip;
  }
  // Gap (px) used between adjacent same-color regions inside charts —
  // grouped bar siblings, stacked segments, donut arcs. Reads from the
  // L1 size token --lb-size-0-5x (2px) so the gap stays in lockstep
  // with the system's spacing scale. Falls back to 2 if the token
  // isn't defined for any reason.
  function _dataGap(host) {
    const raw = getComputedStyle(host).getPropertyValue('--lb-size-0-5x').trim();
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 2;
  }

  // ─── BAR CHART ─────────────────────────────────────────────
  // Vertical or horizontal, single or multi-series, grouped or stacked.
  // Configured via JSON in a script[type=application/json] child.
  // {
  //   x:      [labels...]                  // category axis values
  //   series: [{ name, data: [...] }, ...] // one or more series
  //   orientation: "vertical" | "horizontal"
  //   stacked: bool
  //   colors:  ["..."]                     // optional per-series colors
  // }

  class BarChart {
    constructor(el) {
      this.el = el;
      const cfg = _readJsonChild(el) || {};
      this.x = Array.isArray(cfg.x) ? cfg.x : [];
      this.series = Array.isArray(cfg.series) ? cfg.series : [];
      this.orientation = cfg.orientation === 'horizontal' ? 'horizontal' : 'vertical';
      this.stacked = !!cfg.stacked;
      this.colors = Array.isArray(cfg.colors) ? cfg.colors : null;
      this.legend = cfg.legend !== false; // shown by default if multi-series
      this.el.classList.add('lb-bar-chart');
      this._tooltip = _ensureChartTooltip(this.el);
      // Build a stable SVG element once; subsequent re-renders update
      // viewBox + innerHTML rather than recreate the node so the
      // ResizeObserver target stays valid.
      this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._svg.setAttribute('role', 'img');
      this.el.appendChild(this._svg);
      this._renderLegend();
      this._renderContents();
      this._observeResize();
    }

    _renderLegend() {
      const existing = this.el.querySelector(':scope > .lb-bar-chart__legend');
      if (existing) existing.remove();
      if (this.series.length < 2 || !this.legend) return;
      const ul = document.createElement('div');
      ul.className = 'lb-bar-chart__legend';
      this.series.forEach((s, i) => {
        const item = document.createElement('span');
        item.className = 'lb-bar-chart__legend-item';
        item.innerHTML = `<span class="lb-bar-chart__legend-swatch" style="background: ${_seriesColor(i, this.colors)};"></span>${s.name || ''}`;
        ul.appendChild(item);
      });
      this.el.insertBefore(ul, this.el.firstChild);
    }

    _observeResize() {
      if (typeof ResizeObserver === 'undefined') return;
      let pending = false;
      this._ro = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; this._renderContents(); });
      });
      this._ro.observe(this._svg);
    }

    _renderContents() {
      // ResizeObserver-driven render — the SVG's viewBox matches its
      // actual rendered pixel size 1:1 so text labels stay crisp at
      // any container width. Sub-pixel rounding to integers keeps
      // line strokes from blurring on retina.
      const rect = this._svg.getBoundingClientRect();
      const W = Math.max(80, Math.round(rect.width));
      const H = Math.max(80, Math.round(rect.height));
      this._svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this._svg.setAttribute('aria-label', this._a11ySummary());

      // Padding for axes — left for y-axis labels, bottom for x-axis,
      // top for headroom (max bar shouldn't kiss the top), right small.
      const pad = { top: 12, right: 16, bottom: 36, left: 44 };
      const innerW = W - pad.left - pad.right;
      const innerH = H - pad.top - pad.bottom;

      const isHorz = this.orientation === 'horizontal';
      const valueExtent = this._valueExtent();
      const ticks = niceTicks(0, valueExtent, 5);
      const valueMax = ticks[ticks.length - 1];

      const parts = [];
      // Grid lines for the value axis
      const gridLines = ticks.map((t) => {
        if (isHorz) {
          const x = pad.left + (t / valueMax) * innerW;
          return `<line x1="${x}" x2="${x}" y1="${pad.top}" y2="${pad.top + innerH}"/>`;
        }
        const y = pad.top + innerH - (t / valueMax) * innerH;
        return `<line x1="${pad.left}" x2="${pad.left + innerW}" y1="${y}" y2="${y}"/>`;
      });
      parts.push(`<g class="lb-bar-chart__grid">${gridLines.join('')}</g>`);
      // Value axis tick labels
      ticks.forEach((t) => {
        if (isHorz) {
          const x = pad.left + (t / valueMax) * innerW;
          parts.push(`<text x="${x}" y="${pad.top + innerH + 18}" text-anchor="middle" class="lb-bar-chart__axis-label">${fmtTick(t)}</text>`);
        } else {
          const y = pad.top + innerH - (t / valueMax) * innerH;
          parts.push(`<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="lb-bar-chart__axis-label">${fmtTick(t)}</text>`);
        }
      });

      // Category labels and bars
      const n = this.x.length;
      const slot = (isHorz ? innerH : innerW) / Math.max(n, 1);
      const slotPad = 0.18;
      const groupSize = slot * (1 - slotPad);
      const groupOffset = slot * slotPad / 2;
      const seriesCount = this.series.length || 1;
      // Gap between adjacent same-color regions — accessibility win for
      // colour-blind users. For grouped: subtract the gap from each
      // sibling's width. For stacked: subtract from each non-last
      // segment's length so a thin slice of background shows through.
      const gap = _dataGap(this.el);
      const subBar = (this.stacked
        ? groupSize
        : (groupSize - gap * (seriesCount - 1)) / seriesCount);

      this.x.forEach((label, i) => {
        if (isHorz) {
          const y = pad.top + i * slot + slot / 2 + 4;
          parts.push(`<text x="${pad.left - 8}" y="${y}" text-anchor="end" class="lb-bar-chart__axis-label">${label}</text>`);
        } else {
          const x = pad.left + i * slot + slot / 2;
          parts.push(`<text x="${x}" y="${pad.top + innerH + 18}" text-anchor="middle" class="lb-bar-chart__axis-label">${label}</text>`);
        }

        // Count non-zero series for stacked-gap accounting (so we don't
        // shrink the only visible segment in a sparse category).
        let nonZeroIndex = 0;
        const nonZeroCount = this.series.reduce((acc, s) => acc + ((s.data?.[i] ?? 0) > 0 ? 1 : 0), 0);
        let stackAccum = 0;
        this.series.forEach((s, si) => {
          const v = s.data?.[i] ?? 0;
          if (v == null) return;
          const color = _seriesColor(si, this.colors);
          const len = (v / valueMax) * (isHorz ? innerW : innerH);
          // Stacked: shrink each non-last visible segment by `gap` so
          // adjacent slices have a clear divider line.
          const isLastVisible = (v > 0) && (nonZeroIndex === nonZeroCount - 1);
          const segLen = (this.stacked && v > 0 && !isLastVisible) ? Math.max(1, len - gap) : len;
          if (v > 0) nonZeroIndex++;
          let x, y, w, h;
          if (this.stacked) {
            const startLen = (stackAccum / valueMax) * (isHorz ? innerW : innerH);
            stackAccum += v;
            if (isHorz) {
              x = pad.left + startLen;
              y = pad.top + i * slot + groupOffset;
              w = segLen; h = groupSize;
            } else {
              x = pad.left + i * slot + groupOffset;
              y = pad.top + innerH - startLen - segLen;
              w = groupSize; h = segLen;
            }
          } else {
            // Grouped: each sibling shifts by (subBar + gap) so they
            // never kiss.
            if (isHorz) {
              x = pad.left;
              y = pad.top + i * slot + groupOffset + si * (subBar + gap);
              w = len; h = subBar;
            } else {
              x = pad.left + i * slot + groupOffset + si * (subBar + gap);
              y = pad.top + innerH - len;
              w = subBar; h = len;
            }
          }
          const radius = Math.min(2, Math.min(w, h) / 4);
          parts.push(`<rect class="lb-bar-chart__bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${radius}" fill="${color}" data-bar-cat="${i}" data-bar-series="${si}"/>`);
        });
      });

      this._svg.innerHTML = parts.join('');
      this._wireTooltip();
    }

    _valueExtent() {
      if (this.stacked) {
        // Maximum of per-category sums.
        let max = 0;
        const n = this.x.length;
        for (let i = 0; i < n; i++) {
          let sum = 0;
          this.series.forEach((s) => { sum += s.data?.[i] ?? 0; });
          if (sum > max) max = sum;
        }
        return Math.max(max, 1);
      }
      // Grouped — max single value across all series.
      let max = 0;
      this.series.forEach((s) => (s.data || []).forEach((v) => { if (v > max) max = v; }));
      return Math.max(max, 1);
    }

    _wireTooltip() {
      this._svg.querySelectorAll('.lb-bar-chart__bar').forEach((bar) => {
        bar.addEventListener('mouseenter', (e) => this._showTooltip(e, bar));
        bar.addEventListener('mousemove', (e) => this._positionTooltip(e));
        bar.addEventListener('mouseleave', () => this._hideTooltip());
      });
    }

    _showTooltip(e, bar) {
      const ci = parseInt(bar.dataset.barCat, 10);
      const si = parseInt(bar.dataset.barSeries, 10);
      const cat = this.x[ci];
      const series = this.series[si];
      const value = series?.data?.[ci];
      const color = _seriesColor(si, this.colors);
      this._tooltip.innerHTML = `
        <div class="lb-chart-tooltip__title">${cat ?? ''}</div>
        <div class="lb-chart-tooltip__row">
          <span class="lb-chart-tooltip__swatch" style="background: ${color};"></span>
          <span class="lb-chart-tooltip__label">${series?.name || ''}</span>
          <span class="lb-chart-tooltip__value">${value}</span>
        </div>
      `;
      this._tooltip.dataset.visible = 'true';
      this._positionTooltip(e);
    }

    _positionTooltip(e) {
      const hostRect = this.el.getBoundingClientRect();
      const x = e.clientX - hostRect.left;
      const y = e.clientY - hostRect.top;
      this._tooltip.style.left = `${x}px`;
      this._tooltip.style.top = `${y}px`;
    }

    _hideTooltip() {
      this._tooltip.dataset.visible = 'false';
    }

    _a11ySummary() {
      if (!this.series.length) return 'Bar chart (no data)';
      const summary = this.series.map((s) => `${s.name || ''}: ${(s.data || []).join(', ')}`).join(' | ');
      return `Bar chart over ${this.x.length} categories — ${summary}`;
    }

    setData(cfg) {
      if (cfg.x) this.x = cfg.x;
      if (cfg.series) this.series = cfg.series;
      if (cfg.colors !== undefined) this.colors = cfg.colors;
      if (cfg.stacked !== undefined) this.stacked = !!cfg.stacked;
      if (cfg.orientation) this.orientation = cfg.orientation === 'horizontal' ? 'horizontal' : 'vertical';
      this._renderLegend();
      this._renderContents();
    }
  }

  // ─── LINE / AREA CHART ─────────────────────────────────────
  // Single or multi-series. Lines drawn as SVG paths; area variant
  // closes each line back to baseline at low opacity. Reuses niceTicks
  // for axis ticks and the shared chart tooltip pattern.

  class LineChart {
    constructor(el) {
      this.el = el;
      const cfg = _readJsonChild(el) || {};
      this.x = Array.isArray(cfg.x) ? cfg.x : [];
      this.series = Array.isArray(cfg.series) ? cfg.series : [];
      this.area = !!cfg.area;
      this.colors = Array.isArray(cfg.colors) ? cfg.colors : null;
      this.legend = cfg.legend !== false;
      this.el.classList.add('lb-line-chart');
      this._tooltip = _ensureChartTooltip(this.el);
      this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._svg.setAttribute('role', 'img');
      this.el.appendChild(this._svg);
      this._renderLegend();
      this._renderContents();
      this._observeResize();
    }

    _renderLegend() {
      const existing = this.el.querySelector(':scope > .lb-line-chart__legend');
      if (existing) existing.remove();
      if (this.series.length < 2 || !this.legend) return;
      const ul = document.createElement('div');
      ul.className = 'lb-line-chart__legend';
      this.series.forEach((s, i) => {
        const item = document.createElement('span');
        item.className = 'lb-line-chart__legend-item';
        item.innerHTML = `<span class="lb-line-chart__legend-swatch" style="background: ${_seriesColor(i, this.colors)};"></span>${s.name || ''}`;
        ul.appendChild(item);
      });
      this.el.insertBefore(ul, this.el.firstChild);
    }

    _observeResize() {
      if (typeof ResizeObserver === 'undefined') return;
      let pending = false;
      this._ro = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; this._renderContents(); });
      });
      this._ro.observe(this._svg);
    }

    _renderContents() {
      // viewBox in actual rendered pixels — keeps text labels crisp at
      // any container size. Same approach as Bar Chart.
      const rect = this._svg.getBoundingClientRect();
      const W = Math.max(80, Math.round(rect.width));
      const H = Math.max(80, Math.round(rect.height));
      this._svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this._svg.setAttribute('aria-label', this._a11ySummary());

      const pad = { top: 12, right: 16, bottom: 36, left: 44 };
      const innerW = W - pad.left - pad.right;
      const innerH = H - pad.top - pad.bottom;

      const valueMax = this._valueExtent();
      const ticks = niceTicks(0, valueMax, 5);
      const tickMax = ticks[ticks.length - 1];
      const n = this.x.length;

      const xAt = (i) => n <= 1 ? pad.left + innerW / 2 : pad.left + (i / (n - 1)) * innerW;
      const yAt = (v) => pad.top + innerH - (v / tickMax) * innerH;

      const parts = [];

      // Grid lines (horizontal, value axis)
      const gridLines = ticks.map((t) => {
        const y = yAt(t);
        return `<line x1="${pad.left}" x2="${pad.left + innerW}" y1="${y}" y2="${y}"/>`;
      });
      parts.push(`<g class="lb-line-chart__grid">${gridLines.join('')}</g>`);

      // Y-axis tick labels
      ticks.forEach((t) => {
        parts.push(`<text x="${pad.left - 8}" y="${yAt(t) + 4}" text-anchor="end" class="lb-line-chart__axis-label">${fmtTick(t)}</text>`);
      });

      // X-axis category labels — thin out if there are many to avoid overlap.
      const labelStep = Math.max(1, Math.ceil(n / 10));
      this.x.forEach((label, i) => {
        if (i % labelStep !== 0 && i !== n - 1) return;
        parts.push(`<text x="${xAt(i)}" y="${pad.top + innerH + 18}" text-anchor="middle" class="lb-line-chart__axis-label">${label}</text>`);
      });

      // Render in three passes so a later series's area never overpaints
      // an earlier series's line:
      //   1. all areas (fills, low opacity)
      //   2. all lines (sit on top of every area)
      //   3. all dots (sit on top of every line)
      // This keeps each series visually distinct in multi-series area
      // charts — same accessibility win as gaps in bar charts.
      const allPoints = this.series.map((s) => {
        const data = s.data || [];
        return data.map((v, i) => ({ x: xAt(i), y: yAt(v ?? 0), v }));
      });
      // Pass 1 — areas
      this.series.forEach((s, si) => {
        if (!this.area) return;
        const points = allPoints[si];
        if (points.length < 2) return;
        const color = _seriesColor(si, this.colors);
        const areaPath = `M ${points[0].x.toFixed(2)},${(pad.top + innerH).toFixed(2)} L ` +
          points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ') +
          ` L ${points[points.length - 1].x.toFixed(2)},${(pad.top + innerH).toFixed(2)} Z`;
        parts.push(`<path class="lb-line-chart__area" d="${areaPath}" fill="${color}"/>`);
      });
      // Pass 2 — lines. series[i].dashed renders the industry-standard
      // comparison overlay (de-emphasized "previous period") as a dashed
      // stroke; pair it with a muted color for the full idiom.
      this.series.forEach((s, si) => {
        const points = allPoints[si];
        if (points.length < 2) return;
        const color = _seriesColor(si, this.colors);
        const linePath = 'M ' + points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ');
        const dashed = s.dashed ? ' lb-line-chart__line--dashed' : '';
        parts.push(`<path class="lb-line-chart__line${dashed}" d="${linePath}" stroke="${color}"/>`);
      });
      // Pass 3 — dots. Two circles per data point:
      //   1. transparent hit target (r=12, 24px diameter — matches --lb-size-6x,
      //      satisfies WCAG 2.5.8 minimum target size of 24×24).
      //   2. visible dot (r=4, 8px diameter — matches --lb-size-2x).
      // Hit target is rendered FIRST so .hit:hover + .dot { … } works as a
      // classical adjacent-sibling selector. Visible dot has pointer-events: none
      // so events fall through to the hit target underneath.
      this.series.forEach((s, si) => {
        const points = allPoints[si];
        const color = _seriesColor(si, this.colors);
        points.forEach((p, i) => {
          parts.push(`<circle class="lb-line-chart__hit" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="12" data-cat="${i}" data-series="${si}"/>`);
          parts.push(`<circle class="lb-line-chart__dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" fill="${color}"/>`);
        });
      });

      this._svg.innerHTML = parts.join('');
      this._wireTooltip();
    }

    _valueExtent() {
      let max = 0;
      this.series.forEach((s) => (s.data || []).forEach((v) => { if (v > max) max = v; }));
      return Math.max(max, 1);
    }

    _wireTooltip() {
      // Events fire on the larger transparent hit target, not the visual dot.
      this._svg.querySelectorAll('.lb-line-chart__hit').forEach((hit) => {
        hit.addEventListener('mouseenter', (e) => this._showTooltip(e, hit));
        hit.addEventListener('mousemove', (e) => this._positionTooltip(e));
        hit.addEventListener('mouseleave', () => this._hideTooltip());
      });
    }

    _showTooltip(e, dot) {
      const ci = parseInt(dot.dataset.cat, 10);
      const si = parseInt(dot.dataset.series, 10);
      const cat = this.x[ci];
      const series = this.series[si];
      const value = series?.data?.[ci];
      const color = _seriesColor(si, this.colors);
      // Multi-series: list ALL series at this x position so the user
      // can compare in one hover.
      let rows = '';
      if (this.series.length > 1) {
        this.series.forEach((s, i) => {
          const c = _seriesColor(i, this.colors);
          const v = s.data?.[ci];
          rows += `
            <div class="lb-chart-tooltip__row">
              <span class="lb-chart-tooltip__swatch" style="background: ${c};"></span>
              <span class="lb-chart-tooltip__label">${s.name || ''}</span>
              <span class="lb-chart-tooltip__value">${v ?? '—'}</span>
            </div>`;
        });
      } else {
        rows = `
          <div class="lb-chart-tooltip__row">
            <span class="lb-chart-tooltip__swatch" style="background: ${color};"></span>
            <span class="lb-chart-tooltip__label">${series?.name || ''}</span>
            <span class="lb-chart-tooltip__value">${value}</span>
          </div>`;
      }
      this._tooltip.innerHTML = `<div class="lb-chart-tooltip__title">${cat ?? ''}</div>${rows}`;
      this._tooltip.dataset.visible = 'true';
      this._positionTooltip(e);
    }

    _positionTooltip(e) {
      const hostRect = this.el.getBoundingClientRect();
      this._tooltip.style.left = `${e.clientX - hostRect.left}px`;
      this._tooltip.style.top = `${e.clientY - hostRect.top}px`;
    }

    _hideTooltip() { this._tooltip.dataset.visible = 'false'; }

    _a11ySummary() {
      if (!this.series.length) return 'Line chart (no data)';
      return `Line chart over ${this.x.length} points — ${this.series.map((s) => s.name || '').filter(Boolean).join(', ')}`;
    }

    setData(cfg) {
      if (cfg.x) this.x = cfg.x;
      if (cfg.series) this.series = cfg.series;
      if (cfg.colors !== undefined) this.colors = cfg.colors;
      if (cfg.area !== undefined) this.area = !!cfg.area;
      this._renderLegend();
      this._renderContents();
    }
  }

  // ─── COLOR PICKER ──────────────────────────────────────────
  // Reuses Popover for the trigger-swatch dropdown and Input for the
  // hex field. Custom builds the saturation×value surface, hue slider,
  // and alpha slider — those have no analogue elsewhere in the system.
  // Color math is hand-rolled (~50 lines): hex↔rgb↔hsv plus alpha.
  // The picker drives state in HSV (most intuitive for slider math),
  // emits hex/rgb/hsl/alpha on change.

  // ── Color math ──
  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function _hexToRgb(hex) {
    if (!hex) return null;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 4) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    if (h.length === 6) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: ((n & 255) / 255) };
  }
  function _rgbToHex({ r, g, b, a = 1 }) {
    const h = (n) => _clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    const base = `#${h(r)}${h(g)}${h(b)}`;
    return a < 1 ? `${base}${h(a * 255)}` : base;
  }
  // RGB (0-255) → HSV (h: 0-360, s/v: 0-1)
  function _rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }
  function _hsvToRgb({ h, s, v }) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if      (h <  60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }
  function _rgbToHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if      (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else                 h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return { h, s, l };
  }
  // HSL (h: 0-360, s/l: 0-1) → RGB (0-255). Used by the picker's HSL
  // mode inputs to round-trip user-typed H/S/L back to internal HSV.
  function _hslToRgb({ h, s, l }) {
    if (s === 0) {
      const v = l * 255;
      return { r: v, g: v, b: v };
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h <  60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  // ─── CALENDAR ──────────────────────────────────────────────
  // Event / booking calendar with three views (Month / Week / List)
  // and two intents (browse / book). Sits in the data-viz family,
  // not the input family — Datepicker is the input control. Calendar
  // is the schedule surface.
  //
  // Markup contract:
  //   <div data-lb-calendar
  //        data-lb-view="month|week|list"      (default: month)
  //        data-lb-intent="browse|book"        (default: browse)
  //        data-lb-week-start="0|1"            (default: 1 = Monday, ISO)
  //        data-lb-week-numbers                (default: ON, omit to disable)
  //        data-lb-locale="en-GB"              (default: navigator.language)
  //        data-lb-date="2026-05-07">          (default: today)
  //   </div>
  //
  // Programmatic API (after construction or via `data-lb-calendar` auto-init):
  //   const cal = el._lbCalendar;
  //   cal.setView('week');
  //   cal.setDate(new Date(2026, 4, 7));
  //   cal.setEvents([...]);
  //   cal.setBookingSlots([...]);
  //   cal.next();  cal.prev();  cal.today();
  //
  // Events fired:
  //   lb-calendar-event-click  { event }
  //   lb-calendar-date-click   { date }
  //   lb-calendar-slot-click   { slot }
  //   lb-calendar-view-change  { view }
  //
  // Theming: every visual quality routes through DS tokens. Event
  // categories (1..8) map to --lb-data-N. No hardcoded colours.

  class Calendar {
    constructor(el, options = {}) {
      this.el = el;
      this.view       = options.view       || el.dataset.lbView       || 'month';
      this.intent     = options.intent     || el.dataset.lbIntent     || 'browse';
      this.weekStart  = options.weekStart  ?? parseInt(el.dataset.lbWeekStart || '1', 10);
      this.weekNumbers = options.weekNumbers ?? !el.hasAttribute('data-lb-no-week-numbers');
      this.locale     = options.locale     || el.dataset.lbLocale     || (typeof navigator !== 'undefined' ? navigator.language : 'en-GB');
      // Slot duration in minutes (15 / 30 / 60). 30 is the default:
      // smaller = more visual room per event, less context per screen;
      // larger = the opposite.
      this.slotDuration = options.slotDuration ?? parseInt(el.dataset.lbSlotDuration || '30', 10);
      // Scroll-to time on Week-view first paint. Default 8:00 — the
      // workday morning. We never auto-scroll to the current time:
      // moving the viewport out from under the user loses their place.
      this.scrollHour = options.scrollHour ?? parseInt(el.dataset.lbScrollHour || '8', 10);
      // Working-hours clamp. When set, Week view only renders rows for
      // the [minHour, maxHour) range — useful for booking flows that
      // shouldn't expose midnight slots. Defaults: 0..24 (no clamp).
      // Parse "08:00" or "8" — the "HH:MM" form is more readable in
      // markup but only the hour portion matters.
      const _parseHour = (raw, def) => {
        if (raw == null || raw === '') return def;
        const s = String(raw).split(':')[0];
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? Math.max(0, Math.min(24, n)) : def;
      };
      this.minHour = _parseHour(options.minHour ?? el.dataset.lbMinTime, 0);
      this.maxHour = _parseHour(options.maxHour ?? el.dataset.lbMaxTime, 24);
      // Guard: maxHour must be greater than minHour
      if (this.maxHour <= this.minHour) { this.minHour = 0; this.maxHour = 24; }
      // Re-clamp scrollHour into the visible range so default 8:00
      // doesn't fall outside a 09:00–17:00 working day.
      this.scrollHour = Math.max(this.minHour, Math.min(this.maxHour - 1, this.scrollHour));
      this.events     = options.events     || [];
      this.bookingSlots = options.bookingSlots || [];

      this.date = options.date instanceof Date
        ? options.date
        : (el.dataset.lbDate ? new Date(el.dataset.lbDate) : new Date());

      this._render();
    }

    // ── Public API ──
    setView(view)         { this.view = view;          this._render(); this._dispatch('lb-calendar-view-change', { view }); }
    setDate(date)         { this.date = date;          this._render(); }
    setEvents(events)     { this.events = events || []; this._render(); }
    setBookingSlots(s)    { this.bookingSlots = s || []; this._render(); }
    next()                { this._shift(+1); }
    prev()                { this._shift(-1); }
    today()               { this.date = new Date(); this._render(); }

    _shift(direction) {
      const d = new Date(this.date);
      if (this.view === 'month') d.setMonth(d.getMonth() + direction);
      else if (this.view === 'week') d.setDate(d.getDate() + direction * 7);
      else if (this.view === 'list') d.setDate(d.getDate() + direction * 7);
      this.date = d;
      this._render();
    }

    _dispatch(name, detail) {
      this.el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    // ── ISO 8601 week number ──
    // Week 1 contains the first Thursday of the year. Used for the
    // week-number badges/columns the user explicitly asked for.
    static isoWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }

    // Day-of-week labels following weekStart. Short names per user
    // request ("Mon", "Tue", …). Locale-aware via Intl.DateTimeFormat.
    _weekdayLabels() {
      const fmt = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
      // Reference Monday = 2026-01-05 (a known Monday). Walk 7 days from
      // weekStart to produce the row of labels in the user's order.
      const ref = new Date(2026, 0, 5);
      const labels = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ref);
        d.setDate(ref.getDate() + ((this.weekStart + i) - 1));
        labels.push(fmt.format(d));
      }
      return labels;
    }

    _isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear()
          && a.getMonth() === b.getMonth()
          && a.getDate() === b.getDate();
    }

    // Strip time-of-day so day-comparisons are stable. Returns the
    // start-of-day Date (00:00 local).
    _atDay(date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // ── Rendering ──
    _render() {
      this.el.classList.add('lb-calendar', `lb-calendar--${this.view}`, `lb-calendar--${this.intent}`);
      this.el.innerHTML = this._renderHeader() + this._renderBody();
      this._wire();
      // Tell the gallery icon initialiser to hydrate any data-lb-icon
      // we just stamped (chevrons, "more" indicator).
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this.el);
    }

    // Title text for the current focal date + view. Extracted so the
    // DatePicker heading-variant trigger can use it as its formatDate
    // callback — the trigger label always reflects the calendar's
    // focal-unit format ("May 2026" in month view, "May 4 – 10, 2026"
    // in week/list).
    _formatTitle(date) {
      if (this.view === 'month') {
        return new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric' }).format(date);
      }
      const { start, end } = this._weekRange(date);
      const sameMonth = start.getMonth() === end.getMonth();
      const dayFmt = new Intl.DateTimeFormat(this.locale, { month: 'short', day: 'numeric' });
      const startTxt = dayFmt.format(start);
      const endTxt = sameMonth
        ? new Intl.DateTimeFormat(this.locale, { day: 'numeric' }).format(end)
        : dayFmt.format(end);
      return `${startTxt} – ${endTxt}, ${end.getFullYear()}`;
    }

    _renderHeader() {
      // Title format depends on the focal view's natural unit.
      //   month view → "May 2026" (the focal month)
      //   week/list  → "May 4 – 10, 2026" (the focal week's range)
      const title = this._formatTitle(this.date);

      // Week-number badge — only meaningful in week/list views. For
      // month view, the weekly column on the left carries the W##
      // labels per row; the header just shows the focal month/year.
      let weekBadge = '';
      if (this.weekNumbers && (this.view === 'week' || this.view === 'list')) {
        const w = Calendar.isoWeek(this.date);
        weekBadge = `<span class="lb-calendar__week-badge" aria-label="Week number ${w}">W${w}</span>`;
      }

      return `
        <div class="lb-calendar__header">
          <div class="lb-calendar__title-group">
            <div class="lb-calendar__title-picker" data-lb-cal-title-picker data-title-fallback="${title}"></div>
            ${weekBadge}
          </div>
          <div class="lb-calendar__controls">
            <div class="lb-segmented lb-segmented--sm" data-lb-segmented role="radiogroup" aria-label="Calendar view">
              <button type="button" class="lb-segmented__item" data-lb-value="month" aria-checked="${this.view === 'month'}">Month</button>
              <button type="button" class="lb-segmented__item" data-lb-value="week" aria-checked="${this.view === 'week'}">Week</button>
              <button type="button" class="lb-segmented__item" data-lb-value="list" aria-checked="${this.view === 'list'}">List</button>
            </div>
            <div class="lb-calendar__nav">
              <button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-cal-prev aria-label="Previous">
                <span data-lb-icon="chevron-left" aria-hidden="true"></span>
              </button>
              <button type="button" class="lb-btn lb-btn--secondary lb-btn--small" data-lb-cal-today>Today</button>
              <button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-cal-next aria-label="Next">
                <span data-lb-icon="chevron-right" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    _renderBody() {
      if (this.view === 'week') return this._renderWeek();
      if (this.view === 'list') return this._renderList();
      return this._renderMonth();
    }

    // Week range for the given focal date — returns the start (00:00 of
    // the first weekday following weekStart) and end (23:59:59 of the
    // last weekday). Used by the Week view for grid bounds and by the
    // List view for the agenda window.
    _weekRange(date) {
      const start = this._atDay(date);
      const dow = start.getDay();
      const offset = (dow - this.weekStart + 7) % 7;
      start.setDate(start.getDate() - offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    // ── Month view ──
    //
    // Layout: optional week-number column on the left, then 7 day
    // columns, then 4–6 week rows. Each cell shows date number + up
    // to 3 events as small pills; overflow → "+N more" button → the
    // wider day list opens in a popover (Commit 3).
    _renderMonth() {
      const focal = this.date;
      const year  = focal.getFullYear();
      const month = focal.getMonth();
      const firstOfMonth = new Date(year, month, 1);

      // Walk back to the gridStart — the first day of the week that
      // contains the 1st. Day-of-week math respects weekStart.
      const gridStart = new Date(firstOfMonth);
      const dow = firstOfMonth.getDay();          // 0=Sun..6=Sat
      const offset = (dow - this.weekStart + 7) % 7;
      gridStart.setDate(firstOfMonth.getDate() - offset);

      // Always render 6 weeks (42 cells). Calendars that vary 4/5/6
      // weeks make UI height jitter on month change. Out-of-month days
      // simply read dimmed.
      const weeks = [];
      for (let w = 0; w < 6; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
          const cell = new Date(gridStart);
          cell.setDate(gridStart.getDate() + w * 7 + d);
          days.push(cell);
        }
        weeks.push(days);
      }

      const weekdayRow = this._weekdayLabels()
        .map(label => `<div class="lb-calendar__weekday" role="columnheader">${label}</div>`)
        .join('');

      const today = this._atDay(new Date());

      // Events bucketed by yyyy-mm-dd for O(1) lookup per cell.
      const buckets = {};
      for (const ev of this.events) {
        const start = this._atDay(new Date(ev.start));
        const end   = ev.end ? this._atDay(new Date(ev.end)) : start;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          (buckets[key] = buckets[key] || []).push(ev);
        }
      }

      // Week column (W19 etc) — first cell of each row carries the ISO week.
      const weekColumn = this.weekNumbers ? `<div class="lb-calendar__weekcol-spacer" role="columnheader"><span class="lb-visually-hidden">Week</span></div>` : '';

      const rows = weeks.map(days => {
        const weekNumberCell = this.weekNumbers
          ? `<div class="lb-calendar__weeknum" role="rowheader" aria-label="Week ${Calendar.isoWeek(days[0])}">W${Calendar.isoWeek(days[0])}</div>`
          : '';
        const cells = days.map(date => this._renderMonthCell(date, month, today, buckets)).join('');
        return `<div class="lb-calendar__row" role="row">${weekNumberCell}${cells}</div>`;
      }).join('');

      // The month view is a div-built grid — the gridcell cells need the
      // full role ancestry (grid > row > cell) or they dangle.
      return `
        <div class="lb-calendar__month" role="grid" aria-label="${focal.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">
          <div class="lb-calendar__weekday-row" role="row">
            ${weekColumn}
            ${weekdayRow}
          </div>
          ${rows}
        </div>
      `;
    }

    _renderMonthCell(date, focalMonth, today, buckets) {
      const isOutOfMonth = date.getMonth() !== focalMonth;
      const isToday = this._isSameDay(date, today);
      const isPast = this._atDay(date) < today && !isToday;

      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const dayEvents = (buckets[key] || []);
      const visible = dayEvents.slice(0, 3);
      const overflow = dayEvents.length - visible.length;

      const cls = [
        'lb-calendar__cell',
        isOutOfMonth && 'lb-calendar__cell--out',
        isToday      && 'lb-calendar__cell--today',
        isPast       && 'lb-calendar__cell--past',
      ].filter(Boolean).join(' ');

      const pills = visible.map(ev => {
        const cat = (ev.category != null) ? `--lb-data-${ev.category}` : '--lb-data-1';
        return `
          <button type="button" class="lb-calendar__event"
                  style="--lb-cal-event-color: var(${cat});"
                  data-lb-cal-event-id="${ev.id || ''}"
                  title="${(ev.title || '').replace(/"/g, '&quot;')}">
            <span class="lb-calendar__event-dot" aria-hidden="true"></span>
            <span class="lb-calendar__event-title">${ev.title || ''}</span>
          </button>
        `;
      }).join('');

      const overflowEl = overflow > 0
        ? `<button type="button" class="lb-calendar__more" data-lb-cal-more="${date.toISOString()}">+${overflow} more</button>`
        : '';

      const aria = isToday ? ' aria-current="date"' : '';

      // Booking intent — count badge next to the date number when
      // count: number of AVAILABLE slots that fall on this day. Renders
      // as the shared .lb-counter component (small variant). Past days
      // don't render the badge (slots there are gone). The number is
      // more useful than a binary dot when scanning a month — "1 free"
      // vs "5 free" is different scanning information.
      let bookingBadge = '';
      if (this.intent === 'book' && !isPast) {
        const count = this.bookingSlots.reduce((n, slot) => {
          if (slot.available === false) return n;
          const slStart = new Date(slot.start);
          return this._isSameDay(slStart, date) ? n + 1 : n;
        }, 0);
        if (count > 0) {
          bookingBadge = `<span class="lb-counter lb-counter--small" aria-label="${count} slot${count === 1 ? '' : 's'} available">${count}</span>`;
        }
      }

      return `
        <div class="${cls}" role="gridcell" data-lb-cal-date="${date.toISOString()}"${aria}>
          <div class="lb-calendar__cell-head">
            <span class="lb-calendar__cell-num">${date.getDate()}</span>
            ${bookingBadge}
          </div>
          <div class="lb-calendar__cell-events">
            ${pills}
            ${overflowEl}
          </div>
        </div>
      `;
    }

    // ── Week view ──
    //
    // Layout (post-feedback rewrite):
    //   - Sticky header (day labels + all-day strip) — never scrolls out
    //   - Scrollable body — full 24h grid lives inside, default scroll
    //     position = 8:00 (working-hours convention; user can drag up to
    //     see early hours, down for evening)
    //   - Slot-based grid rows: each "slot" = slotDuration minutes (30 default).
    //     Each slot is 2.5rem tall — a 30-min meeting fills one slot
    //     (40px), 1-hour fills two (80px), more than enough vertical space
    //     to read the title + time. Hour markers every 60min get a
    //     stronger bottom border to keep visual rhythm.
    //   - All-day strip collapses (16px) when no all-day events exist
    //     instead of always reserving 32px.
    //   - "NOW" line gets a small left-anchored label so it reads as a
    //     time indicator at a glance, not a stray dot.
    //   - Past hours within today dim the same way past days do — natural
    //     extension of the user's "show me what's behind vs ahead" cue.
    _renderWeek() {
      const { start } = this._weekRange(this.date);
      const today = this._atDay(new Date());

      // Visible hour range. Defaults 0..24 (whole day); booking flows
      // typically clamp to working hours via data-lb-min-time /
      // data-lb-max-time. Outside this range no rows render — the
      // grid simply ends, no scrolling beyond.
      const hourStart = this.minHour;
      const hourEnd = this.maxHour;
      const slotMin = this.slotDuration;
      const slotsPerHour = 60 / slotMin;
      const totalSlots = (hourEnd - hourStart) * slotsPerHour;
      const totalMinutes = (hourEnd - hourStart) * 60;

      // Days for this week (start..start+6)
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }

      // Day-of-week header row
      const dayHeader = days.map(d => {
        const isToday = this._isSameDay(d, today);
        const isPast = this._atDay(d) < today && !isToday;
        const dowFmt = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
        const numFmt = new Intl.DateTimeFormat(this.locale, { day: 'numeric' });
        const cls = [
          'lb-calendar__week-day-head',
          isToday && 'lb-calendar__week-day-head--today',
          isPast  && 'lb-calendar__week-day-head--past',
        ].filter(Boolean).join(' ');
        return `
          <div class="${cls}">
            <div class="lb-calendar__week-day-name">${dowFmt.format(d)}</div>
            <div class="lb-calendar__week-day-num">${numFmt.format(d)}</div>
          </div>
        `;
      }).join('');

      // All-day events (allDay flag OR multi-day span)
      const allDayEvents = this.events.filter(ev => {
        if (ev.allDay) return true;
        const evStart = this._atDay(new Date(ev.start));
        const evEnd   = this._atDay(new Date(ev.end || ev.start));
        return evEnd > evStart;
      });
      const allDayBars = allDayEvents
        .filter(ev => {
          const evStart = this._atDay(new Date(ev.start));
          const evEnd   = this._atDay(new Date(ev.end || ev.start));
          return evEnd >= start && evStart <= days[6];
        })
        .map(ev => {
          const evStart = this._atDay(new Date(ev.start));
          const evEnd   = this._atDay(new Date(ev.end || ev.start));
          const fromIdx = Math.max(0, Math.round((evStart - start) / 86400000));
          const toIdx   = Math.min(6, Math.round((evEnd - start) / 86400000));
          const cat = (ev.category != null) ? `--lb-data-${ev.category}` : '--lb-data-1';
          return `
            <button type="button" class="lb-calendar__week-allday"
                    style="--lb-cal-event-color: var(${cat}); grid-column: ${fromIdx + 2} / ${toIdx + 3};"
                    data-lb-cal-event-id="${ev.id || ''}"
                    title="${(ev.title || '').replace(/"/g, '&quot;')}">
              <span class="lb-calendar__event-dot" aria-hidden="true"></span>
              <span class="lb-calendar__event-title">${ev.title || ''}</span>
            </button>
          `;
        }).join('');

      // Whether the all-day strip is occupied — drives the collapse-when-
      // empty CSS modifier so empty calendars don't reserve 32px of dead
      // space above the grid.
      const allDayActive = allDayBars.length > 0;

      // Hour-rail labels — one per HOUR (not per slot) so the rail isn't
      // a wall of "08:00 / 08:30 / 09:00 / 09:30 …". Slot grid lines
      // still render via the column cells.
      const hourLabels = [];
      for (let h = hourStart; h < hourEnd; h++) {
        hourLabels.push(`<div class="lb-calendar__week-hour-label" style="grid-row: span ${slotsPerHour};">${String(h).padStart(2, '0')}:00</div>`);
      }

      // Day columns. Each column carries N slot cells (click targets) +
      // absolutely-positioned event blocks computed against minutes.
      const dayColumns = days.map(d => {
        const dayStart = new Date(d);
        dayStart.setHours(hourStart, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(hourEnd, 0, 0, 0);

        // Build slot cells — each slot is a click target with its
        // ISO time. Hour-mark slots get an extra class so the CSS can
        // give them a stronger bottom border (visual hour rhythm).
        const cells = [];
        for (let s = 0; s < totalSlots; s++) {
          const slotStartMin = s * slotMin;
          const slotDate = new Date(d);
          slotDate.setHours(hourStart, 0, 0, 0);
          slotDate.setMinutes(slotStartMin);
          const isHourMark = (slotStartMin % 60) === 0;
          cells.push(`<div class="lb-calendar__week-cell${isHourMark ? ' lb-calendar__week-cell--hour' : ''}" data-lb-cal-date="${slotDate.toISOString()}"></div>`);
        }

        // Single-day, time-bound events. Events with no `end` (or
        // end === start, i.e. zero-duration / instant events) are
        // common from APIs that store only a single timestamp; render
        // them with a default 30-minute block so they're visible.
        // Multi-day timed events are routed to the all-day strip via
        // the early `> evStart` check.
        const dayEvents = this.events.filter(ev => {
          if (ev.allDay) return false;
          const evStart = new Date(ev.start);
          const evEnd   = new Date(ev.end || ev.start);
          if (this._atDay(evEnd) > this._atDay(evStart)) return false;
          return this._isSameDay(evStart, d) && evEnd >= dayStart && evStart < dayEnd;
        });

        const placed = dayEvents.map((ev, i) => {
          const evStart = new Date(ev.start);
          const evEnd   = new Date(ev.end || ev.start);
          const startMin = Math.max(0, (evStart.getHours() - hourStart) * 60 + evStart.getMinutes());
          // Zero-duration events (end===start, common from APIs that
          // store only one timestamp) get a default slotDuration block
          // so they're visible. Capped to the visible range.
          let endMin = Math.min(totalMinutes, (evEnd.getHours() - hourStart) * 60 + evEnd.getMinutes());
          if (endMin <= startMin) {
            endMin = Math.min(totalMinutes, startMin + this.slotDuration);
          }
          if (endMin <= startMin) return null;
          const overlaps = dayEvents.filter(other => {
            if (other === ev) return false;
            const oStart = (new Date(other.start).getHours() - hourStart) * 60 + new Date(other.start).getMinutes();
            const oEnd   = (new Date(other.end || other.start).getHours() - hourStart) * 60 + new Date(other.end || other.start).getMinutes();
            return oStart < endMin && oEnd > startMin;
          });
          const total = overlaps.length + 1;
          const idx = i % total;
          const top = (startMin / totalMinutes) * 100;
          const height = ((endMin - startMin) / totalMinutes) * 100;
          const widthPct = 100 / total;
          const leftPct = idx * widthPct;
          const cat = (ev.category != null) ? `--lb-data-${ev.category}` : '--lb-data-1';
          // Past events (entirely before today's start) read dimmer.
          // Live "in-progress now" events get the full opacity but a
          // subtle accent border so the user can pick them out.
          const now = new Date();
          const isPastEvent = evEnd < now;
          const isLive = evStart <= now && evEnd >= now;
          const cls = [
            'lb-calendar__week-event',
            isPastEvent && 'lb-calendar__week-event--past',
            isLive && 'lb-calendar__week-event--live',
          ].filter(Boolean).join(' ');
          return `
            <button type="button" class="${cls}"
                    style="--lb-cal-event-color: var(${cat});
                           top: ${top.toFixed(2)}%;
                           height: ${Math.max(height, 3).toFixed(2)}%;
                           left: ${leftPct.toFixed(2)}%;
                           width: ${widthPct.toFixed(2)}%;"
                    data-lb-cal-event-id="${ev.id || ''}"
                    title="${(ev.title || '').replace(/"/g, '&quot;')}">
              <span class="lb-calendar__week-event-time">${String(evStart.getHours()).padStart(2,'0')}:${String(evStart.getMinutes()).padStart(2,'0')}</span>
              <span class="lb-calendar__week-event-title">${ev.title || ''}</span>
            </button>
          `;
        }).filter(Boolean).join('');

        const isToday = this._isSameDay(d, today);
        const isPast = this._atDay(d) < today && !isToday;
        const colCls = [
          'lb-calendar__week-col',
          isToday && 'lb-calendar__week-col--today',
          isPast  && 'lb-calendar__week-col--past',
        ].filter(Boolean).join(' ');

        // Past-hours overlay — for today's column only, dim everything
        // BEFORE current time. Visible at-a-glance "this part is the
        // past" cue inside today, mirroring the past-day pattern.
        let pastOverlay = '';
        if (isToday) {
          const nowMin = (new Date().getHours() - hourStart) * 60 + new Date().getMinutes();
          if (nowMin > 0 && nowMin <= totalMinutes) {
            const heightPct = (nowMin / totalMinutes) * 100;
            pastOverlay = `<div class="lb-calendar__week-col-past-overlay" style="height: ${heightPct.toFixed(2)}%;" aria-hidden="true"></div>`;
          }
        }

        // Booking slots for this day. Only render when intent === 'book'
        // AND the day isn't entirely in the past. Slots overlap with
        // the time grid via absolute positioning (z=0) so events still
        // visually win on top. Past slots within today render disabled
        // (greyed out + non-clickable) — gives the "what was free
        // earlier" reference but signals it can't be picked.
        let slotsHtml = '';
        if (this.intent === 'book' && !isPast) {
          const nowForBook = new Date();
          const daySlots = this.bookingSlots.filter(slot => {
            const slStart = new Date(slot.start);
            return this._isSameDay(slStart, d);
          });
          slotsHtml = daySlots.map(slot => {
            const slStart = new Date(slot.start);
            const slEnd   = new Date(slot.end || slot.start);
            const startMin = Math.max(0, (slStart.getHours() - hourStart) * 60 + slStart.getMinutes());
            const endMin   = Math.min(totalMinutes, (slEnd.getHours() - hourStart) * 60 + slEnd.getMinutes());
            if (endMin <= startMin) return '';
            const top = (startMin / totalMinutes) * 100;
            const height = ((endMin - startMin) / totalMinutes) * 100;
            const isPastSlot = isToday && slEnd < nowForBook;
            const cls = [
              'lb-calendar__week-slot',
              slot.available === false  && 'lb-calendar__week-slot--blocked',
              slot.selected             && 'lb-calendar__week-slot--selected',
              isPastSlot                && 'lb-calendar__week-slot--past',
            ].filter(Boolean).join(' ');
            // Disabled when explicitly blocked OR in the past.
            const disabled = (slot.available === false || isPastSlot) ? ' disabled' : '';
            const timeFmt = new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' });
            return `
              <button type="button" class="${cls}"
                      style="top: ${top.toFixed(2)}%; height: ${Math.max(height, 3).toFixed(2)}%;"
                      data-lb-cal-slot-id="${slot.id || ''}"${disabled}
                      aria-label="Slot ${timeFmt.format(slStart)} – ${timeFmt.format(slEnd)}${slot.available === false ? ' (unavailable)' : ''}">
                <span class="lb-calendar__week-slot-time">${timeFmt.format(slStart)}</span>
              </button>
            `;
          }).join('');
        }

        return `
          <div class="${colCls}" style="--lb-cal-slots: ${totalSlots};">
            ${pastOverlay}
            ${cells.join('')}
            ${slotsHtml}
            ${placed}
          </div>
        `;
      }).join('');

      // Current-time indicator with explicit "NOW" label. Restricted to
      // today's column via grid-column. The label sits at the left edge
      // of today's column where it touches the hour rail boundary —
      // reads as a clear time marker, not a stray ornament.
      let nowLine = '';
      const now = new Date();
      if (now >= start && now <= days[6]) {
        const minutes = (now.getHours() - hourStart) * 60 + now.getMinutes();
        if (minutes >= 0 && minutes <= totalMinutes) {
          const top = (minutes / totalMinutes) * 100;
          const todayIdx = days.findIndex(d => this._isSameDay(d, now));
          if (todayIdx >= 0) {
            nowLine = `
              <div class="lb-calendar__week-now"
                   style="top: ${top.toFixed(2)}%; grid-column: ${todayIdx + 2};"
                   aria-label="Now">
                <span class="lb-calendar__week-now-label">NOW</span>
              </div>
            `;
          }
        }
      }

      // The scroll-to position is set by _wire() after render via
      // scrollTop on .lb-calendar__week-scroll, computed from
      // this.scrollHour.
      return `
        <div class="lb-calendar__week${allDayActive ? '' : ' lb-calendar__week--no-allday'}"
             style="--lb-cal-slots: ${totalSlots}; --lb-cal-slots-per-hour: ${slotsPerHour};">
          <div class="lb-calendar__week-header">
            <div class="lb-calendar__week-corner" aria-hidden="true"></div>
            ${dayHeader}
          </div>
          <div class="lb-calendar__week-allday-row">
            <div class="lb-calendar__week-allday-label">all-day</div>
            ${allDayBars}
          </div>
          <div class="lb-calendar__week-scroll" data-lb-cal-week-scroll>
            <div class="lb-calendar__week-grid">
              <div class="lb-calendar__week-hour-rail">
                ${hourLabels.join('')}
              </div>
              ${dayColumns}
              ${nowLine}
            </div>
          </div>
        </div>
      `;
    }

    // ── List / Agenda view ──
    //
    // Vertical list grouped by day, days that fall in the focal week
    // (or, if user wants it, a 30-day rolling window — for v1 we use
    // the focal week to match Week view's natural unit). Empty days
    // collapse to a thin "No events" line so rhythm doesn't break.
    // ── List / Agenda view ──
    //
    // Built on LB.Accordion (multi-open) so each day can be expanded
    // or collapsed independently. Default expanded set: today, today+1,
    // today+2 (3 sections open). Past days always start collapsed —
    // the user can still expand them to look back, they just don't
    // dominate the view by default.
    //
    // Each accordion item's trigger carries:
    //   day-of-week + date (label) | "today" pill (if today) | count badge
    //   (.lb-counter — shared notification pill, --subtle for past days) | chevron
    //
    // The count badge shows the number of events that day. Past days'
    // badges get a `--past` modifier so they read as gone (disabled
    // tokens) without disappearing — important for "what happened
    // earlier this week" reference.
    _renderList() {
      const { start } = this._weekRange(this.date);
      const today = this._atDay(new Date());
      const todayPlus2 = new Date(today); todayPlus2.setDate(today.getDate() + 2);

      // Build the 7 days of the focal week
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }

      // Bucket events per day for fast lookup
      const buckets = {};
      for (const ev of this.events) {
        const evStart = this._atDay(new Date(ev.start));
        const evEnd   = this._atDay(new Date(ev.end || ev.start));
        for (let d = new Date(evStart); d <= evEnd; d.setDate(d.getDate() + 1)) {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          (buckets[key] = buckets[key] || []).push(ev);
        }
      }

      // Short weekday form ("Mon", "Tue") matches Week-view headers
      // so the eye lines up between views — fewer width changes per
      // row, less visual wave when scanning the list.
      const dowFmt  = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
      const dateFmt = new Intl.DateTimeFormat(this.locale, { month: 'long', day: 'numeric' });
      const timeFmt = new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' });

      const items = days.map(d => {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const dayEvents = buckets[key] || [];
        const isToday = this._isSameDay(d, today);
        const dayStart = this._atDay(d);
        const isPast = dayStart < today && !isToday;
        // Default expanded: today, today+1, today+2. Past days always
        // start collapsed (per user request, regardless of content).
        const startOpen = !isPast && dayStart <= todayPlus2;

        const triggerCls = [
          'lb-accordion__trigger',
          'lb-calendar__list-trigger',
          isToday && 'lb-calendar__list-trigger--today',
          isPast  && 'lb-calendar__list-trigger--past',
        ].filter(Boolean).join(' ');
        const chevronCls = startOpen
          ? 'lb-accordion__chevron lb-accordion__chevron--open'
          : 'lb-accordion__chevron';

        const todayPill = isToday
          ? `<span class="lb-calendar__list-today">today</span>`
          : '';
        const badgeCls = isPast
          ? 'lb-counter lb-counter--subtle'
          : 'lb-counter';
        const badge = dayEvents.length > 0
          ? `<span class="${badgeCls}" aria-label="${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}">${dayEvents.length}</span>`
          : '';

        const rows = dayEvents.length
          ? dayEvents.map(ev => {
              const cat = (ev.category != null) ? `--lb-data-${ev.category}` : '--lb-data-1';
              const evStart = new Date(ev.start);
              const evEnd   = new Date(ev.end || ev.start);
              const timeText = ev.allDay
                ? 'all day'
                : `${timeFmt.format(evStart)}${evEnd > evStart ? ' – ' + timeFmt.format(evEnd) : ''}`;
              return `
                <button type="button" class="lb-calendar__list-row${isPast ? ' lb-calendar__list-row--past' : ''}"
                        style="--lb-cal-event-color: var(${cat});"
                        data-lb-cal-event-id="${ev.id || ''}">
                  <span class="lb-calendar__list-time">${timeText}</span>
                  <span class="lb-calendar__list-dot" aria-hidden="true"></span>
                  <span class="lb-calendar__list-title">${ev.title || ''}</span>
                  ${ev.location ? `<span class="lb-calendar__list-location">${ev.location}</span>` : ''}
                </button>
              `;
            }).join('')
          : `<div class="lb-calendar__list-empty${isPast ? ' lb-calendar__list-empty--past' : ''}">No events</div>`;

        return `
          <div class="lb-accordion__item lb-calendar__list-item" data-lb-id="day-${key}">
            <button class="${triggerCls}" type="button" aria-expanded="${startOpen}">
              <span class="lb-calendar__list-trigger-label">
                <span class="lb-calendar__list-dow">${dowFmt.format(d)}</span>
                <span class="lb-calendar__list-date">${dateFmt.format(d)}</span>
              </span>
              <span class="lb-accordion__indicators">
                ${todayPill}
                ${badge}
                <span class="${chevronCls}" aria-hidden="true" data-lb-icon="chevron-down" style="width: 1.25rem; height: 1.25rem;"></span>
              </span>
            </button>
            <div class="lb-accordion__panel"${startOpen ? '' : ' hidden'}>
              <div class="lb-accordion__panel-inner lb-calendar__list-panel-inner">
                ${rows}
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="lb-calendar__list lb-accordion" data-lb-accordion data-lb-allow-multiple="true">
          ${items}
        </div>
      `;
    }

    // ── Wiring ──
    _wire() {
      // Header navigation
      this.el.querySelector('[data-lb-cal-prev]')?.addEventListener('click', () => this.prev());
      this.el.querySelector('[data-lb-cal-next]')?.addEventListener('click', () => this.next());
      this.el.querySelector('[data-lb-cal-today]')?.addEventListener('click', () => this.today());

      // Title picker — DatePicker in the new `heading` variant. The
      // trigger doubles as the section heading; clicking it opens the
      // picker popover. Date selection routes to setDate() so the
      // calendar jumps to the selected day in whatever view is active.
      // formatDate is bound to _formatTitle so the trigger always
      // reflects the focal-unit format ("May 2026" vs "May 4 – 10, 2026").
      const titleHost = this.el.querySelector('[data-lb-cal-title-picker]');
      if (titleHost) {
        const fallback = titleHost.getAttribute('data-title-fallback') || '';
        // Mode follows the calendar's natural focal unit:
        //   month view → 'month' (pick month+year via 4×3 grid)
        //   week / list → 'week' (pick a week, snap to weekStart)
        // Each picker emits lb-datepicker-change with detail.value =
        // the selected Date (first-of-month or week-start). Calendar
        // routes that to setDate() and the calendar re-focuses.
        const dpMode = (this.view === 'month') ? 'month' : 'week';
        const dp = new DatePicker(titleHost, {
          variant: 'heading',
          mode: dpMode,
          weekStart: this.weekStart,
          placeholder: fallback,
          formatDate: (d) => this._formatTitle(d),
        });
        dp.setValue(this.date);
        titleHost.addEventListener('lb-datepicker-change', (e) => {
          const picked = e.detail && e.detail.value;
          if (picked instanceof Date) this.setDate(picked);
        });
      }

      // View segmented — wire after rendering so the lb-segmented JS
      // initialises (auto-init scans for data-lb-segmented post-render).
      const segGroup = this.el.querySelector('[data-lb-segmented]');
      if (segGroup) {
        if (!segGroup._lbSegmented) segGroup._lbSegmented = new Segmented(segGroup);
        segGroup.addEventListener('lb-segmented-change', (e) => {
          if (e.detail && e.detail.value) this.setView(e.detail.value);
        });
      }

      // List-view Accordion instance (multi-open). Each day is one
      // accordion item; today + 2 days ahead start expanded.
      const listAcc = this.el.querySelector('.lb-calendar__list[data-lb-accordion]');
      if (listAcc && !listAcc._lbAccordion) {
        listAcc._lbAccordion = new Accordion(listAcc, { allowMultiple: true });
      }

      // Event clicks → fire lb-calendar-event-click (consumer routes)
      this.el.querySelectorAll('[data-lb-cal-event-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.lbCalEventId;
          const ev = this.events.find(x => x.id === id);
          if (ev) this._dispatch('lb-calendar-event-click', { event: ev });
        });
      });

      // Slot clicks (booking intent) → fire lb-calendar-slot-click.
      // Disabled slots (blocked + past) skip via the `disabled` attr.
      this.el.querySelectorAll('[data-lb-cal-slot-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.lbCalSlotId;
          const slot = this.bookingSlots.find(s => s.id === id);
          if (slot) this._dispatch('lb-calendar-slot-click', { slot });
        });
      });

      // Cell clicks (excluding events / slots / more buttons) → date-click.
      // Booking intent + Month view: clicking a day switches to Week view
      // focused on that day, so the user can see + pick the day's slots
      // immediately. The date-click event fires either way (consumers can
      // override default behaviour by listening + preventing).
      this.el.querySelectorAll('[data-lb-cal-date]').forEach(cell => {
        cell.addEventListener('click', (e) => {
          if (e.target.closest('[data-lb-cal-event-id]')) return;
          if (e.target.closest('[data-lb-cal-slot-id]')) return;
          if (e.target.closest('[data-lb-cal-more]')) return;
          const date = new Date(cell.dataset.lbCalDate);
          this._dispatch('lb-calendar-date-click', { date });
          if (this.intent === 'book' && this.view === 'month') {
            this.date = date;
            this.setView('week');
          }
        });
      });

      // "+N more" — open a Popover anchored to the link, listing the
      // full set of events for that day. Click an event in the popover
      // → fire lb-calendar-event-click. Reuses the DS Popover so the
      // visual treatment + close-on-outside-click + a11y come for free.
      this.el.querySelectorAll('[data-lb-cal-more]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const date = new Date(btn.dataset.lbCalMore);
          this._openMorePopover(btn, date);
        });
      });

      // Week view scroll-to default. After render, scroll the inner
      // container so this.scrollHour is at the top. Only on Week view.
      // Do NOT auto-track current time. User scroll is sacred from this
      // point.
      if (this.view === 'week') {
        const scroller = this.el.querySelector('[data-lb-cal-week-scroll]');
        if (scroller) {
          // The grid is `var(--lb-cal-slots) * 2.5rem` tall in CSS, with
          // each hour spanning slotsPerHour slots. Compute pixel offset
          // by reading slot height post-paint via offsetHeight.
          // Defer to next frame so layout has measured.
          requestAnimationFrame(() => {
            const grid = scroller.querySelector('.lb-calendar__week-grid');
            if (!grid) return;
            const visibleHours = this.maxHour - this.minHour;
            const totalSlots = visibleHours * (60 / this.slotDuration);
            const slotHeight = grid.offsetHeight / totalSlots;
            const slotsPerHour = 60 / this.slotDuration;
            // Scroll to scrollHour relative to minHour so e.g. minHour=9,
            // scrollHour=9 → scroll to top (no scroll).
            scroller.scrollTop = (this.scrollHour - this.minHour) * slotsPerHour * slotHeight;
          });
        }
      }
    }

    // ── Density-overflow popover ──
    // Used when a Month-view cell has more events than the 3-pill cap.
    // Anchored to the "+N more" button; lists the full set of the day's
    // events. Click an event row → fire lb-calendar-event-click and
    // close. Click outside → close.
    _openMorePopover(anchor, date) {
      // Close any prior instance
      if (this._morePopover) {
        this._morePopover.remove();
        this._morePopover = null;
      }
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const dayEvents = this.events.filter(ev => {
        const evStart = this._atDay(new Date(ev.start));
        const evEnd   = this._atDay(new Date(ev.end || ev.start));
        for (let d = new Date(evStart); d <= evEnd; d.setDate(d.getDate() + 1)) {
          if (`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === dayKey) return true;
        }
        return false;
      });

      const dateFmt = new Intl.DateTimeFormat(this.locale, { weekday: 'long', month: 'long', day: 'numeric' });
      const timeFmt = new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' });

      const pop = document.createElement('div');
      pop.className = 'lb-calendar__more-pop';
      pop.setAttribute('role', 'dialog');
      pop.innerHTML = `
        <div class="lb-calendar__more-pop-head">${dateFmt.format(date)}</div>
        <div class="lb-calendar__more-pop-list">
          ${dayEvents.map(ev => {
            const cat = (ev.category != null) ? `--lb-data-${ev.category}` : '--lb-data-1';
            const evStart = new Date(ev.start);
            const time = ev.allDay ? 'all day' : timeFmt.format(evStart);
            return `
              <button type="button" class="lb-calendar__more-pop-row"
                      style="--lb-cal-event-color: var(${cat});"
                      data-lb-cal-event-id="${ev.id || ''}">
                <span class="lb-calendar__list-dot" aria-hidden="true"></span>
                <span class="lb-calendar__more-pop-time">${time}</span>
                <span class="lb-calendar__more-pop-title">${ev.title || ''}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      // Position: anchor to the trigger
      const rect = anchor.getBoundingClientRect();
      pop.style.position = 'absolute';
      pop.style.left = `${window.scrollX + rect.left}px`;
      pop.style.top  = `${window.scrollY + rect.bottom + 4}px`;

      // Outside-click closes
      const onOutside = (e) => {
        if (!pop.contains(e.target)) {
          pop.remove();
          this._morePopover = null;
          document.removeEventListener('mousedown', onOutside, true);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

      // Event row → dispatch + close
      pop.querySelectorAll('[data-lb-cal-event-id]').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.dataset.lbCalEventId;
          const ev = this.events.find(x => x.id === id);
          if (ev) this._dispatch('lb-calendar-event-click', { event: ev });
          pop.remove();
          this._morePopover = null;
        });
      });

      document.body.appendChild(pop);
      this._morePopover = pop;
    }
  }

  class ColorPicker {
    constructor(el) {
      this.el = el;
      this.alpha = el.hasAttribute('data-lb-alpha');
      this.popoverMode = el.hasAttribute('data-lb-popover');
      this.presets = (el.dataset.lbPresets || '').split(',').map(s => s.trim()).filter(Boolean);
      const initialValue = el.dataset.lbValue || '#7c3aed';
      this._setFromString(initialValue, false);
      this._render();
    }

    // Drive everything from {h, s, v, a}. Accepts hex strings ("#rrggbb"
    // or "#rrggbbaa") and rgba(...) at init; everything else is HSV.
    _setFromString(s, emit = true) {
      const trimmed = (s || '').trim();
      let rgb = null;
      if (trimmed.startsWith('rgb')) {
        const m = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/);
        if (m) rgb = { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
      } else {
        rgb = _hexToRgb(trimmed);
      }
      if (!rgb) return;
      const hsv = _rgbToHsv(rgb);
      this._h = hsv.h; this._s = hsv.s; this._v = hsv.v; this._a = rgb.a ?? 1;
      if (emit) this._emit();
    }

    _render() {
      this.el.classList.add('lb-color-picker');
      if (this.popoverMode) this._renderPopover();
      else this._renderInline(this.el);
    }

    // Popover variant — trigger swatch in the host, full picker in a
    // FIXED-POSITIONED floating panel that gets re-parented to <body>
    // on first open. This escapes any scroll/overflow:hidden ancestor
    // (theme editor accordion, modal body, sheet body, etc.) so the
    // full picker is always visible no matter where the trigger sits.
    // Position is computed from the trigger's bounding rect each time
    // it opens; placement flips automatically based on viewport space.
    _renderPopover() {
      this.el.classList.add('lb-color-picker--popover');
      this.el.innerHTML = `
        <button type="button" class="lb-color-picker__trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="Open color picker">
          <span class="lb-color-picker__trigger-swatch"></span>
          <span class="lb-color-picker__trigger-label"></span>
        </button>
      `;
      this._triggerSwatch = this.el.querySelector('.lb-color-picker__trigger-swatch');
      this._triggerLabel = this.el.querySelector('.lb-color-picker__trigger-label');
      this._trigger = this.el.querySelector('.lb-color-picker__trigger');

      // Floating popover — created lazily on first open and parented
      // to <body>. Stays in the DOM after close (display: none) so
      // input state isn't lost on toggle.
      this._floater = document.createElement('div');
      this._floater.className = 'lb-color-picker__popover lb-color-picker__popover--floating';
      this._floater.setAttribute('role', 'dialog');
      this._floater.setAttribute('aria-label', 'Color picker');
      this._floater.style.display = 'none';
      this._renderInline(this._floater);

      this._trigger.addEventListener('click', () => this._toggleFloater());
      // Close on Esc, click-outside, scroll/resize.
      this._onKeyClose = (e) => { if (e.key === 'Escape' && this._open) this._closeFloater(); };
      this._onClickOutside = (e) => {
        if (!this._open) return;
        if (this.el.contains(e.target) || this._floater.contains(e.target)) return;
        this._closeFloater();
      };
      this._onReposition = () => { if (this._open) this._positionFloater(); };
    }

    _toggleFloater() {
      this._open ? this._closeFloater() : this._openFloater();
    }
    _openFloater() {
      if (!this._floater.parentNode) document.body.appendChild(this._floater);
      this._open = true;
      this._floater.style.display = '';
      this._trigger.setAttribute('aria-expanded', 'true');
      this._positionFloater();
      // Stays positioned during page scroll / window resize. Capture
      // phase so popovers in nested scrollers also reposition.
      document.addEventListener('keydown', this._onKeyClose);
      document.addEventListener('mousedown', this._onClickOutside);
      window.addEventListener('scroll', this._onReposition, true);
      window.addEventListener('resize', this._onReposition);
    }
    _closeFloater() {
      this._open = false;
      this._floater.style.display = 'none';
      this._trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', this._onKeyClose);
      document.removeEventListener('mousedown', this._onClickOutside);
      window.removeEventListener('scroll', this._onReposition, true);
      window.removeEventListener('resize', this._onReposition);
    }
    _positionFloater() {
      // Anchor to the trigger's viewport rect. Try below first; flip
      // to above if not enough room. Prefer left-aligned with trigger;
      // shift right if the popover would overflow the viewport.
      const triggerRect = this._trigger.getBoundingClientRect();
      const popoverRect = this._floater.getBoundingClientRect();
      const margin = 8;
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const popH = popoverRect.height || 360;  // estimate before first paint
      const popW = popoverRect.width  || 288;

      // Vertical: prefer below, flip if overflow.
      const spaceBelow = vpH - triggerRect.bottom - margin;
      const spaceAbove = triggerRect.top - margin;
      const top = (spaceBelow >= popH || spaceBelow >= spaceAbove)
        ? triggerRect.bottom + margin
        : Math.max(margin, triggerRect.top - popH - margin);

      // Horizontal: align with trigger left, but keep popover inside vp.
      let left = triggerRect.left;
      if (left + popW > vpW - margin) left = Math.max(margin, vpW - popW - margin);
      if (left < margin) left = margin;

      this._floater.style.top = `${Math.round(top)}px`;
      this._floater.style.left = `${Math.round(left)}px`;
    }

    // Inline variant — full picker UI directly in the host (or in the
    // Popover content for the popover variant).
    _renderInline(host) {
      const surfaceId = `lb-cp-${++ColorPicker._counter}`;
      const alphaSlider = this.alpha
        ? `<div class="lb-color-picker__alpha" role="slider" tabindex="0" aria-label="Alpha" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(this._a * 100)}"><div class="lb-color-picker__alpha-thumb"></div></div>`
        : '';
      const eyedropperBtn = (typeof window !== 'undefined' && window.EyeDropper)
        ? `<button type="button" class="lb-color-picker__eyedropper" aria-label="Pick a color from the screen"><span data-lb-icon="pipette"></span></button>`
        : '';
      const presets = this.presets.length
        ? `<div class="lb-color-picker__presets" role="listbox" aria-label="Preset colors">
            ${this.presets.map(p => `<button type="button" class="lb-color-picker__preset" role="option" aria-label="${p}" data-color="${p}" style="background:${p};"></button>`).join('')}
          </div>`
        : '';

      host.querySelector('.lb-color-picker__body')?.remove();
      const body = document.createElement('div');
      body.className = 'lb-color-picker__body';
      body.innerHTML = `
        <div class="lb-color-picker__surface" id="${surfaceId}" role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuetext="">
          <div class="lb-color-picker__cursor"></div>
        </div>
        <div class="lb-color-picker__sliders">
          <div class="lb-color-picker__rgb-stack">
            <div class="lb-color-picker__hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${Math.round(this._h)}"><div class="lb-color-picker__hue-thumb"></div></div>
            ${alphaSlider}
          </div>
          ${eyedropperBtn}
        </div>
        <div class="lb-color-picker__output">
          <div class="lb-color-picker__format" role="radiogroup" aria-label="Color format">
            <button type="button" class="lb-color-picker__format-btn" data-fmt="hex">HEX</button>
            <button type="button" class="lb-color-picker__format-btn" data-fmt="rgb">RGB</button>
            <button type="button" class="lb-color-picker__format-btn" data-fmt="hsl">HSL</button>
          </div>
          <div class="lb-color-picker__inputs"></div>
        </div>
        ${presets}
      `;
      host.appendChild(body);

      this._surface = body.querySelector('.lb-color-picker__surface');
      this._cursor  = body.querySelector('.lb-color-picker__cursor');
      this._hue     = body.querySelector('.lb-color-picker__hue');
      this._hueThumb = body.querySelector('.lb-color-picker__hue-thumb');
      this._alphaEl  = body.querySelector('.lb-color-picker__alpha');
      this._alphaThumb = body.querySelector('.lb-color-picker__alpha-thumb');
      this._formatEl = body.querySelector('.lb-color-picker__format');
      this._inputsEl = body.querySelector('.lb-color-picker__inputs');
      this._presetsEl = body.querySelector('.lb-color-picker__presets');
      this._eyedropper = body.querySelector('.lb-color-picker__eyedropper');

      // Default format: HEX. Persists per-instance only.
      this._format = 'hex';
      this._renderInputs();

      this._wire();
      this._sync();
    }

    // Builds the bottom input row from `this._format`. HEX → single
    // wide field. RGB → three numeric (r/g/b) + alpha if enabled.
    // HSL → three numeric (h/s/l) + alpha. All inputs use .lb-input
    // so they get the system's field chrome for free.
    _renderInputs() {
      const A = this.alpha
        ? `<input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Alpha (0-1)" min="0" max="1" step="0.01" data-cmp="a">`
        : '';
      const labelRow = (labels) => `<div class="lb-color-picker__input-labels">${labels.map(l => `<span>${l}</span>`).join('')}${this.alpha ? '<span>A</span>' : ''}</div>`;

      let html;
      if (this._format === 'hex') {
        html = `
          <div class="lb-input-wrap lb-color-picker__hex-wrap">
            <input class="lb-input lb-input--small lb-color-picker__hex" type="text" aria-label="Hex value" autocomplete="off" spellcheck="false" maxlength="9" data-cmp="hex">
          </div>`;
      } else if (this._format === 'rgb') {
        html = `
          <div class="lb-color-picker__num-row">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Red (0-255)" min="0" max="255" step="1" data-cmp="r">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Green (0-255)" min="0" max="255" step="1" data-cmp="g">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Blue (0-255)" min="0" max="255" step="1" data-cmp="b">
            ${A}
          </div>
          ${labelRow(['R','G','B'])}`;
      } else { // hsl
        html = `
          <div class="lb-color-picker__num-row">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Hue (0-360)" min="0" max="360" step="1" data-cmp="h">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Saturation (%)" min="0" max="100" step="1" data-cmp="s">
            <input class="lb-input lb-input--small lb-color-picker__num" type="number" aria-label="Lightness (%)" min="0" max="100" step="1" data-cmp="l">
            ${A}
          </div>
          ${labelRow(['H','S','L'])}`;
      }
      this._inputsEl.innerHTML = html;

      // Cache the active inputs for sync()/wire()
      this._hex = this._inputsEl.querySelector('.lb-color-picker__hex');
      this._numInputs = Array.from(this._inputsEl.querySelectorAll('.lb-color-picker__num'));

      // Format buttons reflect current selection
      this._formatEl.querySelectorAll('.lb-color-picker__format-btn').forEach(b => {
        const active = b.dataset.fmt === this._format;
        b.classList.toggle('lb-color-picker__format-btn--active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      this._wireInputs();
    }

    _wireInputs() {
      // Format toggle
      this._formatEl.querySelectorAll('.lb-color-picker__format-btn').forEach(b => {
        b.onclick = () => {
          this._format = b.dataset.fmt;
          this._renderInputs();
          this._sync();
        };
      });
      // Single hex field — same flow as before.
      if (this._hex) {
        this._hex.addEventListener('change', () => this._setFromString(this._hex.value));
        this._hex.addEventListener('blur', () => this._sync());
        this._hex.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this._hex.blur(); }
        });
      }
      // Numeric fields — apply on `input` so dragging the spinner
      // updates the picker live. Reads ALL fields together so partial
      // input doesn't reinterpret in-progress entry.
      this._numInputs.forEach(inp => {
        inp.addEventListener('input', () => this._readNumInputs());
        inp.addEventListener('blur', () => this._sync());
      });
    }

    _readNumInputs() {
      const get = (cmp) => {
        const el = this._inputsEl.querySelector(`[data-cmp="${cmp}"]`);
        if (!el) return null;
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? v : null;
      };
      if (this._format === 'rgb') {
        const r = get('r'), g = get('g'), b = get('b');
        if (r === null || g === null || b === null) return;
        const hsv = _rgbToHsv({ r: _clamp(r,0,255), g: _clamp(g,0,255), b: _clamp(b,0,255) });
        this._h = hsv.h; this._s = hsv.s; this._v = hsv.v;
      } else if (this._format === 'hsl') {
        const h = get('h'), s = get('s'), l = get('l');
        if (h === null || s === null || l === null) return;
        const rgb = _hslToRgb({ h: _clamp(h,0,360), s: _clamp(s,0,100)/100, l: _clamp(l,0,100)/100 });
        const hsv = _rgbToHsv(rgb);
        this._h = hsv.h; this._s = hsv.s; this._v = hsv.v;
      }
      if (this.alpha) {
        const a = get('a');
        if (a !== null) this._a = _clamp(a, 0, 1);
      }
      this._sync();
      this._emit();
    }

    _wire() {
      // Shared "pick on click + drag" pattern — fires the same handler
      // on pointerdown (so a single tap picks immediately) AND on every
      // pointermove. Built on LB.pointerDrag — gains primary-button
      // filter (previous _dragSurface let middle/right-click trigger
      // picks — likely a latent bug), preventDefault, setPointerCapture,
      // and lostpointercapture cleanup.
      const onPick = (el, fn) => pointerDrag(el, {
        onStart: (e, ctx) => fn(e.clientX, e.clientY, ctx.startRect),
        onMove:  (e, ctx) => fn(e.clientX, e.clientY, ctx.startRect),
      });
      // Surface — drag picks saturation (x) and value (y).
      onPick(this._surface, (x, y, rect) => {
        this._s = _clamp((x - rect.left) / rect.width, 0, 1);
        this._v = 1 - _clamp((y - rect.top) / rect.height, 0, 1);
        this._sync(); this._emit();
      });
      // Hue slider — horizontal drag from 0 to 360.
      onPick(this._hue, (x, _y, rect) => {
        this._h = _clamp((x - rect.left) / rect.width, 0, 1) * 360;
        this._sync(); this._emit();
      });
      // Alpha slider — horizontal drag from 0 to 1.
      if (this._alphaEl) {
        onPick(this._alphaEl, (x, _y, rect) => {
          this._a = _clamp((x - rect.left) / rect.width, 0, 1);
          this._sync(); this._emit();
        });
      }
      // Keyboard support on each surface.
      this._keyboard(this._surface, (e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft')  this._s = _clamp(this._s - step, 0, 1);
        if (e.key === 'ArrowRight') this._s = _clamp(this._s + step, 0, 1);
        if (e.key === 'ArrowUp')    this._v = _clamp(this._v + step, 0, 1);
        if (e.key === 'ArrowDown')  this._v = _clamp(this._v - step, 0, 1);
      });
      this._keyboard(this._hue, (e) => {
        const step = e.shiftKey ? 30 : 5;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')  this._h = (this._h - step + 360) % 360;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   this._h = (this._h + step) % 360;
      });
      if (this._alphaEl) this._keyboard(this._alphaEl, (e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')  this._a = _clamp(this._a - step, 0, 1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   this._a = _clamp(this._a + step, 0, 1);
      });
      // Hex / numeric inputs are wired in _wireInputs(), called from
      // _renderInputs() each time the format toggle changes.
      // Preset clicks
      if (this._presetsEl) {
        this._presetsEl.addEventListener('click', (e) => {
          const p = e.target.closest('.lb-color-picker__preset');
          if (p) this._setFromString(p.dataset.color);
        });
      }
      // Eyedropper — modern Chrome/Edge.
      if (this._eyedropper) {
        this._eyedropper.addEventListener('click', async () => {
          try {
            const result = await new window.EyeDropper().open();
            this._setFromString(result.sRGBHex);
          } catch { /* user cancelled */ }
        });
      }
    }


    _keyboard(el, handler) {
      el.addEventListener('keydown', (e) => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        handler(e);
        this._sync();
        this._emit();
      });
    }

    // Render the visual state from the current HSV/alpha. No event.
    _sync() {
      const baseHue = `hsl(${this._h.toFixed(0)}, 100%, 50%)`;
      const rgb = _hsvToRgb({ h: this._h, s: this._s, v: this._v });
      const r = rgb.r | 0, g = rgb.g | 0, b = rgb.b | 0;
      const hex = _rgbToHex({ ...rgb, a: this._a });
      // Surface: bg = hue (full sat/val) → white horizontal, black vertical
      this._surface.style.background = `
        linear-gradient(to top, #000, transparent),
        linear-gradient(to right, #fff, transparent),
        ${baseHue}
      `;
      this._surface.setAttribute('aria-valuetext', `Saturation ${Math.round(this._s * 100)}%, brightness ${Math.round(this._v * 100)}%`);
      this._cursor.style.left = `${this._s * 100}%`;
      this._cursor.style.top = `${(1 - this._v) * 100}%`;
      this._cursor.style.background = hex;
      // Hue thumb
      this._hueThumb.style.left = `${(this._h / 360) * 100}%`;
      this._hueThumb.style.background = baseHue;
      this._hue.setAttribute('aria-valuenow', String(Math.round(this._h)));
      // Alpha
      if (this._alphaEl) {
        this._alphaEl.style.setProperty('--alpha-color', `rgb(${rgb.r|0}, ${rgb.g|0}, ${rgb.b|0})`);
        this._alphaThumb.style.left = `${this._a * 100}%`;
        this._alphaThumb.style.background = hex;
        this._alphaEl.setAttribute('aria-valuenow', String(Math.round(this._a * 100)));
      }
      // Active text inputs reflect the current color in the chosen
      // format. Skip whichever field the user is typing in — never
      // reformat a value mid-edit (that's why the format buttons,
      // not focus, drive layout swap).
      const active = document.activeElement;
      if (this._format === 'hex' && this._hex && active !== this._hex) {
        this._hex.value = hex;
      } else if (this._format === 'rgb') {
        const setIf = (cmp, v) => {
          const el = this._inputsEl.querySelector(`[data-cmp="${cmp}"]`);
          if (el && active !== el) el.value = String(v);
        };
        setIf('r', r); setIf('g', g); setIf('b', b);
      } else if (this._format === 'hsl') {
        const hslVal = _rgbToHsl({ r, g, b });
        const setIf = (cmp, v) => {
          const el = this._inputsEl.querySelector(`[data-cmp="${cmp}"]`);
          if (el && active !== el) el.value = String(v);
        };
        setIf('h', Math.round(hslVal.h));
        setIf('s', Math.round(hslVal.s * 100));
        setIf('l', Math.round(hslVal.l * 100));
      }
      if (this.alpha) {
        const aEl = this._inputsEl.querySelector('[data-cmp="a"]');
        if (aEl && active !== aEl) aEl.value = String(+this._a.toFixed(2));
      }
      // Trigger swatch (popover variant)
      if (this._triggerSwatch) this._triggerSwatch.style.background = hex;
      if (this._triggerLabel) this._triggerLabel.textContent = hex;
      // Active preset highlight
      if (this._presetsEl) {
        this._presetsEl.querySelectorAll('.lb-color-picker__preset').forEach((p) => {
          p.classList.toggle('lb-color-picker__preset--active', p.dataset.color.toLowerCase() === hex.toLowerCase());
        });
      }
    }

    _emit() {
      const rgb = _hsvToRgb({ h: this._h, s: this._s, v: this._v });
      const r = rgb.r | 0, g = rgb.g | 0, b = rgb.b | 0;
      const hsl = _rgbToHsl({ r, g, b });
      const hex = _rgbToHex({ r, g, b, a: this._a });
      this.el.dataset.lbValue = hex;
      this.el.dispatchEvent(new CustomEvent('lb-color-change', {
        detail: {
          hex,
          rgb: { r, g, b, a: this._a },
          rgba: `rgba(${r}, ${g}, ${b}, ${this._a.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')})`,
          hsl: { h: Math.round(hsl.h), s: Math.round(hsl.s * 100), l: Math.round(hsl.l * 100), a: this._a }
        },
        bubbles: true
      }));
    }

    // Public API
    getValue() { return this.el.dataset.lbValue; }
    // emit=true (default) fires lb-color-change so consumers re-sync.
    // Pass false from initial-paint code paths (e.g. theme editor's
    // syncUiFromState) to avoid logging a "change" when the picker is
    // just being seeded with the same value it already represents.
    setValue(s, emit = true) { this._setFromString(s, emit); this._sync(); }
  }
  ColorPicker._counter = 0;

  // ─── CODE BLOCK ────────────────────────────────────────────
  // Adds copy + optional header strip + optional line numbers + an
  // opt-in regex highlighter for js / ts / json / css / html / bash.
  // The original <code> child is preserved (escaped on init so consumer
  // markup like &lt;br/&gt; in template strings can't HTML-inject).
  // Highlighter is intentionally lightweight — pattern-matching tokens,
  // not a parser. Sufficient for doc snippets; it misses edge cases
  // like template-literal interpolation.

  function _escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Token specs per language. Order matters — earlier patterns win
  // (so comments and strings are matched before keywords inside them).
  // Each entry: [name, regex] — regex must use ^ since we slice as we
  // walk left-to-right. Result classes are .lb-tok-{name}.
  const _SYNTAX_LANGS = {
    js: [
      ['comment',     /^\/\/[^\n]*/],
      ['comment',     /^\/\*[\s\S]*?\*\//],
      ['string',      /^`(?:\\.|\$\{[^}]*\}|[^`\\])*`/],
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['string',      /^'(?:\\.|[^'\\])*'/],
      ['number',      /^\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/],
      ['keyword',     /^\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|import|export|from|as|default|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|void|delete|static|get|set)\b/],
      ['fn',          /^\b[A-Za-z_$][\w$]*(?=\s*\()/],
      ['punctuation', /^[{}()[\];,.]/],
    ],
    ts: [
      ['comment',     /^\/\/[^\n]*/],
      ['comment',     /^\/\*[\s\S]*?\*\//],
      ['string',      /^`(?:\\.|\$\{[^}]*\}|[^`\\])*`/],
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['string',      /^'(?:\\.|[^'\\])*'/],
      ['number',      /^\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/],
      ['keyword',     /^\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|import|export|from|as|default|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|void|delete|static|get|set|interface|type|enum|implements|public|private|protected|readonly|abstract|namespace|declare|infer|keyof|never|unknown|any|number|string|boolean|object)\b/],
      ['fn',          /^\b[A-Za-z_$][\w$]*(?=\s*[<(])/],
      ['punctuation', /^[{}()[\];,.<>:?|&]/],
    ],
    json: [
      ['comment',     /^\/\/[^\n]*/],
      ['string',      /^"(?:\\.|[^"\\])*"(?=\s*:)/],  // keys
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['number',      /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/],
      ['keyword',     /^\b(?:true|false|null)\b/],
      ['punctuation', /^[{}[\]:,]/],
    ],
    css: [
      ['comment',     /^\/\*[\s\S]*?\*\//],
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['string',      /^'(?:\\.|[^'\\])*'/],
      ['number',      /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?\b/],
      ['attr',        /^--[\w-]+/],            // custom properties
      ['keyword',     /^@[\w-]+/],            // at-rules
      ['fn',          /^\b[\w-]+(?=\s*\()/],
      ['tag',         /^[.#]?[\w-]+(?=\s*\{)/],
      ['punctuation', /^[{};:,]/],
    ],
    html: [
      ['comment',     /^<!--[\s\S]*?-->/],
      ['tag',         /^<\/?[\w-]+/],
      ['attr',        /^\s+[\w-]+(?==)/],
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['string',      /^'(?:\\.|[^'\\])*'/],
      ['punctuation', /^[<>=/]/],
    ],
    bash: [
      ['comment',     /^#[^\n]*/],
      ['string',      /^"(?:\\.|[^"\\])*"/],
      ['string',      /^'(?:[^'])*'/],
      ['keyword',     /^\b(?:if|then|else|elif|fi|for|while|do|done|in|case|esac|function|return|exit|break|continue|export|local|readonly|set|unset)\b/],
      ['fn',          /^\b(?:echo|cd|ls|cp|mv|rm|mkdir|cat|grep|sed|awk|curl|wget|git|npm|node|yarn|pnpm|docker|ssh|scp|sudo|tar|find|xargs)\b/],
      ['number',      /^\b\d+\b/],
      ['punctuation', /^[|&;<>(){}[\]]/],
    ],
  };
  // Aliases so consumers can use either short or long names.
  _SYNTAX_LANGS.javascript = _SYNTAX_LANGS.js;
  _SYNTAX_LANGS.typescript = _SYNTAX_LANGS.ts;
  _SYNTAX_LANGS.sh         = _SYNTAX_LANGS.bash;
  _SYNTAX_LANGS.shell      = _SYNTAX_LANGS.bash;
  _SYNTAX_LANGS.xml        = _SYNTAX_LANGS.html;
  _SYNTAX_LANGS.svg        = _SYNTAX_LANGS.html;

  function _highlight(src, lang) {
    const rules = _SYNTAX_LANGS[lang];
    if (!rules) return _escapeHtml(src);
    let out = '';
    let i = 0;
    while (i < src.length) {
      const slice = src.slice(i);
      let matched = null;
      for (const [name, re] of rules) {
        const m = slice.match(re);
        if (m && m.index === 0) { matched = { name, text: m[0] }; break; }
      }
      if (matched) {
        out += `<span class="lb-tok-${matched.name}">${_escapeHtml(matched.text)}</span>`;
        i += matched.text.length;
      } else {
        // Walk one character of plain text. This is O(n²) worst-case
        // but the regex engine eats most input quickly; for snippet-
        // sized blocks it's instant.
        out += _escapeHtml(src[i]);
        i += 1;
      }
    }
    return out;
  }

  const SVG_COPY = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const SVG_CHECK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  // Slice 6 — extra action icons (Lucide-derived)
  const SVG_DOWNLOAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
  const SVG_EXTERNAL = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  const SVG_APPLY = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12 11 14 15 10"/><circle cx="12" cy="12" r="9"/></svg>';

  // Map LBT-style language tag → file extension for Save downloads.
  // Default is .txt when unknown.
  const LB_LANG_EXT = {
    js: 'js', javascript: 'js', mjs: 'mjs',
    ts: 'ts', typescript: 'ts', tsx: 'tsx', jsx: 'jsx',
    json: 'json',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', xml: 'xml', svg: 'svg',
    bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh',
    py: 'py', python: 'py',
    rb: 'rb', ruby: 'rb',
    go: 'go',
    rs: 'rs', rust: 'rs',
    java: 'java', kt: 'kt', kotlin: 'kt',
    swift: 'swift',
    c: 'c', h: 'h', cpp: 'cpp', 'c++': 'cpp', hpp: 'hpp',
    cs: 'cs', csharp: 'cs',
    md: 'md', markdown: 'md', mdx: 'mdx',
    yaml: 'yml', yml: 'yml',
    toml: 'toml',
    sql: 'sql',
    php: 'php',
    lua: 'lua',
    text: 'txt', plain: 'txt',
  };

  class CodeBlock {
    constructor(el) {
      this.el = el;
      this.lang = el.dataset.lbLang || '';
      this.title = el.dataset.lbTitle || '';
      this.numbers = el.hasAttribute('data-lb-numbers');
      // Action visibility — Copy/Save are opt-out, Open/Apply opt-in.
      // Most code-blocks in docs/marketing pages just need Copy+Save;
      // dev surfaces add Open / Apply via attributes.
      this.noCopy = el.hasAttribute('data-lb-no-copy');
      this.noSave = el.hasAttribute('data-lb-no-save');
      this.showOpen = el.hasAttribute('data-lb-open');
      this.showApply = el.hasAttribute('data-lb-apply');
      const codeEl = el.querySelector(':scope > code');
      this._source = (codeEl ? codeEl.textContent : el.textContent) || '';
      this._source = this._source.replace(/^\n+|\n+$/g, '');
      this._render();
    }

    _render() {
      this.el.classList.add('lb-code-block');
      if (this.numbers) this.el.classList.add('lb-code-block--numbers');

      const showHeader = !!(this.lang || this.title);
      let highlighted = this.lang ? _highlight(this._source, this.lang) : _escapeHtml(this._source);
      if (this.numbers) {
        highlighted = highlighted
          .split('\n')
          .map((line) => '<span class="lb-code-block__line">' + (line || '​') + '</span>')
          .join('');
      }

      const actionsHtml = this._actionsHtml();
      const headerHtml = showHeader
        ? '<div class="lb-code-block__header">'
          + '<span class="lb-code-block__title">' + _escapeHtml(this.title || '') + '</span>'
          + '<div class="lb-code-block__header-right">'
          +   '<span class="lb-code-block__lang">' + _escapeHtml(this.lang || '') + '</span>'
          +   actionsHtml
          + '</div>'
          + '</div>'
        : '';
      const floatingActions = (!showHeader && actionsHtml) ? actionsHtml : '';

      this.el.innerHTML = headerHtml + floatingActions + '<code>' + highlighted + '</code>';
      this._wireActions();
    }

    // Builds the action button row. data-lb-code-action attribute lets
    // _wireActions look up the right handler + inject the SVG inline
    // (using data-lb-icon would let the global initIcons sweep override
    // us — same trap that bit Rating).
    _actionsHtml() {
      const buttons = [];
      if (!this.noCopy)   buttons.push(this._buttonHtml('copy',  'Copy',  'Copy code to clipboard'));
      if (!this.noSave)   buttons.push(this._buttonHtml('save',  'Save',  'Download as file'));
      if (this.showOpen)  buttons.push(this._buttonHtml('open',  'Open',  'Open in editor'));
      if (this.showApply) buttons.push(this._buttonHtml('apply', 'Apply', 'Apply this change', true));
      if (!buttons.length) return '';
      return '<div class="lb-code-block__actions">' + buttons.join('') + '</div>';
    }

    _buttonHtml(action, label, aria, primary) {
      const cls = 'lb-code-block__action lb-code-block__' + action +
        (primary ? ' lb-code-block__action--primary' : '');
      return '<button type="button" class="' + cls + '" data-lb-code-action="' + action + '" aria-label="' + _escapeHtml(aria) + '">'
        + '<span class="lb-code-block__action-icon" data-lb-code-action-icon></span>'
        + '<span class="lb-code-block__action-label">' + label + '</span>'
        + '</button>';
    }

    _wireActions() {
      // The <code> region scrolls horizontally — a scrollable region must
      // be keyboard-reachable to be keyboard-scrollable.
      const codeEl = this.el.querySelector('code');
      if (codeEl && !codeEl.hasAttribute('tabindex')) {
        codeEl.setAttribute('tabindex', '0');
        codeEl.setAttribute('aria-label', (this.el.dataset.lbTitle ? this.el.dataset.lbTitle + ' — ' : '') + 'code sample');
      }
      const setup = {
        copy:  { svg: SVG_COPY,     fn: () => this.copy() },
        save:  { svg: SVG_DOWNLOAD, fn: () => this.save() },
        open:  { svg: SVG_EXTERNAL, fn: () => this.openInEditor() },
        apply: { svg: SVG_APPLY,    fn: () => this.apply() },
      };
      this.el.querySelectorAll('[data-lb-code-action]').forEach((btn) => {
        const action = btn.dataset.lbCodeAction;
        const cfg = setup[action];
        if (!cfg) return;
        const iconEl = btn.querySelector('[data-lb-code-action-icon]');
        if (iconEl) iconEl.innerHTML = cfg.svg;
        btn.addEventListener('click', cfg.fn);
      });
    }

    // Smart copy — writes BOTH text/plain AND text/html to the
    // clipboard so users pasting into a rich-text target get
    // syntax-highlighted formatted code while
    // terminal pastes get clean plain text. Forum-win #8: "Code
    // blocks lost syntax highlighting on copy". Three-tier fallback:
    // ClipboardItem → writeText → execCommand.
    async copy() {
      const btn = this.el.querySelector('.lb-code-block__copy');
      let ok = false;
      try {
        if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
          const codeEl = this.el.querySelector(':scope > code');
          const htmlContent = codeEl
            ? '<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre;"><code>' + codeEl.innerHTML + '</code></pre>'
            : '<pre><code>' + _escapeHtml(this._source) + '</code></pre>';
          const item = new ClipboardItem({
            'text/html':  new Blob([htmlContent],  { type: 'text/html' }),
            'text/plain': new Blob([this._source], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
          ok = true;
        }
      } catch (_) { /* fall through */ }
      if (!ok) {
        try {
          await navigator.clipboard.writeText(this._source);
          ok = true;
        } catch (_) {
          const ta = document.createElement('textarea');
          ta.value = this._source;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); ok = true; } catch (_) {}
          document.body.removeChild(ta);
        }
      }
      if (btn && ok) this._flashCopied(btn);
      this.el.dispatchEvent(new CustomEvent('lb-code-copy', {
        bubbles: true, detail: { source: this._source, format: ok ? 'rich' : 'plain' },
      }));
    }

    _flashCopied(btn) {
      btn.classList.add('lb-code-block__copy--copied');
      const iconEl = btn.querySelector('[data-lb-code-action-icon]');
      const label  = btn.querySelector('.lb-code-block__action-label');
      if (iconEl) iconEl.innerHTML = SVG_CHECK;
      if (label)  label.textContent = 'Copied';
      clearTimeout(this._copiedT);
      this._copiedT = setTimeout(() => {
        btn.classList.remove('lb-code-block__copy--copied');
        if (iconEl) iconEl.innerHTML = SVG_COPY;
        if (label)  label.textContent = 'Copy';
      }, 1500);
    }

    // Download the source as a file. Filename uses data-lb-title if
    // it already includes an extension (consumer's intent); else builds
    // {title-or-snippet}.{ext} from LB_LANG_EXT, defaulting to .txt.
    save() {
      const filename = this._suggestedFilename();
      const blob = new Blob([this._source], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      this.el.dispatchEvent(new CustomEvent('lb-code-save', {
        bubbles: true, detail: { source: this._source, filename, lang: this.lang },
      }));
    }

    _suggestedFilename() {
      if (this.title && /\.\w+$/.test(this.title)) return this.title;
      const ext = LB_LANG_EXT[(this.lang || '').toLowerCase()] || 'txt';
      const base = this.title ? this.title.replace(/\s+/g, '-').toLowerCase() : 'snippet';
      return base + '.' + ext;
    }

    // Open-in-editor — emits an event for the consumer. They might
    // open their own editor panel, deep-link to a VS Code instance,
    // route via their own surface, etc.
    openInEditor() {
      this.el.dispatchEvent(new CustomEvent('lb-code-open', {
        bubbles: true,
        detail: { source: this._source, lang: this.lang, title: this.title },
      }));
    }

    // Apply — for dev-surface consumers building code-assistant-
    // style "apply this change to file X" affordances. Emits an event;
    // consumer reads the source and applies it to their target file.
    apply() {
      this.el.dispatchEvent(new CustomEvent('lb-code-apply', {
        bubbles: true,
        detail: { source: this._source, lang: this.lang, title: this.title },
      }));
    }

    setSource(text, lang) {
      this._source = text || '';
      if (lang !== undefined) this.lang = lang;
      this._render();
    }
  }

  // ─── BAR LIST ──────────────────────────────────────────────
  // Pure CSS layout, but a tiny initialiser computes proportional bar
  // widths from each row's data-lb-value. The largest value is 100%
  // (the bar fills the row); everything else scales relative to it.
  // Consumers can opt out by setting --bar-width inline themselves.

  function initBarLists(root = document) {
    root.querySelectorAll('[data-lb-bar-list]').forEach((list) => {
      if (list._lbBarListDone) return;
      list._lbBarListDone = true;
      list.classList.add('lb-bar-list');
      const rows = Array.from(list.querySelectorAll('[data-lb-bar-list-row]'));
      let maxV = 0;
      rows.forEach((row) => {
        const v = parseFloat(row.dataset.lbValue);
        if (Number.isFinite(v) && v > maxV) maxV = v;
      });
      rows.forEach((row) => {
        row.classList.add('lb-bar-list__row');
        const v = parseFloat(row.dataset.lbValue);
        const pct = (Number.isFinite(v) && maxV > 0) ? (v / maxV) * 100 : 0;
        row.style.setProperty('--bar-width', `${pct}%`);
      });
    });
  }

  // ─── PAGINATION ────────────────────────────────────────────

  class Pagination {
    constructor(el, options = {}) {
      this.el = el;
      this.totalPages = options.totalPages || parseInt(el.dataset.lbTotalPages) || 1;
      this.currentPage = options.currentPage || parseInt(el.dataset.lbCurrentPage) || 1;
      this.siblingCount = options.siblingCount ?? 1;
      this.onChange = options.onChange || null;
      this.render();
    }

    render() {
      this.el.innerHTML = '';
      this.el.setAttribute('aria-label', 'Pagination');

      // Prev button
      const prev = this._btn(SVG_ARROW_LEFT, 'Previous page', this.currentPage <= 1);
      prev.classList.add('lb-pagination__btn--prev');
      prev.addEventListener('click', () => this.goTo(this.currentPage - 1));
      this.el.appendChild(prev);

      // Page numbers
      const pages = this._getPageNumbers();
      pages.forEach((p) => {
        if (p === '...') {
          const ellipsis = document.createElement('span');
          ellipsis.className = 'lb-pagination__ellipsis';
          ellipsis.textContent = '...';
          ellipsis.setAttribute('aria-hidden', 'true');
          this.el.appendChild(ellipsis);
        } else {
          const btn = this._btn(p, `Page ${p}`, false);
          if (p === this.currentPage) {
            btn.classList.add('lb-pagination__btn--active');
            btn.setAttribute('aria-current', 'page');
          }
          btn.addEventListener('click', () => this.goTo(p));
          this.el.appendChild(btn);
        }
      });

      // Next button
      const next = this._btn(SVG_ARROW_RIGHT, 'Next page', this.currentPage >= this.totalPages);
      next.classList.add('lb-pagination__btn--next');
      next.addEventListener('click', () => this.goTo(this.currentPage + 1));
      this.el.appendChild(next);
    }

    goTo(page) {
      if (page < 1 || page > this.totalPages || page === this.currentPage) return;
      this.currentPage = page;
      this.render();
      if (this.onChange) this.onChange(page);
      this.el.dispatchEvent(new CustomEvent('lb-page-change', { detail: { page } }));
    }

    _btn(content, label, disabled) {
      const btn = document.createElement('button');
      btn.className = 'lb-pagination__btn';
      btn.innerHTML = typeof content === 'number' ? content : content;
      btn.setAttribute('aria-label', label);
      if (disabled) btn.disabled = true;
      return btn;
    }

    _getPageNumbers() {
      const { currentPage: c, totalPages: t, siblingCount: s } = this;
      if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);

      const left = Math.max(c - s, 2);
      const right = Math.min(c + s, t - 1);
      const showLeftDots = left > 2;
      const showRightDots = right < t - 1;

      const pages = [1];
      if (showLeftDots) pages.push('...');
      for (let i = left; i <= right; i++) pages.push(i);
      if (showRightDots) pages.push('...');
      pages.push(t);
      return pages;
    }
  }

  // ─── DATEPICKER ────────────────────────────────────────────

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function startOfDay(d) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function fmtDate(d) { return `${MONTH_NAMES[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`; }

  class DatePicker {
    constructor(el, options = {}) {
      this.el = el;
      this.mode = options.mode || el.dataset.lbMode || 'single';
      this.variant = options.variant || el.dataset.lbVariant || 'inline';
      this.size = options.size || el.dataset.lbSize || 'medium';
      this.onChange = options.onChange || null;
      this.onRangeChange = options.onRangeChange || null;
      this.minDate = options.minDate ? startOfDay(options.minDate) : null;
      this.maxDate = options.maxDate ? startOfDay(options.maxDate) : null;
      this.formatDate = options.formatDate || fmtDate;
      // Time-mode-only options. timeFormat: '24h' (default, 00:00–23:59) |
      // '12h' (1:00 AM – 12:59 PM with AM/PM column). step: minute granularity
      // for the minutes selector (5 min default — 00, 05, 10, ... 55).
      this.timeFormat = options.timeFormat || el.dataset.lbTimeFormat || '24h';
      this.timeStep = parseInt(options.timeStep || el.dataset.lbTimeStep || '5', 10);
      // Week-mode option: which day starts the week (0=Sun, 1=Mon=ISO).
      // Selection in week mode highlights that whole week.
      this.weekStart = options.weekStart ?? parseInt(el.dataset.lbWeekStart || '1', 10);
      this.placeholder = options.placeholder || el.dataset.lbPlaceholder
        || (this.mode === 'range' ? 'Select date range'
          : this.mode === 'time'  ? 'Select time'
          : this.mode === 'week'  ? 'Select week'
          : this.mode === 'month' ? 'Select month'
          : 'Select date');
      this.label = options.label || el.dataset.lbLabel || '';
      this.hint = options.hint || el.dataset.lbHint || '';
      this.error = options.error || el.dataset.lbError || '';
      this.disabled = options.disabled ?? el.hasAttribute('data-lb-disabled');
      // Form integration (input variant): a name renders hidden input(s)
      // that submit the picked value like a native control — one input
      // for single/month/time, `${name}-start` + `${name}-end` for
      // range and week. data-lb-format picks the serialization: 'iso'
      // (default — LOCAL yyyy-mm-dd, no UTC shift; time mode HH:MM) or
      // 'epoch' (ms); options.formatValue(date, mode) overrides both.
      this.name = options.name || el.dataset.lbName || '';
      this.required = options.required ?? el.hasAttribute('data-lb-required');
      this.format = options.format || el.dataset.lbFormat || 'iso';
      this.formatValue = options.formatValue || null;

      const now = new Date();
      this._viewMonth = now.getMonth();
      this._viewYear = now.getFullYear();
      this._selected = null;
      this._rangeStart = null;
      this._rangeEnd = null;
      // Time state — defaults to current hour + nearest step minute.
      this._timeHours = now.getHours();
      this._timeMinutes = Math.round(now.getMinutes() / this.timeStep) * this.timeStep;
      if (this._timeMinutes >= 60) { this._timeMinutes = 0; this._timeHours = (this._timeHours + 1) % 24; }
      // null until user picks for the first time, so triggers show placeholder
      this._timeSelected = null;
      this._open = false;

      if (this.variant === 'input' || this.variant === 'heading') {
        // Heading variant reuses the input variant's popover/grid path
        // entirely; only the trigger element's class differs (heading-
        // shaped vs field-shaped). Same wiring, same emit, same a11y.
        this._initInput();
      } else {
        this._initInline();
      }
    }

    // ── Inline variant ──────────────────────────────────────

    _initInline() {
      this._gridRoot = this.el.querySelector('.lb-datepicker__grid-root');
      if (!this._gridRoot) {
        this._gridRoot = document.createElement('div');
        this._gridRoot.className = 'lb-datepicker__grid-root';
        this.el.appendChild(this._gridRoot);
      }
      this._gridRoot.setAttribute('role', 'application');
      this._gridRoot.setAttribute('aria-label',
        this.mode === 'time'  ? 'Time picker' :
        this.mode === 'range' ? 'Date range picker' :
                                'Date picker');
      this._renderContent();
    }

    // Branch on mode — date variants render the calendar grid; time
    // mode renders the hours/minutes selector.
    _renderContent() {
      if (this.mode === 'time')        this._renderTime();
      else if (this.mode === 'month')  this._renderMonthGrid();
      else                              this._renderGrid();   // single, range, week
    }

    // ── Input variant ───────────────────────────────────────

    _initInput() {
      // Build label if provided
      if (this.label && !this.el.querySelector('.lb-datepicker-field__label')) {
        const lbl = document.createElement('label');
        lbl.className = 'lb-datepicker-field__label';
        lbl.textContent = this.label;
        this.el.prepend(lbl);
      }

      // Build trigger if missing. Time mode swaps the calendar icon
      // for a clock so the affordance reads correctly at-a-glance.
      // The heading variant (variant='heading') replaces the field-
      // shaped trigger with a heading-styled button — used for places
      // where the date IS the section heading (e.g. Calendar headline).
      this.trigger = this.el.querySelector('.lb-datepicker-trigger');
      if (!this.trigger) {
        this.trigger = document.createElement('button');
        this.trigger.type = 'button';
        if (this.variant === 'heading') {
          // No leading icon — the heading text IS the affordance. Only
          // a trailing chevron-down hints at click. Same trigger class
          // family so the popover/grid wiring picks it up unchanged.
          this.trigger.className = `lb-datepicker-trigger lb-datepicker-trigger--heading lb-datepicker-trigger--placeholder`;
          if (this.disabled) this.trigger.disabled = true;
          this.trigger.innerHTML = `
            <span class="lb-datepicker-trigger__text">${this.placeholder}</span>
            <span class="lb-datepicker-trigger__chevron">${SVG_CHEVRON}</span>
          `;
        } else {
          this.trigger.className = `lb-datepicker-trigger lb-datepicker-trigger--${this.size} lb-datepicker-trigger--placeholder`;
          if (this.error) this.trigger.classList.add('lb-datepicker-trigger--error');
          if (this.disabled) this.trigger.disabled = true;
          const triggerIcon = this.mode === 'time' ? SVG_CLOCK : SVG_CALENDAR;
          this.trigger.innerHTML = `
            <span class="lb-datepicker-trigger__icon">${triggerIcon}</span>
            <span class="lb-datepicker-trigger__text">${this.placeholder}</span>
            <span class="lb-datepicker-trigger__chevron">${SVG_CHEVRON}</span>
          `;
        }
        this.el.appendChild(this.trigger);
      }

      const triggerId = this.trigger.id || uid('dp-trigger');
      this.trigger.id = triggerId;
      this.trigger.setAttribute('aria-haspopup', 'dialog');
      this.trigger.setAttribute('aria-expanded', 'false');

      // Build hint/error below trigger
      if (this.error && !this.el.querySelector('.lb-datepicker-field__hint--error')) {
        const errEl = document.createElement('span');
        errEl.className = 'lb-datepicker-field__hint lb-datepicker-field__hint--error';
        errEl.id = uid('dp-hint');
        errEl.textContent = this.error;
        this.el.appendChild(errEl);
        this.trigger.setAttribute('aria-describedby', errEl.id);
      } else if (this.hint && !this.el.querySelector('.lb-datepicker-field__hint')) {
        const hintEl = document.createElement('span');
        hintEl.className = 'lb-datepicker-field__hint';
        hintEl.id = uid('dp-hint');
        hintEl.textContent = this.hint;
        this.el.appendChild(hintEl);
        this.trigger.setAttribute('aria-describedby', hintEl.id);
      }

      // Form plumbing: hidden mirror(s), required announcement, reset
      // hook. User picks emit lb-datepicker-change on the host (all
      // modes), so one listener keeps the mirrors current; programmatic
      // setValue/setRange sync explicitly (they deliberately emit
      // nothing).
      if (this.name) {
        const mk = (n) => {
          const i = document.createElement('input');
          i.type = 'hidden'; i.name = n;
          this.el.appendChild(i);
          return i;
        };
        if (this.mode === 'range' || this.mode === 'week') {
          this._hiddenStart = mk(`${this.name}-start`);
          this._hiddenEnd = mk(`${this.name}-end`);
        } else {
          this._hidden = mk(this.name);
        }
        this._syncFormValue();
      }
      // a pick always clears a runtime error and (when named) syncs the
      // mirrors — errors must clear on unnamed pickers too, matching
      // Select's unconditional clear in _select()
      this.el.addEventListener('lb-datepicker-change', () => { this._syncFormValue(); this.clearError(); });
      if (this.required) this.trigger.setAttribute('aria-required', 'true');
      this._form = this.el.closest('form');
      if (this._form) {
        this._onFormReset = () => {
          this._selected = null; this._rangeStart = null; this._rangeEnd = null; this._timeSelected = null;
          this._updateTriggerText();
          this._syncFormValue();
          this.clearError();
        };
        this._form.addEventListener('reset', this._onFormReset);
      }

      // Build popover
      this.popover = this.el.querySelector('.lb-datepicker-popover');
      if (!this.popover) {
        this.popover = document.createElement('div');
        this.popover.className = 'lb-datepicker-popover';
        this.popover.setAttribute('role', 'dialog');
        this.popover.setAttribute('aria-label',
          this.mode === 'time'  ? 'Time picker' :
          this.mode === 'range' ? 'Date range picker' :
                                  'Date picker');
        this.el.appendChild(this.popover);
      }

      this._gridRoot = this.popover.querySelector('.lb-datepicker__grid-root');
      if (!this._gridRoot) {
        this._gridRoot = document.createElement('div');
        this._gridRoot.className = 'lb-datepicker__grid-root';
        this.popover.appendChild(this._gridRoot);
      }
      this._gridRoot.setAttribute('role', 'application');

      this.popover.style.display = 'none';

      this.trigger.addEventListener('click', () => {
        if (!this.disabled) this._togglePopover();
      });

      this._removeClickOutside = onClickOutside(this.el, () => {
        if (this._open) this._closePopover();
      });

      this.el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._open) this._closePopover();
      });

      this._renderContent();
    }

    _togglePopover() { this._open ? this._closePopover() : this._openPopover(); }

    _openPopover() {
      this._open = true;
      if (this.popover) this.popover.style.display = '';
      if (this.trigger) {
        this.trigger.setAttribute('aria-expanded', 'true');
        const chev = this.trigger.querySelector('.lb-datepicker-trigger__chevron');
        if (chev) chev.classList.add('lb-datepicker-trigger__chevron--open');
      }
    }

    _closePopover() {
      this._open = false;
      if (this.popover) this.popover.style.display = 'none';
      if (this.trigger) {
        this.trigger.setAttribute('aria-expanded', 'false');
        const chev = this.trigger.querySelector('.lb-datepicker-trigger__chevron');
        if (chev) chev.classList.remove('lb-datepicker-trigger__chevron--open');
      }
    }

    // ── Mini custom select (for month/year pickers) ────────

    _buildMiniSelect(label, options, selectedValue, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'lb-datepicker__select-wrap';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'lb-datepicker__select';
      trigger.setAttribute('aria-label', label);
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const textSpan = document.createElement('span');
      textSpan.className = 'lb-datepicker__select-text';
      textSpan.textContent = options.find(o => o.value === selectedValue)?.label || '';

      const chevron = document.createElement('span');
      chevron.className = 'lb-datepicker__select-chevron';
      chevron.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

      trigger.append(textSpan, chevron);

      const list = document.createElement('ul');
      // Dual-class: select-list keeps its floating-panel surface (border,
      // shadow, max-height, overflow, animation); lb-list gives items the
      // shared layout.
      list.className = 'lb-datepicker__select-list lb-list';
      list.setAttribute('role', 'listbox');
      list.hidden = true;

      options.forEach((opt) => {
        const li = document.createElement('li');
        li.className = 'lb-list__item';
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.dataset.lbValue = opt.value;
        const label = document.createElement('span');
        label.className = 'lb-list__label';
        label.textContent = opt.label;
        li.appendChild(label);
        if (opt.value === selectedValue) li.classList.add('lb-list__item--selected');
        list.appendChild(li);
      });

      wrap.append(trigger, list);

      let open = false;

      const show = () => {
        open = true;
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        chevron.classList.add('lb-datepicker__select-chevron--open');
        // Scroll selected into view
        const sel = list.querySelector('.lb-list__item--selected');
        if (sel) requestAnimationFrame(() => sel.scrollIntoView({ block: 'nearest' }));
      };

      const hide = () => {
        open = false;
        list.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        chevron.classList.remove('lb-datepicker__select-chevron--open');
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        open ? hide() : show();
      });

      list.addEventListener('click', (e) => {
        const li = e.target.closest('.lb-list__item');
        if (!li) return;
        const val = parseInt(li.dataset.value);
        textSpan.textContent = li.textContent;
        list.querySelectorAll('.lb-list__item--selected').forEach(el => el.classList.remove('lb-list__item--selected'));
        li.classList.add('lb-list__item--selected');
        hide();
        onChange(val);
      });

      // Keyboard
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); show(); }
        if (e.key === 'Escape') { e.preventDefault(); hide(); trigger.focus(); }
      });

      list.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); hide(); trigger.focus(); }
      });

      // Close on outside click
      document.addEventListener('mousedown', (e) => {
        if (open && !wrap.contains(e.target)) hide();
      });

      return wrap;
    }

    // ── Grid rendering ──────────────────────────────────────

    _renderGrid() {
      const root = this._gridRoot;
      root.innerHTML = '';
      const month = this._viewMonth;
      const year = this._viewYear;

      // Header: prev | month + year selects | next
      const header = document.createElement('div');
      header.className = 'lb-datepicker__header';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'lb-datepicker__nav-btn';
      prevBtn.innerHTML = SVG_ARROW_LEFT;
      prevBtn.setAttribute('aria-label', 'Previous month');
      prevBtn.addEventListener('click', () => this._shiftMonth(-1));

      const selects = document.createElement('div');
      selects.className = 'lb-datepicker__selects';

      // Month custom select — 3-letter labels (Jan, Feb, ...) keep the
      // calendar header compact and match the fmtDate output. Full month
      // names are still used for the table's aria-label and per-day cell
      // labels, so screen readers always announce the unabbreviated month.
      const monthOptions = MONTH_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));
      const monthSel = this._buildMiniSelect('Month', monthOptions, month, (val) => {
        this._viewMonth = val; this._renderGrid();
      });

      // Year custom select. Range 1920 → now+10 supports historical
      // use cases (DOB pickers, archival data entry, anniversaries)
      // alongside ordinary calendar navigation. Sort order is
      // DESCENDING (now+10 at top, 1920 at bottom) — opposite of the
      // months select. Reasoning: users overwhelmingly pick years
      // near the present (current month browsing, recent DOB).
      // Descending keeps the most-relevant years one click away;
      // older years are reachable but de-prioritised. This mirrors
      // Facebook's birthday picker convention and modern DOB-picker
      // libraries. Months stay ASCENDING (Jan → Dec) because the
      // calendar reading order is canonical and cyclical.
      const thisYear = new Date().getFullYear();
      const yearOptions = [];
      for (let y = thisYear + 10; y >= 1920; y--) yearOptions.push({ value: y, label: String(y) });
      const yearSel = this._buildMiniSelect('Year', yearOptions, year, (val) => {
        this._viewYear = val; this._renderGrid();
      });

      selects.append(monthSel, yearSel);

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'lb-datepicker__nav-btn';
      nextBtn.innerHTML = SVG_ARROW_RIGHT;
      nextBtn.setAttribute('aria-label', 'Next month');
      nextBtn.addEventListener('click', () => this._shiftMonth(1));

      header.append(prevBtn, selects, nextBtn);
      root.appendChild(header);

      // Table
      const table = document.createElement('table');
      table.className = 'lb-datepicker__table';
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-label', `${MONTH_NAMES[month]} ${year}`);

      // Weekday headers
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      DAY_SHORT.forEach((short, i) => {
        const th = document.createElement('th');
        th.className = 'lb-datepicker__weekday';
        th.setAttribute('scope', 'col');
        th.setAttribute('abbr', DAY_NAMES[i]);
        th.textContent = short;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      // Day cells
      const tbody = document.createElement('tbody');
      const firstDow = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = startOfDay(new Date());

      let dayNum = 1 - firstDow;
      for (let w = 0; w < 6; w++) {
        // Skip row if all days would be next month
        if (dayNum > daysInMonth) break;

        const tr = document.createElement('tr');
        if (this.mode === 'week') tr.classList.add('lb-datepicker__row--week-pick');
        for (let d = 0; d < 7; d++) {
          const td = document.createElement('td');
          td.className = 'lb-datepicker__cell';
          td.setAttribute('role', 'gridcell');

          const cellDate = startOfDay(new Date(year, month, dayNum));
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lb-datepicker__day';
          btn.textContent = cellDate.getDate();

          const dateLabel = `${MONTH_NAMES[cellDate.getMonth()]} ${cellDate.getDate()}, ${cellDate.getFullYear()}`;
          const isToday = sameDay(cellDate, today);

          if (dayNum < 1 || dayNum > daysInMonth) {
            btn.classList.add('lb-datepicker__day--out-of-month');
            btn.tabIndex = -1;
            btn.setAttribute('aria-label', dateLabel);
          } else {
            btn.setAttribute('aria-label', isToday ? `${dateLabel} (today)` : dateLabel);

            if (isToday) btn.classList.add('lb-datepicker__day--today');

            // Week mode owns its own selection treatment via --in-week
            // (applied to all 7 days of the selected week). The
            // single-day --selected modifier would otherwise stick to
            // the clicked day and break uniform row hover/selection.
            const inWeek = this._isInSelectedWeek(cellDate);
            const selected = this.mode === 'week' ? inWeek : this._isSelected(cellDate);
            if (this.mode !== 'week' && selected) {
              btn.classList.add('lb-datepicker__day--selected');
            }
            btn.setAttribute('aria-pressed', String(selected));

            if (this._isInRange(cellDate)) btn.classList.add('lb-datepicker__day--in-range');

            // Week mode — every day in the selected week gets a marker;
            // CSS draws a continuous bar across the row using a soft tint.
            if (inWeek) btn.classList.add('lb-datepicker__day--in-week');

            if (this._isDisabled(cellDate)) {
              btn.classList.add('lb-datepicker__day--disabled');
              btn.setAttribute('aria-disabled', 'true');
              btn.tabIndex = -1;
            } else {
              const clickDate = new Date(cellDate.getTime());
              btn.addEventListener('click', () => this._selectDate(clickDate));
            }
          }

          td.appendChild(btn);
          tr.appendChild(td);
          dayNum++;
        }
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      root.appendChild(table);
    }

    // ── Time render — hours + minutes selectors (and AM/PM in 12h mode)
    //
    // Reuses the existing _buildMiniSelect helper that the calendar
    // header uses for month/year — same dropdown chrome, same a11y, same
    // CSS. The only new layout is the .lb-datepicker__time-row flex
    // container that places the columns side-by-side.

    // ── Month-mode grid ──
    // 4 rows × 3 columns of month cells. Header shows the year with
    // prev/next chevrons to navigate years. Click a cell → select that
    // month (Date set to first of month, current focal year).
    _renderMonthGrid() {
      const root = this._gridRoot;
      root.innerHTML = '';

      // Header: prev | year-select | next — same chrome as the day-grid
      // header. Year is a real custom select (same _buildMiniSelect
      // helper as the rest of the picker) so users can jump to any
      // year directly instead of clicking the chevron 30+ times.
      const header = document.createElement('div');
      header.className = 'lb-datepicker__header lb-datepicker__header--month-mode';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'lb-datepicker__nav-btn';
      prevBtn.innerHTML = SVG_ARROW_LEFT;
      prevBtn.setAttribute('aria-label', 'Previous year');
      prevBtn.addEventListener('click', () => { this._viewYear--; this._renderMonthGrid(); });

      // Year select — same range + DESCENDING order as the single/range
      // mode (see the comment in _renderGrid for the rationale). Months
      // stay ascending in single mode; here in month mode the months ARE
      // the body grid (4×3 cells in calendar reading order Jan → Dec),
      // so the asymmetry holds: months read top-to-bottom in chronological
      // order, year picker is sorted by recency.
      const thisYear = new Date().getFullYear();
      const yearOptions = [];
      for (let y = thisYear + 10; y >= 1920; y--) yearOptions.push({ value: y, label: String(y) });
      const yearSel = this._buildMiniSelect('Year', yearOptions, this._viewYear, (val) => {
        this._viewYear = val; this._renderMonthGrid();
      });
      yearSel.classList.add('lb-datepicker__year-select');

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'lb-datepicker__nav-btn';
      nextBtn.innerHTML = SVG_ARROW_RIGHT;
      nextBtn.setAttribute('aria-label', 'Next year');
      nextBtn.addEventListener('click', () => { this._viewYear++; this._renderMonthGrid(); });

      header.append(prevBtn, yearSel, nextBtn);
      root.appendChild(header);

      // Body: 3-column grid of 12 month cells.
      const grid = document.createElement('div');
      grid.className = 'lb-datepicker__months';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `Months in ${this._viewYear}`);

      const today = new Date();
      const todayMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
      const selectedMonthKey = this._selected
        ? `${this._selected.getFullYear()}-${this._selected.getMonth()}`
        : null;

      for (let m = 0; m < 12; m++) {
        const cellDate = new Date(this._viewYear, m, 1);
        const cellKey = `${this._viewYear}-${m}`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lb-datepicker__month-cell';
        btn.textContent = MONTH_NAMES[m].slice(0, 3);   // short label "Jan"
        btn.setAttribute('aria-label', `${MONTH_NAMES[m]} ${this._viewYear}`);

        if (cellKey === todayMonthKey) btn.classList.add('lb-datepicker__month-cell--today');
        const selected = cellKey === selectedMonthKey;
        if (selected) btn.classList.add('lb-datepicker__month-cell--selected');
        btn.setAttribute('aria-pressed', String(selected));

        if (this._isDisabled(cellDate)) {
          btn.classList.add('lb-datepicker__month-cell--disabled');
          btn.setAttribute('aria-disabled', 'true');
          btn.tabIndex = -1;
        } else {
          btn.addEventListener('click', () => this._selectMonth(cellDate));
        }

        grid.appendChild(btn);
      }
      root.appendChild(grid);
    }

    _selectMonth(date) {
      this._selected = startOfDay(date);
      this._viewMonth = date.getMonth();
      this._viewYear = date.getFullYear();
      if (this.onChange) this.onChange(this._selected);
      this._updateTriggerText();
      this.el.dispatchEvent(new CustomEvent('lb-datepicker-change', {
        detail: { mode: 'month', value: this._selected },
      }));
      this._closePopover();
      this._renderMonthGrid();
    }

    _renderTime() {
      const root = this._gridRoot;
      root.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'lb-datepicker__time-row';

      const is12h = this.timeFormat === '12h';
      const step = this.timeStep || 5;

      // Hours options. 24h: 0..23 padded ("00", "01", ...). 12h: 1..12.
      const hourValues = is12h
        ? Array.from({ length: 12 }, (_, i) => i + 1)
        : Array.from({ length: 24 }, (_, i) => i);
      const hourOptions = hourValues.map((h) => ({
        value: h,
        label: is12h ? String(h) : String(h).padStart(2, '0'),
      }));

      // Minutes options. Step controls granularity (1, 5, 10, 15, 30).
      const minuteValues = [];
      for (let m = 0; m < 60; m += step) minuteValues.push(m);
      const minuteOptions = minuteValues.map((m) => ({
        value: m,
        label: String(m).padStart(2, '0'),
      }));

      // Snap current minutes to the nearest step value so the
      // selected option always exists in the dropdown.
      if (!minuteValues.includes(this._timeMinutes)) {
        this._timeMinutes = minuteValues.reduce(
          (closest, m) => Math.abs(m - this._timeMinutes) < Math.abs(closest - this._timeMinutes) ? m : closest,
          minuteValues[0]
        );
      }

      // For 12h mode, derive the displayed hour + period from the
      // 24h-stored _timeHours.
      const period24 = this._timeHours >= 12 ? 'PM' : 'AM';
      const hour12 = ((this._timeHours + 11) % 12) + 1;
      const selectedHour = is12h ? hour12 : this._timeHours;

      const hoursSel = this._buildMiniSelect('Hours', hourOptions, selectedHour, (val) => {
        if (is12h) {
          // val is 1..12; combine with current period to get 0..23
          const isPM = this._period === 'PM';
          this._timeHours = (val % 12) + (isPM ? 12 : 0);
        } else {
          this._timeHours = val;
        }
        this._onTimeChange();
      });

      const colon = document.createElement('span');
      colon.className = 'lb-datepicker__time-colon';
      colon.setAttribute('aria-hidden', 'true');
      colon.textContent = ':';

      const minutesSel = this._buildMiniSelect('Minutes', minuteOptions, this._timeMinutes, (val) => {
        this._timeMinutes = val;
        this._onTimeChange();
      });

      wrap.append(hoursSel, colon, minutesSel);

      if (is12h) {
        this._period = period24;
        const periodSel = this._buildMiniSelect(
          'AM or PM',
          [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }],
          period24,
          (val) => {
            this._period = val;
            // Adjust _timeHours to match the new period
            const h12 = ((this._timeHours + 11) % 12) + 1;
            this._timeHours = (h12 % 12) + (val === 'PM' ? 12 : 0);
            this._onTimeChange();
          }
        );
        wrap.appendChild(periodSel);
      }

      root.appendChild(wrap);
    }

    // Single source of truth for time-state changes — updates trigger
    // text (input variant only), marks the time as user-selected, and
    // emits the public event consumers listen for.
    _onTimeChange() {
      this._timeSelected = { hours: this._timeHours, minutes: this._timeMinutes };
      if (this.trigger) {
        const text = this.trigger.querySelector('.lb-datepicker-trigger__text');
        if (text) text.textContent = this._formatTime(this._timeHours, this._timeMinutes);
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      }
      if (this.onChange) this.onChange(this._timeSelected);
      this.el.dispatchEvent(new CustomEvent('lb-datepicker-change', {
        detail: { mode: 'time', value: this._timeSelected },
      }));
    }

    _formatTime(h, m) {
      const mm = String(m).padStart(2, '0');
      if (this.timeFormat === '12h') {
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = ((h + 11) % 12) + 1;
        return `${h12}:${mm} ${period}`;
      }
      return `${String(h).padStart(2, '0')}:${mm}`;
    }

    /** Public: set the time programmatically. Useful for forms that
        bind to a known initial value. Accepts {hours, minutes}. */
    setTime({ hours, minutes }) {
      if (typeof hours === 'number') this._timeHours = Math.max(0, Math.min(23, hours));
      if (typeof minutes === 'number') this._timeMinutes = Math.max(0, Math.min(59, minutes));
      this._renderContent();
      this._onTimeChange();
    }

    _shiftMonth(delta) {
      this._viewMonth += delta;
      if (this._viewMonth > 11) { this._viewMonth = 0; this._viewYear++; }
      if (this._viewMonth < 0) { this._viewMonth = 11; this._viewYear--; }
      this._renderGrid();
    }

    // ── Selection ───────────────────────────────────────────

    _selectDate(date) {
      if (this.mode === 'single') {
        this._selected = date;
        if (this.onChange) this.onChange(date);
        this._updateTriggerText();
        // Single canonical event name for all DatePicker modes —
        // `lb-datepicker-change` with `detail.value` = the selected
        // Date (single/week/month) or `{rangeStart, rangeEnd}` (range)
        // or the time string (time).
        this.el.dispatchEvent(new CustomEvent('lb-datepicker-change', {
          detail: { mode: 'single', value: date, date },
        }));
        this._closePopover();
      } else if (this.mode === 'week') {
        // User clicks any day; we snap to the start of the week
        // containing that day. The trigger label and emit carry the
        // week start (consumers can derive end via +6 days).
        const weekStart = this._weekStartOf(date);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        this._selected = weekStart;
        if (this.onChange) this.onChange(weekStart);
        this._updateTriggerText();
        this.el.dispatchEvent(new CustomEvent('lb-datepicker-change', {
          detail: { mode: 'week', value: weekStart, weekStart, weekEnd },
        }));
        this._closePopover();
      } else {
        // Range mode
        if (!this._rangeStart || this._rangeEnd) {
          // Starting new range
          this._rangeStart = date;
          this._rangeEnd = null;
        } else {
          // Completing range
          if (date.getTime() < this._rangeStart.getTime()) {
            this._rangeEnd = this._rangeStart;
            this._rangeStart = date;
          } else {
            this._rangeEnd = date;
          }
          if (this.onRangeChange) this.onRangeChange(this._rangeStart, this._rangeEnd);
          this._updateTriggerText();
          this.el.dispatchEvent(new CustomEvent('lb-datepicker-change', {
            detail: { mode: 'range', value: { rangeStart: this._rangeStart, rangeEnd: this._rangeEnd }, rangeStart: this._rangeStart, rangeEnd: this._rangeEnd },
          }));
          this._closePopover();
        }
      }
      this._renderGrid();
    }

    _updateTriggerText() {
      if (!this.trigger) return;
      const textEl = this.trigger.querySelector('.lb-datepicker-trigger__text');
      if (!textEl) return;
      if (this.mode === 'single' && this._selected) {
        textEl.textContent = this.formatDate(this._selected);
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      } else if (this.mode === 'range' && this._rangeStart && this._rangeEnd) {
        textEl.textContent = `${this.formatDate(this._rangeStart)} \u2013 ${this.formatDate(this._rangeEnd)}`;
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      } else if (this.mode === 'week' && this._selected) {
        // Week mode — always pass the week-start through formatDate so
        // consumers can format however they want (e.g. Calendar's
        // "4 May – 10, 2026" range header). Default formatDate just
        // shows the start date; consumers should override.
        textEl.textContent = this.formatDate(this._selected);
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      } else if (this.mode === 'month' && this._selected) {
        // Month mode — pass first-of-month through formatDate.
        textEl.textContent = this.formatDate(this._selected);
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      } else if (this.mode === 'time' && this._timeSelected) {
        textEl.textContent = this._formatTime(this._timeHours, this._timeMinutes);
        this.trigger.classList.remove('lb-datepicker-trigger--placeholder');
      } else {
        // Empty state for the mode (init, or a form reset cleared the
        // selection) — back to the placeholder.
        textEl.textContent = this.placeholder;
        this.trigger.classList.add('lb-datepicker-trigger--placeholder');
      }
    }

    // ── State checks ────────────────────────────────────────

    _isSelected(d) {
      if (this._selected && sameDay(d, this._selected)) return true;
      if (this._rangeStart && sameDay(d, this._rangeStart)) return true;
      if (this._rangeEnd && sameDay(d, this._rangeEnd)) return true;
      return false;
    }

    _isInRange(d) {
      if (!this._rangeStart || !this._rangeEnd) return false;
      const t = d.getTime();
      return t > this._rangeStart.getTime() && t < this._rangeEnd.getTime();
    }

    // Week-mode helpers.
    // Returns the start (inclusive) of the week containing `d`, using
    // the configured weekStart (0=Sun, 1=Mon=ISO).
    _weekStartOf(d) {
      const day = startOfDay(d);
      const dow = day.getDay();
      const offset = (dow - this.weekStart + 7) % 7;
      day.setDate(day.getDate() - offset);
      return day;
    }
    _isInSelectedWeek(d) {
      if (this.mode !== 'week' || !this._selected) return false;
      const ws = this._weekStartOf(this._selected);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return d >= ws && d <= we;
    }

    _isDisabled(d) {
      if (this.minDate && d.getTime() < this.minDate.getTime()) return true;
      if (this.maxDate && d.getTime() > this.maxDate.getTime()) return true;
      return false;
    }

    // ── Public API ──────────────────────────────────────────

    setValue(date) {
      this._selected = this.mode === 'week' ? this._weekStartOf(startOfDay(date)) : startOfDay(date);
      this._viewMonth = date.getMonth();
      this._viewYear = date.getFullYear();
      this._updateTriggerText();
      // Re-render through the same dispatcher so week + month modes
      // hit their proper renderer (single + range fall through to grid).
      this._renderContent();
      this._syncFormValue();
    }

    setRange(start, end) {
      this._rangeStart = startOfDay(start);
      this._rangeEnd = end ? startOfDay(end) : null;
      this._viewMonth = start.getMonth();
      this._viewYear = start.getFullYear();
      this._updateTriggerText();
      this._renderGrid();
      this._syncFormValue();
    }

    getValue() {
      if (this.mode === 'range') return { start: this._rangeStart, end: this._rangeEnd };
      if (this.mode === 'time') return this._timeSelected ? { hours: this._timeHours, minutes: this._timeMinutes } : null;
      return this._selected;
    }

    // ── Form value serialization ────────────────────────────

    _serializeDate(d) {
      if (!d) return '';
      if (this.formatValue) return String(this.formatValue(d, this.mode));
      if (this.format === 'epoch') return String(d.getTime());
      const p = (n) => String(n).padStart(2, '0');
      // local date — toISOString would shift across the UTC boundary
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    _syncFormValue() {
      if (!this.name) return;
      const p = (n) => String(n).padStart(2, '0');
      if (this.mode === 'range') {
        if (this._hiddenStart) this._hiddenStart.value = this._serializeDate(this._rangeStart);
        if (this._hiddenEnd) this._hiddenEnd.value = this._serializeDate(this._rangeEnd);
      } else if (this.mode === 'week') {
        const start = this._selected;
        const end = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) : null;
        if (this._hiddenStart) this._hiddenStart.value = this._serializeDate(start);
        if (this._hiddenEnd) this._hiddenEnd.value = this._serializeDate(end);
      } else if (this.mode === 'time') {
        if (this._hidden) this._hidden.value = this._timeSelected ? `${p(this._timeHours)}:${p(this._timeMinutes)}` : '';
      } else if (this._hidden) {
        this._hidden.value = this._serializeDate(this._selected);
      }
    }

    // ── Runtime error state (input variant) ─────────────────
    // Same shape as Select: existing error skin + the datepicker
    // field's own hint class (alert icon via the shared injection map).

    setError(message) {
      if (!this.trigger) return;
      this.trigger.classList.add('lb-datepicker-trigger--error');
      this.trigger.setAttribute('aria-invalid', 'true');
      if (message) {
        // Only ever create/reuse a RUNTIME-marked element — an
        // author-authored static error/hint (data-lb-error) is never
        // touched, same guard as LB.Form's messages.
        let errEl = this.el.querySelector('.lb-datepicker-field__hint--error[data-lb-form-error]');
        if (!errEl) {
          errEl = document.createElement('span');
          errEl.className = 'lb-datepicker-field__hint lb-datepicker-field__hint--error';
          errEl.setAttribute('data-lb-form-error', '');
          errEl.id = uid('dp-hint');
          this.el.appendChild(errEl);
        }
        errEl.textContent = message;
        initFieldHintIcons(this.el);
        initIcons(this.el);
        this._runtimeErrorEl = errEl;
        // preserve an existing describedby (the field hint) — append,
        // don't replace, and restore it on clear (mirrors Select)
        if (this._describedByBefore === undefined) this._describedByBefore = this.trigger.getAttribute('aria-describedby');
        this.trigger.setAttribute('aria-describedby',
          [this._describedByBefore, errEl.id].filter(Boolean).join(' '));
      }
    }

    clearError() {
      if (!this.trigger) return;
      this.trigger.classList.remove('lb-datepicker-trigger--error');
      this.trigger.removeAttribute('aria-invalid');
      if (this._runtimeErrorEl) {
        this._runtimeErrorEl.remove();
        this._runtimeErrorEl = null;
        if (this._describedByBefore) this.trigger.setAttribute('aria-describedby', this._describedByBefore);
        else this.trigger.removeAttribute('aria-describedby');
        this._describedByBefore = undefined;
      }
    }

    destroy() {
      if (this._removeClickOutside) this._removeClickOutside();
      if (this._form && this._onFormReset) this._form.removeEventListener('reset', this._onFormReset);
      if (this._hidden) this._hidden.remove();
      if (this._hiddenStart) this._hiddenStart.remove();
      if (this._hiddenEnd) this._hiddenEnd.remove();
    }
  }

  // ─── FORM VALIDATION ───────────────────────────────────────
  // The thin behaviour layer over the existing error skin. LB.Form owns
  // WHEN to validate (submit, with live clearing on input/selection)
  // and WHICH baseline rules run — required, email, url, phone digits,
  // DS selects and datepickers — toggling the classes and per-field
  // APIs the components already ship. Business rules, sanitization and
  // the submission itself stay with the consumer, per the
  // pluggable-engines boundary. Opt in with data-lb-validate on a
  // <form>; per-field messages via data-lb-error-required /
  // -email / -url / -phone on the field (fallbacks below).

  class Form {
    constructor(el, options = {}) {
      this.form = el;
      this.messages = Object.assign({
        required: 'This field is required.',
        email: 'Enter a valid email address.',
        url: 'Enter a valid URL.',
        phone: 'Enter a valid phone number.',
      }, options.messages || {});
      this.onValid = options.onValid || null;
      // DS errors replace the browser's own bubbles
      el.setAttribute('novalidate', '');
      // Validate in the DOCUMENT capture phase: submit targets the form,
      // where listeners run in registration order regardless of capture —
      // and consumer listeners registered at parse time would beat our
      // DOMContentLoaded auto-init. Capturing on document runs before ANY
      // listener on the form, and stopping propagation on an invalid
      // submit guarantees consumer submit handlers only ever see valid
      // submits.
      this._onSubmit = (e) => {
        if (e.target !== this.form) return;
        if (!this.validate()) { e.preventDefault(); e.stopPropagation(); }
        else if (this.onValid) this.onValid(e);
      };
      document.addEventListener('submit', this._onSubmit, true);
      // live clearing: a field stops shouting as soon as the user types
      this._onInput = (e) => {
        const t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('.lb-phone__input')) this._clearPhoneError(t.closest('[data-lb-phone]'));
        else if (t.matches('.lb-input')) this._clearNativeError(t);
      };
      el.addEventListener('input', this._onInput);
      // native selects / checkboxes / radios clear on change
      this._onChange = (e) => {
        const t = e.target;
        if (t && t.matches && !t.matches('.lb-input, .lb-phone__input') && t.willValidate) this._clearGenericError(t);
      };
      el.addEventListener('change', this._onChange);
      // reset returns the WHOLE form to a clean slate — native controls
      // fire no input events on reset, so errors must be cleared here
      // (DS selects and datepickers already follow reset themselves)
      this._onReset = () => {
        this.form.querySelectorAll('input.lb-input, textarea.lb-input').forEach((i) => this._clearNativeError(i));
        this.form.querySelectorAll('[data-lb-phone]').forEach((ph) => this._clearPhoneError(ph));
        Array.from(this.form.elements).forEach((c) => this._clearGenericError(c));
      };
      el.addEventListener('reset', this._onReset);
    }

    validate() {
      const invalid = [];

      // Native inputs/textareas (.lb-input); the phone's inner input is
      // handled by the phone pass below.
      this.form.querySelectorAll('input.lb-input, textarea.lb-input').forEach((input) => {
        if (input.disabled || input.closest('[data-lb-phone]')) return;
        const v = input.value.trim();
        let kind = null;
        if ((input.required || input.hasAttribute('data-lb-required')) && !v) kind = 'required';
        else if (v && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) kind = 'email';
        else if (v && input.type === 'url' && !this._validUrl(v)) kind = 'url';
        if (kind) { this._setNativeError(input, this._msgFor(input, kind)); invalid.push(input); }
        else this._clearNativeError(input);
      });

      // Phone composition — judge the NATIONAL number the user typed
      // (6–15 digits): the full number always carries the dial code, so
      // an empty optional phone would read as "+1" and never pass.
      this.form.querySelectorAll('[data-lb-phone]').forEach((ph) => {
        const input = ph.querySelector('.lb-phone__input');
        const required = ph.hasAttribute('data-lb-required') || (input && input.required);
        const national = (input ? input.value : '').replace(/\D/g, '');
        let kind = null;
        if (required && !national) kind = 'required';
        else if (national && (national.length < 6 || national.length > 15)) kind = 'phone';
        if (kind) { this._setPhoneError(ph, this._msgFor(ph, kind)); invalid.push(input || ph); }
        else this._clearPhoneError(ph);
      });

      // DS selects — required only; the instance also clears itself on
      // pick, the else covers programmatically-set values.
      this.form.querySelectorAll('[data-lb-select][data-lb-required]').forEach((f) => {
        const inst = f._lbSelect;
        if (!inst) return;
        if (!inst.getValue()) { inst.setError(this._msgFor(f, 'required')); invalid.push(f.querySelector('button.lb-select') || f); }
        else inst.clearError();
      });

      // DS datepickers (input variant) — required only.
      this.form.querySelectorAll('[data-lb-datepicker][data-lb-required]').forEach((f) => {
        const inst = f._lbDatePicker;
        if (!inst || !inst.getValue) return;
        const v = inst.getValue();
        const empty = !v || (inst.mode === 'range' && !(v.start && v.end));
        if (empty) { inst.setError(this._msgFor(f, 'required')); invalid.push(f.querySelector('.lb-datepicker-trigger') || f); }
        else inst.clearError();
      });

      // Everything else with native constraints (checkboxes, radios,
      // native selects, inputs outside the lb-input skin): novalidate
      // silenced the browser, so the DS must enforce what it silenced —
      // opting in must never make a form LESS validated. Message comes
      // from the control's own (localized) validationMessage.
      Array.from(this.form.elements).forEach((c) => {
        if (!c.willValidate || c.type === 'hidden') return;
        if (c.matches('.lb-input') || c.closest('[data-lb-phone]')) return; // handled above
        if (!c.checkValidity()) {
          this._setGenericError(c, c.dataset.lbErrorRequired || c.validationMessage || this.messages.required);
          invalid.push(c);
        } else {
          this._clearGenericError(c);
        }
      });

      if (invalid.length) {
        const first = invalid[0];
        if (first.focus) first.focus({ preventScroll: true });
        if (first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return false;
      }
      return true;
    }

    _setGenericError(c, message) {
      c.setAttribute('aria-invalid', 'true');
      const err = this._renderError(this._errHost(c), message);
      c.setAttribute('aria-describedby', err.id);
    }

    _clearGenericError(c) {
      if (!c.getAttribute) return;
      if (c.getAttribute('aria-invalid') !== 'true') return;
      if (c.matches('.lb-input') || c.closest('[data-lb-phone]')) return;
      c.removeAttribute('aria-invalid');
      this._removeError(this._errHost(c), c);
    }

    _msgFor(el, kind) {
      const key = 'lbError' + kind.charAt(0).toUpperCase() + kind.slice(1);
      return el.dataset[key] || (el.closest('.lb-field') || el).dataset?.[key] || this.messages[kind];
    }

    _validUrl(v) {
      try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
      catch { return false; }
    }

    // DS-created messages carry data-lb-form-error so author-authored
    // static hints are never touched.
    _errHost(el) { return el.closest('.lb-field') || el.parentElement || this.form; }

    _renderError(host, message) {
      let err = host.querySelector(':scope > .lb-field__error[data-lb-form-error]');
      if (!err) {
        err = document.createElement('span');
        err.className = 'lb-field__error';
        err.setAttribute('data-lb-form-error', '');
        err.id = uid('form-err');
        host.appendChild(err);
      }
      err.textContent = message;
      initFieldHintIcons(host);
      initIcons(host);
      return err;
    }

    _removeError(host, focusEl) {
      const err = host.querySelector(':scope > .lb-field__error[data-lb-form-error]');
      if (err) {
        if (focusEl && focusEl.getAttribute('aria-describedby') === err.id) focusEl.removeAttribute('aria-describedby');
        err.remove();
      }
    }

    _setNativeError(input, message) {
      input.classList.add('lb-input--error');
      input.setAttribute('aria-invalid', 'true');
      const err = this._renderError(this._errHost(input), message);
      input.setAttribute('aria-describedby', err.id);
    }

    _clearNativeError(input) {
      input.classList.remove('lb-input--error');
      input.removeAttribute('aria-invalid');
      this._removeError(this._errHost(input), input);
    }

    _setPhoneError(ph, message) {
      ph.classList.add('lb-phone--error');
      const input = ph.querySelector('.lb-phone__input');
      if (input) input.setAttribute('aria-invalid', 'true');
      const err = this._renderError(this._errHost(ph), message);
      if (input) input.setAttribute('aria-describedby', err.id);
    }

    _clearPhoneError(ph) {
      if (!ph) return;
      ph.classList.remove('lb-phone--error');
      const input = ph.querySelector('.lb-phone__input');
      if (input) input.removeAttribute('aria-invalid');
      this._removeError(this._errHost(ph), input);
    }

    destroy() {
      document.removeEventListener('submit', this._onSubmit, true);
      this.form.removeEventListener('input', this._onInput);
      this.form.removeEventListener('change', this._onChange);
      this.form.removeEventListener('reset', this._onReset);
    }
  }

  // ─── SHOW MORE ─────────────────────────────────────────────
  // Collapse a grid to N rows and reveal the rest on demand.
  //
  //   <div class="my-grid" id="press" data-lb-show-more="3"
  //        data-lb-show-more-sm="2"> …tiles… </div>
  //   <button class="lb-btn lb-btn--secondary lb-btn--medium"
  //           data-lb-show-more-for="press"
  //           data-lb-label-more="Show more" data-lb-label-less="Show fewer">
  //     <span class="lb-btn__label">Show more</span></button>
  //
  // The limit is rows × the grid's rendered column count, so it follows
  // the responsive template; data-lb-show-more-sm overrides the row
  // count at ≤640px (the file's phone breakpoint family). The consumer
  // authors and styles the button — the DS never invents one; it is
  // wired with aria-controls/aria-expanded, swaps its label, and hides
  // itself when nothing is hidden. Collapsing scrolls back to where the
  // reader expanded, so the button lands where it was before the page
  // grew. Tiles hide via the [hidden] attribute — the companion
  // [data-lb-show-more] > [hidden] rule in components.css wins against
  // class-level display rules, so tiles of ANY class collapse (the
  // global lb-[hidden] rule only covers lb-* classes). A ResizeObserver
  // recomputes on resize and when the grid becomes visible (e.g. inside
  // a tab panel), replacing polling or tab-click sniffing. Reveal
  // animation is deliberately not bundled — motion stays a consumer
  // choice. Emits lb-show-more-toggle {expanded} (bubbles).

  class ShowMore {
    constructor(el) {
      this.grid = el;
      this.button = el.id ? document.querySelector(`[data-lb-show-more-for="${CSS.escape(el.id)}"]`) : null;
      this._collapsed = true;
      this._restoreY = 0;
      this._sm = window.matchMedia('(max-width: 640px)');
      if (this.button) {
        this.button.setAttribute('aria-controls', el.id);
        this._onClick = () => this.toggle();
        this.button.addEventListener('click', this._onClick);
      }
      this._ro = new ResizeObserver(() => this.refresh());
      this._ro.observe(el);
      this._onMq = () => this.refresh();
      this._sm.addEventListener('change', this._onMq);
      this.refresh();
    }

    _columns() {
      const tpl = getComputedStyle(this.grid).gridTemplateColumns;
      return tpl && tpl !== 'none' ? tpl.split(' ').length : 1;
    }

    refresh() {
      const attr = this._sm.matches && this.grid.hasAttribute('data-lb-show-more-sm')
        ? 'data-lb-show-more-sm' : 'data-lb-show-more';
      const rows = parseInt(this.grid.getAttribute(attr) || '3', 10);
      const limit = rows * this._columns();
      let shown = 0;
      let hiddenCount = 0;
      // Only tiles ShowMore hid carry the marker; a tile the CONSUMER
      // hid (filtering) is left alone and doesn't occupy a visible slot.
      Array.from(this.grid.children).forEach((child) => {
        const mine = child.hasAttribute('data-lb-show-more-hidden');
        if (child.hidden && !mine) return;
        const hide = this._collapsed && shown >= limit;
        if (hide) {
          child.hidden = true;
          child.setAttribute('data-lb-show-more-hidden', '');
          hiddenCount++;
        } else {
          child.hidden = false;
          child.removeAttribute('data-lb-show-more-hidden');
          shown++;
        }
      });
      this.grid.setAttribute('data-lb-collapsed', String(this._collapsed));
      if (this.button) {
        this.button.hidden = this._collapsed && hiddenCount === 0;
        const label = this._collapsed
          ? (this.button.getAttribute('data-lb-label-more') || 'Show more')
          : (this.button.getAttribute('data-lb-label-less') || 'Show fewer');
        const labelEl = this.button.querySelector('.lb-btn__label');
        (labelEl || this.button).textContent = label;
        this.button.setAttribute('aria-expanded', String(!this._collapsed));
      }
    }

    expand() {
      if (!this._collapsed) return;
      this._restoreY = window.scrollY;
      this._collapsed = false;
      this.refresh();
      this.grid.dispatchEvent(new CustomEvent('lb-show-more-toggle', { detail: { expanded: true }, bubbles: true }));
    }

    collapse() {
      if (this._collapsed) return;
      this._collapsed = true;
      this.refresh();
      window.scrollTo({ top: this._restoreY, behavior: 'smooth' });
      this.grid.dispatchEvent(new CustomEvent('lb-show-more-toggle', { detail: { expanded: false }, bubbles: true }));
    }

    toggle() { this._collapsed ? this.expand() : this.collapse(); }

    destroy() {
      this._ro.disconnect();
      this._sm.removeEventListener('change', this._onMq);
      if (this.button && this._onClick) this.button.removeEventListener('click', this._onClick);
      // release only the tiles this instance hid
      Array.from(this.grid.children).forEach((c) => {
        if (c.hasAttribute('data-lb-show-more-hidden')) {
          c.hidden = false;
          c.removeAttribute('data-lb-show-more-hidden');
        }
      });
      this.grid.removeAttribute('data-lb-collapsed');
    }
  }

  // ─── TOAST MANAGER ─────────────────────────────────────────

  class ToastManager {
    constructor(options = {}) {
      this.position = options.position || 'bottom-right';
      this.autoDismiss = options.autoDismiss ?? 5000;
      // Actionable toasts get double the reading time: the user has to
      // notice the message AND decide about the action. Set to 0 for the
      // strictest WCAG 2.2.1 reading (persist until dismissed).
      this.autoDismissWithAction = options.autoDismissWithAction ?? 10000;
      this._region = document.querySelector('.lb-toast-region');
      if (!this._region) {
        this._region = document.createElement('div');
        this._region.className = 'lb-toast-region';
        document.body.appendChild(this._region);
      }
    }

    // action: { label, onClick } — exactly one, per the snackbar convention
    // (two or more choices belong in a dialog). dismissOnAction defaults true.
    show({ variant = 'info', title, message, icon, duration, action, dismissOnAction = true } = {}) {
      const id = uid('toast');
      const toast = document.createElement('div');
      toast.className = `lb-toast lb-toast--${variant}`;
      toast.id = id;
      // An actionable toast is never role=alert: alert is spec'd for text
      // and interrupts, and assertive announcements race the button.
      const urgent = !action && (variant === 'warning' || variant === 'danger');
      toast.setAttribute('role', urgent ? 'alert' : 'status');
      toast.setAttribute('aria-live', urgent ? 'assertive' : 'polite');

      // Filled status icons — more attention-grabbing than outlined on tinted bg
      const iconMap = {
        info:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm1 11h-2a1 1 0 0 1 0-2h.5v-4H11a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1v5h.5a1 1 0 0 1 0 2Z"/></svg>',
        success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5.3 7.7-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L11 13.6l5.3-5.3a1 1 0 1 1 1.4 1.4Z"/></svg>',
        warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13.73 3.99a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3l-8-14Zm-1.73 4.01a1 1 0 0 1 1 1v4a1 1 0 0 1-2 0v-4a1 1 0 0 1 1-1Zm0 10a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/></svg>',
        danger:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.7 12.3a1 1 0 0 1-1.4 1.4L12 13.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L10.6 12 8.3 9.7a1 1 0 0 1 1.4-1.4L12 10.6l2.3-2.3a1 1 0 0 1 1.4 1.4L13.4 12l2.3 2.3Z"/></svg>'
      };

      // The neutral variant carries no status, so it takes no icon —
      // an icon there would imply one.
      const glyph = variant === 'neutral' ? (icon || '') : (icon || iconMap[variant] || '');
      toast.innerHTML = `
        ${glyph ? `<span class="lb-toast__icon" aria-hidden="true">${glyph}</span>` : ''}
        <div class="lb-toast__body">
          ${title ? `<strong class="lb-toast__title">${title}</strong>` : ''}
          ${message || ''}
        </div>
        ${action ? `<button type="button" class="lb-toast__action">${action.label}</button>` : ''}
        <button class="lb-toast__close" aria-label="Dismiss">${SVG_CLOSE}</button>
      `;

      const closeBtn = toast.querySelector('.lb-toast__close');
      closeBtn.addEventListener('click', () => this.dismiss(id));

      if (action) {
        toast.querySelector('.lb-toast__action').addEventListener('click', (e) => {
          if (typeof action.onClick === 'function') action.onClick(e);
          if (dismissOnAction) this.dismiss(id);
        });
      }

      // Esc dismisses while focus is inside the toast.
      toast.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); this.dismiss(id); }
      });

      this._region.appendChild(toast);

      // TIMING — a toast carrying an action holds a path to that action, so
      // it gets DOUBLE the standard reading time (10s vs 5s) and its timer
      // pauses on hover/focus below. It does not persist by default: an
      // undo toast that never leaves becomes page furniture, and the
      // durable alternative path the docs require (Trash, history) is what
      // actually keeps the action reachable. For the strictest WCAG 2.2.1
      // reading, pass `duration: 0` per toast or
      // `new LB.ToastManager({ autoDismissWithAction: 0 })` globally.
      const timeout = duration ?? (action ? this.autoDismissWithAction : this.autoDismiss);
      if (timeout > 0) {
        let remaining = timeout;
        let startedAt = Date.now();
        let timer = setTimeout(() => this.dismiss(id), remaining);
        // Pause while the user is reading or tabbing through it.
        const pause = () => {
          if (!timer) return;
          clearTimeout(timer); timer = null;
          remaining -= Date.now() - startedAt;
        };
        const resume = () => {
          if (timer || remaining <= 0) return;
          startedAt = Date.now();
          timer = setTimeout(() => this.dismiss(id), remaining);
        };
        toast.addEventListener('mouseenter', pause);
        toast.addEventListener('mouseleave', resume);
        toast.addEventListener('focusin', pause);
        toast.addEventListener('focusout', resume);
      }

      return id;
    }

    dismiss(id) {
      const toast = document.getElementById(id);
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'opacity 200ms, transform 200ms';
        setTimeout(() => toast.remove(), 200);
      }
    }
  }

  // ─── ICON LOADER ───────────────────────────────────────────
  //
  // LB.icon('search')           → returns cached SVG string (or '')
  // LB.icon('search', el)       → injects SVG into element
  // await LB.iconLoad('search') → fetches + caches, returns SVG string
  // LB.iconPreload(['search', 'eye', 'x']) → bulk preload
  //
  // Icons are fetched from assets/icons/ folder relative to lb.js location.
  // Once fetched, they're cached in memory — no duplicate requests.

  const _iconCache = {};
  let _iconBasePath = 'assets/icons';

  // The bundled set mixes two orderings for the circle family (upstream
  // renamed the family across releases): circle-check but help-circle.
  // Accept BOTH orders — the flipped alias resolves to the shipped file,
  // so consumers stop guessing. Filenames themselves are stable API.
  const _ICON_ALIASES = {
    'bar-chart-3': 'bar-chart', // current Lucide name for the glyph the set ships as bar-chart
    'check-circle': 'circle-check', 'check-circle-filled': 'circle-check-filled',
    'alert-circle': 'circle-alert', 'dot-circle': 'circle-dot',
    'stop-circle': 'circle-stop', 'circle-help': 'help-circle',
    'circle-loader': 'loader-circle', 'circle-minus': 'minus-circle',
    'circle-pause': 'pause-circle', 'circle-play': 'play-circle',
    'circle-plus': 'plus-circle', 'circle-user': 'user-circle',
    'circle-x': 'x-circle', 'circle-x-filled': 'x-circle-filled',
  };

  // Detect base path from script src so assets/icons/ resolves correctly
  // even when lb.js is loaded from a subfolder. Origin-qualified: a
  // CDN-hosted lb.js must resolve assets on the CDN, not on the
  // consuming site (pathname alone turned cdn…/gh/…/js/lb.js into a
  // root-relative /gh/… path that 404s on the consumer's own domain).
  // Same-origin consumers are unaffected — an absolute same-origin URL
  // resolves identically to the old root-relative one.
  (function detectBasePath() {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      if (s.src.includes('lb.js')) {
        const url = new URL(s.src);
        const dir = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
        // assets/icons/ sits one level up from js/
        _iconBasePath = url.origin + dir.replace(/\/js$/, '') + '/assets/icons';
        break;
      }
    }
  })();

  async function iconLoad(name) {
    name = _ICON_ALIASES[name] || name;
    if (_iconCache[name] !== undefined) return _iconCache[name];
    try {
      const res = await fetch(`${_iconBasePath}/${name}.svg`);
      if (!res.ok) { _iconCache[name] = ''; return ''; }
      const svg = await res.text();
      _iconCache[name] = svg;
      return svg;
    } catch {
      _iconCache[name] = '';
      return '';
    }
  }

  function icon(name, targetEl) {
    name = _ICON_ALIASES[name] || name;
    const cached = _iconCache[name];
    if (cached !== undefined) {
      // Only write on success — a failed load (cached '') must never
      // erase author-provided fallback content (e.g. a text glyph
      // inside the element). Natireva vendoring find, 2026-08-09.
      if (targetEl && cached) targetEl.innerHTML = cached;
      return cached;
    }
    // Not cached yet — fire async load
    iconLoad(name).then((svg) => {
      if (targetEl && svg) targetEl.innerHTML = svg;
    });
    return '';
  }

  async function iconPreload(names) {
    return Promise.all(names.map((n) => iconLoad(n)));
  }

  function setIconBasePath(path) {
    _iconBasePath = path.replace(/\/$/, '');
  }

  // Auto-init: any <span data-lb-icon="name"> (or any tag, <i>, <svg-wrap)
  // gets its SVG populated from the icon library. Runs on every LB.init()
  // so dynamically-added markup auto-hydrates. Skips elements already
  // populated (idempotent).
  function initIcons(root = document) {
    root.querySelectorAll('[data-lb-icon]').forEach((el) => {
      if (el._lbIconDone) return;
      const name = el.getAttribute('data-lb-icon');
      if (!name) return;
      // Async load + inject
      icon(name, el);
      // Mark so re-inits don't re-hydrate (iconLoad's in-memory cache
      // already prevents re-fetching, but skipping the DOM write keeps
      // LB.init() O(unhydrated) instead of O(all))
      el._lbIconDone = true;
    });
  }

  // ─── CLEARABLE INPUT ────────────────────────────────────────

  const SVG_CLEAR = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  class ClearableInput {
    constructor(el) {
      this.wrap = el.classList.contains('lb-input-wrap') ? el : el.querySelector('.lb-input-wrap');
      if (!this.wrap) return;
      this.input = this.wrap.querySelector('.lb-input');
      if (!this.input) return;
      this._init();
    }

    _init() {
      this.btn = document.createElement('button');
      this.btn.type = 'button';
      this.btn.className = 'lb-input-wrap__action lb-input-wrap__action--hidden';
      this.btn.setAttribute('aria-label', 'Clear input');
      this.btn.tabIndex = -1;
      this.btn.innerHTML = SVG_CLEAR;
      this.wrap.appendChild(this.btn);

      this.input.addEventListener('input', () => this._toggle());
      this.input.addEventListener('change', () => this._toggle());
      this.btn.addEventListener('click', () => this.clear());

      this._toggle();
    }

    // Toggle BOTH the X button visibility AND the input's right-padding
    // class. Earlier the input always carried .lb-input--has-end, which
    // reserved 2.25rem of right padding even when no X was visible —
    // that cropped the placeholder text in narrow inputs (e.g. the
    // sidebar search). Now padding is only reserved when the X is
    // actually shown.
    _toggle() {
      const hasValue = this.input.value.length > 0;
      this.btn.classList.toggle('lb-input-wrap__action--hidden', !hasValue);
      this.input.classList.toggle('lb-input--has-end', hasValue);
    }

    clear() {
      this.input.value = '';
      this.btn.classList.add('lb-input-wrap__action--hidden');
      this.input.classList.remove('lb-input--has-end');
      this.input.focus();
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.input.dispatchEvent(new CustomEvent('lb-input-clear', { bubbles: true }));
    }
  }

  // ─── PASSWORD INPUT ────────────────────────────────────────

  const SVG_EYE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_EYE_OFF = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  class PasswordInput {
    constructor(el) {
      this.wrap = el.classList.contains('lb-input-wrap') ? el : el.querySelector('.lb-input-wrap');
      if (!this.wrap) return;
      this.input = this.wrap.querySelector('.lb-input');
      if (!this.input) return;
      this._visible = false;
      this._init();
    }

    _init() {
      if (this.input.type !== 'password') this.input.type = 'password';
      this.input.classList.add('lb-input--has-end');

      this.btn = document.createElement('button');
      this.btn.type = 'button';
      this.btn.className = 'lb-input-wrap__action';
      this.btn.setAttribute('aria-label', 'Show password');
      this.btn.tabIndex = -1;
      this.btn.innerHTML = SVG_EYE;
      this.wrap.appendChild(this.btn);

      this.btn.addEventListener('click', () => this.toggle());
    }

    toggle() {
      this._visible = !this._visible;
      this.input.type = this._visible ? 'text' : 'password';
      this.btn.innerHTML = this._visible ? SVG_EYE_OFF : SVG_EYE;
      this.btn.setAttribute('aria-label', this._visible ? 'Hide password' : 'Show password');
      this.input.dispatchEvent(new CustomEvent('lb-password-toggle', { bubbles: true, detail: { visible: this._visible } }));
    }
  }

  // ─── BANNER (dismiss) ──────────────────────────────────────

  function initBanners() {
    document.querySelectorAll('.lb-banner .lb-banner__close').forEach((btn) => {
      btn.addEventListener('click', () => {
        const banner = btn.closest('.lb-banner');
        if (banner) {
          banner.style.display = 'none';
          banner.dispatchEvent(new CustomEvent('lb-banner-dismiss'));
        }
      });
    });
  }

  // ─── CHIP (toggle + remove) ─────────────────────────────────

  function initChips() {
    document.querySelectorAll('.lb-chip').forEach((chip) => {
      if (chip._lbChipInit) return;
      chip._lbChipInit = true;
      if (chip.classList.contains('lb-chip--disabled')) return;
      // Removal-idiom chips are never toggle chips: MultiSelect pills
      // (owned by their field) and applied-filter chips in a filter bar
      // both mean "× removes me". Skip by ancestry, not construction
      // time — preselected fields build pills BEFORE this boot sweep.
      if (chip.closest('[data-lb-multi-select], .lb-filter-bar')) return;

      // Toggle chips are usually <span>s (historically so a remove <button>
      // could nest): give them button semantics + keyboard toggle so the
      // selected state is programmatically conveyed — the quiet visuals
      // carry less weight than the old primary fill.
      if (chip.tagName !== 'BUTTON') {
        if (!chip.hasAttribute('role')) chip.setAttribute('role', 'button');
        if (!chip.hasAttribute('tabindex')) chip.setAttribute('tabindex', '0');
        chip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); }
        });
      }

      // Selection idiom = leading check (M3 convention, 2026-08-03).
      // × is the REMOVAL idiom and lives only on Multi-Select field pills
      // (which never pass through initChips); legacy × buttons inside
      // toggle chips are stripped on init.
      const sync = () => {
        const selected = chip.classList.contains('lb-chip--selected');
        chip.setAttribute('aria-pressed', String(selected));
        const legacyRemove = chip.querySelector('.lb-chip__remove');
        if (legacyRemove) legacyRemove.remove();
        let check = chip.querySelector('.lb-chip__check');
        if (selected && !check) {
          check = document.createElement('span');
          check.className = 'lb-chip__check';
          check.setAttribute('aria-hidden', 'true');
          check.innerHTML = SVG_CHECK;
          chip.prepend(check);
        } else if (!selected && check) {
          check.remove();
        }
      };
      sync();

      // Toggle selected on click
      chip.addEventListener('click', () => {
        chip.classList.toggle('lb-chip--selected');
        sync();
        chip.dispatchEvent(new CustomEvent('lb-chip-toggle', { bubbles: true, detail: { selected: chip.classList.contains('lb-chip--selected') } }));
      });
    });
  }

  // ─── AVATAR (image fallback) ───────────────────────────────
  //
  // Renders the data-lb-initials value when the inner <img> can't load —
  // and also when there is no <img> at all. The previous implementation
  // attached a one-off `error` listener inside DOMContentLoaded, which
  // missed images that had ALREADY failed before init ran (the browser
  // does not refire `error` on listeners attached after the fact).
  //
  // This walks every .lb-avatar with data-lb-initials and decides what
  // to do based on the current state of its <img> child.

  function _renderAvatarInitials(avatar) {
    if (avatar._lbAvatarDone) return;
    avatar._lbAvatarDone = true;
    const initials = avatar.dataset.lbInitials;
    if (!initials) return;
    // Wipe any failed <img> and set the initials text. The flex centering
    // on .lb-avatar handles layout.
    avatar.replaceChildren(document.createTextNode(initials));
  }

  function initAvatars() {
    document.querySelectorAll('.lb-avatar[data-lb-initials]').forEach((avatar) => {
      if (avatar._lbAvatarBound) return;
      avatar._lbAvatarBound = true;
      const img = avatar.querySelector('.lb-avatar__img');
      if (!img) {
        // No <img> at all — initials are the only content
        _renderAvatarInitials(avatar);
        return;
      }
      // Image is already failed — render initials now
      if (img.complete && img.naturalWidth === 0) {
        _renderAvatarInitials(avatar);
        return;
      }
      // Image hasn't loaded yet OR is currently loading — listen for errors
      img.addEventListener('error', () => _renderAvatarInitials(avatar));
    });
  }

  // ─── PHONE INPUT ────────────────────────────────────────────

  const PHONE_COUNTRIES = [
    { iso: 'af', name: 'Afghanistan', code: '+93' },
    { iso: 'al', name: 'Albania', code: '+355' },
    { iso: 'dz', name: 'Algeria', code: '+213' },
    { iso: 'ad', name: 'Andorra', code: '+376' },
    { iso: 'ao', name: 'Angola', code: '+244' },
    { iso: 'ar', name: 'Argentina', code: '+54' },
    { iso: 'am', name: 'Armenia', code: '+374' },
    { iso: 'au', name: 'Australia', code: '+61' },
    { iso: 'at', name: 'Austria', code: '+43' },
    { iso: 'az', name: 'Azerbaijan', code: '+994' },
    { iso: 'bh', name: 'Bahrain', code: '+973' },
    { iso: 'bd', name: 'Bangladesh', code: '+880' },
    { iso: 'by', name: 'Belarus', code: '+375' },
    { iso: 'be', name: 'Belgium', code: '+32' },
    { iso: 'bz', name: 'Belize', code: '+501' },
    { iso: 'bj', name: 'Benin', code: '+229' },
    { iso: 'bt', name: 'Bhutan', code: '+975' },
    { iso: 'bo', name: 'Bolivia', code: '+591' },
    { iso: 'ba', name: 'Bosnia and Herzegovina', code: '+387' },
    { iso: 'bw', name: 'Botswana', code: '+267' },
    { iso: 'br', name: 'Brazil', code: '+55' },
    { iso: 'bn', name: 'Brunei', code: '+673' },
    { iso: 'bg', name: 'Bulgaria', code: '+359' },
    { iso: 'bf', name: 'Burkina Faso', code: '+226' },
    { iso: 'bi', name: 'Burundi', code: '+257' },
    { iso: 'kh', name: 'Cambodia', code: '+855' },
    { iso: 'cm', name: 'Cameroon', code: '+237' },
    { iso: 'ca', name: 'Canada', code: '+1' },
    { iso: 'cv', name: 'Cape Verde', code: '+238' },
    { iso: 'cf', name: 'Central African Republic', code: '+236' },
    { iso: 'td', name: 'Chad', code: '+235' },
    { iso: 'cl', name: 'Chile', code: '+56' },
    { iso: 'cn', name: 'China', code: '+86' },
    { iso: 'co', name: 'Colombia', code: '+57' },
    { iso: 'cd', name: 'Congo (DRC)', code: '+243' },
    { iso: 'cg', name: 'Congo (Republic)', code: '+242' },
    { iso: 'cr', name: 'Costa Rica', code: '+506' },
    { iso: 'ci', name: "Côte d'Ivoire", code: '+225' },
    { iso: 'hr', name: 'Croatia', code: '+385' },
    { iso: 'cu', name: 'Cuba', code: '+53' },
    { iso: 'cy', name: 'Cyprus', code: '+357' },
    { iso: 'cz', name: 'Czech Republic', code: '+420' },
    { iso: 'dk', name: 'Denmark', code: '+45' },
    { iso: 'dj', name: 'Djibouti', code: '+253' },
    { iso: 'do', name: 'Dominican Republic', code: '+1' },
    { iso: 'ec', name: 'Ecuador', code: '+593' },
    { iso: 'eg', name: 'Egypt', code: '+20' },
    { iso: 'sv', name: 'El Salvador', code: '+503' },
    { iso: 'gq', name: 'Equatorial Guinea', code: '+240' },
    { iso: 'er', name: 'Eritrea', code: '+291' },
    { iso: 'ee', name: 'Estonia', code: '+372' },
    { iso: 'et', name: 'Ethiopia', code: '+251' },
    { iso: 'fj', name: 'Fiji', code: '+679' },
    { iso: 'fi', name: 'Finland', code: '+358' },
    { iso: 'fr', name: 'France', code: '+33' },
    { iso: 'ga', name: 'Gabon', code: '+241' },
    { iso: 'gm', name: 'Gambia', code: '+220' },
    { iso: 'ge', name: 'Georgia', code: '+995' },
    { iso: 'de', name: 'Germany', code: '+49' },
    { iso: 'gh', name: 'Ghana', code: '+233' },
    { iso: 'gr', name: 'Greece', code: '+30' },
    { iso: 'gt', name: 'Guatemala', code: '+502' },
    { iso: 'gn', name: 'Guinea', code: '+224' },
    { iso: 'gy', name: 'Guyana', code: '+592' },
    { iso: 'ht', name: 'Haiti', code: '+509' },
    { iso: 'hn', name: 'Honduras', code: '+504' },
    { iso: 'hk', name: 'Hong Kong', code: '+852' },
    { iso: 'hu', name: 'Hungary', code: '+36' },
    { iso: 'is', name: 'Iceland', code: '+354' },
    { iso: 'in', name: 'India', code: '+91' },
    { iso: 'id', name: 'Indonesia', code: '+62' },
    { iso: 'ir', name: 'Iran', code: '+98' },
    { iso: 'iq', name: 'Iraq', code: '+964' },
    { iso: 'ie', name: 'Ireland', code: '+353' },
    { iso: 'il', name: 'Israel', code: '+972' },
    { iso: 'it', name: 'Italy', code: '+39' },
    { iso: 'jm', name: 'Jamaica', code: '+1' },
    { iso: 'jp', name: 'Japan', code: '+81' },
    { iso: 'jo', name: 'Jordan', code: '+962' },
    { iso: 'kz', name: 'Kazakhstan', code: '+7' },
    { iso: 'ke', name: 'Kenya', code: '+254' },
    { iso: 'kw', name: 'Kuwait', code: '+965' },
    { iso: 'kg', name: 'Kyrgyzstan', code: '+996' },
    { iso: 'la', name: 'Laos', code: '+856' },
    { iso: 'lv', name: 'Latvia', code: '+371' },
    { iso: 'lb', name: 'Lebanon', code: '+961' },
    { iso: 'ls', name: 'Lesotho', code: '+266' },
    { iso: 'lr', name: 'Liberia', code: '+231' },
    { iso: 'ly', name: 'Libya', code: '+218' },
    { iso: 'li', name: 'Liechtenstein', code: '+423' },
    { iso: 'lt', name: 'Lithuania', code: '+370' },
    { iso: 'lu', name: 'Luxembourg', code: '+352' },
    { iso: 'mo', name: 'Macau', code: '+853' },
    { iso: 'mg', name: 'Madagascar', code: '+261' },
    { iso: 'mw', name: 'Malawi', code: '+265' },
    { iso: 'my', name: 'Malaysia', code: '+60' },
    { iso: 'mv', name: 'Maldives', code: '+960' },
    { iso: 'ml', name: 'Mali', code: '+223' },
    { iso: 'mt', name: 'Malta', code: '+356' },
    { iso: 'mr', name: 'Mauritania', code: '+222' },
    { iso: 'mu', name: 'Mauritius', code: '+230' },
    { iso: 'mx', name: 'Mexico', code: '+52' },
    { iso: 'md', name: 'Moldova', code: '+373' },
    { iso: 'mc', name: 'Monaco', code: '+377' },
    { iso: 'mn', name: 'Mongolia', code: '+976' },
    { iso: 'me', name: 'Montenegro', code: '+382' },
    { iso: 'ma', name: 'Morocco', code: '+212' },
    { iso: 'mz', name: 'Mozambique', code: '+258' },
    { iso: 'mm', name: 'Myanmar', code: '+95' },
    { iso: 'na', name: 'Namibia', code: '+264' },
    { iso: 'np', name: 'Nepal', code: '+977' },
    { iso: 'nl', name: 'Netherlands', code: '+31' },
    { iso: 'nz', name: 'New Zealand', code: '+64' },
    { iso: 'ni', name: 'Nicaragua', code: '+505' },
    { iso: 'ne', name: 'Niger', code: '+227' },
    { iso: 'ng', name: 'Nigeria', code: '+234' },
    { iso: 'kp', name: 'North Korea', code: '+850' },
    { iso: 'mk', name: 'North Macedonia', code: '+389' },
    { iso: 'no', name: 'Norway', code: '+47' },
    { iso: 'om', name: 'Oman', code: '+968' },
    { iso: 'pk', name: 'Pakistan', code: '+92' },
    { iso: 'ps', name: 'Palestine', code: '+970' },
    { iso: 'pa', name: 'Panama', code: '+507' },
    { iso: 'pg', name: 'Papua New Guinea', code: '+675' },
    { iso: 'py', name: 'Paraguay', code: '+595' },
    { iso: 'pe', name: 'Peru', code: '+51' },
    { iso: 'ph', name: 'Philippines', code: '+63' },
    { iso: 'pl', name: 'Poland', code: '+48' },
    { iso: 'pt', name: 'Portugal', code: '+351' },
    { iso: 'qa', name: 'Qatar', code: '+974' },
    { iso: 'ro', name: 'Romania', code: '+40' },
    { iso: 'ru', name: 'Russia', code: '+7' },
    { iso: 'rw', name: 'Rwanda', code: '+250' },
    { iso: 'sa', name: 'Saudi Arabia', code: '+966' },
    { iso: 'sn', name: 'Senegal', code: '+221' },
    { iso: 'rs', name: 'Serbia', code: '+381' },
    { iso: 'sg', name: 'Singapore', code: '+65' },
    { iso: 'sk', name: 'Slovakia', code: '+421' },
    { iso: 'si', name: 'Slovenia', code: '+386' },
    { iso: 'so', name: 'Somalia', code: '+252' },
    { iso: 'za', name: 'South Africa', code: '+27' },
    { iso: 'kr', name: 'South Korea', code: '+82' },
    { iso: 'ss', name: 'South Sudan', code: '+211' },
    { iso: 'es', name: 'Spain', code: '+34' },
    { iso: 'lk', name: 'Sri Lanka', code: '+94' },
    { iso: 'sd', name: 'Sudan', code: '+249' },
    { iso: 'sr', name: 'Suriname', code: '+597' },
    { iso: 'se', name: 'Sweden', code: '+46' },
    { iso: 'ch', name: 'Switzerland', code: '+41' },
    { iso: 'sy', name: 'Syria', code: '+963' },
    { iso: 'tw', name: 'Taiwan', code: '+886' },
    { iso: 'tj', name: 'Tajikistan', code: '+992' },
    { iso: 'tz', name: 'Tanzania', code: '+255' },
    { iso: 'th', name: 'Thailand', code: '+66' },
    { iso: 'tl', name: 'Timor-Leste', code: '+670' },
    { iso: 'tg', name: 'Togo', code: '+228' },
    { iso: 'tt', name: 'Trinidad and Tobago', code: '+1' },
    { iso: 'tn', name: 'Tunisia', code: '+216' },
    { iso: 'tr', name: 'Turkey', code: '+90' },
    { iso: 'tm', name: 'Turkmenistan', code: '+993' },
    { iso: 'ug', name: 'Uganda', code: '+256' },
    { iso: 'ua', name: 'Ukraine', code: '+380' },
    { iso: 'ae', name: 'United Arab Emirates', code: '+971' },
    { iso: 'gb', name: 'United Kingdom', code: '+44' },
    { iso: 'us', name: 'United States', code: '+1' },
    { iso: 'uy', name: 'Uruguay', code: '+598' },
    { iso: 'uz', name: 'Uzbekistan', code: '+998' },
    { iso: 've', name: 'Venezuela', code: '+58' },
    { iso: 'vn', name: 'Vietnam', code: '+84' },
    { iso: 'ye', name: 'Yemen', code: '+967' },
    { iso: 'zm', name: 'Zambia', code: '+260' },
    { iso: 'zw', name: 'Zimbabwe', code: '+263' },
  ];

  // Flags are vendored locally under /assets/flags/. Base path auto-detects
  // from lb.js's own <script src> so consumers served from any subpath
  // resolve correctly. Mirrors the icon loader pattern above.
  let _flagBasePath = 'assets/flags';
  // Origin-qualified for the same reason as detectBasePath above: flags
  // must load from wherever lb.js lives (CDN included), and unlike
  // icons they render as <img> and fail hard, so the consumer-side
  // escape hatch setFlagBasePath mirrors setIconBasePath.
  (function detectFlagBasePath() {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      if (s.src.includes('lb.js')) {
        const url = new URL(s.src);
        const dir = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
        _flagBasePath = url.origin + dir.replace(/\/js$/, '') + '/assets/flags';
        break;
      }
    }
  })();

  function setFlagBasePath(path) {
    _flagBasePath = path.replace(/\/$/, '');
  }

  const _flagCache = {};

  function flagUrl(iso) {
    return `${_flagBasePath}/${iso}.svg`;
  }

  class PhoneInput {
    constructor(el, opts = {}) {
      this.el = el;
      this.countries = PHONE_COUNTRIES;
      this.open = false;
      this.activeIdx = -1;

      // Detect default country from browser locale
      const browserLang = navigator.language || 'en-US';
      const localeParts = browserLang.split('-');
      const localeCountry = (localeParts[1] || localeParts[0]).toLowerCase();
      const defaultIso = opts.defaultCountry || localeCountry;
      this.selected = this.countries.find(c => c.iso === defaultIso) || this.countries.find(c => c.iso === 'us');

      this._build();
      this._bind();
    }

    _build() {
      const el = this.el;
      const c = this.selected;

      // Trigger (flag + code + chevron)
      this.trigger = document.createElement('button');
      this.trigger.type = 'button';
      this.trigger.className = 'lb-phone__trigger';
      this.trigger.setAttribute('role', 'combobox');
      this.trigger.setAttribute('aria-haspopup', 'listbox');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-label', `Select country, currently ${c.name} ${c.code}`);

      this.flagImg = document.createElement('img');
      this.flagImg.className = 'lb-phone__flag';
      this.flagImg.src = flagUrl(c.iso);
      this.flagImg.alt = '';
      this.flagImg.setAttribute('aria-hidden', 'true');

      this.codeSpan = document.createElement('span');
      this.codeSpan.className = 'lb-phone__code';
      this.codeSpan.textContent = c.code;

      this.chevron = document.createElement('span');
      this.chevron.className = 'lb-phone__chevron';
      this.chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

      this.trigger.append(this.flagImg, this.codeSpan, this.chevron);

      // Divider
      const divider = document.createElement('span');
      divider.className = 'lb-phone__divider';
      divider.setAttribute('aria-hidden', 'true');

      // Number input
      this.input = el.querySelector('.lb-phone__input');
      if (!this.input) {
        this.input = document.createElement('input');
        this.input.type = 'tel';
        this.input.className = 'lb-phone__input';
        this.input.placeholder = opts.placeholder || 'Phone number';
      }
      this.input.setAttribute('inputmode', 'numeric');

      // Dropdown — uses the shared List primitive (.lb-list--filterable)
      // so search, keyboard nav (Arrow/Enter/Esc/Home/End), scroll-into-
      // view, and ARIA listbox+activedescendant all come from List for
      // free. Earlier this class duplicated those behaviours; List was
      // extracted later for Multi-Select / Command Palette / Datepicker
      // and Phone now uses the same primitive.
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'lb-phone__dropdown lb-list lb-list--filterable';
      this.dropdown.setAttribute('data-lb-list-filterable', '');
      this.dropdown.hidden = true;

      // Search input — wraps it in the same .lb-list__search-wrap +
      // .lb-input-wrap structure used by the List filterable demo so
      // the input gets the leading search icon, the proper field
      // styling, and the clearable X. The bare <input class="lb-list__search">
      // shape (no wraps) renders unstyled — that was the visible bug
      // after the first refactor.
      const searchWrap = document.createElement('div');
      searchWrap.className = 'lb-list__search-wrap';
      searchWrap.setAttribute('data-lb-clearable', '');

      const inputWrap = document.createElement('div');
      inputWrap.className = 'lb-input-wrap';

      const searchIcon = document.createElement('span');
      searchIcon.className = 'lb-input-wrap__icon lb-input-wrap__icon--start';
      searchIcon.setAttribute('aria-hidden', 'true');
      searchIcon.setAttribute('data-lb-icon', 'search');

      this.searchInput = document.createElement('input');
      this.searchInput.type = 'search';
      this.searchInput.className = 'lb-input lb-input--medium lb-input--has-start lb-list__search';
      this.searchInput.placeholder = 'Search country…';
      this.searchInput.setAttribute('aria-label', 'Search countries');
      this.searchInput.setAttribute('autocomplete', 'off');

      inputWrap.append(searchIcon, this.searchInput);
      searchWrap.appendChild(inputWrap);

      // Items container — List looks for .lb-list__items
      this.optionsList = document.createElement('ul');
      this.optionsList.className = 'lb-list__items';

      // No-results placeholder — List toggles its visibility automatically
      const noResults = document.createElement('div');
      noResults.className = 'lb-list__no-results';
      noResults.hidden = true;
      noResults.textContent = 'No countries found';

      this.dropdown.append(searchWrap, this.optionsList, noResults);

      // Assemble
      el.textContent = '';
      el.append(this.trigger, divider, this.input, this.dropdown);

      this._renderOptions(this.countries);

      // Mount the List primitive on the dropdown (after items are in place).
      // Delegates filter, keyboard nav, ARIA, scroll-into-view to List.
      this._listInstance = new List(this.dropdown);
    }

    _renderOptions(list) {
      this.optionsList.innerHTML = '';
      list.forEach((c) => {
        const li = document.createElement('li');
        li.className = 'lb-list__item';
        li.dataset.lbValue = c.iso;
        // Searchable text — covers name + dialing code + ISO so users can
        // type "germany", "+49", or "de" and find the same row.
        li.dataset.lbSearch = `${c.name} ${c.code} ${c.iso}`;
        if (c.iso === this.selected.iso) {
          li.classList.add('lb-list__item--selected');
        }

        const flag = document.createElement('img');
        flag.className = 'lb-list__icon lb-list__icon--round';
        flag.src = flagUrl(c.iso);
        flag.alt = '';
        flag.loading = 'lazy';

        const name = document.createElement('span');
        name.className = 'lb-list__label';
        name.textContent = c.name;

        const code = document.createElement('span');
        code.className = 'lb-list__hint';
        code.textContent = c.code;

        li.append(flag, name, code);
        this.optionsList.appendChild(li);
      });
    }

    _bind() {
      // Toggle dropdown
      this.trigger.addEventListener('click', () => this._toggle());

      // Selection — List dispatches `lb-list-select` with detail.value
      this.dropdown.addEventListener('lb-list-select', (e) => {
        const country = this.countries.find((c) => c.iso === e.detail.value);
        if (country) this._select(country);
      });

      // Escape closes — List handles arrow/enter; we just need esc → close
      this.dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this._close();
          this.trigger.focus();
        }
      });

      // Number-only input: strip non-digits on input (preserves paste)
      this.input.addEventListener('input', () => {
        const pos = this.input.selectionStart;
        const before = this.input.value;
        const cleaned = before.replace(/[^\d]/g, '');
        if (cleaned !== before) {
          this.input.value = cleaned;
          // Adjust cursor position
          const diff = before.length - cleaned.length;
          this.input.selectionStart = this.input.selectionEnd = Math.max(0, pos - diff);
        }
        // Max 15 digits (E.164)
        if (this.input.value.length > 15) {
          this.input.value = this.input.value.slice(0, 15);
        }
        this._emitChange();
      });

      // Close on outside click
      this._outsideHandler = (e) => {
        if (this.open && !this.el.contains(e.target)) this._close();
      };
      document.addEventListener('mousedown', this._outsideHandler);

      // Trigger keyboard
      this.trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          this._openDropdown();
        }
      });
    }

    _toggle() {
      this.open ? this._close() : this._openDropdown();
    }

    _openDropdown() {
      this.open = true;
      this.dropdown.hidden = false;
      this.trigger.setAttribute('aria-expanded', 'true');
      this.chevron.classList.add('lb-phone__chevron--open');
      // Reset search via the List primitive's own filter()
      this.searchInput.value = '';
      if (this._listInstance) this._listInstance.filter('');
      // Focus search + scroll selected into view on the next frame
      requestAnimationFrame(() => {
        this.searchInput.focus();
        const sel = this.optionsList.querySelector('.lb-list__item--selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
      });
    }

    _close() {
      this.open = false;
      this.dropdown.hidden = true;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.chevron.classList.remove('lb-phone__chevron--open');
    }

    _select(country) {
      this.selected = country;
      this.flagImg.src = flagUrl(country.iso);
      this.codeSpan.textContent = country.code;
      this.trigger.setAttribute('aria-label', `Select country, currently ${country.name} ${country.code}`);
      this._close();
      this.input.focus();
      this._emitChange();
    }

    _emitChange() {
      const value = this.selected.code + this.input.value;
      this.el.dispatchEvent(new CustomEvent('lb-phone-change', {
        bubbles: true,
        detail: {
          country: this.selected,
          number: this.input.value,
          fullNumber: value,
        }
      }));
    }

    getValue() {
      return {
        country: this.selected,
        number: this.input.value,
        fullNumber: this.selected.code + this.input.value,
      };
    }

    setCountry(iso) {
      const c = this.countries.find(x => x.iso === iso);
      if (c) this._select(c);
    }

    destroy() {
      document.removeEventListener('mousedown', this._outsideHandler);
    }
  }

  // ─── NUMBER INPUT ──────────────────────────────────────────
  // Numeric field with stepper buttons and min/max clamping.
  // Dispatches `lb-number-change` with `{ value }` on every change.
  // Keyboard: native up/down already works on <input type="number">; we
  // also wire Enter to commit + blur.

  class NumberInput {
    constructor(el, options = {}) {
      this.wrap = el;
      this.input = el.querySelector('.lb-number');
      if (!this.input) return;
      this.decBtn = el.querySelector('.lb-number__step--dec');
      this.incBtn = el.querySelector('.lb-number__step--inc');
      this.step = parseFloat(el.dataset.lbStep ?? this.input.step ?? '1') || 1;
      this.min  = this._readLimit(el.dataset.lbMin ?? this.input.min, -Infinity);
      this.max  = this._readLimit(el.dataset.lbMax ?? this.input.max,  Infinity);
      this._init();
    }

    _readLimit(raw, fallback) {
      if (raw === undefined || raw === null || raw === '') return fallback;
      const n = parseFloat(raw);
      return isNaN(n) ? fallback : n;
    }

    _init() {
      if (this.decBtn) this._bindHoldStep(this.decBtn, -this.step);
      if (this.incBtn) this._bindHoldStep(this.incBtn,  this.step);
      this.input.addEventListener('input',  () => this._updateButtonStates());
      this.input.addEventListener('change', () => this._clampAndEmit());
      this._updateButtonStates();
    }

    /** Bind press-and-hold autorepeat to a stepper button.
        First step fires immediately on mousedown/touchstart; after a 400ms
        dwell, the value keeps stepping, accelerating from 250ms between
        ticks down to 50ms. Stops on mouseup / touchend / pointerleave /
        blur. Keyboard Enter/Space triggers a single step (no repeat). */
    _bindHoldStep(btn, delta) {
      let timer = null;
      let speed = 250;

      const stop = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        speed = 250;
      };
      const tick = () => {
        if (btn.disabled) { stop(); return; }
        this._stepBy(delta);
        speed = Math.max(50, speed * 0.88);
        timer = setTimeout(tick, speed);
      };
      const start = () => {
        if (btn.disabled) return;
        this._stepBy(delta);
        timer = setTimeout(tick, 400);
      };

      btn.addEventListener('mousedown', (e) => { if (e.button === 0) start(); });
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
      btn.addEventListener('mouseup',     stop);
      btn.addEventListener('mouseleave',  stop);
      btn.addEventListener('touchend',    stop);
      btn.addEventListener('touchcancel', stop);
      btn.addEventListener('blur',        stop);

      // Keyboard: single step on Enter/Space (no autorepeat)
      btn.addEventListener('keydown', (e) => {
        if (btn.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._stepBy(delta);
        }
      });
    }

    _stepBy(delta) {
      const current = this.getValue() ?? 0;
      this.setValue(this._round(current + delta));
    }

    _clampAndEmit() {
      const v = this.getValue();
      if (v === null) return;  // empty input — don't clamp
      if (v < this.min) this.setValue(this.min);
      else if (v > this.max) this.setValue(this.max);
      else { this._updateButtonStates(); this._emit(v); }
    }

    _round(v) {
      // Avoid 0.1 + 0.2 = 0.30000…004 by rounding to step precision.
      const decimals = (String(this.step).split('.')[1] || '').length;
      return parseFloat(v.toFixed(decimals));
    }

    _updateButtonStates() {
      const v = this.getValue() ?? 0;
      if (this.decBtn) this.decBtn.disabled = v - this.step < this.min - 1e-9;
      if (this.incBtn) this.incBtn.disabled = v + this.step > this.max + 1e-9;
    }

    _emit(v) {
      this.wrap.dispatchEvent(new CustomEvent('lb-number-change', { detail: { value: v } }));
    }

    /** Current value as a number, or null when the input is empty. */
    getValue() {
      if (this.input.value === '') return null;
      const v = parseFloat(this.input.value);
      return isNaN(v) ? null : v;
    }

    /** Programmatic set — clamps to [min,max] and dispatches event. */
    setValue(v) {
      const clamped = Math.min(Math.max(v, this.min), this.max);
      const rounded = this._round(clamped);
      this.input.value = String(rounded);
      this._updateButtonStates();
      this._emit(rounded);
    }

    destroy() {}
  }

  // ─── MULTI-SELECT ──────────────────────────────────────────
  // Form field with inline chip pills + popup listbox. Uses
  // the List primitive internally (mode='multi', optional
  // filterable + sortSelected). Maintains a Set of values and
  // renders pills in the trigger.

  const SVG_PILL_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  class MultiSelect {
    constructor(el, options = {}) {
      this.field = el;
      this.size = options.size || el.dataset.lbSize || 'medium';
      this.placeholder = options.placeholder || el.dataset.lbPlaceholder || 'Select…';
      this.filterable = el.hasAttribute('data-lb-filterable') || options.filterable === true;
      this.sortSelected = el.hasAttribute('data-lb-sort-selected') || options.sortSelected === true;
      this._options = [];
      this._values = new Set(
        (options.value || (el.dataset.lbValue ? el.dataset.lbValue.split(',') : []))
          .filter(Boolean)
      );
      this._open = false;
      this._init();
    }

    _init() {
      const optData = this.field.dataset.lbOptions;
      if (optData) {
        try { this._options = JSON.parse(optData); } catch (e) { /* ignore */ }
      }

      // Trigger — uses div+tabindex (not button) so nested pill buttons
      // aren't invalid nested interactive elements.
      this.trigger = document.createElement('div');
      this.trigger.className = `lb-multi-select lb-multi-select--${this.size}`;
      this.trigger.setAttribute('role', 'combobox');
      // Adopt an external <label for="<field id>"> as the accessible name;
      // otherwise the placeholder is the only honest name.
      {
        const lab = this.field.id ? document.querySelector(`label[for="${this.field.id}"]`) : null;
        if (lab) {
          if (!lab.id) lab.id = `${this.field.id}-label`;
          this.trigger.setAttribute('aria-labelledby', lab.id);
        } else {
          this.trigger.setAttribute('aria-label', this.placeholder || 'Multi select');
        }
      }
      this.trigger.setAttribute('aria-haspopup', 'listbox');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.tabIndex = 0;

      this.pillsEl = document.createElement('span');
      this.pillsEl.className = 'lb-multi-select__pills';
      this.placeholderEl = document.createElement('span');
      this.placeholderEl.className = 'lb-multi-select__placeholder';
      this.placeholderEl.textContent = this.placeholder;
      this.chevron = document.createElement('span');
      this.chevron.className = 'lb-multi-select-wrap__chevron';
      this.chevron.innerHTML = SVG_CHEVRON;

      this.trigger.append(this.pillsEl, this.placeholderEl, this.chevron);

      // Mount into field — replace .lb-multi-select-wrap inner content
      const wrap = this.field.querySelector('.lb-multi-select-wrap');
      if (wrap) { wrap.innerHTML = ''; wrap.appendChild(this.trigger); }
      else this.field.appendChild(this.trigger);

      this.trigger.addEventListener('click', (e) => {
        // Don't toggle when a pill's remove X is clicked
        if (e.target.closest('.lb-multi-select__pill-remove')) return;
        this._toggle();
      });
      this.trigger.addEventListener('keydown', (e) => this._onTriggerKeydown(e));

      this._removeClickOutside = onClickOutside(this.field, () => {
        if (this._open) this._close();
      });

      this._renderPills();
    }

    setOptions(options) {
      this._options = options;
      this._renderPills();
      if (this._list) this._buildList();
    }

    _toggle() { this._open ? this._close() : this._show(); }

    _show() {
      this._open = true;
      this.trigger.setAttribute('aria-expanded', 'true');
      this.chevron.classList.add('lb-multi-select-wrap__chevron--open');
      this._buildList();
    }

    _close() {
      this._open = false;
      this.trigger.setAttribute('aria-expanded', 'false');
      this.chevron.classList.remove('lb-multi-select-wrap__chevron--open');
      if (this._list) { this._list.remove(); this._list = null; this._listInstance = null; }
      this.trigger.focus();
    }

    _buildList() {
      if (this._list) this._list.remove();

      // Container holds optional search + scrollable items list.
      // Popup surface class `.lb-dropdown-list` provides float/shadow/radius;
      // `.lb-list` provides item layout; `.lb-list--multi-select` enables
      // the checkbox visual pattern.
      this._list = document.createElement('div');
      this._list.className = 'lb-dropdown-list lb-list lb-list--multi-select';
      if (this.filterable) this._list.classList.add('lb-list--filterable');

      // Build inner items <ul>
      let itemsRoot = this._list;
      if (this.filterable) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'lb-list__search-wrap';
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'lb-list__search';
        search.placeholder = 'Search…';
        search.autocomplete = 'off';
        searchWrap.appendChild(search);
        this._list.appendChild(searchWrap);

        itemsRoot = document.createElement('ul');
        itemsRoot.className = 'lb-list__items';
        this._list.appendChild(itemsRoot);
      }

      this._options.forEach((opt) => {
        const li = document.createElement('li');
        li.className = 'lb-list__item';
        li.dataset.lbValue = opt.value;
        if (opt.disabled) li.classList.add('lb-list__item--disabled');
        if (this._values.has(opt.value)) li.classList.add('lb-list__item--selected');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'lb-checkbox';
        cb.tabIndex = -1;
        cb.checked = this._values.has(opt.value);
        if (opt.disabled) cb.disabled = true;

        const label = document.createElement('span');
        label.className = 'lb-list__label';
        label.textContent = opt.label;

        li.append(cb, label);
        itemsRoot.appendChild(li);
      });

      // Attach List behaviour — handles keyboard nav, selection, filter,
      // and sort-selected-on-mount if data-lb-list-sort-selected is set.
      if (this.sortSelected) this._list.setAttribute('data-lb-list-sort-selected', '');
      if (this.filterable) this._list.setAttribute('data-lb-list-filterable', '');
      this._list.dataset.lbListMode = 'multi';

      // Mount BEFORE instantiating List — constructor scans the DOM.
      const wrap = this.field.querySelector('.lb-multi-select-wrap');
      wrap.appendChild(this._list);

      this._listInstance = new List(this._list);
      this._list._lbList = this._listInstance;

      // The list mounts after the boot-time sweeps, so its checkboxes
      // miss the global initCheckboxGlyphs/initIcons passes — run them
      // scoped here or the boxes render with no check glyph at all
      // (bug since the 3d82f36 glyph-frame refactor).
      initCheckboxGlyphs(this._list);
      initIcons(this._list);

      // Mirror selections back into our value set + re-render pills.
      this._list.addEventListener('lb-list-select', (e) => {
        const { value, item, selected } = e.detail;
        // `selected` is [{ value, item }] per List.getSelected()
        this._values = new Set(selected.map((s) => s.value));
        this._renderPills();
        this.field.dispatchEvent(new CustomEvent('lb-multi-select-change', {
          detail: { values: [...this._values], toggled: value, item },
        }));
      });

      // Focus the search when filterable, else the list container
      if (this.filterable) {
        const search = this._list.querySelector('.lb-list__search');
        if (search) search.focus();
      }
    }

    _renderPills() {
      this.pillsEl.innerHTML = '';
      const selectedOpts = this._options.filter((o) => this._values.has(o.value));
      selectedOpts.forEach((opt) => {
        // Reuse existing Chip component — quiet-selected styling, theme-
        // adaptive, dark-mode friendly. <span> not <button>: nesting a
        // button would swallow clicks meant for the combobox trigger.
        const chip = document.createElement('span');
        chip.className = 'lb-chip lb-chip--selected';

        chip.appendChild(document.createTextNode(opt.label));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'lb-chip__remove';
        remove.setAttribute('aria-label', `Remove ${opt.label}`);
        remove.innerHTML = SVG_PILL_X;
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeValue(opt.value);
        });
        chip.appendChild(remove);

        this.pillsEl.appendChild(chip);
      });
      // Show only one of pills/placeholder so neither grabs flex:1 space
      // when the other should own the row.
      this.pillsEl.hidden = selectedOpts.length === 0;
      this.placeholderEl.hidden = selectedOpts.length > 0;
    }

    _removeValue(value) {
      this._values.delete(value);
      this._renderPills();
      // Sync the popup list item if open
      if (this._list) {
        const li = this._list.querySelector(`.lb-list__item[data-lb-value="${value}"]`);
        if (li) {
          li.classList.remove('lb-list__item--selected');
          li.setAttribute('aria-selected', 'false');
          const cb = li.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = false;
        }
      }
      this.field.dispatchEvent(new CustomEvent('lb-multi-select-change', {
        detail: { values: [...this._values], toggled: value },
      }));
    }

    _onTriggerKeydown(e) {
      if (!this._open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._show();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this._close();
      }
    }

    /** Get selected values as an array. */
    getValue() { return [...this._values]; }

    /** Replace the selected set. */
    setValue(values) {
      this._values = new Set(values);
      this._renderPills();
      if (this._list) this._buildList();
    }

    destroy() {
      this._close();
      if (this._removeClickOutside) this._removeClickOutside();
    }
  }

  // ─── FILE UPLOADER ─────────────────────────────────────────
  // Drag-drop + click-to-browse + file list. The component is purely
  // presentational — it holds the selected File objects and renders
  // rows with optional progress bars and remove buttons. Actual
  // uploading (XHR / fetch) is the consumer's responsibility; they
  // call setProgress(file, pct) and markDone(file) / markError(file, msg)
  // to drive the UI. Events: lb-file-added, lb-file-removed,
  // lb-file-error (invalid type / too big / count exceeded).

  class FileUploader {
    constructor(el, options = {}) {
      this.root = el;
      this.dropzone = el.querySelector('.lb-uploader__dropzone');
      this.input = el.querySelector('.lb-uploader__input');
      this.filesList = el.querySelector('.lb-uploader__files');
      // Constraints
      this.accept = el.dataset.lbAccept || options.accept || ''; // e.g. "image/*,.pdf"
      this.maxSize = +(el.dataset.lbMaxSize || options.maxSize || 0); // bytes, 0 = unlimited
      this.maxFiles = +(el.dataset.lbMaxFiles || options.maxFiles || 0); // 0 = unlimited
      this.multiple = el.hasAttribute('data-lb-multiple')
        || (this.input && this.input.hasAttribute('multiple'))
        || options.multiple === true;
      this._files = []; // Array<{ file: File, id: string, row: HTMLElement, status: 'pending'|'uploading'|'done'|'error' }>
      this._init();
    }

    _init() {
      if (!this.dropzone || !this.input || !this.filesList) return;

      // Ensure input attributes match our options
      if (this.accept) this.input.setAttribute('accept', this.accept);
      if (this.multiple) this.input.setAttribute('multiple', '');

      // Click on dropzone → open file picker
      this.dropzone.addEventListener('click', (e) => {
        if (this.dropzone.classList.contains('lb-uploader__dropzone--disabled')) return;
        // Don't re-trigger from clicks bubbled out of the input itself
        if (e.target === this.input) return;
        this.input.click();
      });
      // Keyboard: Space/Enter on the dropzone also opens picker
      this.dropzone.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (this.dropzone.classList.contains('lb-uploader__dropzone--disabled')) return;
          this.input.click();
        }
      });
      // Make dropzone focusable for keyboard users
      if (!this.dropzone.hasAttribute('tabindex')) this.dropzone.tabIndex = 0;
      if (!this.dropzone.hasAttribute('role')) this.dropzone.setAttribute('role', 'button');
      // The dropzone IS the control; the native input is driven
      // programmatically and must not nest inside it as a second control.
      this.input.tabIndex = -1;
      this.input.setAttribute('aria-hidden', 'true');
      if (this.dropzone.contains(this.input)) {
        this.dropzone.parentNode.insertBefore(this.input, this.dropzone.nextSibling);
      }

      // Native input change
      this.input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        this._addFiles(files);
        // Reset input so picking the same file again fires change
        this.input.value = '';
      });

      // Drag-drop
      ['dragenter', 'dragover'].forEach((type) => {
        this.dropzone.addEventListener(type, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.dropzone.classList.contains('lb-uploader__dropzone--disabled')) return;
          this.dropzone.classList.add('lb-uploader__dropzone--drag-active');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        this.dropzone.addEventListener(type, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.remove('lb-uploader__dropzone--drag-active');
        });
      });
      this.dropzone.addEventListener('drop', (e) => {
        if (this.dropzone.classList.contains('lb-uploader__dropzone--disabled')) return;
        const files = Array.from(e.dataTransfer?.files || []);
        this._addFiles(files);
      });
    }

    _addFiles(files) {
      for (const file of files) {
        const err = this._validate(file);
        if (err) {
          this.root.dispatchEvent(new CustomEvent('lb-file-error', {
            detail: { file, error: err },
          }));
          // Still render the row so user sees what was rejected + why
          const entry = this._renderRow(file, { status: 'error', meta: err });
          this._files.push(entry);
          continue;
        }

        // Single-file mode: replace any existing file
        if (!this.multiple && this._files.length) {
          this._files.forEach((e) => e.row.remove());
          this._files = [];
        }

        const entry = this._renderRow(file, { status: 'pending' });
        this._files.push(entry);
        this.root.dispatchEvent(new CustomEvent('lb-file-added', {
          detail: { file, id: entry.id },
        }));
      }
    }

    _validate(file) {
      if (this.maxSize && file.size > this.maxSize) {
        return `File too large (${this._formatSize(file.size)} > ${this._formatSize(this.maxSize)})`;
      }
      if (this.accept) {
        const types = this.accept.split(',').map((s) => s.trim()).filter(Boolean);
        const ok = types.some((t) => {
          if (t.startsWith('.')) {
            return file.name.toLowerCase().endsWith(t.toLowerCase());
          }
          if (t.endsWith('/*')) {
            return file.type.startsWith(t.slice(0, -1));
          }
          return file.type === t;
        });
        if (!ok) return `Unsupported file type`;
      }
      if (this.maxFiles && this._files.length >= this.maxFiles) {
        return `Maximum ${this.maxFiles} files`;
      }
      return null;
    }

    _renderRow(file, { status = 'pending', meta = null } = {}) {
      const id = uid('lb-file');
      const row = document.createElement('li');
      row.className = 'lb-uploader__file';
      if (status === 'error') row.classList.add('lb-uploader__file--error');
      row.dataset.lbFileId = id;

      // Icon — generic file symbol
      const icon = document.createElement('span');
      icon.className = 'lb-uploader__file-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

      // Body — name + meta (size or error message)
      const body = document.createElement('div');
      body.className = 'lb-uploader__file-body';
      const name = document.createElement('span');
      name.className = 'lb-uploader__file-name';
      name.textContent = file.name;
      const metaEl = document.createElement('span');
      metaEl.className = 'lb-uploader__file-meta';
      metaEl.textContent = meta || this._formatSize(file.size);
      body.append(name, metaEl);

      // Progress — reuses .lb-progress
      const progressWrap = document.createElement('div');
      progressWrap.className = 'lb-uploader__progress';
      const progress = document.createElement('progress');
      progress.className = 'lb-progress lb-progress--small';
      progress.max = 100;
      progress.value = 0;
      progress.setAttribute('aria-label', `Uploading ${file.name}`);
      progressWrap.appendChild(progress);
      if (status !== 'pending' && status !== 'uploading') {
        progressWrap.style.display = 'none';
      }

      // Remove button
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lb-uploader__remove';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      remove.addEventListener('click', () => this.remove(id));

      row.append(icon, body, progressWrap, remove);
      this.filesList.appendChild(row);

      return { file, id, row, progress, metaEl, status };
    }

    _formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    /** Consumer calls this during XHR upload progress events. */
    setProgress(id, percent) {
      const entry = this._files.find((e) => e.id === id);
      if (!entry) return;
      entry.status = 'uploading';
      entry.progress.value = Math.max(0, Math.min(100, percent));
    }

    /** Consumer calls this on successful upload. */
    markDone(id) {
      const entry = this._files.find((e) => e.id === id);
      if (!entry) return;
      entry.status = 'done';
      entry.row.classList.add('lb-uploader__file--done', 'lb-uploader__file--success');
      entry.progress.parentElement.style.display = 'none';
    }

    /** Consumer calls this on failed upload. */
    markError(id, message) {
      const entry = this._files.find((e) => e.id === id);
      if (!entry) return;
      entry.status = 'error';
      entry.row.classList.add('lb-uploader__file--error');
      entry.row.classList.remove('lb-uploader__file--success', 'lb-uploader__file--done');
      if (message) entry.metaEl.textContent = message;
      entry.progress.parentElement.style.display = 'none';
    }

    remove(id) {
      const idx = this._files.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const [entry] = this._files.splice(idx, 1);
      entry.row.remove();
      this.root.dispatchEvent(new CustomEvent('lb-file-removed', {
        detail: { file: entry.file, id },
      }));
    }

    clear() {
      this._files.forEach((e) => e.row.remove());
      this._files = [];
    }

    getFiles() { return this._files.map((e) => ({ file: e.file, id: e.id, status: e.status })); }

    destroy() {}
  }

  // ─── COMMAND PALETTE ───────────────────────────────────────
  // Global launcher. The consumer authors the backdrop + inner shell
  // in markup (so they control the command list + grouping). This
  // class wires:
  //   - global keyboard listener (⌘K / Ctrl+K) to open the palette
  //   - Escape to close
  //   - backdrop click to close
  //   - focus trap while open
  //   - focus return to the previously-focused element on close
  //   - binding the inner .lb-list--filterable search to the command list
  //   - Enter on the active item dispatches `lb-cmdk-select`

  class CommandPalette {
    constructor(el, options = {}) {
      this.backdrop = el;
      this.shell = el.querySelector('.lb-cmdk');
      this.search = el.querySelector('.lb-cmdk__search');
      this.hotkey = el.dataset.lbHotkey || options.hotkey || 'k';
      this._open = false;
      this._previousFocus = null;
      this._releaseTrap = null;
      this._init();
    }

    _init() {
      // Initial state: hidden
      if (!this.backdrop.hasAttribute('hidden')) this.backdrop.setAttribute('hidden', '');
      this.backdrop.setAttribute('role', 'dialog');
      this.backdrop.setAttribute('aria-modal', 'true');

      // Global keyboard: ⌘K / Ctrl+K opens, Escape closes (only if open)
      this._keyHandler = (e) => {
        const isOpen = this._open;
        const mod = e.metaKey || e.ctrlKey;
        // Check if the key matches our configured hotkey (case-insensitive)
        if (mod && e.key.toLowerCase() === this.hotkey.toLowerCase() && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          isOpen ? this.close() : this.open();
          return;
        }
        if (isOpen && e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      };
      document.addEventListener('keydown', this._keyHandler);

      // Backdrop click (not shell click) closes
      this.backdrop.addEventListener('mousedown', (e) => {
        if (e.target === this.backdrop) this.close();
      });

      // The inner <ul class="lb-list" data-lb-list> is a standard List
      // primitive. CommandPalette owns the search input (externally,
      // above the list) and drives the list via public filter() +
      // bindKeyboardNav() so arrow keys work while focus stays on the
      // search. WAI-ARIA combobox pattern: activedescendant, not roving
      // focus.
      this.resultsList = this.backdrop.querySelector('.lb-list');

      if (this.search && this.resultsList) {
        // a11y — combobox contract (WAI-ARIA APG)
        const listId = this.resultsList.id || uid('cmdk-list');
        this.resultsList.id = listId;
        this.search.setAttribute('role', 'combobox');
        this.search.setAttribute('aria-expanded', 'true');   // always open while palette is visible
        this.search.setAttribute('aria-autocomplete', 'list');
        this.search.setAttribute('aria-controls', listId);
        if (!this.search.hasAttribute('aria-label')) {
          this.search.setAttribute('aria-label', 'Search commands');
        }

        // Filter on typing; hide empty group labels.
        this.search.addEventListener('input', (e) => this._filter(e.target.value));

        // Route arrow-key nav to the search input (focus stays there;
        // highlight moves via aria-activedescendant). Without this,
        // arrow keys only worked after focus moved into the <ul>.
        const listInst = this.resultsList._lbList;
        if (listInst) listInst.bindKeyboardNav(this.search);

        // Mirror active item → aria-activedescendant on the search input.
        this.resultsList.addEventListener('lb-list-active-change', (e) => {
          if (e.detail.id) this.search.setAttribute('aria-activedescendant', e.detail.id);
          else this.search.removeAttribute('aria-activedescendant');
        });
      }

      // Relay list-select event as a cmdk-select (friendlier API) + auto-close
      if (this.resultsList) {
        this.resultsList.addEventListener('lb-list-select', (e) => {
          this.backdrop.dispatchEvent(new CustomEvent('lb-cmdk-select', {
            detail: e.detail,
          }));
          this.close();
        });
      }

      // Screen-reader live region for announcing filter result counts.
      // aria-live="polite" + visually-hidden — heard but not seen.
      this._countAnnouncer = document.createElement('div');
      this._countAnnouncer.setAttribute('role', 'status');
      this._countAnnouncer.setAttribute('aria-live', 'polite');
      this._countAnnouncer.className = 'lb-visually-hidden';
      this.shell.appendChild(this._countAnnouncer);
    }

    _filter(query) {
      const listInst = this.resultsList?._lbList;
      if (!listInst) return;
      listInst.filter(query);

      // Hide group labels that have no visible items after filtering
      const groups = this.resultsList.querySelectorAll('.lb-cmdk__group-label');
      groups.forEach((label) => {
        let sibling = label.nextElementSibling;
        let hasVisibleItem = false;
        while (sibling && !sibling.classList.contains('lb-cmdk__group-label')) {
          if (sibling.classList.contains('lb-list__item') && !sibling.hidden) {
            hasVisibleItem = true;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        label.hidden = !hasVisibleItem;
      });

      // After filter, re-seed activedescendant to the first visible item.
      // Without this, aria-activedescendant may point at a now-hidden item
      // which screen readers treat as "no active option".
      if (this.search) {
        const first = listInst._visibleEnabled()[0];
        if (first) this.search.setAttribute('aria-activedescendant', first.id);
        else this.search.removeAttribute('aria-activedescendant');
      }

      // Announce the result count to screen readers via the polite live region
      if (this._countAnnouncer) {
        const visibleCount = listInst._visibleEnabled().length;
        const msg = visibleCount === 0
          ? 'No commands match'
          : visibleCount === 1 ? '1 command' : `${visibleCount} commands`;
        this._countAnnouncer.textContent = msg;
      }
    }

    open() {
      if (this._open) return;
      this._open = true;
      this._previousFocus = document.activeElement;
      this.backdrop.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      this._releaseTrap = trapFocus(this.shell);
      if (this.search) {
        this.search.value = '';
        this._filter('');

        // Re-prime the list's active item and sync aria-activedescendant
        // so arrow keys work from the very first keystroke (no click-first).
        const listInst = this.resultsList?._lbList;
        if (listInst) {
          const first = listInst._visibleEnabled()[0];
          if (first) {
            listInst._activate(first, { scroll: false });
            this.search.setAttribute('aria-activedescendant', first.id);
          } else {
            this.search.removeAttribute('aria-activedescendant');
          }
        }

        requestAnimationFrame(() => this.search.focus());
      }
      this.backdrop.dispatchEvent(new CustomEvent('lb-cmdk-open'));
    }

    close() {
      if (!this._open) return;
      this._open = false;
      this.backdrop.setAttribute('hidden', '');
      document.body.style.overflow = '';
      if (this._releaseTrap) this._releaseTrap();
      if (this._previousFocus) this._previousFocus.focus();
      this.backdrop.dispatchEvent(new CustomEvent('lb-cmdk-close'));
    }

    destroy() {
      document.removeEventListener('keydown', this._keyHandler);
      if (this._releaseTrap) this._releaseTrap();
    }
  }

  // ─── SEGMENTED CONTROL ─────────────────────────────────────
  // Pill-style either/or selector. Manages aria-checked (radio mode,
  // default) or aria-pressed (toggle-button mode — opt in via
  // data-lb-mode="toggle"). Arrow keys roam within the group; Home/End
  // jump to ends; Space/Enter activates. Dispatches lb-segmented-change
  // with { value, index }.

  class Segmented {
    constructor(el, options = {}) {
      this.el = el;
      this.mode = el.dataset.lbMode || options.mode || 'radio'; // 'radio' | 'toggle'
      this._init();
    }

    _init() {
      this.items = Array.from(this.el.querySelectorAll('.lb-segmented__item'));
      if (!this.items.length) return;

      // ARIA roles
      const selAttr = this.mode === 'toggle' ? 'aria-pressed' : 'aria-checked';
      if (this.mode !== 'toggle') {
        if (!this.el.hasAttribute('role')) this.el.setAttribute('role', 'radiogroup');
      }
      this.items.forEach((item) => {
        if (this.mode !== 'toggle' && !item.hasAttribute('role')) item.setAttribute('role', 'radio');
        if (!item.hasAttribute(selAttr)) item.setAttribute(selAttr, 'false');
        // Roving tabindex: only the selected (or first enabled) item is tab-reachable
        item.tabIndex = -1;
        item.addEventListener('click', () => this._select(item));
      });

      // Initial tab target — selected item, else first enabled
      const active = this.items.find((i) => i.getAttribute(selAttr) === 'true')
                  || this.items.find((i) => !i.disabled);
      if (active) active.tabIndex = 0;

      this.el.addEventListener('keydown', (e) => this._onKeydown(e));
    }

    _select(item) {
      if (item.disabled) return;
      const selAttr = this.mode === 'toggle' ? 'aria-pressed' : 'aria-checked';

      if (this.mode === 'toggle') {
        // Each toggle button flips independently
        const next = item.getAttribute(selAttr) !== 'true';
        item.setAttribute(selAttr, String(next));
      } else {
        // Radio — exactly one active
        this.items.forEach((i) => {
          i.setAttribute(selAttr, 'false');
          i.tabIndex = -1;
        });
        item.setAttribute(selAttr, 'true');
        item.tabIndex = 0;
      }

      item.focus();
      this.el.dispatchEvent(new CustomEvent('lb-segmented-change', {
        detail: {
          value: item.dataset.lbValue ?? item.textContent.trim(),
          index: this.items.indexOf(item),
          item,
          mode: this.mode,
        },
      }));
    }

    _onKeydown(e) {
      const enabled = this.items.filter((i) => !i.disabled);
      if (!enabled.length) return;
      const currentIdx = enabled.indexOf(document.activeElement);
      if (currentIdx < 0) return;

      let nextIdx = currentIdx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { nextIdx = (currentIdx + 1) % enabled.length; }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { nextIdx = (currentIdx - 1 + enabled.length) % enabled.length; }
      else if (e.key === 'Home') { nextIdx = 0; }
      else if (e.key === 'End')  { nextIdx = enabled.length - 1; }
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this._select(document.activeElement);
        return;
      } else {
        return;
      }
      e.preventDefault();
      const next = enabled[nextIdx];
      // Radio groups auto-select on arrow (matches native radio behaviour);
      // toggle groups only move focus.
      if (this.mode === 'toggle') {
        this.items.forEach((i) => { i.tabIndex = -1; });
        next.tabIndex = 0;
        next.focus();
      } else {
        this._select(next);
      }
    }

    /** Programmatic: select by value or index. */
    setValue(valueOrIndex) {
      let target = null;
      if (typeof valueOrIndex === 'number') target = this.items[valueOrIndex];
      else target = this.items.find((i) => i.dataset.lbValue === String(valueOrIndex));
      if (target) this._select(target);
    }

    getValue() {
      const selAttr = this.mode === 'toggle' ? 'aria-pressed' : 'aria-checked';
      if (this.mode === 'toggle') {
        return this.items.filter((i) => i.getAttribute(selAttr) === 'true').map((i) => i.dataset.lbValue ?? i.textContent.trim());
      }
      const selected = this.items.find((i) => i.getAttribute(selAttr) === 'true');
      return selected ? (selected.dataset.lbValue ?? selected.textContent.trim()) : null;
    }

    destroy() {}
  }

  // ─── LIST ──────────────────────────────────────────────────
  // Shared primitive for option lists. Consumed internally by
  // Select, Dropdown (combobox), MultiSelect, Menu, Phone
  // country picker, and Datepicker month/year. Provides:
  //   - keyboard navigation (Arrow/Home/End/Enter/Space)
  //   - type-to-filter (when --filterable)
  //   - single or multi selection
  //   - ARIA role defaulting (listbox | menu)
  //   - `lb-list-select` event
  //
  // Opt-in via data-lb-list on a .lb-list element. Direct consumers
  // mount without data attrs and call new LB.List(el, options).

  class List {
    constructor(el, options = {}) {
      this.el = el;
      this._options = options;
      this.mode = el.dataset.lbListMode || options.mode || 'single'; // single | multi | menu
      this.filterable = el.hasAttribute('data-lb-list-filterable') || options.filterable === true;
      // Opt-in: on mount (and on refresh()), float selected items to the top,
      // separator between groups, alphabetical within each. Order is STABLE
      // during interaction — items don't shift when toggled. Useful for long
      // multi-select lists so consumers can scan what's selected.
      this.sortSelected = el.hasAttribute('data-lb-list-sort-selected') || options.sortSelected === true;
      this._init();
    }

    _init() {
      // Items container — if filterable, items live in .lb-list__items sub-list
      this.itemsRoot = this.el.querySelector('.lb-list__items') || this.el;
      this.items = Array.from(this.itemsRoot.querySelectorAll('.lb-list__item'));

      // ARIA defaults
      const parentRole = this.mode === 'menu' ? 'menu' : 'listbox';
      const itemRole   = this.mode === 'menu' ? 'menuitem' : 'option';
      if (!this.itemsRoot.hasAttribute('role')) {
        this.itemsRoot.setAttribute('role', parentRole);
      }
      if (this.mode === 'multi') {
        this.itemsRoot.setAttribute('aria-multiselectable', 'true');
      }
      // The filterable sub-list is its own (scrollable) listbox — it needs
      // an accessible name and keyboard reachability of its own.
      if (this.itemsRoot !== this.el) {
        if (!this.itemsRoot.hasAttribute('aria-label') && !this.itemsRoot.hasAttribute('aria-labelledby')) {
          const hostLabel = this.el.getAttribute('aria-label');
          this.itemsRoot.setAttribute('aria-label', hostLabel || 'Options');
        }
        if (!this.itemsRoot.hasAttribute('tabindex')) this.itemsRoot.setAttribute('tabindex', '0');
      }
      this.items.forEach((item) => {
        // Embedded checkbox glyphs are state VISUALS — the option itself
        // carries aria-selected; the input must not be a second control.
        item.querySelectorAll('input.lb-checkbox').forEach((cb) => {
          cb.tabIndex = -1;
          cb.setAttribute('aria-hidden', 'true');
          // Native inputs stay "interactive" to AT heuristics even when
          // aria-hidden; disabled is the honest state — the option owns
          // the semantics. A scoped CSS reset keeps the normal look.
          cb.disabled = true;
          cb.classList.add('lb-checkbox--presentational');
        });
        if (!item.hasAttribute('role')) item.setAttribute('role', itemRole);
        // Ensure stable IDs so consumers can use aria-activedescendant
        // on an external search input (combobox pattern).
        if (!item.id) item.id = uid('lb-list-item');
        if (this.mode !== 'menu') {
          const isSel = item.classList.contains('lb-list__item--selected');
          item.setAttribute('aria-selected', isSel ? 'true' : 'false');
        }
        const isDis = item.classList.contains('lb-list__item--disabled') || item.hasAttribute('disabled');
        if (isDis) item.setAttribute('aria-disabled', 'true');
        if (item.tabIndex < 0 && item.tagName !== 'BUTTON' && item.tagName !== 'A') {
          item.tabIndex = -1;
        }
        item.addEventListener('click', () => this._onSelect(item));
      });

      // Filterable search — looks for .lb-list__search descendant.
      // Consumers who own the search input externally (e.g. Command
      // Palette with its fixed-top search field) don't set --filterable
      // on the list — they call list.filter(query) directly.
      if (this.filterable) {
        this.search = this.el.querySelector('.lb-list__search');
        if (this.search) {
          this.search.addEventListener('input', (e) => this._onFilter(e.target.value));
        }
      }

      // Keyboard nav — on search input when filterable, else on the list.
      // Consumers can also attach via bindKeyboardNav(el) — useful when
      // the list has no internal search but an external input drives it
      // (Command Palette pattern).
      const navTarget = this.search || this.el;
      navTarget.addEventListener('keydown', (e) => this._onKeydown(e));
      this._navTarget = navTarget;

      // Sort-selected: apply once on mount
      if (this.sortSelected) this._applySortSelected();

      // Activate first enabled item as the default keyboard position
      const first = this._visibleEnabled()[0];
      if (first) this._activate(first, { scroll: false });
    }

    /** Float selected items to top + auto-separator + alphabetical within groups.
        DOM-only reorder; preserves element identity + handlers. */
    _applySortSelected() {
      const itemsSnap = Array.from(this.itemsRoot.querySelectorAll('.lb-list__item'));
      if (!itemsSnap.length) return;

      const selected = [];
      const unselected = [];
      itemsSnap.forEach((item) => {
        (item.classList.contains('lb-list__item--selected') ? selected : unselected).push(item);
      });

      const labelOf = (el) => {
        const lab = el.querySelector('.lb-list__label, .lb-list__stack > :first-child');
        return (lab ? lab.textContent : el.textContent).trim().toLowerCase();
      };
      const alpha = (a, b) => {
        const la = labelOf(a), lb = labelOf(b);
        return la < lb ? -1 : la > lb ? 1 : 0;
      };
      selected.sort(alpha);
      unselected.sort(alpha);

      // Remove any prior auto-separator (static user-authored separators
      // without --auto are left alone).
      this.itemsRoot.querySelectorAll('.lb-list__separator--auto').forEach((s) => s.remove());

      // Detach all items and re-append in the new order.
      itemsSnap.forEach((i) => i.remove());
      selected.forEach((i) => this.itemsRoot.appendChild(i));
      if (selected.length > 0 && unselected.length > 0) {
        const sep = document.createElement('li');
        sep.className = 'lb-list__separator lb-list__separator--auto';
        sep.setAttribute('role', 'presentation');
        sep.setAttribute('aria-hidden', 'true');
        this.itemsRoot.appendChild(sep);
      }
      unselected.forEach((i) => this.itemsRoot.appendChild(i));

      // Refresh items cache — DOM order changed.
      this.items = Array.from(this.itemsRoot.querySelectorAll('.lb-list__item'));
    }

    /** Programmatic re-sort. Call after externally toggling selection, or
        after reopening a dropdown so the selected-first order refreshes. */
    refresh() {
      if (this.sortSelected) this._applySortSelected();
    }

    _visibleEnabled() {
      return this.items.filter((i) => !i.hidden && !i.classList.contains('lb-list__item--disabled'));
    }

    _activate(item, { scroll = true } = {}) {
      this.items.forEach((i) => i.classList.remove('lb-list__item--active'));
      if (item) {
        item.classList.add('lb-list__item--active');
        if (scroll) item.scrollIntoView({ block: 'nearest' });
      }
      this._activeItem = item;
      // Fire so consumers (e.g. CommandPalette) can keep an external
      // combobox input's aria-activedescendant in sync with the highlight.
      this.el.dispatchEvent(new CustomEvent('lb-list-active-change', {
        detail: { item, id: item ? item.id : null },
      }));
    }

    _onKeydown(e) {
      const enabled = this._visibleEnabled();
      if (!enabled.length) return;
      const currentIdx = enabled.indexOf(this._activeItem);
      let nextIdx = currentIdx < 0 ? 0 : currentIdx;
      let handled = false;

      if (e.key === 'ArrowDown') { nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % enabled.length; handled = true; }
      else if (e.key === 'ArrowUp') { nextIdx = currentIdx < 0 ? enabled.length - 1 : (currentIdx - 1 + enabled.length) % enabled.length; handled = true; }
      else if (e.key === 'Home')   { nextIdx = 0; handled = true; }
      else if (e.key === 'End')    { nextIdx = enabled.length - 1; handled = true; }
      else if (e.key === 'Enter' || e.key === ' ') {
        if (this._activeItem) {
          e.preventDefault();
          this._onSelect(this._activeItem);
        }
        return;
      }

      if (handled) {
        e.preventDefault();
        this._activate(enabled[nextIdx]);
      }
    }

    _onSelect(item) {
      if (item.classList.contains('lb-list__item--disabled') || item.getAttribute('aria-disabled') === 'true') return;
      const value = item.dataset.lbValue;

      if (this.mode === 'multi') {
        const wasSelected = item.classList.contains('lb-list__item--selected');
        item.classList.toggle('lb-list__item--selected', !wasSelected);
        item.setAttribute('aria-selected', String(!wasSelected));
        // Keep any nested checkbox in sync
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = !wasSelected;
      } else if (this.mode === 'menu') {
        // Menu items fire action and don't persist selection
      } else {
        this.items.forEach((i) => {
          i.classList.remove('lb-list__item--selected');
          i.setAttribute('aria-selected', 'false');
        });
        item.classList.add('lb-list__item--selected');
        item.setAttribute('aria-selected', 'true');
      }

      this.el.dispatchEvent(new CustomEvent('lb-list-select', {
        bubbles: true,
        detail: { value, item, mode: this.mode, selected: this.getSelected() },
      }));
    }

    /** Public: filter items by query. Matches against .lb-list__label
        textContent if present (so icons/kbd-hints don't pollute the
        match), otherwise falls back to the item's own textContent. */
    filter(query) { this._onFilter(query); }

    /** Public: route keyboard nav to a specific target (e.g. an external
        search input that owns focus). Replaces the default keydown target.
        Called by CommandPalette so arrow keys work while focus stays on
        the search — no click-first requirement. */
    bindKeyboardNav(target) {
      if (!target || target === this._navTarget) return;
      target.addEventListener('keydown', (e) => this._onKeydown(e));
      this._navTarget = target;
    }

    /** Returns the currently-active item id — used by consumers wiring
        aria-activedescendant on an external search combobox. */
    getActiveItemId() {
      return this._activeItem ? this._activeItem.id : null;
    }

    _onFilter(query) {
      const q = (query || '').toLowerCase().trim();
      let visibleCount = 0;
      this.items.forEach((item) => {
        // Match priority:
        //   1. data-lb-search attribute (when set, item owns the searchable
        //      string — used by Phone country picker to include name +
        //      dialing code + ISO so "+49" and "DE" both find Germany).
        //   2. .lb-list__label slot (cmdk/dropdown UX where icons + kbd
        //      hints shouldn't pollute the match).
        //   3. Fallback: the item's own full textContent.
        const searchAttr = item.getAttribute('data-lb-search');
        const label = !searchAttr ? item.querySelector('.lb-list__label') : null;
        const text = (searchAttr || (label ? label.textContent : item.textContent) || '').toLowerCase();
        const match = !q || text.includes(q);
        item.hidden = !match;
        if (match) visibleCount++;
      });
      const empty = this.el.querySelector('.lb-list__no-results');
      if (empty) empty.hidden = visibleCount > 0;
      const firstVisible = this._visibleEnabled()[0];
      if (firstVisible) this._activate(firstVisible, { scroll: false });
    }

    /** Programmatic: select an item by value (single-select mode). */
    setValue(value) {
      const target = this.items.find((i) => i.dataset.lbValue === String(value));
      if (target) this._onSelect(target);
    }

    /** Returns [{ value, item }] for selected items. */
    getSelected() {
      return this.items
        .filter((i) => i.classList.contains('lb-list__item--selected'))
        .map((i) => ({ value: i.dataset.lbValue, item: i }));
    }

    destroy() {}
  }

  // ─── TABLE ─────────────────────────────────────────────────
  // Wires row selection (checkbox-per-row + select-all with
  // indeterminate), and sortable headers. Auto-sort is opt-in
  // via data-lb-sort-auto on the <table>. Sort clicks always
  // dispatch `lb-table-sort` so callers can implement their own
  // ordering (e.g. server-side).

  class Table {
    constructor(el, options = {}) {
      this.el = el;
      this.options = options;
      // Delegated listeners so rows added/removed after init (pagination,
      // filtering, chunked append) keep working without rebinding.
      this._onChange = (e) => {
        const t = e.target;
        if (this.selectAll && t === this.selectAll) { this._onSelectAll(); return; }
        if (t.matches && t.matches('[data-lb-table-select]') && t.closest('tbody')) this._onRowCheck(t);
      };
      this._onClick = (e) => {
        const ex = e.target.closest && e.target.closest('[data-lb-table-expand]');
        if (ex && this.el.contains(ex)) { this._onExpand(ex); return; }
        const btn = e.target.closest && e.target.closest('[data-lb-sort]');
        if (btn && this.el.contains(btn)) this._onSort(btn);
      };
      this.el.addEventListener('change', this._onChange);
      this.el.addEventListener('click', this._onClick);
      this.refresh();
    }

    // Live queries — the row set is never a stale snapshot.
    get rowChecks() {
      return Array.from(this.el.querySelectorAll('tbody [data-lb-table-select]'));
    }
    get sortButtons() {
      return Array.from(this.el.querySelectorAll('[data-lb-sort]'));
    }

    /* Re-sync after structural changes the change/click delegation can't
       see: row--selected classes for pre-checked rows, select-all state,
       aria-sort + indicator icons on (new) sortable headers. Also resets
       the auto-sort "original order" snapshot — after the consumer swaps
       rows, the previous order is no longer meaningful. */
    refresh() {
      this.selectAll = this.el.querySelector('[data-lb-table-select-all]');
      this._originalOrder = null;
      // Rows built after the boot sweeps miss the global checkbox-glyph
      // and icon passes (same lazy-mount gap MultiSelect had) — refresh
      // is the documented post-swap hook, so it self-heals both. Both
      // passes are idempotent.
      initCheckboxGlyphs(this.el);
      initIcons(this.el);
      this.rowChecks.forEach((cb) => {
        if (cb.checked) {
          const tr = cb.closest('tr');
          if (tr) tr.classList.add('lb-table__row--selected');
        }
      });
      this._updateSelectAllState();
      this.sortButtons.forEach((btn) => {
        // Ensure the header cell has aria-sort so the CSS indicator works
        const th = btn.closest('th');
        if (th && !th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none');
        // Sync the indicator icon to the current state. If a column
        // ships pre-sorted (aria-sort already set), match the icon to
        // that state; otherwise use the neutral chevrons-up-down hint.
        const state = th ? th.getAttribute('aria-sort') : 'none';
        this._setSortIcon(btn, state);
      });
    }

    _onSelectAll() {
      const checked = this.selectAll.checked;
      this.rowChecks.forEach((cb) => {
        if (cb.disabled) return;
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('lb-table__row--selected', checked);
      });
      this.selectAll.indeterminate = false;
      this.el.dispatchEvent(new CustomEvent('lb-table-select', {
        detail: { all: true, checked, selectedCount: this._selectedCount() },
      }));
    }

    _onRowCheck(cb) {
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('lb-table__row--selected', cb.checked);
      this._updateSelectAllState();
      this.el.dispatchEvent(new CustomEvent('lb-table-select', {
        detail: { all: false, row: tr, checked: cb.checked, selectedCount: this._selectedCount() },
      }));
    }

    _selectedCount() {
      return this.rowChecks.filter((cb) => cb.checked).length;
    }

    _updateSelectAllState() {
      if (!this.selectAll) return;
      const total = this.rowChecks.length;
      const count = this._selectedCount();
      this.selectAll.checked = count > 0 && count === total;
      this.selectAll.indeterminate = count > 0 && count < total;
    }

    // Map aria-sort state → indicator icon. The previous "rotate the
    // chevron 180°" approach worked for descending but left two
    // transitions silent (none↔ascending swapped only opacity, no
    // visible "turn"). Swapping the icon makes every state distinct:
    //   none        → chevrons-up-down (sortable hint)
    //   ascending   → chevron-up
    //   descending  → chevron-down
    _setSortIcon(btn, state) {
      const indicator = btn.querySelector('.lb-table__sort-indicator');
      if (!indicator) return;
      const iconName = state === 'ascending'  ? 'chevron-up'
                     : state === 'descending' ? 'chevron-down'
                     : 'chevrons-up-down';
      if (indicator.getAttribute('data-lb-icon') === iconName) return;
      indicator.setAttribute('data-lb-icon', iconName);
      indicator.innerHTML = '';
      indicator._lbIconDone = false;
      if (window.LB && window.LB.initIcons) window.LB.initIcons(indicator.parentElement || indicator);
    }

    _onSort(btn) {
      const key = btn.dataset.lbSort;
      const th = btn.closest('th');
      const current = th ? th.getAttribute('aria-sort') : 'none';
      const next = !current || current === 'none'
        ? 'ascending'
        : current === 'ascending' ? 'descending' : 'none';

      // Clear other columns' sort state
      this.sortButtons.forEach((other) => {
        if (other === btn) return;
        const otherTh = other.closest('th');
        if (otherTh) otherTh.setAttribute('aria-sort', 'none');
        this._setSortIcon(other, 'none');
      });
      if (th) th.setAttribute('aria-sort', next);
      this._setSortIcon(btn, next);

      const direction = next === 'ascending' ? 'asc' : next === 'descending' ? 'desc' : null;

      if (this.el.hasAttribute('data-lb-sort-auto')) {
        this._autoSort(btn, direction);
      }

      this.el.dispatchEvent(new CustomEvent('lb-table-sort', {
        detail: { key, direction },
      }));
    }

    _autoSort(btn, direction) {
      const th = btn.closest('th');
      const tbody = this.el.tBodies[0];
      if (!tbody || !th) return;
      const colIndex = Array.from(th.parentElement.children).indexOf(th);
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(
        (r) => !r.classList.contains('lb-table__row--empty')
          && !r.classList.contains('lb-table__detail-row')
      );
      // Detail rows travel with their parent through any reorder.
      const detailOf = (r) => {
        const next = r.nextElementSibling;
        return next && next.classList.contains('lb-table__detail-row') ? next : null;
      };
      const place = (r) => {
        const d = detailOf(r);
        tbody.appendChild(r);
        if (d) tbody.appendChild(d);
      };
      if (direction === null) {
        // Restore original order if we stored it
        if (this._originalOrder) {
          this._originalOrder.forEach(place);
        }
        return;
      }
      if (!this._originalOrder) this._originalOrder = rows.slice();
      rows.sort((a, b) => {
        const av = this._cellValue(a.children[colIndex]);
        const bv = this._cellValue(b.children[colIndex]);
        if (av < bv) return direction === 'asc' ? -1 : 1;
        if (av > bv) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      rows.forEach(place);
    }

    _cellValue(cell) {
      if (!cell) return '';
      const explicit = cell.dataset.lbSortValue;
      if (explicit !== undefined) {
        const n = parseFloat(explicit);
        return isNaN(n) ? explicit.toLowerCase() : n;
      }
      const text = cell.textContent.trim();
      const cleaned = text.replace(/[,$€£¥\s]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? text.toLowerCase() : n;
    }

    // Row expansion: a [data-lb-table-expand] button toggles the row's
    // adjacent .lb-table__detail-row sibling. The global aria-expanded
    // chevron rule rotates the icon for free. NOTE: pair with --striped
    // is unsupported (nth-child stripes count detail rows) and detail
    // rows are excluded from data-lb-sort-auto by class.
    _onExpand(btn) {
      const tr = btn.closest('tr');
      const detail = tr && tr.nextElementSibling;
      if (!detail || !detail.classList.contains('lb-table__detail-row')) return;
      const expanded = detail.hidden;
      detail.hidden = !expanded;
      btn.setAttribute('aria-expanded', String(expanded));
      this.el.dispatchEvent(new CustomEvent('lb-table-expand', {
        detail: { row: tr, detailRow: detail, expanded },
      }));
    }

    getSelected() {
      return this.rowChecks.filter((cb) => cb.checked).map((cb) => cb.closest('tr'));
    }

    destroy() {
      this.el.removeEventListener('change', this._onChange);
      this.el.removeEventListener('click', this._onClick);
      if (this.el._lbTable === this) delete this.el._lbTable;
    }
  }

  // ─── TABLE COLUMN RESIZE (opt-in) ──────────────────────────
  //
  // data-lb-table-resize on a <table>, or on .lb-table-wrap--sticky to
  // keep BOTH split tables' <colgroup>s in sync. Handles are separators
  // on each header cell edge: pointer drag (LB.pointerDrag), ArrowLeft/
  // Right keyboard resize, and double-click reset — the single-pointer
  // non-drag alternative WCAG 2.5.7 requires (keyboard alone doesn't
  // satisfy it). Dispatches `lb-table-resize` {index, width} on the host.
  const TABLE_RESIZE_MIN = 48; // px — keeps a column grabbable
  const TABLE_RESIZE_STEP = 8; // px per arrow-key press

  function initTableResize(root = document) {
    root.querySelectorAll('[data-lb-table-resize]').forEach((host) => {
      if (host._lbTableResize) return;
      host._lbTableResize = true;

      const isWrap = !host.matches('table');
      const tables = isWrap
        ? Array.from(host.querySelectorAll('table'))
        : [host];
      const headerTable = tables.find((t) => t.tHead) || tables[0];
      if (!headerTable || !headerTable.tHead) return;
      const headRow = headerTable.tHead.rows[0];
      if (!headRow) return;
      const colCount = headRow.cells.length;

      // Fixed layout so <col> widths are authoritative; the sticky
      // variant already sets it, plain tables get the modifier.
      tables.forEach((t) => t.classList.add('lb-table--fixed'));

      // Matching <colgroup> per table (created only if absent).
      const colgroups = tables.map((t) => {
        let cg = t.querySelector('colgroup');
        if (!cg) {
          cg = document.createElement('colgroup');
          for (let i = 0; i < colCount; i++) cg.appendChild(document.createElement('col'));
          t.insertBefore(cg, t.firstChild);
        }
        return cg;
      });

      let frozen = false;
      const freeze = () => {
        // First interaction: pin every column at its rendered width so
        // resizing one column doesn't reflow the rest.
        if (frozen) return;
        frozen = true;
        Array.from(headRow.cells).forEach((th, i) => {
          const w = Math.round(th.getBoundingClientRect().width);
          colgroups.forEach((cg) => { if (cg.children[i]) cg.children[i].style.width = w + 'px'; });
        });
      };
      const setWidth = (index, px) => {
        const w = Math.max(TABLE_RESIZE_MIN, Math.round(px));
        colgroups.forEach((cg) => { if (cg.children[index]) cg.children[index].style.width = w + 'px'; });
        return w;
      };
      const announce = (handle, w) => handle.setAttribute('aria-valuenow', w);
      const emit = (index, width) => {
        host.dispatchEvent(new CustomEvent('lb-table-resize', { bubbles: true, detail: { index, width } }));
      };

      Array.from(headRow.cells).forEach((th, index) => {
        // No handle on the 1px select/actions hug columns or the last
        // column (its right edge is the table edge).
        if (index === colCount - 1) return;
        if (th.classList.contains('lb-table__cell--select') || th.classList.contains('lb-table__cell--actions')) return;

        th.classList.add('lb-table__cell--resizable');
        const handle = document.createElement('span');
        handle.className = 'lb-table__resize';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', 'Resize ' + (th.textContent.trim() || 'column ' + (index + 1)) + ' column');
        // A focusable separator must expose its value from the start —
        // not only after the first interaction.
        handle.setAttribute('aria-valuemin', String(TABLE_RESIZE_MIN));
        handle.setAttribute('aria-valuemax', '4000');
        handle.setAttribute('aria-valuenow',
          String(Math.round(th.getBoundingClientRect().width) || TABLE_RESIZE_MIN));
        th.appendChild(handle);

        pointerDrag(handle, {
          draggingClass: 'lb-table__resize--active',
          onStart: (e, ctx) => {
            freeze();
            ctx.startWidth = colgroups[0].children[index].getBoundingClientRect().width
              || th.getBoundingClientRect().width;
          },
          onMove: (ev, ctx) => {
            const w = setWidth(index, ctx.startWidth + (ev.clientX - ctx.startX));
            announce(handle, w);
          },
          onEnd: (ev, ctx) => {
            const w = Math.max(TABLE_RESIZE_MIN, Math.round(ctx.startWidth + ((ev && ev.clientX !== undefined ? ev.clientX : ctx.startX) - ctx.startX)));
            emit(index, w);
          },
        });

        handle.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          freeze();
          const current = colgroups[0].children[index].getBoundingClientRect().width || th.getBoundingClientRect().width;
          const w = setWidth(index, current + (e.key === 'ArrowRight' ? TABLE_RESIZE_STEP : -TABLE_RESIZE_STEP));
          announce(handle, w);
          emit(index, w);
        });

        // Double-click = reset this column to automatic width — the
        // WCAG 2.5.7 single-pointer alternative to the drag.
        handle.addEventListener('dblclick', () => {
          colgroups.forEach((cg) => { if (cg.children[index]) cg.children[index].style.width = ''; });
          handle.removeAttribute('aria-valuenow');
          emit(index, null);
        });
      });
    });
  }

  // ─── REGISTRATION (for components loaded as separate files) ───
  //
  // Heavy or optional components (Media, Timeline, future Chat) live
  // in `js/components/lb-*.js` files loaded as additional scripts. They
  // self-register via `LB.register(name, ClassRef, selector)`. The
  // shared init dispatcher below then sweeps `selector` per `LB.init(
  // root)` call to wire matching elements.
  //
  // register() also handles the load-order edge case: if a component
  // file loads AFTER LB.init has already run (DOMContentLoaded already
  // fired), the registration triggers an immediate document-wide sweep
  // so any matching elements already in the DOM activate right away.
  //
  // Selector is optional. Components that are instantiated only
  // programmatically (e.g., `new LB.ToastManager()`) register with no
  // selector to be discoverable on LB without being part of the auto-
  // init sweep.
  const _registered = [];
  function register(name, ClassRef, selector) {
    _registered.push({ name, ClassRef, selector });
    if (selector && typeof document !== 'undefined' && document.readyState !== 'loading') {
      const propKey = '_lb' + name.charAt(0).toUpperCase() + name.slice(1);
      document.querySelectorAll(selector).forEach((el) => {
        if (!el[propKey]) el[propKey] = new ClassRef(el);
      });
    }
  }

  // Opt-in modules (js/components/*.js) self-register above and must load
  // AFTER this file. Without its module the markup renders but every
  // behavior is dead — silently. At window load (all classic/deferred
  // scripts done, so no false alarms) name the exact missing script.
  const _OPT_IN_MODULES = [
    ['[data-lb-shell]', 'lb-shell.js'],
    ['[data-lb-header]', 'lb-header.js'],
    ['[data-lb-board]', 'lb-board.js'],
    ['[data-lb-media]', 'lb-media.js'],
    ['[data-lb-selection]', 'lb-selection.js'],
    ['[data-lb-timeline]', 'lb-timeline.js'],
    ['[data-lb-bubble]', 'lb-chat.js'],
    ['[data-lb-thread]', 'lb-chat.js'],
    ['[data-lb-conv-list]', 'lb-chat.js'],
    ['[data-lb-artifact]', 'lb-chat-artifact.js'],
    ['a[data-lb-lightbox]', 'lb-lightbox.js'],
  ];
  function _warnMissingModules() {
    _OPT_IN_MODULES.forEach(([sel, file]) => {
      if (!document.querySelector(sel)) return;
      if (_registered.some((r) => r.selector === sel)) return;
      console.warn(`letbe-ds: found ${sel} but its controller is not loaded — include js/components/${file} after lb.js.`);
    });
  }
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') _warnMissingModules();
    else window.addEventListener('load', _warnMissingModules);
  }

  // ─── AUTO-INIT ─────────────────────────────────────────────

  function init(root = document) {
    // Table wrappers scroll horizontally — keyboard users need a tab stop
    // to scroll them (WCAG scrollable-region; covers plain-markup tables).
    root.querySelectorAll('.lb-table-wrap, .lb-table-wrap__body').forEach((w) => {
      if (!w.hasAttribute('tabindex')) w.setAttribute('tabindex', '0');
    });

    // Accordions
    root.querySelectorAll('[data-lb-accordion]').forEach((el) => {
      if (!el._lbAccordion) el._lbAccordion = new Accordion(el);
    });

    // Tabs
    root.querySelectorAll('[data-lb-tabs]').forEach((el) => {
      if (!el._lbTabs) el._lbTabs = new Tabs(el);
    });

    // Modals
    root.querySelectorAll('[data-lb-modal]').forEach((el) => {
      if (!el._lbModal) el._lbModal = new Modal(el);
    });

    // Sheets
    root.querySelectorAll('[data-lb-sheet]').forEach((el) => {
      if (!el._lbSheet) el._lbSheet = new Sheet(el);
    });

    // Dropdowns
    root.querySelectorAll('[data-lb-dropdown]').forEach((el) => {
      if (!el._lbDropdown) el._lbDropdown = new Dropdown(el);
    });

    // Custom selects
    root.querySelectorAll('[data-lb-select]').forEach((el) => {
      if (!el._lbSelect) el._lbSelect = new Select(el);
    });

    // Form validation
    root.querySelectorAll('form[data-lb-validate]').forEach((el) => {
      if (!el._lbForm) el._lbForm = new Form(el);
    });

    // Show more
    root.querySelectorAll('[data-lb-show-more]').forEach((el) => {
      if (!el._lbShowMore) el._lbShowMore = new ShowMore(el);
    });

    // Menus
    root.querySelectorAll('[data-lb-menu]').forEach((el) => {
      if (!el._lbMenu) el._lbMenu = new Menu(el);
    });

    // Popovers
    root.querySelectorAll('[data-lb-popover]').forEach((el) => {
      if (!el._lbPopover) el._lbPopover = new Popover(el);
    });

    // Tooltips
    root.querySelectorAll('[data-lb-tooltip]').forEach((el) => {
      if (!el._lbTooltip) el._lbTooltip = new Tooltip(el);
    });

    // Sliders
    root.querySelectorAll('[data-lb-slider]').forEach((el) => {
      if (!el._lbSlider) el._lbSlider = new Slider(el);
    });

    // Media players — extracted to js/components/lb-media.js
    // (self-registers via LB.register; swept here via the
    // _registered iterator at the end of init()).

    // Timelines — extracted to js/components/lb-timeline.js
    // (self-registers via LB.register; swept here via the
    // _registered iterator at the end of init()).

    root.querySelectorAll('[data-lb-rating]').forEach((el) => {
      if (!el._lbRating) el._lbRating = new Rating(el);
    });

    root.querySelectorAll('[data-lb-resizable]').forEach((el) => {
      if (!el._lbResizable) el._lbResizable = new Resizable(el);
    });

    root.querySelectorAll('[data-lb-tree]').forEach((el) => {
      if (!el._lbTree) el._lbTree = new Tree(el);
    });

    root.querySelectorAll('[data-lb-sparkline]').forEach((el) => {
      if (!el._lbSparkline) el._lbSparkline = new Sparkline(el);
    });

    root.querySelectorAll('[data-lb-donut]').forEach((el) => {
      if (!el._lbDonut) el._lbDonut = new Donut(el);
    });

    root.querySelectorAll('[data-lb-bar-chart]').forEach((el) => {
      if (!el._lbBarChart) el._lbBarChart = new BarChart(el);
    });

    root.querySelectorAll('[data-lb-line-chart]').forEach((el) => {
      if (!el._lbLineChart) el._lbLineChart = new LineChart(el);
    });

    root.querySelectorAll('[data-lb-calendar]').forEach((el) => {
      if (!el._lbCalendar) el._lbCalendar = new Calendar(el);
    });

    root.querySelectorAll('[data-lb-color-picker]').forEach((el) => {
      if (!el._lbColorPicker) el._lbColorPicker = new ColorPicker(el);
    });

    root.querySelectorAll('[data-lb-code-block]').forEach((el) => {
      if (!el._lbCodeBlock) el._lbCodeBlock = new CodeBlock(el);
    });

    // Pagination
    root.querySelectorAll('[data-lb-pagination]').forEach((el) => {
      if (!el._lbPagination) el._lbPagination = new Pagination(el);
    });

    // DatePickers
    root.querySelectorAll('[data-lb-datepicker]').forEach((el) => {
      if (!el._lbDatePicker) el._lbDatePicker = new DatePicker(el);
    });

    // Clearable inputs
    root.querySelectorAll('[data-lb-clearable]').forEach((el) => {
      // data-lb-clearable on a Rating means "clicking the same item
      // clears the value" — handled by the Rating class itself, not by
      // the text-input clear-button helper.
      if (el.hasAttribute('data-lb-rating')) return;
      if (!el._lbClearable) el._lbClearable = new ClearableInput(el);
    });

    // Password inputs
    root.querySelectorAll('[data-lb-password]').forEach((el) => {
      if (!el._lbPassword) el._lbPassword = new PasswordInput(el);
    });

    // Phone inputs
    root.querySelectorAll('[data-lb-phone]').forEach((el) => {
      if (!el._lbPhone) el._lbPhone = new PhoneInput(el);
    });

    // Tables
    root.querySelectorAll('[data-lb-table]').forEach((el) => {
      if (!el._lbTable) el._lbTable = new Table(el);
    });

    // Lists (standalone — consumer components may instantiate internally)
    root.querySelectorAll('[data-lb-list]').forEach((el) => {
      if (!el._lbList) el._lbList = new List(el);
    });

    // Segmented controls
    root.querySelectorAll('[data-lb-segmented]').forEach((el) => {
      if (!el._lbSegmented) el._lbSegmented = new Segmented(el);
    });

    // Command palettes (⌘K launchers)
    root.querySelectorAll('[data-lb-cmdk]').forEach((el) => {
      if (!el._lbCmdK) el._lbCmdK = new CommandPalette(el);
    });

    // File uploaders
    root.querySelectorAll('[data-lb-uploader]').forEach((el) => {
      if (!el._lbUploader) el._lbUploader = new FileUploader(el);
    });

    // MultiSelect fields
    root.querySelectorAll('[data-lb-multi-select]').forEach((el) => {
      if (!el._lbMultiSelect) el._lbMultiSelect = new MultiSelect(el);
    });

    // Number inputs (wrap + stepper buttons)
    root.querySelectorAll('[data-lb-number]').forEach((el) => {
      if (!el._lbNumber) el._lbNumber = new NumberInput(el);
    });

    // Simple behaviors
    initBanners();
    initChips();
    initTableResize(root);
    initAvatars();
    initBarLists(root);
    initCheckboxGlyphs(root);
    initFieldHintIcons(root);
    initIcons(root);

    // Registered components — anything added via LB.register() gets
    // its auto-init sweep here. Heavy components extracted to
    // js/components/lb-*.js use this path; the hardcoded sweeps
    // above will migrate to it over time.
    _registered.forEach(({ name, ClassRef, selector }) => {
      if (!selector) return;
      const propKey = '_lb' + name.charAt(0).toUpperCase() + name.slice(1);
      root.querySelectorAll(selector).forEach((el) => {
        if (!el[propKey]) el[propKey] = new ClassRef(el);
      });
    });
  }

  // ─── CHECKBOX GLYPHS ────────────────────────────────────────
  //
  // Wraps every .lb-checkbox input in a .lb-checkbox-frame and injects
  // two sibling glyph spans (check + minus) using [data-lb-icon]. CSS
  // sibling combinators show the right glyph based on :checked /
  // :indeterminate state. Real SVGs replace the earlier mask-image
  // approach so the global Icon-stroke knob retunes them along with
  // every other glyph in the gallery.
  //
  // Idempotent — checks for an existing frame parent before wrapping.

  function initCheckboxGlyphs(root = document) {
    root.querySelectorAll('.lb-checkbox').forEach((input) => {
      const parent = input.parentElement;
      if (parent && parent.classList.contains('lb-checkbox-frame')) return; // done
      const frame = document.createElement('span');
      frame.className = 'lb-checkbox-frame';
      // Build glyphs first so their position relative to the input is
      // exactly: input first, glyphs after (sibling combinator depends
      // on this order).
      const check = document.createElement('span');
      check.className = 'lb-checkbox__glyph lb-checkbox__glyph--check';
      check.setAttribute('aria-hidden', 'true');
      check.setAttribute('data-lb-icon', 'check');
      const minus = document.createElement('span');
      minus.className = 'lb-checkbox__glyph lb-checkbox__glyph--minus';
      minus.setAttribute('aria-hidden', 'true');
      minus.setAttribute('data-lb-icon', 'minus');
      // Wrap: place frame where input was, move input into it, append glyphs
      input.replaceWith(frame);
      frame.appendChild(input);
      frame.appendChild(check);
      frame.appendChild(minus);
    });
  }

  // ─── FIELD-HINT VALIDATION ICONS ────────────────────────────
  //
  // Prepends a real <span data-lb-icon="…"> to every validation hint
  // (.lb-field__error, .lb-field__success, dropdown/datepicker hint
  // variants) so the icon goes through the live SVG pipeline. The
  // earlier mask-image approach rendered a frozen silhouette that
  // ignored the Icon-stroke knob. Idempotent — checks for an existing
  // icon child before injecting.

  const FIELD_HINT_ICON_MAP = [
    { sel: '.lb-field__error',                  icon: 'circle-alert' },
    { sel: '.lb-field__success',                icon: 'circle-check' },
    { sel: '.lb-dropdown-field__hint--error',   icon: 'circle-alert' },
    { sel: '.lb-dropdown-field__hint--success', icon: 'circle-check' },
    { sel: '.lb-datepicker-field__hint--error', icon: 'circle-alert' },
    { sel: '.lb-datepicker-field__hint--success', icon: 'circle-check' },
  ];

  function initFieldHintIcons(root = document) {
    for (const { sel, icon } of FIELD_HINT_ICON_MAP) {
      root.querySelectorAll(sel).forEach((el) => {
        if (el.querySelector(':scope > [data-lb-icon]')) return; // already done
        const span = document.createElement('span');
        span.setAttribute('data-lb-icon', icon);
        span.setAttribute('aria-hidden', 'true');
        el.insertBefore(span, el.firstChild);
      });
    }
  }

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    init,
    register,
    Accordion,
    Tabs,
    Modal,
    Sheet,
    Dropdown,
    Menu,
    Popover,
    Tooltip,
    Slider,
    // Media — extracted to js/components/lb-media.js (self-registers)
    // Timeline — extracted to js/components/lb-timeline.js (self-registers)
    pointerDrag,
    edgeAutoScroll,
    fmtTime,
    Pagination,
    DatePicker,
    Calendar,
    ToastManager,
    Select,
    Form,
    ShowMore,
    ClearableInput,
    PasswordInput,
    PhoneInput,
    Table,
    List,
    MultiSelect,
    NumberInput,
    Segmented,
    CommandPalette,
    FileUploader,
    alert: alertDialog,
    icon,
    iconLoad,
    iconPreload,
    initIcons,
    initCheckboxGlyphs,
    setIconBasePath,
    setFlagBasePath,
  };
})();

// Expose LB on window so classic scripts loaded separately (gallery-layout.js,
// theme-editor.js) can call it. `const LB` at top level in a classic script
// is reachable from other scripts but is NOT a window property by default —
// without this line, `window.LB` is undefined in other script files.
if (typeof window !== 'undefined') {
  window.LB = LB;
}

// Auto-init on DOMContentLoaded so components with data-lb-* attributes
// wire themselves without callers needing to remember LB.init(). Calling
// init() later (or twice) is idempotent — each element stores its instance
// on el._lb* and skips re-init.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LB.init());
  } else {
    LB.init();
  }
}

// Support ES module import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LB;
}
