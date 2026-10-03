/**
 * lb-chat-composer-popover.js — letbe-ds compact composer in a popover
 *
 * Loaded as a separate <script> after lb-chat.js. Self-registers the
 * `LB.openComposerPopover()` factory. Ships ONE exported function;
 * no auto-init selector. Composer popover is summoned imperatively,
 * normally in response to a selection event from another component
 * (LB.Timeline's lb-timeline-selection, a text-selection range on a
 * canvas surface, etc.).
 *
 *   LB.openComposerPopover(opts)
 *     opts.anchor          required — Element | DOMRect | {x,y,width,height}
 *                          target rect to anchor to (viewport coords)
 *     opts.placement       'bottom' | 'top'  (default 'bottom')
 *     opts.contextChip     optional — {label, kind} appended as a chip
 *     opts.prefill         optional — initial textarea value
 *     opts.tools           optional — same array as composer.setTools()
 *     opts.models          optional — same array as composer.setModels()
 *     opts.currentModel    optional — model id from opts.models
 *     opts.commands        optional — array passed through to
 *                          composer.registerCommand() one by one
 *     opts.placeholder     optional — textarea placeholder override
 *     opts.onSubmit        optional — function(value, context) →
 *                          if returns false the popover stays open
 *     opts.onClose         optional — function() called when dismissed
 *     opts.autoCloseOnSubmit  default true; if false the consumer
 *                          owns dismissal via .close()
 *
 *   Returns { el, composer, close() }.
 *
 * Per the pluggable-engine rule, this module does NOT:
 *   - position itself with flip / shift / virtual-element math beyond
 *     basic viewport clamping — consumers wanting collision avoidance
 *     should pass an already-clamped anchor rect.
 *   - own dismissal semantics — outside-click + Esc + Tab-out are
 *     baked in; anything else is consumer territory.
 *
 * Per the no-fork rule, this module consumes:
 *   - LB.Composer                                  the composer engine
 *   - .lb-popover                                  surface chrome
 *   - .lb-composer + .lb-composer__row             markup
 *   - .lb-icon-btn + .lb-btn--ghost                buttons
 *
 * No bespoke surface, no bespoke composer skin.
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-chat-composer-popover] LB is not defined — load js/lb.js + js/components/lb-chat.js first');
    return;
  }

  const LB = window.LB;

  if (!LB.Composer) {
    console.error('[lb-chat-composer-popover] LB.Composer is not defined — load js/components/lb-chat.js first');
    return;
  }

  // Single per-document popover. Calling openComposerPopover again
  // closes any existing one — same semantics as a one-instance modal.
  let _active = null;

  function rectFromAnchor(anchor) {
    if (!anchor) return null;
    if (anchor instanceof Element) return anchor.getBoundingClientRect();
    // DOMRect or {x,y,width,height}
    const x = anchor.x ?? anchor.left ?? 0;
    const y = anchor.y ?? anchor.top  ?? 0;
    const w = anchor.width  ?? 0;
    const h = anchor.height ?? 0;
    return {
      x, y, width: w, height: h,
      top: y, left: x, right: x + w, bottom: y + h,
    };
  }

  function clampToViewport(top, left, width, gap) {
    const margin = 8;
    const maxLeft = window.innerWidth  - width - margin;
    const maxTop  = window.innerHeight - margin;
    return {
      top:  Math.max(margin, Math.min(top,  maxTop)),
      left: Math.max(margin, Math.min(left, maxLeft)),
    };
  }

  // The canonical composer markup, compacted: chips row + input row +
  // footer (tools + model). Footer only present when tools/models are
  // configured — left empty otherwise so the popover stays slim.
  function buildComposerMarkup(opts) {
    const placeholder = opts.placeholder || 'Ask about this selection…';
    let html = ''
      + '<div class="lb-composer lb-composer--popover" data-lb-composer>'
      +   '<div class="lb-composer__chips lb-composer__chips--empty" data-lb-composer-chips></div>'
      +   '<div class="lb-composer__row">'
      +     '<textarea data-lb-composer-input placeholder="' + escapeAttr(placeholder) + '" rows="1"></textarea>'
      +     '<div class="lb-composer__actions">'
      +       '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost" data-lb-composer-send aria-label="Send"><span data-lb-icon="send" aria-hidden="true"></span></button>'
      +       '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost" data-lb-composer-stop aria-label="Stop" hidden><span data-lb-icon="square-rounded" aria-hidden="true"></span></button>'
      +     '</div>'
      +   '</div>';
    // Footer only present if we have tools or models.
    const hasFooter = (opts.tools && opts.tools.length) || (opts.models && opts.models.length);
    if (hasFooter) {
      html += ''
      +   '<div class="lb-composer__footer">'
      +     '<div class="lb-composer__tools" data-lb-composer-tools></div>'
      +     '<div class="lb-composer__model" data-lb-composer-model></div>'
      +   '</div>';
    }
    html += '</div>';
    return html;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/&/g, '&amp;');
  }

  function openComposerPopover(opts) {
    opts = opts || {};
    // Close any existing popover first — one-at-a-time.
    if (_active) { _active.close(); _active = null; }

    const anchorRect = rectFromAnchor(opts.anchor);
    if (!anchorRect) {
      console.warn('[lb-chat-composer-popover] no anchor provided');
      return null;
    }

    // Surface: a .lb-popover the consumer mounts on the body. Plain
    // position:fixed so it stays anchored to viewport coords (the same
    // approach as the ConvList kebab).
    const surface = document.createElement('div');
    surface.className = 'lb-popover lb-composer-popover-surface';
    surface.setAttribute('role', 'dialog');
    surface.setAttribute('aria-modal', 'false');
    surface.setAttribute('aria-label', opts.ariaLabel || 'Compose message about selection');
    surface.style.position = 'fixed';

    // Build the inner composer.
    surface.innerHTML = buildComposerMarkup(opts);
    document.body.appendChild(surface);

    // Wire LB.Composer onto the freshly-injected node, plus icon swap.
    const composerEl = surface.querySelector('[data-lb-composer]');
    if (LB.init)      LB.init(surface);
    if (LB.initIcons) LB.initIcons(surface);
    const composer = composerEl && composerEl._lbComposer;

    // Optional configuration — tools / models / commands / prefill /
    // context chip. All consumed via the public Composer API.
    if (composer) {
      if (Array.isArray(opts.tools) && opts.tools.length)   composer.setTools(opts.tools);
      if (Array.isArray(opts.models) && opts.models.length) composer.setModels(opts.models, opts.currentModel);
      if (Array.isArray(opts.commands)) opts.commands.forEach((c) => composer.registerCommand(c));
      if (opts.prefill != null)        composer.setValue(opts.prefill);
      if (opts.contextChip) {
        composer.addChip({
          id: opts.contextChip.id || 'ctx',
          label: opts.contextChip.label,
          kind: opts.contextChip.kind || 'context',
          removable: opts.contextChip.removable !== false,
          data: opts.contextChip.data || null,
        });
      }
    }

    // Position the popover after layout — measure surface, clamp to
    // viewport. Placement 'bottom' (default) docks the top edge below
    // the anchor; 'top' docks the bottom edge above.
    const placement = opts.placement === 'top' ? 'top' : 'bottom';
    requestAnimationFrame(() => {
      const sRect = surface.getBoundingClientRect();
      const gap = 8;
      // Center horizontally on the anchor's mid-point.
      const centerX = anchorRect.left + (anchorRect.width / 2);
      let left = centerX - (sRect.width / 2);
      let top  = placement === 'bottom'
        ? anchorRect.bottom + gap
        : anchorRect.top - sRect.height - gap;
      const clamped = clampToViewport(top, left, sRect.width, gap);
      surface.style.top  = clamped.top  + 'px';
      surface.style.left = clamped.left + 'px';
      // Focus the textarea so the user can immediately type.
      if (composer) composer.focus();
    });

    // ── Dismissal: outside-click, Esc, Tab-out ──
    const onSubmit = (e) => {
      const value = e.detail && e.detail.value;
      const ctx = {
        contextChip: opts.contextChip || null,
        anchorRect,
        model: composer ? composer.getModel?.() : null,
      };
      let keepOpen = false;
      if (typeof opts.onSubmit === 'function') {
        keepOpen = opts.onSubmit(value, ctx) === false;
      }
      if (!keepOpen && opts.autoCloseOnSubmit !== false) {
        handle.close();
      } else {
        composer.clear();
        composer.setState('idle');
      }
    };

    composerEl.addEventListener('lb-composer-submit', onSubmit);

    const outsideHandler = (e) => {
      if (!surface.contains(e.target)) handle.close();
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handle.close();
      }
    };

    // Defer attaching the outside handler so the event that opened us
    // (typically a pointerup or click on the anchor) doesn't trip it.
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideHandler, true);
      document.addEventListener('keydown', keyHandler);
    }, 0);

    const handle = {
      el: surface,
      composer,
      close() {
        if (!surface.isConnected) return;
        document.removeEventListener('pointerdown', outsideHandler, true);
        document.removeEventListener('keydown', keyHandler);
        composerEl.removeEventListener('lb-composer-submit', onSubmit);
        surface.remove();
        if (_active === handle) _active = null;
        if (typeof opts.onClose === 'function') opts.onClose();
      },
      reposition(newAnchor) {
        const rect = rectFromAnchor(newAnchor);
        if (!rect) return;
        const sRect = surface.getBoundingClientRect();
        const centerX = rect.left + (rect.width / 2);
        const top = placement === 'bottom'
          ? rect.bottom + 8
          : rect.top - sRect.height - 8;
        const clamped = clampToViewport(top, centerX - sRect.width / 2, sRect.width, 8);
        surface.style.top  = clamped.top  + 'px';
        surface.style.left = clamped.left + 'px';
      },
    };

    _active = handle;
    return handle;
  }

  // ─── PUBLIC API ───────────────────────────────────────────
  // No LB.register — this is summoned imperatively, not auto-init.
  LB.openComposerPopover = openComposerPopover;
})();
