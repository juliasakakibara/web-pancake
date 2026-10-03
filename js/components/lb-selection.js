/**
 * lb-selection.js — letbe-ds bulk-selection layer (workspace-modules S3)
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register(). Generic multi-select over a container of items —
 * media grids, lists, galleries. Implements the verified 2026 spec:
 *
 *   - Progressive disclosure: checks reveal on hover/focus
 *     (CSS side); the FIRST selection adds .lb-selection--active to the
 *     container so checks appear on every item.
 *   - Long-press (~500ms) on an item enters selection mode on touch.
 *   - While active, clicking an item's body toggles it (links/buttons
 *     inside items still work — clicks on interactive elements are
 *     ignored unless it's the item's own checkbox).
 *   - Select-all with native :indeterminate for partial selections
 *     (minus glyph — the verified mixed-state convention).
 *   - Selection PERSISTS after bulk actions until deliberately cleared
 *     (Esc, deselect-all, or clear()).
 *
 * Markup:
 *   <div data-lb-selection data-lb-selection-toolbar="#toolbarId">
 *     <div class="lb-media-card" data-lb-selectable data-lb-id="a1">
 *       <label class="lb-media-card__check">
 *         <input type="checkbox" class="lb-checkbox" aria-label="Select item">
 *       </label>
 *       …
 *     </div>…
 *   </div>
 *
 * Toolbar wiring (all optional, looked up inside the toolbar element):
 *   [data-lb-selection-all]    select-all checkbox (indeterminate-aware)
 *   [data-lb-selection-count]  textContent = "N selected"
 *   [data-lb-selection-clear]  click → clear()
 *   The toolbar element gets .lb-toolbar--selecting while active.
 *
 * API at el._lbSelection: getSelected() → id[], count(), selectAll(),
 * clear(), toggle(id, force?), isActive().
 * Events (bubbling from the container):
 *   lb-selection-change {ids, count, total}
 *
 * Dependencies — public LB API only (LB.register).
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-selection] LB is not defined — load js/lb.js before js/components/lb-selection.js');
    return;
  }
  const LB = window.LB;

  const LONG_PRESS_MS = 500;

  class Selection {
    constructor(el) {
      this.el = el;
      this._ids = new Set();

      const toolbarSel = el.dataset.lbSelectionToolbar;
      this._toolbar = toolbarSel ? document.querySelector(toolbarSel) : null;
      this._allBox = this._toolbar ? this._toolbar.querySelector('[data-lb-selection-all]') : null;
      this._countEl = this._toolbar ? this._toolbar.querySelector('[data-lb-selection-count]') : null;
      this._clearBtn = this._toolbar ? this._toolbar.querySelector('[data-lb-selection-clear]') : null;

      // Item checkboxes toggle their item.
      el.addEventListener('change', (e) => {
        const box = e.target.closest('.lb-media-card__check .lb-checkbox, [data-lb-selectable] > .lb-checkbox');
        if (!box) return;
        const item = e.target.closest('[data-lb-selectable]');
        if (item) this.toggle(this._idOf(item), box.checked);
      });

      // While active, clicking an item's non-interactive body toggles it.
      el.addEventListener('click', (e) => {
        if (!this.isActive()) return;
        if (e.target.closest('a, button, input, label, [data-lb-menu]')) return;
        const item = e.target.closest('[data-lb-selectable]');
        if (item) { e.preventDefault(); this.toggle(this._idOf(item)); }
      });

      // Long-press enters selection mode (touch parity for hover-reveal).
      this._pressTimer = null;
      el.addEventListener('pointerdown', (e) => {
        const item = e.target.closest('[data-lb-selectable]');
        if (!item || this.isActive()) return;
        this._pressTimer = setTimeout(() => this.toggle(this._idOf(item), true), LONG_PRESS_MS);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
        el.addEventListener(t, () => { clearTimeout(this._pressTimer); }));

      // Esc clears the whole selection (deliberate exit).
      this._onKey = (e) => { if (e.key === 'Escape' && this.isActive()) this.clear(); };
      document.addEventListener('keydown', this._onKey);

      if (this._allBox) {
        this._allBox.addEventListener('change', () => {
          this._allBox.checked ? this.selectAll() : this.clear();
        });
      }
      if (this._clearBtn) this._clearBtn.addEventListener('click', () => this.clear());

      this._sync();
    }

    _idOf(item) { return item.dataset.lbId || ''; }
    _items() { return Array.from(this.el.querySelectorAll('[data-lb-selectable]')); }

    isActive() { return this._ids.size > 0; }
    count() { return this._ids.size; }
    getSelected() { return Array.from(this._ids); }

    toggle(id, force) {
      if (!id) return;
      const on = force !== undefined ? force : !this._ids.has(id);
      on ? this._ids.add(id) : this._ids.delete(id);
      this._sync();
    }
    selectAll() {
      this._items().forEach((i) => this._ids.add(this._idOf(i)));
      this._sync();
    }
    clear() {
      this._ids.clear();
      this._sync();
    }

    _sync() {
      const total = this._items().length;
      const count = this._ids.size;
      this.el.classList.toggle('lb-selection--active', count > 0);
      this._items().forEach((item) => {
        const on = this._ids.has(this._idOf(item));
        item.classList.toggle('lb-media-card--selected', on);
        item.toggleAttribute('data-lb-selected', on);
        const box = item.querySelector('.lb-checkbox');
        if (box) box.checked = on;
      });
      if (this._toolbar) this._toolbar.classList.toggle('lb-toolbar--selecting', count > 0);
      if (this._countEl) this._countEl.textContent = count + ' selected';
      if (this._allBox) {
        this._allBox.checked = count > 0 && count === total;
        this._allBox.indeterminate = count > 0 && count < total;
      }
      this.el.dispatchEvent(new CustomEvent('lb-selection-change', {
        bubbles: true, detail: { ids: this.getSelected(), count, total },
      }));
    }

    destroy() {
      document.removeEventListener('keydown', this._onKey);
      clearTimeout(this._pressTimer);
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Selection = Selection;
  LB.register('selection', Selection, '[data-lb-selection]');
})();
