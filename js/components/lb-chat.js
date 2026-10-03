/**
 * lb-chat.js — letbe-ds AI Chat primitives
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register(). This module ships the foundational chat primitives.
 * Workspace shells and layout variants live in sibling modules:
 *   - lb-chat-artifact.js
 *   - lb-chat-workspace.js
 *   - lb-chat-workspace-{converse,dev,timeline}.js
 *
 * Slice 1 (this slice): LB.Bubble visual primitive only — message
 * shapes (user / assistant / system) with state-driven affordances
 * (streaming / error / edited). No Thread, no Composer yet — those
 * land in Slice 2.
 *
 * Dependencies — all from the public LB API:
 *   - LB.register
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-chat] LB is not defined — load js/lb.js before js/components/lb-chat.js');
    return;
  }

  const LB = window.LB;

  // ─── BUBBLE ────────────────────────────────────────────────
  // Message primitive for chat threads. Three role variants:
  //   - user      right-aligned, subtly tinted card body
  //   - assistant flat text, full content width (no body card)
  //   - system    centred, muted caption (no avatar, no actions)
  //
  // States via data-state attribute:
  //   - done      (default) final state; footer actions visible on hover
  //   - streaming blinking caret at end of body
  //   - error     danger-tinted body
  //   - edited    "(edited)" indicator next to timestamp
  //
  // Markup contract:
  //   <div class="lb-bubble lb-bubble--{role}" data-lb-bubble [data-state="..."]>
  //     <div class="lb-bubble__avatar"> ... </div>
  //     <div class="lb-bubble__content">
  //       <div class="lb-bubble__header">
  //         <span class="lb-bubble__sender">Name</span>
  //         <span class="lb-bubble__timestamp">2:34 PM</span>
  //       </div>
  //       <div class="lb-bubble__body"> ... </div>
  //       <div class="lb-bubble__footer"> ...actions... </div>
  //     </div>
  //   </div>
  //
  // Public API at el._lbBubble:
  //   getRole()           'user' | 'assistant' | 'system'
  //   getState()          current state value
  //   setState(s)         set data-state and emit lb-bubble-state-change
  //   appendText(token)   PUSH streaming API — append a plain-text token
  //                       to body; auto-transitions to 'streaming' state
  //   setBodyHtml(html)   escape hatch for consumer-rendered HTML
  //                       (use for full-markdown engines, math, etc.)
  //   setBodyText(text)   replace body with plain text
  //
  // Events emitted (CustomEvent, bubbles):
  //   lb-bubble-state-change   detail: { state, prev }

  const VALID_ROLES = ['user', 'assistant', 'system'];
  const VALID_STATES = ['done', 'streaming', 'error', 'edited'];

  class Bubble {
    constructor(el) {
      this.el = el;
      this.role = this._readRole();
      this.state = (el.dataset.state && VALID_STATES.includes(el.dataset.state))
        ? el.dataset.state
        : 'done';
      this._bodyEl = el.querySelector('.lb-bubble__body');
      this._footerEl = el.querySelector('.lb-bubble__footer');
      if (!el.dataset.state) el.dataset.state = this.state;
      // Wire footer action delegation — clicks on any button with
      // data-lb-bubble-action emit lb-bubble-action {action, bubble}.
      // Custom buttons in consumer markup get this for free.
      this._wireFooterDelegation();
    }

    _wireFooterDelegation() {
      if (!this._footerEl) return;
      this._footerEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lb-bubble-action]');
        if (!btn) return;
        const action = btn.dataset.lbBubbleAction;
        // Built-in actions: edit, copy, regenerate, like, dislike,
        // branch-prev, branch-next, more. Consumer-defined actions
        // pass through identically.
        if (action === 'edit') {
          this._startInlineEdit();
          return;
        }
        if (action === 'branch-prev' || action === 'branch-next') {
          this._switchBranch(action === 'branch-next' ? 1 : -1);
          return;
        }
        if (action === 'copy') {
          this._copyBody();
        }
        // Emit for consumer wiring regardless — copy, like, dislike,
        // regenerate, etc. The consumer handles model-side concerns.
        this.el.dispatchEvent(new CustomEvent('lb-bubble-action', {
          bubbles: true, detail: { action, bubble: this },
        }));
      });
    }

    _copyBody() {
      const text = this._bodyEl ? this._bodyEl.innerText : '';
      if (!text || !navigator.clipboard) return;
      navigator.clipboard.writeText(text).catch(() => {});
    }

    // ── Inline edit (user messages) ───────────────────────
    // Per Q2 alignment, every edit creates a branch — preserves the
    // original message. The Thread (if this bubble is mounted in one)
    // is responsible for creating the sibling bubble and refreshing
    // visibility. We just stage the new value and emit the events.

    _startInlineEdit() {
      if (!this._bodyEl) return;
      if (this._editing) return;
      this._editing = true;
      const originalHtml = this._bodyEl.innerHTML;
      const originalText = this._bodyEl.innerText;
      this.el.classList.add('lb-bubble--editing');
      this._bodyEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'lb-bubble__edit';
      wrap.innerHTML = ''
        + '<textarea class="lb-bubble__edit-input" data-lb-bubble-edit-input></textarea>'
        + '<div class="lb-bubble__edit-actions">'
        +   '<button type="button" class="lb-btn lb-btn--small lb-btn--secondary" data-lb-bubble-edit-cancel>Cancel</button>'
        +   '<button type="button" class="lb-btn lb-btn--small lb-btn--primary" data-lb-bubble-edit-save>Save &amp; submit</button>'
        + '</div>';
      this._bodyEl.appendChild(wrap);
      const input = wrap.querySelector('textarea');
      input.value = originalText;
      input.focus();
      // Autogrow
      const grow = () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 320) + 'px';
      };
      input.addEventListener('input', grow);
      grow();
      // Wire buttons
      wrap.querySelector('[data-lb-bubble-edit-cancel]').addEventListener('click', () => {
        this._endInlineEdit(originalHtml);
      });
      wrap.querySelector('[data-lb-bubble-edit-save]').addEventListener('click', () => {
        const newValue = input.value.trim();
        if (!newValue || newValue === originalText) {
          this._endInlineEdit(originalHtml);
          return;
        }
        this._endInlineEdit(originalHtml);
        // Emit save event — Thread listens for this and creates the
        // sibling branch + appropriate visibility updates.
        this.el.dispatchEvent(new CustomEvent('lb-bubble-edit-save', {
          bubbles: true, detail: {
            bubble: this,
            oldValue: originalText,
            newValue,
          },
        }));
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._endInlineEdit(originalHtml);
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          wrap.querySelector('[data-lb-bubble-edit-save]').click();
        }
      });
    }

    _endInlineEdit(restoreHtml) {
      this._editing = false;
      this.el.classList.remove('lb-bubble--editing');
      if (this._bodyEl) this._bodyEl.innerHTML = restoreHtml;
    }

    _switchBranch(delta) {
      this.el.dispatchEvent(new CustomEvent('lb-bubble-branch-switch-request', {
        bubbles: true, detail: { bubble: this, delta },
      }));
    }

    _readRole() {
      for (let i = 0; i < VALID_ROLES.length; i++) {
        if (this.el.classList.contains('lb-bubble--' + VALID_ROLES[i])) {
          return VALID_ROLES[i];
        }
      }
      return 'assistant';
    }

    getRole() { return this.role; }
    getState() { return this.state; }

    setState(next) {
      if (!VALID_STATES.includes(next)) {
        console.warn('[lb-bubble] invalid state:', next);
        return;
      }
      if (this.state === next) return;
      const prev = this.state;
      this.state = next;
      this.el.dataset.state = next;
      // aria-busy mutes the live-region announcement while a bubble is
      // streaming so AT doesn't read every token. When state flips to
      // anything else, aria-busy clears and the Thread's role=log /
      // aria-live emits the completed content.
      if (next === 'streaming') this.el.setAttribute('aria-busy', 'true');
      else this.el.setAttribute('aria-busy', 'false');
      this.el.dispatchEvent(new CustomEvent('lb-bubble-state-change', {
        bubbles: true, detail: { state: next, prev },
      }));
    }

    appendText(token) {
      if (!this._bodyEl || token == null) return;
      if (this.state !== 'streaming') this.setState('streaming');
      this._bodyEl.appendChild(document.createTextNode(String(token)));
    }

    setBodyHtml(html) {
      if (!this._bodyEl) return;
      this._bodyEl.innerHTML = String(html);
    }

    setBodyText(text) {
      if (!this._bodyEl) return;
      this._bodyEl.textContent = String(text);
    }
  }

  // ─── INTERNAL: branch path utility ────────────────────────
  // Every bubble lives on a branch path — a string like
  //   "root/a/b3/c"
  // identifying which branch chain it belongs to. Empty string =
  // root branch. Edited messages create a sibling at the same depth
  // with a different terminal segment; descendants of that new
  // sibling get the new path as their prefix.
  //
  // A bubble is "visible" if its branchPath is a prefix of the
  // currently-active branch path. The Thread filters visible
  // bubbles via display:none on bubbles whose path doesn't match,
  // not by removing them — preserves DOM state for branch switching.

  function isPrefix(prefix, path) {
    if (prefix === '') return true; // root is prefix of everything
    if (prefix === path) return true;
    return path.indexOf(prefix + '/') === 0;
  }

  // Generate a short unique id for new branches.
  let _branchCounter = 0;
  function nextBranchId() {
    _branchCounter += 1;
    return 'b' + Date.now().toString(36) + _branchCounter.toString(36);
  }

  // ─── INTERNAL: escapeHtml ─────────────────────────────────
  // Tiny helper used when Thread programmatically builds bubble
  // markup from plain-text fields (sender, timestamp, body).
  // Consumer-supplied HTML slots (avatarHtml, bodyHtml, footerHtml)
  // are deliberately NOT escaped — consumers can already inject
  // arbitrary HTML; that's the explicit contract.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;',
      }[c];
    });
  }

  // ─── THREAD ────────────────────────────────────────────────
  // Host that aggregates bubbles. Owns:
  //   - scroll-to-bottom behaviour (auto-stick while content grows
  //     if user was at bottom; do NOT fight the user if they've
  //     scrolled up)
  //   - jump-to-bottom pill (auto-injected if not in markup; shows
  //     when scrolled away from bottom)
  //   - programmatic append/clear/getBubbles API
  //   - emits lb-thread-append, lb-thread-bottom-reached events
  //
  // Markup contract (minimum):
  //   <div class="lb-thread" data-lb-thread style="overflow-y: auto;">
  //     <!-- bubbles render here; consumer can pre-seed any --!>
  //   </div>
  //
  // Public API at el._lbThread:
  //   appendBubble(opts) → bubbleEl     create + append a Bubble
  //                                     (returns the new element with
  //                                     ._lbBubble already wired)
  //   getBubbles()                      array of bubble elements in
  //                                     DOM order
  //   clear()                           remove all bubbles (jump pill
  //                                     preserved)
  //   scrollToBottom(behavior?)         'smooth' | 'instant' | 'auto'
  //   isAtBottom()                      boolean
  //
  // appendBubble options:
  //   role            'user' | 'assistant' | 'system'
  //   state           'done' | 'streaming' | 'error' | 'edited'
  //   sender          plain text (escaped); omit on system
  //   timestamp       plain text (escaped); omit on system
  //   avatarHtml      raw HTML for avatar slot
  //   body            plain text (escaped, set via textContent)
  //   bodyHtml        raw HTML (wins over body if both passed)
  //   footerHtml      raw HTML for footer action row

  // ── Default action row HTML by role ───────────────────────
  // Injected into a bubble's empty footer when Thread.appendBubble
  // creates a bubble without consumer-supplied footerHtml. Buttons
  // carry data-lb-bubble-action so the Bubble's footer delegation
  // picks them up and emits lb-bubble-action events.

  function defaultActionsHtml(role) {
    if (role === 'system') return '';
    if (role === 'assistant') {
      return ''
        + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="copy" data-lb-icon="copy" aria-label="Copy"></button>'
        + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="like" data-lb-icon="thumbs-up" aria-label="Helpful"></button>'
        + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="dislike" data-lb-icon="thumbs-down" aria-label="Not helpful"></button>'
        + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="regenerate" data-lb-icon="refresh-cw" aria-label="Regenerate"></button>';
    }
    // user
    return ''
      + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="edit" data-lb-icon="pencil" aria-label="Edit message (creates branch)"></button>'
      + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="copy" data-lb-icon="copy" aria-label="Copy"></button>'
      + '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="more" data-lb-icon="more-horizontal" aria-label="More actions"></button>';
  }

  // Branch arrows HTML — inserted at the LEFT of the footer when a
  // bubble has multiple siblings. Shows current index / total.
  function branchArrowsHtml(index, total) {
    return ''
      + '<div class="lb-bubble__branch-nav" aria-label="Branch navigation">'
      +   '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="branch-prev" data-lb-icon="chevron-left" aria-label="Previous branch"></button>'
      +   '<span class="lb-bubble__branch-count">' + (index + 1) + ' / ' + total + '</span>'
      +   '<button type="button" class="lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small" data-lb-bubble-action="branch-next" data-lb-icon="chevron-right" aria-label="Next branch"></button>'
      + '</div>';
  }

  class Thread {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-thread');
      // role=log + aria-live=polite makes the thread a live region that
      // announces newly-appended bubbles to screen readers. Streaming
      // bubbles carry aria-busy=true (set by Bubble.setState) so AT
      // skips them until they're done — then a single announcement of
      // the completed content fires when aria-busy flips off.
      this.el.setAttribute('role', 'log');
      this.el.setAttribute('aria-live', 'polite');
      this.el.setAttribute('aria-relevant', 'additions text');
      this.el.setAttribute('aria-label', el.getAttribute('aria-label') || 'Conversation');
      // Thread itself is the scroll container by default.
      this._scrollEl = el;
      this._atBottomThreshold = 24; // px tolerance for "at bottom"
      this._wasAtBottom = true;
      // Active branch path — '' = root. New bubbles inherit it as
      // their branch path so they appear in the currently-selected
      // conversation tree.
      this._activeBranch = '';
      // Branch siblings registry: map of "sibling group id" →
      //   { paths: [path1, path2, ...], activeIndex: N }
      // Created when an edit happens; consulted by the prev/next
      // arrow handlers and by visibility filtering. Group id is the
      // shared parent path; siblings are the alternate next-segments.
      this._branchGroups = new Map();

      // Auto-inject the jump-to-bottom pill if not present.
      this._jumpBtn = el.querySelector('[data-lb-thread-jump]');
      if (!this._jumpBtn) {
        this._jumpBtn = document.createElement('button');
        this._jumpBtn.type = 'button';
        this._jumpBtn.className = 'lb-thread__jump-pill';
        this._jumpBtn.setAttribute('data-lb-thread-jump', '');
        this._jumpBtn.setAttribute('aria-label', 'Jump to bottom');
        this._jumpBtn.innerHTML = '<span data-lb-icon="chevron-down" aria-hidden="true"></span>';
        el.appendChild(this._jumpBtn);
        // Ask the icon system to swap the placeholder for SVG.
        if (window.LB && window.LB.initIcons) window.LB.initIcons(this._jumpBtn);
      }
      this._jumpBtn.addEventListener('click', () => this.scrollToBottom());

      // Scroll listener — keep _wasAtBottom in sync. Throttle to
      // animation frame to avoid spamming on touch scroll.
      let scrollRaf = null;
      this._scrollEl.addEventListener('scroll', () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null;
          this._checkScroll();
        });
      });

      // MutationObserver — when content changes (bubble appended,
      // streaming text added), re-stick to bottom IF the user was
      // at bottom before the change. Subtree+characterData covers
      // appendText accumulating on bubble bodies.
      this._mo = new MutationObserver(() => {
        if (this._wasAtBottom) this.scrollToBottom('instant');
        this._checkScroll();
      });
      this._mo.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Initial state — wait for layout pass before checking.
      requestAnimationFrame(() => this._checkScroll());

      // ── Branch-event delegation ────────────────────────
      // Bubbles request a branch switch via the prev/next arrows;
      // they emit lb-bubble-branch-switch-request which we handle
      // here. Edit-save also emits lb-bubble-edit-save; we create
      // the sibling bubble in response.
      this.el.addEventListener('lb-bubble-branch-switch-request', (e) => {
        this._handleBranchSwitch(e.detail.bubble, e.detail.delta);
      });
      this.el.addEventListener('lb-bubble-edit-save', (e) => {
        this._handleEditSave(e.detail.bubble, e.detail.oldValue, e.detail.newValue);
      });
    }

    // ── Branch management ────────────────────────────────────

    getActiveBranch() { return this._activeBranch; }

    setActiveBranch(path) {
      this._activeBranch = String(path || '');
      this._refreshVisibility();
    }

    _refreshVisibility() {
      const bubbles = this.el.querySelectorAll(':scope > [data-lb-bubble]');
      bubbles.forEach((b) => {
        const p = b.dataset.branchPath || '';
        // Bubble is visible iff its branch path is a prefix of the
        // active branch (i.e., it lies on the current branch chain).
        const visible = isPrefix(p, this._activeBranch);
        b.classList.toggle('lb-bubble--branch-hidden', !visible);
      });
    }

    _handleEditSave(bubble, oldValue, newValue) {
      // Create a sibling branch for the edited bubble. New bubble
      // takes the original's parent path; both bubbles get unique
      // branch ids appended. Active branch switches to the new one.
      const originalEl = bubble.el;
      const parentPath = originalEl.dataset.branchPath || '';
      // Generate a fresh segment for the new sibling — and one for
      // the original too, the first time it branches (so siblings
      // are symmetric).
      let originalSeg = originalEl.dataset.branchSeg;
      if (!originalSeg) {
        originalSeg = nextBranchId();
        originalEl.dataset.branchSeg = originalSeg;
        const originalFullPath = parentPath ? parentPath + '/' + originalSeg : originalSeg;
        // Update the original bubble's full branchPath and migrate
        // any descendants that inherited the old (empty-segment) path.
        this._migrateBranchPath(originalEl, parentPath, originalFullPath);
      }
      const originalFullPath = parentPath ? parentPath + '/' + originalSeg : originalSeg;
      const newSeg = nextBranchId();
      const newFullPath = parentPath ? parentPath + '/' + newSeg : newSeg;

      // Register / extend the branch group at this point.
      const groupKey = parentPath + '|' + this._bubbleSlotOf(originalEl);
      let group = this._branchGroups.get(groupKey);
      if (!group) {
        group = { paths: [originalFullPath], activeIndex: 0 };
        this._branchGroups.set(groupKey, group);
      }
      group.paths.push(newFullPath);
      group.activeIndex = group.paths.length - 1;

      // Create the new sibling bubble — same role/sender/timestamp
      // as the original but new body text.
      const newBubble = this._appendBubbleAtPath({
        role: bubble.getRole(),
        sender: originalEl.querySelector('.lb-bubble__sender')?.textContent || '',
        timestamp: originalEl.querySelector('.lb-bubble__timestamp')?.textContent || '',
        avatarHtml: originalEl.querySelector('.lb-bubble__avatar')?.innerHTML || '',
        body: newValue,
      }, newFullPath, group);

      // Update arrows on BOTH siblings (and any other siblings in
      // the group) — the count changed and the indices need refresh.
      this._renderBranchArrowsForGroup(group);

      // Switch active branch — hides the original's descendants,
      // shows the new sibling alone.
      this.setActiveBranch(newFullPath);

      this.el.dispatchEvent(new CustomEvent('lb-thread-branch-created', {
        bubbles: true, detail: {
          originalBubble: bubble,
          newBubble: newBubble._lbBubble,
          oldValue, newValue,
          path: newFullPath,
        },
      }));
    }

    _migrateBranchPath(originalEl, oldPrefix, newPath) {
      // The original bubble's branchPath was the parentPath (without
      // its own segment). Now that we're assigning it a segment, we
      // shift it onto the new path. Any descendants in the same chain
      // get re-pathed too.
      const bubbles = Array.from(this.el.querySelectorAll(':scope > [data-lb-bubble]'));
      const startIdx = bubbles.indexOf(originalEl);
      // Original element itself:
      originalEl.dataset.branchPath = newPath;
      // Subsequent bubbles that had the same parentPath as their
      // branchPath are descendants — migrate them.
      for (let i = startIdx + 1; i < bubbles.length; i++) {
        if ((bubbles[i].dataset.branchPath || '') === oldPrefix) {
          bubbles[i].dataset.branchPath = newPath;
        } else {
          break;
        }
      }
    }

    _bubbleSlotOf(el) {
      // A "slot" identifies the position of a sibling group within
      // the thread. We use the count of preceding visible bubbles
      // sharing the same parent path so two edits at different
      // positions don't collide in the registry.
      const bubbles = Array.from(this.el.querySelectorAll(':scope > [data-lb-bubble]'));
      return bubbles.indexOf(el);
    }

    _renderBranchArrowsForGroup(group) {
      // For every bubble whose branchPath is one of group.paths,
      // (re)render the arrow nav into its footer at the leading edge.
      const total = group.paths.length;
      group.paths.forEach((p, idx) => {
        const bubbles = this.el.querySelectorAll(':scope > [data-lb-bubble]');
        bubbles.forEach((b) => {
          if (b.dataset.branchPath !== p) return;
          const footer = b.querySelector('.lb-bubble__footer');
          if (!footer) return;
          // Remove any prior nav.
          const old = footer.querySelector('.lb-bubble__branch-nav');
          if (old) old.remove();
          // Insert new nav at the start of the footer.
          const tmp = document.createElement('span');
          tmp.innerHTML = branchArrowsHtml(idx, total);
          footer.insertBefore(tmp.firstChild, footer.firstChild);
          if (window.LB && window.LB.initIcons) window.LB.initIcons(footer);
        });
      });
    }

    _handleBranchSwitch(bubble, delta) {
      // Find which group the bubble belongs to via its branchPath.
      const path = bubble.el.dataset.branchPath || '';
      let foundGroup = null;
      for (const g of this._branchGroups.values()) {
        if (g.paths.indexOf(path) >= 0) {
          foundGroup = g;
          break;
        }
      }
      if (!foundGroup) return;
      const idx = foundGroup.paths.indexOf(path);
      let next = idx + delta;
      if (next < 0) next = foundGroup.paths.length - 1;
      if (next >= foundGroup.paths.length) next = 0;
      foundGroup.activeIndex = next;
      this.setActiveBranch(foundGroup.paths[next]);
      // Re-render arrows on all siblings so the "N / M" label updates.
      this._renderBranchArrowsForGroup(foundGroup);
    }

    // Internal variant of appendBubble that lets us insert at a
    // specific branch path (the parent flow inherits the active
    // branch instead).
    _appendBubbleAtPath(opts, path, group) {
      const role = ['user', 'assistant', 'system'].indexOf(opts.role) >= 0 ? opts.role : 'assistant';
      const state = ['done', 'streaming', 'error', 'edited'].indexOf(opts.state) >= 0 ? opts.state : 'done';
      const isSystem = role === 'system';
      const sender = opts.sender || '';
      const timestamp = opts.timestamp || '';

      const bubble = document.createElement('div');
      bubble.className = 'lb-bubble lb-bubble--' + role;
      bubble.setAttribute('data-lb-bubble', '');
      bubble.dataset.state = state;
      bubble.dataset.branchPath = path;
      // For sibling bubbles created via edit, branchSeg = final
      // segment of the path. Used by future migrations to detect
      // already-branched bubbles.
      const lastSlash = path.lastIndexOf('/');
      bubble.dataset.branchSeg = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

      let html = '';
      if (!isSystem) {
        html += '<div class="lb-bubble__avatar">' + (opts.avatarHtml || '') + '</div>';
      }
      html += '<div class="lb-bubble__content">';
      if (!isSystem && (sender || timestamp)) {
        html += '<div class="lb-bubble__header">';
        if (sender) html += '<span class="lb-bubble__sender">' + escapeHtml(sender) + '</span>';
        if (timestamp) html += '<span class="lb-bubble__timestamp">' + escapeHtml(timestamp) + '</span>';
        html += '</div>';
      }
      html += '<div class="lb-bubble__body">';
      if (opts.bodyHtml != null) html += String(opts.bodyHtml);
      else if (opts.body != null) html += escapeHtml(opts.body);
      html += '</div>';
      if (!isSystem) html += '<div class="lb-bubble__footer">' + defaultActionsHtml(role) + '</div>';
      html += '</div>';
      bubble.innerHTML = html;

      // Insert right after the original sibling so siblings stay
      // adjacent in DOM order — keeps branch-switching natural.
      const ref = this.el.querySelector(':scope > [data-lb-bubble][data-branch-path="' + group.paths[0] + '"]');
      if (ref && ref.nextSibling) this.el.insertBefore(bubble, ref.nextSibling);
      else this.el.appendChild(bubble);
      // Push the jump pill back to the end.
      if (this._jumpBtn && this._jumpBtn.parentNode === this.el) {
        this.el.appendChild(this._jumpBtn);
      }

      if (!bubble._lbBubble) bubble._lbBubble = new Bubble(bubble);
      if (window.LB && window.LB.initIcons) window.LB.initIcons(bubble);

      return bubble;
    }

    isAtBottom() {
      const el = this._scrollEl;
      return (el.scrollHeight - el.scrollTop - el.clientHeight) <= this._atBottomThreshold;
    }

    _checkScroll() {
      const atBottom = this.isAtBottom();
      const prev = this._wasAtBottom;
      this._wasAtBottom = atBottom;
      this.el.classList.toggle('lb-thread--has-jump', !atBottom);
      if (atBottom && !prev) {
        this.el.dispatchEvent(new CustomEvent('lb-thread-bottom-reached', { bubbles: true }));
      }
    }

    scrollToBottom(behavior) {
      const b = behavior || 'smooth';
      this._scrollEl.scrollTo({ top: this._scrollEl.scrollHeight, behavior: b });
    }

    appendBubble(opts) {
      opts = opts || {};
      const role = ['user', 'assistant', 'system'].indexOf(opts.role) >= 0 ? opts.role : 'assistant';
      const state = ['done', 'streaming', 'error', 'edited'].indexOf(opts.state) >= 0 ? opts.state : 'done';
      const isSystem = role === 'system';
      const sender = opts.sender || '';
      const timestamp = opts.timestamp || '';

      const bubble = document.createElement('div');
      bubble.className = 'lb-bubble lb-bubble--' + role;
      bubble.setAttribute('data-lb-bubble', '');
      bubble.dataset.state = state;
      // Branch path: new bubbles inherit the active branch so they
      // appear in the currently-selected conversation tree.
      bubble.dataset.branchPath = this._activeBranch;

      let html = '';
      if (!isSystem) {
        html += '<div class="lb-bubble__avatar">' + (opts.avatarHtml || '') + '</div>';
      }
      html += '<div class="lb-bubble__content">';
      if (!isSystem && (sender || timestamp)) {
        html += '<div class="lb-bubble__header">';
        if (sender) html += '<span class="lb-bubble__sender">' + escapeHtml(sender) + '</span>';
        if (timestamp) html += '<span class="lb-bubble__timestamp">' + escapeHtml(timestamp) + '</span>';
        html += '</div>';
      }
      // Body — bodyHtml wins over body if both are passed.
      html += '<div class="lb-bubble__body">';
      if (opts.bodyHtml != null) html += String(opts.bodyHtml);
      else if (opts.body != null) html += escapeHtml(opts.body);
      html += '</div>';
      // Footer — explicit footerHtml wins; otherwise inject role-
      // appropriate default actions so consumers get Copy/Like/etc
      // for free. Set footerHtml: '' (empty string) to suppress.
      if (!isSystem) {
        const footerInner = (opts.footerHtml != null) ? opts.footerHtml : defaultActionsHtml(role);
        html += '<div class="lb-bubble__footer">' + footerInner + '</div>';
      }
      html += '</div>';
      bubble.innerHTML = html;

      // Insert before the jump button so it stays the last child.
      if (this._jumpBtn && this._jumpBtn.parentNode === this.el) {
        this.el.insertBefore(bubble, this._jumpBtn);
      } else {
        this.el.appendChild(bubble);
      }

      // Wire the new bubble — register API won't fire on the freshly
      // detached node, so instantiate directly.
      if (!bubble._lbBubble) bubble._lbBubble = new Bubble(bubble);

      // Ask icon system to swap any data-lb-icon placeholders we passed
      // through avatarHtml / footerHtml.
      if (window.LB && window.LB.initIcons) window.LB.initIcons(bubble);

      this.el.dispatchEvent(new CustomEvent('lb-thread-append', {
        bubbles: true, detail: { bubble, role, state },
      }));

      return bubble;
    }

    getBubbles() {
      return Array.from(this.el.querySelectorAll(':scope > [data-lb-bubble]'));
    }

    clear() {
      this.getBubbles().forEach((b) => b.remove());
    }
  }

  // ─── COMPOSER ──────────────────────────────────────────────
  // Input dock for sending chat messages. Slice 2 minimum:
  //   - multi-line textarea that autogrows up to a cap
  //   - send button (primary, icon-only)
  //   - stop button (visible only when state = 'streaming')
  //   - Cmd/Ctrl + Enter submits; plain Enter inserts newline
  //   - emits lb-composer-submit with detail: { value }
  //   - emits lb-composer-stop while in streaming state
  //
  // Slice 4 will extend this with: leading + menu (attachments),
  // tool toggle chips, model selector, slash command palette, mic.
  //
  // Markup contract (minimum):
  //   <div class="lb-composer" data-lb-composer>
  //     <div class="lb-composer__row">
  //       <textarea data-lb-composer-input placeholder="..."></textarea>
  //       <div class="lb-composer__actions">
  //         <button data-lb-composer-send>...</button>
  //         <button data-lb-composer-stop hidden>...</button>
  //       </div>
  //     </div>
  //   </div>
  //
  // Public API at el._lbComposer:
  //   getValue() / setValue(t) / clear() / focus()
  //   getState() / setState(s)   's' = 'idle' | 'sending' | 'streaming'

  const COMPOSER_STATES = ['idle', 'sending', 'streaming'];

  class Composer {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-composer');
      this._input = el.querySelector('[data-lb-composer-input]') || el.querySelector('textarea');
      // Composer textarea is the primary input — give it an aria-label
      // if the consumer didn't supply one, so screen readers announce
      // "Message, edit text" instead of just "edit text".
      if (this._input && !this._input.hasAttribute('aria-label') && !this._input.hasAttribute('aria-labelledby')) {
        this._input.setAttribute('aria-label', 'Message');
      }
      this._sendBtn = el.querySelector('[data-lb-composer-send]');
      this._stopBtn = el.querySelector('[data-lb-composer-stop]');
      this._chipsEl = el.querySelector('[data-lb-composer-chips]');
      this._toolsEl = el.querySelector('[data-lb-composer-tools]');
      this._modelEl = el.querySelector('[data-lb-composer-model]');
      this._attachBtn = el.querySelector('[data-lb-composer-attach]');
      this._micBtn = el.querySelector('[data-lb-composer-mic]');
      this.state = 'idle';

      // Internal stores keyed by id
      this._chips = new Map();   // id → { id, label, kind, data, removable, el }
      this._tools = new Map();   // id → { id, label, icon, active, el }
      this._models = [];
      this._currentModel = null;
      this._commands = new Map(); // id → { id, label, hint, icon, run, keywords }
      this._chipCounter = 0;

      // Slash palette state
      this._slashOpen = false;
      this._slashEl = null;
      this._slashIndex = 0;

      if (!this._input) return;

      this._input.addEventListener('input', () => {
        this._autoGrow();
        this._maybeOpenSlash();
        this._updateSlashFilter();
      });
      this._input.addEventListener('keydown', (e) => {
        if (this._slashOpen) {
          if (e.key === 'ArrowDown') { e.preventDefault(); this._slashMove(1); return; }
          if (e.key === 'ArrowUp')   { e.preventDefault(); this._slashMove(-1); return; }
          if (e.key === 'Enter')     { e.preventDefault(); this._slashSelect(); return; }
          if (e.key === 'Escape')    { e.preventDefault(); this._closeSlash(); return; }
        }
        // Enter submits (the AI-chat convention); Shift+Enter inserts a
        // newline. Cmd/Ctrl+Enter also submits (muscle memory). The
        // isComposing guard keeps IME (CJK) composition commits from
        // sending mid-word.
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this._submit();
        }
      });
      this._input.addEventListener('blur', () => {
        // Defer close so click on a palette item still registers.
        setTimeout(() => this._closeSlash(), 120);
      });

      if (this._sendBtn) this._sendBtn.addEventListener('click', () => this._submit());
      if (this._stopBtn) this._stopBtn.addEventListener('click', () => this._stop());
      if (this._attachBtn) this._attachBtn.addEventListener('click', () => this._openFilePicker());
      if (this._micBtn) this._micBtn.addEventListener('click', () => {
        this.el.dispatchEvent(new CustomEvent('lb-composer-voice-request', {
          bubbles: true, detail: { composer: this },
        }));
      });

      // Drag-and-drop attachments — files + folders. Use getAsEntry()
      // for folder support (webkit-prefixed but universally available).
      this._wireDragDrop();

      this._autoGrow();
      this._reflectState();
    }

    // ── Drag and drop ─────────────────────────────────────────
    _wireDragDrop() {
      const card = this.el;
      ['dragenter', 'dragover'].forEach((ev) => {
        card.addEventListener(ev, (e) => {
          if (!e.dataTransfer || !this._hasFiles(e.dataTransfer)) return;
          e.preventDefault();
          card.classList.add('lb-composer--dragover');
        });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        card.addEventListener(ev, (e) => {
          // Only clear on actual leave of the card (not when
          // crossing into a child) — fires too eagerly otherwise.
          if (ev === 'dragleave' && card.contains(e.relatedTarget)) return;
          card.classList.remove('lb-composer--dragover');
        });
      });
      card.addEventListener('drop', (e) => {
        if (!e.dataTransfer || !this._hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        this._handleDataTransfer(e.dataTransfer);
      });
    }

    _hasFiles(dt) {
      const types = Array.from(dt.types || []);
      return types.indexOf('Files') >= 0;
    }

    _handleDataTransfer(dt) {
      const items = Array.from(dt.items || []);
      const results = [];
      const fileItems = items.filter((it) => it.kind === 'file');
      if (!fileItems.length) {
        // Fallback: use dt.files (no folder support)
        Array.from(dt.files || []).forEach((file) => {
          results.push({ kind: 'file', name: file.name, size: file.size, file });
        });
        this._emitAttach(results);
        results.forEach((r) => this.addChip({
          label: r.name,
          kind: r.kind,
          data: r,
        }));
        return;
      }
      // With items API we can detect folders via webkitGetAsEntry().
      fileItems.forEach((it) => {
        const entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
        if (entry && entry.isDirectory) {
          results.push({ kind: 'folder', name: entry.name, entry });
        } else {
          const file = it.getAsFile();
          if (file) results.push({ kind: 'file', name: file.name, size: file.size, file });
        }
      });
      this._emitAttach(results);
      results.forEach((r) => this.addChip({
        label: r.kind === 'folder' ? r.name + '/' : r.name,
        kind: r.kind,
        data: r,
      }));
    }

    _emitAttach(items) {
      this.el.dispatchEvent(new CustomEvent('lb-composer-attach', {
        bubbles: true, detail: { items, composer: this },
      }));
    }

    _openFilePicker() {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';
      this.el.appendChild(input);
      input.addEventListener('change', () => {
        const results = Array.from(input.files || []).map((file) => ({
          kind: 'file', name: file.name, size: file.size, file,
        }));
        if (results.length) {
          this._emitAttach(results);
          results.forEach((r) => this.addChip({ label: r.name, kind: r.kind, data: r }));
        }
        input.remove();
      });
      input.click();
    }

    // ── Context chips ─────────────────────────────────────────
    addChip(opts) {
      if (!this._chipsEl) return null;
      opts = opts || {};
      const id = opts.id || ('chip-' + (++this._chipCounter));
      const removable = opts.removable !== false;
      const kind = opts.kind || 'file';
      const label = opts.label || '';
      const data = opts.data || null;
      const chipEl = document.createElement('span');
      chipEl.className = 'lb-composer-chip lb-composer-chip--' + kind;
      chipEl.dataset.chipId = id;
      let html = '';
      if (kind === 'file') html += '<span class="lb-composer-chip__icon" data-lb-icon="file"></span>';
      else if (kind === 'folder') html += '<span class="lb-composer-chip__icon" data-lb-icon="folder"></span>';
      else if (kind === 'image') html += '<span class="lb-composer-chip__icon" data-lb-icon="image"></span>';
      else html += '<span class="lb-composer-chip__icon" data-lb-icon="tag"></span>';
      html += '<span class="lb-composer-chip__label">' + escapeHtml(label) + '</span>';
      if (removable) html += '<button type="button" class="lb-composer-chip__remove" data-lb-composer-chip-remove aria-label="Remove ' + escapeHtml(label) + '"><span data-lb-icon="x" aria-hidden="true"></span></button>';
      chipEl.innerHTML = html;
      this._chipsEl.appendChild(chipEl);
      if (window.LB && window.LB.initIcons) window.LB.initIcons(chipEl);
      if (removable) {
        chipEl.querySelector('[data-lb-composer-chip-remove]').addEventListener('click', () => {
          this.removeChip(id);
        });
      }
      this._chips.set(id, { id, label, kind, data, removable, el: chipEl });
      this._reflectChipsState();
      return chipEl;
    }

    removeChip(id) {
      const c = this._chips.get(id);
      if (!c) return;
      c.el.remove();
      this._chips.delete(id);
      this._reflectChipsState();
      this.el.dispatchEvent(new CustomEvent('lb-composer-chip-remove', {
        bubbles: true, detail: { id, chip: c },
      }));
    }

    getChips() {
      return Array.from(this._chips.values()).map((c) => ({
        id: c.id, label: c.label, kind: c.kind, data: c.data,
      }));
    }

    clearChips() {
      Array.from(this._chips.keys()).forEach((id) => this.removeChip(id));
    }

    _reflectChipsState() {
      if (!this._chipsEl) return;
      this._chipsEl.classList.toggle('lb-composer__chips--empty', this._chips.size === 0);
    }

    // ── Tool toggles ──────────────────────────────────────────
    setTools(tools) {
      if (!this._toolsEl) return;
      this._toolsEl.innerHTML = '';
      this._tools.clear();
      (tools || []).forEach((t) => this.addTool(t));
    }

    addTool(opts) {
      if (!this._toolsEl) return null;
      opts = opts || {};
      const id = opts.id;
      if (!id) return null;
      const label = opts.label || id;
      const icon = opts.icon || null;
      const active = !!opts.active;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lb-composer-tool';
      btn.dataset.toolId = id;
      btn.setAttribute('aria-pressed', String(active));
      let html = '';
      if (icon) html += '<span class="lb-composer-tool__icon" data-lb-icon="' + icon + '" aria-hidden="true"></span>';
      html += '<span class="lb-composer-tool__label">' + escapeHtml(label) + '</span>';
      btn.innerHTML = html;
      this._toolsEl.appendChild(btn);
      if (window.LB && window.LB.initIcons) window.LB.initIcons(btn);
      btn.addEventListener('click', () => this.toggleTool(id));
      this._tools.set(id, { id, label, icon, active, el: btn });
      return btn;
    }

    toggleTool(id) {
      const t = this._tools.get(id);
      if (!t) return;
      t.active = !t.active;
      t.el.setAttribute('aria-pressed', String(t.active));
      t.el.classList.toggle('lb-composer-tool--active', t.active);
      this.el.dispatchEvent(new CustomEvent('lb-composer-tool-toggle', {
        bubbles: true, detail: { id, active: t.active },
      }));
    }

    getTools() {
      return Array.from(this._tools.values())
        .filter((t) => t.active)
        .map((t) => t.id);
    }

    // ── Model picker ──────────────────────────────────────────
    setModels(models, defaultId) {
      if (!this._modelEl) return;
      this._models = (models || []).slice();
      this._currentModel = defaultId || (this._models[0] && this._models[0].id) || null;
      this._renderModelPicker();
    }

    setModel(id) {
      if (!this._models.find((m) => m.id === id)) return;
      this._currentModel = id;
      this._renderModelPicker();
      this.el.dispatchEvent(new CustomEvent('lb-composer-model-change', {
        bubbles: true, detail: { id },
      }));
    }

    getModel() { return this._currentModel; }

    _renderModelPicker() {
      if (!this._modelEl) return;
      this._modelEl.innerHTML = '';
      if (!this._models.length) return;
      const current = this._models.find((m) => m.id === this._currentModel) || this._models[0];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lb-composer-model';
      btn.innerHTML = ''
        + '<span class="lb-composer-model__label">' + escapeHtml(current.label) + '</span>'
        + '<span class="lb-composer-model__chevron" data-lb-icon="chevron-down" aria-hidden="true"></span>';
      // Build a tiny inline dropdown using existing patterns (no
      // dependency on LB.Dropdown for Slice 4 minimum — popover-style
      // menu inline below the button).
      const menu = document.createElement('div');
      menu.className = 'lb-composer-model__menu';
      menu.hidden = true;
      this._models.forEach((m) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lb-composer-model__item';
        if (m.id === current.id) item.classList.add('lb-composer-model__item--active');
        item.textContent = m.label;
        item.addEventListener('click', () => {
          this.setModel(m.id);
          menu.hidden = true;
        });
        menu.appendChild(item);
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      document.addEventListener('click', (e) => {
        if (!this._modelEl.contains(e.target)) menu.hidden = true;
      });
      this._modelEl.appendChild(btn);
      this._modelEl.appendChild(menu);
      if (window.LB && window.LB.initIcons) window.LB.initIcons(btn);
    }

    // ── Slash commands ────────────────────────────────────────
    registerCommand(opts) {
      if (!opts || !opts.id) return;
      this._commands.set(opts.id, {
        id: opts.id,
        label: opts.label || opts.id,
        hint: opts.hint || '',
        icon: opts.icon || null,
        run: typeof opts.run === 'function' ? opts.run : null,
        keywords: (opts.keywords || []).map((k) => String(k).toLowerCase()),
      });
    }

    unregisterCommand(id) { this._commands.delete(id); }

    _slashTriggerActive() {
      // Slash palette opens when the textarea value starts with "/"
      // (we keep it simple — at-start only for Slice 4; mid-input
      // triggers can come later).
      const v = this._input.value || '';
      return v.length > 0 && v.charAt(0) === '/';
    }

    _maybeOpenSlash() {
      if (this._commands.size === 0) return;
      if (this._slashTriggerActive()) {
        if (!this._slashOpen) this._openSlash();
      } else {
        if (this._slashOpen) this._closeSlash();
      }
    }

    _openSlash() {
      if (this._slashOpen) return;
      this._slashOpen = true;
      this._slashIndex = 0;
      const palette = document.createElement('div');
      palette.className = 'lb-composer-slash';
      palette.setAttribute('role', 'listbox');
      this.el.appendChild(palette);
      this._slashEl = palette;
      this._renderSlash();
    }

    _closeSlash() {
      if (!this._slashOpen) return;
      this._slashOpen = false;
      if (this._slashEl) this._slashEl.remove();
      this._slashEl = null;
    }

    _filteredCommands() {
      const v = (this._input.value || '').slice(1).toLowerCase(); // strip leading slash
      const all = Array.from(this._commands.values());
      if (!v) return all;
      return all.filter((c) => {
        if (c.id.toLowerCase().indexOf(v) >= 0) return true;
        if (c.label.toLowerCase().indexOf(v) >= 0) return true;
        if (c.keywords.some((k) => k.indexOf(v) >= 0)) return true;
        return false;
      });
    }

    _renderSlash() {
      if (!this._slashEl) return;
      const cmds = this._filteredCommands();
      if (cmds.length === 0) {
        this._slashEl.innerHTML = '<div class="lb-composer-slash__empty">No commands match.</div>';
        return;
      }
      if (this._slashIndex >= cmds.length) this._slashIndex = cmds.length - 1;
      if (this._slashIndex < 0) this._slashIndex = 0;
      this._slashEl.innerHTML = '';
      cmds.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'lb-composer-slash__item';
        if (idx === this._slashIndex) item.classList.add('lb-composer-slash__item--active');
        item.setAttribute('role', 'option');
        item.dataset.cmdId = c.id;
        let html = '';
        if (c.icon) html += '<span class="lb-composer-slash__icon" data-lb-icon="' + c.icon + '" aria-hidden="true"></span>';
        html += '<span class="lb-composer-slash__id">/' + escapeHtml(c.id) + '</span>';
        html += '<span class="lb-composer-slash__label">' + escapeHtml(c.label) + '</span>';
        if (c.hint) html += '<span class="lb-composer-slash__hint">' + escapeHtml(c.hint) + '</span>';
        item.innerHTML = html;
        item.addEventListener('mousedown', (e) => {
          // mousedown (not click) so it fires before blur closes the palette
          e.preventDefault();
          this._slashIndex = idx;
          this._slashSelect();
        });
        this._slashEl.appendChild(item);
      });
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this._slashEl);
    }

    _updateSlashFilter() {
      if (this._slashOpen) this._renderSlash();
    }

    _slashMove(delta) {
      const cmds = this._filteredCommands();
      if (!cmds.length) return;
      this._slashIndex = (this._slashIndex + delta + cmds.length) % cmds.length;
      this._renderSlash();
    }

    _slashSelect() {
      const cmds = this._filteredCommands();
      if (!cmds.length) { this._closeSlash(); return; }
      const cmd = cmds[this._slashIndex];
      this._closeSlash();
      // Run callback if provided; otherwise just clear the slash from
      // the input so the user can keep typing the command's arg.
      this._input.value = '';
      this._autoGrow();
      this.el.dispatchEvent(new CustomEvent('lb-composer-command', {
        bubbles: true, detail: { id: cmd.id, command: cmd },
      }));
      if (cmd.run) {
        try { cmd.run({ composer: this, command: cmd }); } catch (err) { console.error(err); }
      }
      this._input.focus();
    }

    _autoGrow() {
      const t = this._input;
      if (!t) return;
      // Reset height to scrollHeight grows AND shrinks correctly.
      t.style.height = 'auto';
      const cap = 240; // ~10 lines at default body-m line height
      t.style.height = Math.min(t.scrollHeight, cap) + 'px';
    }

    _submit() {
      if (this.state !== 'idle') return;
      const value = (this._input.value || '').trim();
      // Allow submit with no text if there ARE chips (e.g., "summarise
      // this file"). Otherwise require text.
      if (!value && this._chips.size === 0) return;
      this.el.dispatchEvent(new CustomEvent('lb-composer-submit', {
        bubbles: true, detail: {
          value,
          chips: this.getChips(),
          tools: this.getTools(),
          model: this.getModel(),
        },
      }));
      // Clear after dispatch — the universal chat convention (the value
      // travels in the event detail; chips are kept for the consumer).
      this.clear();
    }

    _stop() {
      this.el.dispatchEvent(new CustomEvent('lb-composer-stop', { bubbles: true }));
    }

    _reflectState() {
      this.el.dataset.state = this.state;
      // Send/stop visibility is controlled by [data-state] selectors
      // in CSS, but also toggle the `hidden` attribute so screen
      // readers and keyboard tab order behave correctly.
      if (this._sendBtn) {
        const showSend = this.state === 'idle' || this.state === 'sending';
        this._sendBtn.hidden = !showSend;
        this._sendBtn.disabled = this.state === 'sending';
      }
      if (this._stopBtn) {
        this._stopBtn.hidden = this.state !== 'streaming';
      }
    }

    getValue() { return this._input ? this._input.value : ''; }
    setValue(v) {
      if (!this._input) return;
      this._input.value = String(v == null ? '' : v);
      this._autoGrow();
    }
    clear() { this.setValue(''); }
    focus() { if (this._input) this._input.focus(); }

    getState() { return this.state; }
    setState(next) {
      if (COMPOSER_STATES.indexOf(next) < 0) {
        console.warn('[lb-composer] invalid state:', next);
        return;
      }
      if (this.state === next) return;
      const prev = this.state;
      this.state = next;
      this._reflectState();
      this.el.dispatchEvent(new CustomEvent('lb-composer-state-change', {
        bubbles: true, detail: { state: next, prev },
      }));
    }
  }

  // ─── TOOL CALL ─────────────────────────────────────────────
  // Collapsible card showing one tool invocation by the assistant.
  // Tool-call display must support BOTH a compact
  // summary header (icon + verb + one-line) AND an expanded view
  // with both the consumer's formatted inputs/outputs AND a "raw"
  // peek showing the JSON the tool received/returned. Risky ops
  // (shell, file write, network) gate behind an explicit confirm.
  //
  // Markup contract (minimum):
  //   <div class="lb-tool-call" data-lb-tool-call>
  //     <!-- everything else can be programmatically populated, OR -->
  //     <!-- the consumer can provide static markup -->
  //   </div>
  //
  // Public API at el._lbToolCall:
  //   setData({                       declarative bulk-state
  //     icon, name, summary,
  //     status: 'pending'|'running'|'success'|'error'|'awaiting-confirm',
  //     inputHtml, outputHtml,        formatted bodies
  //     rawInput, rawOutput,          for the raw I/O peek tab
  //     risky?: boolean,              show confirm gate
  //   })
  //   appendOutputHtml(html)          imperative streaming append
  //   setStatus(s)
  //   expand() / collapse() / toggle()
  //   isExpanded()
  //
  // Events:
  //   lb-tool-call-toggle       {expanded}
  //   lb-tool-call-confirm      consumer should proceed with the
  //                             gated operation
  //   lb-tool-call-cancel       consumer should abort

  const TOOL_STATUSES = ['pending', 'running', 'success', 'error', 'awaiting-confirm'];

  // Status → Badge configuration. Maps each tool-call lifecycle state
  // to the existing lb-badge variant + an appropriate Lucide icon, so
  // status pills inherit the system's a11y treatment (semantic colour
  // tokens, icon labels, screen-reader-friendly markup) instead of
  // bespoke styling.
  const TOOL_STATUS_BADGE = {
    pending:            { variant: 'default', icon: 'clock',                 label: 'Pending' },
    running:            { variant: 'default', icon: 'circle-dot',            label: 'Running' },
    success:            { variant: 'success', icon: 'circle-check-filled',   label: 'Done' },
    error:              { variant: 'danger',  icon: 'x-circle-filled',       label: 'Failed' },
    'awaiting-confirm': { variant: 'warning', icon: 'alert-triangle-filled', label: 'Awaiting confirm' },
  };

  class ToolCall {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-tool-call');
      this._data = {};
      // If the element is empty, build the default structure.
      if (!el.querySelector('.lb-tool-call__head')) {
        this._renderShell();
      }
      this._headEl = el.querySelector('.lb-tool-call__head');
      this._bodyEl = el.querySelector('.lb-tool-call__body');
      this._tabsEl = el.querySelector('.lb-tool-call__tabs');
      this._formattedEl = el.querySelector('.lb-tool-call__formatted');
      this._rawEl = el.querySelector('.lb-tool-call__raw');
      // Status pill: reuses the lb-badge primitive (small size + status
      // variant + icon slot) so it inherits the system's a11y/colour
      // treatment automatically. We look it up by data attribute, not
      // by class, since the class set is now lb-badge-derived.
      this._statusEl = el.querySelector('[data-lb-tool-call-status]');
      this._confirmEl = el.querySelector('.lb-tool-call__confirm');
      this._expanded = el.dataset.expanded === 'true';
      this._activeTab = 'formatted';
      this._reflectExpanded();
      this._wire();
    }

    _renderShell() {
      this.el.innerHTML = ''
        + '<button type="button" class="lb-tool-call__head" data-lb-tool-call-toggle>'
        +   '<span class="lb-tool-call__icon" data-lb-tool-call-icon></span>'
        +   '<span class="lb-tool-call__summary">'
        +     '<span class="lb-tool-call__name" data-lb-tool-call-name></span>'
        +     '<span class="lb-tool-call__verb" data-lb-tool-call-verb></span>'
        +   '</span>'
        +   '<span class="lb-badge lb-badge--small" data-lb-tool-call-status></span>'
        +   '<span class="lb-tool-call__chevron" data-lb-icon="chevron-down" aria-hidden="true"></span>'
        + '</button>'
        + '<div class="lb-tool-call__body">'
        +   '<div class="lb-tool-call__tabs" role="tablist">'
        +     '<button type="button" class="lb-tool-call__tab lb-tool-call__tab--active" data-lb-tool-call-tab="formatted" role="tab">Formatted</button>'
        +     '<button type="button" class="lb-tool-call__tab" data-lb-tool-call-tab="raw" role="tab">Raw I/O</button>'
        +   '</div>'
        +   '<div class="lb-tool-call__formatted" role="tabpanel"></div>'
        +   '<div class="lb-tool-call__raw" role="tabpanel" hidden></div>'
        +   '<div class="lb-tool-call__confirm" hidden>'
        +     '<p class="lb-tool-call__confirm-msg">This action may make irreversible changes. Continue?</p>'
        +     '<div class="lb-tool-call__confirm-actions">'
        +       '<button type="button" class="lb-btn lb-btn--small lb-btn--secondary" data-lb-tool-call-cancel>Cancel</button>'
        +       '<button type="button" class="lb-btn lb-btn--small lb-btn--primary" data-lb-tool-call-confirm>Continue</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';
    }

    _wire() {
      const toggle = this.el.querySelector('[data-lb-tool-call-toggle]');
      if (toggle) toggle.addEventListener('click', () => this.toggle());
      this.el.querySelectorAll('[data-lb-tool-call-tab]').forEach((tab) => {
        tab.addEventListener('click', () => this._setTab(tab.dataset.lbToolCallTab));
      });
      const confirmBtn = this.el.querySelector('[data-lb-tool-call-confirm]');
      const cancelBtn = this.el.querySelector('[data-lb-tool-call-cancel]');
      if (confirmBtn) confirmBtn.addEventListener('click', () => {
        this._hideConfirm();
        this.el.dispatchEvent(new CustomEvent('lb-tool-call-confirm', {
          bubbles: true, detail: { toolCall: this },
        }));
      });
      if (cancelBtn) cancelBtn.addEventListener('click', () => {
        this._hideConfirm();
        this.setStatus('error');
        this.el.dispatchEvent(new CustomEvent('lb-tool-call-cancel', {
          bubbles: true, detail: { toolCall: this },
        }));
      });
    }

    setData(opts) {
      opts = opts || {};
      const merged = Object.assign({}, this._data, opts);
      this._data = merged;
      // Icon (slot is a span that initIcons turns into an SVG)
      const iconEl = this.el.querySelector('[data-lb-tool-call-icon]');
      if (iconEl && opts.icon != null) {
        iconEl.setAttribute('data-lb-icon', opts.icon);
        if (window.LB && window.LB.initIcons) window.LB.initIcons(iconEl.parentNode);
      }
      // Name (the tool's identifier — file_read, web_search, etc.)
      const nameEl = this.el.querySelector('[data-lb-tool-call-name]');
      if (nameEl && opts.name != null) nameEl.textContent = opts.name;
      // Verb (one-line summary — "Read auth.ts", "Searched the web")
      const verbEl = this.el.querySelector('[data-lb-tool-call-verb]');
      if (verbEl && opts.summary != null) verbEl.textContent = opts.summary;
      // Formatted body
      if (opts.inputHtml != null || opts.outputHtml != null) {
        const f = this._formattedEl;
        if (f) {
          f.innerHTML = ''
            + (opts.inputHtml ? '<div class="lb-tool-call__section"><div class="lb-tool-call__section-label">Input</div><div class="lb-tool-call__section-body">' + opts.inputHtml + '</div></div>' : '')
            + (opts.outputHtml ? '<div class="lb-tool-call__section"><div class="lb-tool-call__section-label">Output</div><div class="lb-tool-call__section-body">' + opts.outputHtml + '</div></div>' : '');
        }
      }
      // Raw I/O
      if (opts.rawInput != null || opts.rawOutput != null) {
        const r = this._rawEl;
        if (r) {
          const ri = opts.rawInput != null ? opts.rawInput : merged.rawInput;
          const ro = opts.rawOutput != null ? opts.rawOutput : merged.rawOutput;
          r.innerHTML = ''
            + (ri != null ? '<div class="lb-tool-call__section"><div class="lb-tool-call__section-label">Raw input</div><pre class="lb-tool-call__raw-block">' + escapeHtml(typeof ri === 'string' ? ri : JSON.stringify(ri, null, 2)) + '</pre></div>' : '')
            + (ro != null ? '<div class="lb-tool-call__section"><div class="lb-tool-call__section-label">Raw output</div><pre class="lb-tool-call__raw-block">' + escapeHtml(typeof ro === 'string' ? ro : JSON.stringify(ro, null, 2)) + '</pre></div>' : '');
        }
      }
      // Status
      if (opts.status != null) this.setStatus(opts.status);
      // Risky → show confirm gate
      if (opts.risky === true) this._showConfirm();
      else if (opts.risky === false) this._hideConfirm();
    }

    appendOutputHtml(html) {
      const f = this._formattedEl;
      if (!f) return;
      let outputSection = f.querySelector('.lb-tool-call__section:last-child .lb-tool-call__section-body');
      if (!outputSection) {
        f.insertAdjacentHTML('beforeend', '<div class="lb-tool-call__section"><div class="lb-tool-call__section-label">Output</div><div class="lb-tool-call__section-body"></div></div>');
        outputSection = f.querySelector('.lb-tool-call__section:last-child .lb-tool-call__section-body');
      }
      outputSection.insertAdjacentHTML('beforeend', String(html));
    }

    setStatus(s) {
      if (TOOL_STATUSES.indexOf(s) < 0) return;
      this.el.dataset.status = s;
      if (!this._statusEl) return;
      const cfg = TOOL_STATUS_BADGE[s] || TOOL_STATUS_BADGE.pending;
      // Rebuild the badge: class set for the variant, icon slot for
      // the matching glyph, label text after. We replace the entire
      // class list (preserving data-* attrs and the element ref) so
      // switching variants doesn't accumulate stale variant classes.
      this._statusEl.className = 'lb-badge lb-badge--small lb-badge--' + cfg.variant;
      this._statusEl.innerHTML = ''
        + '<span class="lb-badge__icon" data-lb-icon="' + cfg.icon + '" aria-hidden="true"></span>'
        + escapeHtml(cfg.label);
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this._statusEl);
    }

    _setTab(name) {
      if (name !== 'formatted' && name !== 'raw') return;
      this._activeTab = name;
      this.el.querySelectorAll('[data-lb-tool-call-tab]').forEach((t) => {
        const active = t.dataset.lbToolCallTab === name;
        t.classList.toggle('lb-tool-call__tab--active', active);
      });
      if (this._formattedEl) this._formattedEl.hidden = name !== 'formatted';
      if (this._rawEl) this._rawEl.hidden = name !== 'raw';
    }

    _showConfirm() {
      if (this._confirmEl) this._confirmEl.hidden = false;
      this.setStatus('awaiting-confirm');
      // Auto-expand so the user sees the gate.
      this.expand();
    }

    _hideConfirm() {
      if (this._confirmEl) this._confirmEl.hidden = true;
    }

    expand() { if (!this._expanded) this.toggle(); }
    collapse() { if (this._expanded) this.toggle(); }
    toggle() {
      this._expanded = !this._expanded;
      this._reflectExpanded();
      this.el.dispatchEvent(new CustomEvent('lb-tool-call-toggle', {
        bubbles: true, detail: { expanded: this._expanded },
      }));
    }
    isExpanded() { return this._expanded; }

    _reflectExpanded() {
      this.el.dataset.expanded = String(this._expanded);
      const toggle = this.el.querySelector('[data-lb-tool-call-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', String(this._expanded));
    }
  }

  // ─── CONV LIST ─────────────────────────────────────────────
  // Sidebar conversation list with chronological date grouping
  // (Today / Yesterday / Previous 7 Days / Previous 30 Days /
  // Month YYYY), pinning (pinned section at top), color tags
  // (a left-edge stripe), per-row hover kebab actions, and a
  // search filter input. Delivers forum-win #4 — the highest-
  // volume pain category in chat-product sidebar feedback.
  //
  // Conversation data shape:
  //   {
  //     id: 'conv-abc',          // stable identifier
  //     title: 'Quick refactor question',
  //     timestamp: 1717400000000, // unix ms (for date grouping +
  //                                 sort within group)
  //     pinned: false,
  //     colorTag: null,           // CSS color or token reference
  //     unread: 0,                // optional count for the unread pill
  //     searchText: '',           // optional body extract for fuzzy
  //                                 filter (titles always searched)
  //     active: false,            // current selection (server-of-truth
  //                                 in the consumer; set via setActive)
  //   }
  //
  // Markup contract:
  //   <div class="lb-conv-list" data-lb-conv-list>
  //     <!-- Optional search input row — auto-injected if missing -->
  //     <div class="lb-conv-list__search" data-lb-conv-list-search>
  //       <input type="search" placeholder="...">
  //     </div>
  //     <!-- Items get rendered into __items by setConvs / addConv -->
  //     <ul class="lb-conv-list__items" data-lb-conv-list-items></ul>
  //   </div>
  //
  // Public API at el._lbConvList:
  //   setConvs(array)             bulk replace + render
  //   addConv(opts)               append; returns id
  //   removeConv(id)
  //   updateConv(id, partial)     merge + re-render
  //   pinConv(id) / unpinConv(id)
  //   setActive(id) / getActive()
  //   setFilter(text)             text filter (case-insensitive,
  //                                 across title + searchText)
  //   getConvs() / getConv(id)
  //   clear()
  //
  // Events (CustomEvent, bubbles):
  //   lb-conv-select   {id, conv}
  //   lb-conv-action   {action, id, conv}    action ∈ rename | pin |
  //                                          unpin | share | move |
  //                                          delete | (consumer-defined)
  //   lb-conv-list-filter {filter}

  // ── Date grouping ──
  // Buckets conversations by recency. "Today" / "Yesterday" use the
  // user's local calendar; "Previous 7 Days" excludes today + yesterday;
  // "Previous 30 Days" excludes the 7-day window; older groups by
  // "Month YYYY". Pinned items always live in their own header at top.
  const MONTH_NAMES = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function bucketLabel(timestamp, now) {
    const todayStart = startOfDay(now);
    const dayMs = 86400000;
    const ts = startOfDay(timestamp);
    if (ts === todayStart) return 'Today';
    if (ts === todayStart - dayMs) return 'Yesterday';
    const diffDays = Math.floor((todayStart - ts) / dayMs);
    if (diffDays < 7) return 'Previous 7 Days';
    if (diffDays < 30) return 'Previous 30 Days';
    const d = new Date(timestamp);
    return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Order buckets get rendered in. Anything not in this list (month
  // labels) sort by their first appearance, which after the standard
  // buckets is always reverse-chronological — so older months stack
  // below in correct order.
  const BUCKET_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

  class ConvList {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-conv-list');
      this._convs = new Map();
      this._activeId = null;
      this._filter = '';
      this._convCounter = 0;

      // Search row — auto-inject if not present so the simplest
      // consumer markup (an empty <div data-lb-conv-list></div>) just
      // works. Consumer-supplied input is honoured if present.
      this._searchWrap = el.querySelector('[data-lb-conv-list-search]');
      if (!this._searchWrap) {
        this._searchWrap = document.createElement('div');
        this._searchWrap.className = 'lb-conv-list__search';
        this._searchWrap.setAttribute('data-lb-conv-list-search', '');
        // Reuses the canonical Input pattern: .lb-input-wrap + .lb-input
        // with a leading search-icon slot. Same styling as every other
        // search field in the system; no bespoke input class.
        this._searchWrap.innerHTML = ''
          + '<div class="lb-input-wrap">'
          +   '<span class="lb-input-wrap__icon lb-input-wrap__icon--start" data-lb-icon="search" aria-hidden="true"></span>'
          +   '<input type="search" class="lb-input lb-input--small lb-input--has-start" placeholder="Search conversations…" aria-label="Search conversations">'
          + '</div>';
        el.appendChild(this._searchWrap);
        if (window.LB && window.LB.initIcons) window.LB.initIcons(this._searchWrap);
      }
      this._searchInput = this._searchWrap.querySelector('input');
      if (this._searchInput) {
        this._searchInput.addEventListener('input', () => {
          this.setFilter(this._searchInput.value);
        });
      }

      // Items container — same auto-inject pattern. role=listbox + each
      // row role=option so AT announces "selected, 3 of 12" etc.
      this._itemsEl = el.querySelector('[data-lb-conv-list-items]');
      if (!this._itemsEl) {
        this._itemsEl = document.createElement('ul');
        this._itemsEl.className = 'lb-conv-list__items';
        this._itemsEl.setAttribute('data-lb-conv-list-items', '');
        el.appendChild(this._itemsEl);
      }
      // A conversation list is navigation, not a select widget: plain list
      // semantics, rows are list items whose TITLE is the row button
      // (aria-current marks the open conversation). This keeps the kebab a
      // legitimate sibling control instead of a nested-interactive violation.
      this._itemsEl.setAttribute('role', 'list');
      this._itemsEl.setAttribute('aria-label', el.getAttribute('aria-label') || 'Conversations');

      // Delegated click handling — item clicks select, kebab clicks
      // open the action menu. Hovering reveals the kebab via CSS;
      // we don't need any per-row listeners.
      this._itemsEl.addEventListener('click', (e) => {
        const kebab = e.target.closest('[data-lb-conv-kebab]');
        if (kebab) {
          e.stopPropagation();
          this._openKebabMenu(kebab);
          return;
        }
        const li = e.target.closest('[data-conv-id]');
        if (!li) return;
        const id = li.dataset.convId;
        this.setActive(id);
        const conv = this._convs.get(id);
        this.el.dispatchEvent(new CustomEvent('lb-conv-select', {
          bubbles: true, detail: { id, conv },
        }));
      });

      // Keyboard support on conversation rows.
      //   ArrowDown / ArrowUp  — roam between rows in the list
      //   Home / End           — first / last row
      //   Enter / Space        — select active row (same as click)
      //   ArrowDown on kebab   — open the kebab menu (AT-friendly)
      this._itemsEl.addEventListener('keydown', (e) => {
        const target = document.activeElement;
        const kebab = e.target.closest('[data-lb-conv-kebab]');
        if (kebab && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          this._openKebabMenu(kebab);
          return;
        }
        const li = target && target.closest && target.closest('[data-conv-id]');
        if (!li) return;
        const rows = Array.from(this._itemsEl.querySelectorAll('[data-conv-id]'));
        const cur = rows.indexOf(li);
        const focusRow = (row) => (row && (row.querySelector('.lb-conv__title') || row)).focus();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusRow(rows[Math.min(rows.length - 1, cur + 1)]);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusRow(rows[Math.max(0, cur - 1)]);
        } else if (e.key === 'Home') {
          e.preventDefault();
          focusRow(rows[0]);
        } else if (e.key === 'End') {
          e.preventDefault();
          focusRow(rows[rows.length - 1]);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        }
      });
    }

    // ── State mutations ──

    setConvs(arr) {
      this._convs.clear();
      (arr || []).forEach((c) => {
        if (!c || !c.id) return;
        this._convs.set(c.id, Object.assign({}, c));
      });
      this._render();
    }

    addConv(opts) {
      opts = opts || {};
      const id = opts.id || ('conv-' + (++this._convCounter));
      const conv = Object.assign({
        id, title: '', timestamp: Date.now(),
        pinned: false, colorTag: null, unread: 0, searchText: '',
      }, opts, { id });
      this._convs.set(id, conv);
      this._render();
      return id;
    }

    removeConv(id) {
      if (!this._convs.has(id)) return;
      this._convs.delete(id);
      if (this._activeId === id) this._activeId = null;
      this._render();
    }

    updateConv(id, partial) {
      const c = this._convs.get(id);
      if (!c) return;
      Object.assign(c, partial || {});
      this._render();
    }

    pinConv(id)   { this.updateConv(id, { pinned: true }); }
    unpinConv(id) { this.updateConv(id, { pinned: false }); }

    setActive(id) {
      this._activeId = id || null;
      // Update active-state class + aria-selected without a full re-render.
      this._itemsEl.querySelectorAll('[data-conv-id]').forEach((li) => {
        const isActive = li.dataset.convId === this._activeId;
        li.classList.toggle('lb-conv--active', isActive);
        const titleBtn = li.querySelector('.lb-conv__title');
        if (titleBtn) {
          if (isActive) titleBtn.setAttribute('aria-current', 'true');
          else titleBtn.removeAttribute('aria-current');
        }
      });
    }
    getActive() { return this._activeId; }

    setFilter(text) {
      const f = String(text || '').toLowerCase();
      if (this._filter === f) return;
      this._filter = f;
      if (this._searchInput && this._searchInput.value !== text) {
        this._searchInput.value = text;
      }
      this._render();
      this.el.dispatchEvent(new CustomEvent('lb-conv-list-filter', {
        bubbles: true, detail: { filter: this._filter },
      }));
    }

    getConvs() { return Array.from(this._convs.values()); }
    getConv(id) { return this._convs.get(id); }
    clear() { this.setConvs([]); }

    // ── Render ──

    _matchesFilter(c) {
      if (!this._filter) return true;
      const hay = ((c.title || '') + ' ' + (c.searchText || '')).toLowerCase();
      return hay.indexOf(this._filter) >= 0;
    }

    _render() {
      const all = Array.from(this._convs.values()).filter((c) => this._matchesFilter(c));
      // Sort newest first within each bucket.
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const pinned = all.filter((c) => c.pinned);
      const unpinned = all.filter((c) => !c.pinned);
      const now = Date.now();

      // Group unpinned by bucket label, preserving insertion order
      // (which is reverse-chronological after the sort above).
      const buckets = new Map();
      unpinned.forEach((c) => {
        const label = bucketLabel(c.timestamp || now, now);
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push(c);
      });

      const orderedLabels = [];
      BUCKET_ORDER.forEach((l) => { if (buckets.has(l)) orderedLabels.push(l); });
      Array.from(buckets.keys()).forEach((l) => {
        if (BUCKET_ORDER.indexOf(l) < 0) orderedLabels.push(l);
      });

      let html = '';
      if (pinned.length) {
        html += this._sectionHtml('Pinned', pinned);
      }
      orderedLabels.forEach((label) => {
        html += this._sectionHtml(label, buckets.get(label));
      });
      if (!html && this._filter) {
        html = '<li class="lb-conv-list__empty">No conversations match.</li>';
      } else if (!html) {
        html = '<li class="lb-conv-list__empty">No conversations yet.</li>';
      }
      this._itemsEl.innerHTML = html;
      // Wire icon swap for any kebabs we just rendered.
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this._itemsEl);
    }

    _sectionHtml(label, convs) {
      // Presentation role so the section header doesn't disrupt the
      // listbox option index. Kept aria-hidden too so AT skips it.
      let html = '<li class="lb-conv-list__group-header" role="presentation" aria-hidden="true">' + escapeHtml(label) + '</li>';
      convs.forEach((c) => { html += this._convHtml(c); });
      return html;
    }

    _convHtml(c) {
      const isActive = this._activeId === c.id;
      const stripe = c.colorTag
        ? ' style="--lb-conv-tag: ' + escapeHtml(c.colorTag) + '"'
        : '';
      const cls = 'lb-conv'
        + (isActive ? ' lb-conv--active' : '')
        + (c.colorTag ? ' lb-conv--tagged' : '')
        + (c.pinned ? ' lb-conv--pinned' : '');
      let html = '<li class="' + cls + '" data-conv-id="' + escapeHtml(c.id) + '"' + stripe + '>';
      if (c.pinned) html += '<span class="lb-conv__pin" data-lb-icon="pin" aria-hidden="true"></span><span class="lb-visually-hidden">Pinned</span>';
      html += '<button type="button" class="lb-conv__title"' + (isActive ? ' aria-current="true"' : '') + '>' + escapeHtml(c.title || 'Untitled') + '</button>';
      if (c.unread && c.unread > 0) {
        html += '<span class="lb-conv__unread">' + (c.unread > 99 ? '99+' : c.unread) + '</span>';
      }
      html += '<button type="button" class="lb-conv__kebab" data-lb-conv-kebab aria-label="More actions" aria-haspopup="menu" aria-expanded="false"><span data-lb-icon="more-horizontal" aria-hidden="true"></span></button>';
      html += '</li>';
      return html;
    }

    // ── Kebab menu ──
    // Lightweight popover (not the full LB.Menu) so this module stays
    // self-contained: a small div appended to body, absolute-positioned
    // to the kebab. Closed by outside-click. Action selection emits
    // lb-conv-action which the consumer handles.

    _openKebabMenu(kebab) {
      this._closeKebabMenu();
      const li = kebab.closest('[data-conv-id]');
      if (!li) return;
      const id = li.dataset.convId;
      const conv = this._convs.get(id);
      if (!conv) return;
      // Reuses the canonical Menu surface (.lb-menu) + List item classes
      // (.lb-list__item, .lb-list__item--danger) so styling matches every
      // other popover menu in the system. The trigger-based LB.Menu
      // pattern doesn't fit per-row dynamic anchoring, so positioning,
      // focus, and keyboard navigation are managed here, but the visual
      // surface is shared.
      const menu = document.createElement('ul');
      menu.className = 'lb-menu lb-conv-list__kebab-surface';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-orientation', 'vertical');
      menu.setAttribute('aria-label', 'Conversation actions');
      const pinLabel = conv.pinned ? 'Unpin' : 'Pin';
      const pinAction = conv.pinned ? 'unpin' : 'pin';
      menu.innerHTML = ''
        + '<li class="lb-list__item" role="menuitem" tabindex="-1" data-action="rename">Rename</li>'
        + '<li class="lb-list__item" role="menuitem" tabindex="-1" data-action="' + pinAction + '">' + pinLabel + '</li>'
        + '<li class="lb-list__item" role="menuitem" tabindex="-1" data-action="share">Share</li>'
        + '<li class="lb-list__item" role="menuitem" tabindex="-1" data-action="move">Move…</li>'
        + '<li class="lb-list__item lb-list__item--danger" role="menuitem" tabindex="-1" data-action="delete">Delete</li>';
      document.body.appendChild(menu);

      // Position: align top-right of menu to bottom-right of kebab.
      // Clamp to viewport so we never render off-screen on narrow
      // sidebars or when the sidebar drawer pushes the kebab close to
      // the right edge.
      const r = kebab.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = (r.bottom + 4) + 'px';
      menu.style.right = Math.max(4, window.innerWidth - r.right) + 'px';
      // After paint, if the menu would overflow the top of the viewport
      // we flip it above the kebab instead.
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.bottom > window.innerHeight - 4) {
        menu.style.top = Math.max(4, r.top - menuRect.height - 4) + 'px';
      }

      // Expose state to AT.
      kebab.setAttribute('aria-expanded', 'true');

      this._kebabMenuEl = menu;
      this._kebabMenuConvId = id;
      this._kebabTriggerEl = kebab;

      // ── Activation (click + Enter/Space via keydown) ──
      const activate = (action) => {
        this._closeKebabMenu();
        if (action === 'pin') this.pinConv(id);
        else if (action === 'unpin') this.unpinConv(id);
        else if (action === 'delete') this.removeConv(id);
        this.el.dispatchEvent(new CustomEvent('lb-conv-action', {
          bubbles: true, detail: { action, id, conv: this._convs.get(id) || conv },
        }));
      };
      menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action]');
        if (!item) return;
        activate(item.dataset.action);
      });

      // ── Keyboard navigation — Arrows / Home / End / Enter / Space /
      // Escape. Mirrors LB.Menu's behaviour so the kebab feels like
      // every other menu in the system. ──
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
      const focusItem = (i) => {
        const idx = (i + items.length) % items.length;
        items.forEach((it, j) => { it.tabIndex = j === idx ? 0 : -1; });
        items[idx].focus();
      };
      this._kebabKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this._closeKebabMenu();
          kebab.focus();
          return;
        }
        const cur = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(cur < 0 ? 0 : cur + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(cur < 0 ? items.length - 1 : cur - 1); }
        else if (e.key === 'Home')    { e.preventDefault(); focusItem(0); }
        else if (e.key === 'End')     { e.preventDefault(); focusItem(items.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ') {
          if (cur >= 0) {
            e.preventDefault();
            activate(items[cur].dataset.action);
          }
        } else if (e.key === 'Tab') {
          // Tabbing out closes the menu without consuming the event
          // so focus moves naturally to the next focusable element.
          this._closeKebabMenu();
        }
      };

      // ── Outside click closes ──
      this._kebabOutside = (e) => {
        if (!menu.contains(e.target) && !kebab.contains(e.target)) {
          this._closeKebabMenu();
        }
      };
      // Defer attaching listeners by one tick so the click that opened
      // us doesn't immediately fire outside-click.
      setTimeout(() => {
        document.addEventListener('click', this._kebabOutside);
        document.addEventListener('keydown', this._kebabKey);
      }, 0);

      // Move focus into the menu so screen readers announce it and
      // keyboard users can drive it. First item gets focus.
      if (items[0]) {
        items[0].tabIndex = 0;
        items[0].focus();
      }
    }

    _closeKebabMenu() {
      if (this._kebabMenuEl) this._kebabMenuEl.remove();
      this._kebabMenuEl = null;
      this._kebabMenuConvId = null;
      if (this._kebabTriggerEl) {
        this._kebabTriggerEl.setAttribute('aria-expanded', 'false');
        this._kebabTriggerEl = null;
      }
      if (this._kebabOutside) document.removeEventListener('click', this._kebabOutside);
      if (this._kebabKey) document.removeEventListener('keydown', this._kebabKey);
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Bubble = Bubble;
  LB.Thread = Thread;
  LB.Composer = Composer;
  LB.ToolCall = ToolCall;
  LB.ConvList = ConvList;
  LB.register('bubble', Bubble, '[data-lb-bubble]');
  LB.register('thread', Thread, '[data-lb-thread]');
  LB.register('composer', Composer, '[data-lb-composer]');
  LB.register('toolCall', ToolCall, '[data-lb-tool-call]');
  LB.register('convList', ConvList, '[data-lb-conv-list]');

  // ─── CONTEXT BUDGET BAR (re-homed from the retired ChatWorkspace) ──
  class ContextBudgetBar {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-context-budget-bar');
      this._used = 0;
      this._total = 0;
      this._labelText = null;

      this._labelEl = el.querySelector('[data-lb-context-budget-label]');
      this._trackEl = el.querySelector('[data-lb-context-budget-track]');
      this._fillEl  = el.querySelector('[data-lb-context-budget-fill]');
      if (!this._labelEl) {
        this._labelEl = document.createElement('span');
        this._labelEl.className = 'lb-context-budget-bar__label';
        this._labelEl.setAttribute('data-lb-context-budget-label', '');
        el.appendChild(this._labelEl);
      } else {
        this._labelEl.classList.add('lb-context-budget-bar__label');
      }
      if (!this._trackEl) {
        this._trackEl = document.createElement('div');
        this._trackEl.className = 'lb-context-budget-bar__track';
        this._trackEl.setAttribute('data-lb-context-budget-track', '');
        el.appendChild(this._trackEl);
      } else {
        this._trackEl.classList.add('lb-context-budget-bar__track');
      }
      if (!this._fillEl) {
        this._fillEl = document.createElement('div');
        this._fillEl.className = 'lb-context-budget-bar__fill';
        this._fillEl.setAttribute('data-lb-context-budget-fill', '');
        this._trackEl.appendChild(this._fillEl);
      } else {
        this._fillEl.classList.add('lb-context-budget-bar__fill');
      }

      // Accessibility
      this.el.setAttribute('role', 'progressbar');
      if (!this.el.hasAttribute('aria-label') && !this.el.hasAttribute('aria-labelledby')) {
        this.el.setAttribute('aria-label', 'Context budget');
      }
      this.el.setAttribute('aria-valuemin', '0');
      this.el.setAttribute('aria-valuemax', '100');

      // Read initial budget from data attributes if present.
      const u = parseFloat(el.dataset.lbUsed);
      const t = parseFloat(el.dataset.lbTotal);
      const lbl = el.dataset.lbLabel;
      if (Number.isFinite(u)) this._used = u;
      if (Number.isFinite(t)) this._total = t;
      if (lbl) this._labelText = lbl;
      this._render();
    }

    setBudget(opts) {
      opts = opts || {};
      if (Number.isFinite(opts.used))  this._used  = opts.used;
      if (Number.isFinite(opts.total)) this._total = opts.total;
      if (opts.label != null)          this._labelText = opts.label;
      this._render();
    }
    setUsed(n)   { if (Number.isFinite(n)) { this._used  = n; this._render(); } }
    setTotal(n)  { if (Number.isFinite(n)) { this._total = n; this._render(); } }
    setLabel(t)  { this._labelText = t; this._render(); }
    getRatio()   { return this._total > 0 ? Math.min(1, Math.max(0, this._used / this._total)) : 0; }
    getUsed()    { return this._used; }
    getTotal()   { return this._total; }

    _render() {
      const ratio = this.getRatio();
      const pct = Math.round(ratio * 100);
      this._fillEl.style.width = pct + '%';
      let tone = 'default';
      if (ratio >= 0.85) tone = 'danger';
      else if (ratio >= 0.70) tone = 'warning';
      this.el.dataset.tone = tone;

      // Label — consumer override wins.
      if (this._labelText != null) {
        this._labelEl.textContent = this._labelText;
      } else if (this._total > 0) {
        this._labelEl.textContent = fmtTokens(this._used) + ' / ' + fmtTokens(this._total);
      } else {
        this._labelEl.textContent = pct + '%';
      }
      this.el.setAttribute('aria-valuenow', String(pct));

      this.el.dispatchEvent(new CustomEvent('lb-context-budget-change', {
        bubbles: true, detail: { used: this._used, total: this._total, ratio },
      }));
    }
  }

  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  LB.ContextBudgetBar = ContextBudgetBar;
  LB.register('contextBudgetBar', ContextBudgetBar, '[data-lb-context-budget-bar]');
})();
