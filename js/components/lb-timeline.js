/**
 * lb-timeline.js — LB.Timeline trim / playhead / ruler primitive
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register() so any [data-lb-timeline] element gets auto-init
 * when LB.init() runs (or immediately if registration happens AFTER
 * DOMContentLoaded).
 *
 * Dependencies — all from the public LB API:
 *   - LB.fmtTime          (not used directly; here for parity)
 *   - LB.pointerDrag      shared drag lifecycle (handles + playhead)
 *   - LB.Slider           inner Zoom slider auto-instantiation
 *
 * Two Timeline-local helpers travel with the class because they're
 * specific to time-axis rendering:
 *   - fmtTimelineTime     auto-scaling time formatter (M:SS.mmm /
 *                         MM:SS / HH:MM:SS depending on total duration)
 *   - pickTimelineTickStep  ruler tick step selector
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-timeline] LB is not defined — load js/lb.js before js/components/lb-timeline.js');
    return;
  }

  const LB = window.LB;
  const pointerDrag = LB.pointerDrag;
  const Slider = LB.Slider;

  // ─── TIMELINE ──────────────────────────────────────────────
  // Standalone trim/playhead/ruler primitive. Emits lb-timeline-change
  // {inSec, outSec, playheadSec}. Composes with Media Player but
  // doesn't require one — also useful for any "set in/out over a
  // duration" UI (audio editor, video trimmer, range slice picker).
  //
  // HARD pluggable-engine rule applies (see roadmap): we ship the
  // chrome / ruler / handles / playhead state machine. Real waveform
  // rendering, frame-accurate scrubbing, multi-clip composition are
  // separate engines the consumer attaches.
  //
  // Slice 1 (this commit): skeleton + lane + ruler + readout +
  //   playhead/handle markers. NO drag yet.
  // Slice 2: pointer-drag trim handles.
  // Slice 3: pointer-drag + keyboard playhead, a11y focus ring.
  // Slice 4: horizontal zoom + adaptive tick density.
  // Slice 5: Media Player composition demo (bind <audio> timeupdate).

  // Time formatter — auto-scales by total duration so the readout +
  // ruler labels stay readable across the full range:
  //   < 1 min → MM:SS.mmm (sub-second precision for short clips)
  //   < 1 hr  → MM:SS
  //   else    → HH:MM:SS
  // Kept Timeline-local (not added to LB.fmtTime) so existing Media
  // Player formatting stays exactly as it is.
  function fmtTimelineTime(sec, totalSec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    if (!isFinite(totalSec) || totalSec < 0) totalSec = sec;
    if (totalSec < 60) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec - Math.floor(sec)) * 1000);
      return String(m) + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
    }
    if (totalSec < 3600) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Pick a "nice" tick step for the ruler — same idea as d3's nice
  // ticks but tuned for seconds. Returns { major, minor } in seconds.
  // Aims for ~6–10 major ticks across the visible duration.
  function pickTimelineTickStep(totalSec) {
    if (!isFinite(totalSec) || totalSec <= 0) return { major: 1, minor: 0.5 };
    const target = totalSec / 8; // ~8 major ticks
    // Candidate steps in seconds, ascending.
    const candidates = [
      0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30,
      60, 120, 300, 600, 900, 1800, 3600, 7200, 10800,
    ];
    let major = candidates[candidates.length - 1];
    for (const c of candidates) { if (c >= target) { major = c; break; } }
    return { major, minor: major / 2 };
  }

  class Timeline {
    constructor(el) {
      this.el = el;
      // Read declarative config from data-attrs. All in seconds.
      this.duration = this._readNum('duration', 0);
      this.inSec = this._readNum('in', 0);
      this.outSec = this._readNum('out', this.duration);
      this.playheadSec = this._readNum('playhead', 0);
      this.zoom = 1; // 1× = fit visible viewport; up to 10× from the zoom slider
      this._clampValues();
      this._render();
      this._enableZoom();
      this._paint();
      this._enableHandleDrag();
      this._enablePlayheadDrag();
      this._enableKeyboard();
      // Wheel zoom is opt-in via attribute. Default OFF preserves the
      // browser's Ctrl+scroll = page zoom convention. Consumers building
      // editor-style surfaces (composition demos, video trimmers) add
      // data-lb-timeline-wheel-zoom to get Ctrl+scroll = timeline zoom.
      if (this._readBoolAttr('wheelZoom')) this._enableWheelZoom();
    }

    _readBoolAttr(key) {
      // Reads a data-lb-timeline-* boolean attribute. The source
      // attribute is data-lb-timeline-{kebab-key}, which HTML dataset
      // auto-converts to .lbTimeline{CamelKey}. Presence is true
      // unless the attribute is explicitly "false".
      const dsKey = 'lbTimeline' + key.charAt(0).toUpperCase() + key.slice(1);
      if (!(dsKey in this.el.dataset)) return false;
      return this.el.dataset[dsKey] !== 'false';
    }

    _readNum(key, fallback) {
      const v = parseFloat(this.el.dataset['lb' + key.charAt(0).toUpperCase() + key.slice(1)]);
      return isFinite(v) ? v : fallback;
    }

    _clampValues() {
      const d = Math.max(0, this.duration);
      this.duration = d;
      this.inSec = Math.max(0, Math.min(this.inSec, d));
      this.outSec = Math.max(this.inSec, Math.min(this.outSec, d));
      this.playheadSec = Math.max(0, Math.min(this.playheadSec, d));
    }

    // Build the DOM once — readout row, ruler, lane with selection +
    // handles + playhead. Subsequent state changes only update positions
    // and text content (via _paint), not the tree.
    _render() {
      this.el.classList.add('lb-timeline');
      if (this.duration <= 0) this.el.classList.add('lb-timeline--empty');
      // Handles + playhead expose role="slider" with aria-orientation,
      // aria-valuemin/max/now/text — same a11y contract as LB.Slider so
      // screen readers announce the drag values and keyboard users get
      // arrow-key nudge. tabindex="0" makes them focusable. aria-label
      // names them; aria-valuetext is set in _paint as a human-readable
      // time string so screen readers say "00:12" not "12".
      //
      // Slice 4 wraps ruler + lane in a viewport (overflow-x:auto) and
      // a scroller (width scales with zoom). Handles/playhead positions
      // stay in % of the scroller's full width so their existing math
      // still works without any per-zoom adjustments.
      this.el.innerHTML = ''
        + '<div class="lb-timeline__header">'
        +   '<div class="lb-timeline__readout" data-lb-timeline-readout>'
        +     '<span class="lb-timeline__readout-item"><span class="lb-timeline__readout-label">In</span><span class="lb-timeline__readout-value" data-lb-timeline-readout-in>—</span></span>'
        +     '<span class="lb-timeline__readout-item"><span class="lb-timeline__readout-label">Out</span><span class="lb-timeline__readout-value" data-lb-timeline-readout-out>—</span></span>'
        +     '<span class="lb-timeline__readout-item"><span class="lb-timeline__readout-label">Duration</span><span class="lb-timeline__readout-value" data-lb-timeline-readout-dur>—</span></span>'
        +   '</div>'
        +   '<div class="lb-slider-field lb-timeline__zoom" data-lb-slider data-lb-timeline-zoom>'
        +     '<div class="lb-slider-field__header">'
        +       '<span class="lb-slider-field__label">Zoom</span>'
        +       '<span class="lb-slider-field__value" data-lb-timeline-zoom-display aria-live="polite">1.0×</span>'
        +     '</div>'
        +     '<div class="lb-slider-track-wrap lb-slider-track-wrap--medium">'
        +       '<div class="lb-slider-track"><div class="lb-slider-track__fill" style="width: 0%"></div></div>'
        +       '<input type="range" class="lb-slider" min="1" max="10" step="0.1" value="1" aria-label="Timeline zoom" aria-valuemin="1" aria-valuemax="10" aria-valuenow="1">'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div class="lb-timeline__viewport" data-lb-timeline-viewport>'
        +   '<div class="lb-timeline__scroller" data-lb-timeline-scroller>'
        +     '<div class="lb-timeline__ruler" data-lb-timeline-ruler></div>'
        +     '<div class="lb-timeline__lane" data-lb-timeline-lane>'
        +       '<div class="lb-timeline__selection"></div>'
        +       '<div class="lb-timeline__handle lb-timeline__handle--in"  data-lb-timeline-handle="in"  role="slider" tabindex="0" aria-orientation="horizontal" aria-label="Trim start"></div>'
        +       '<div class="lb-timeline__handle lb-timeline__handle--out" data-lb-timeline-handle="out" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="Trim end"></div>'
        +       '<div class="lb-timeline__playhead" data-lb-timeline-playhead role="slider" tabindex="0" aria-orientation="horizontal" aria-label="Playhead"></div>'
        +     '</div>'
        +   '</div>'
        + '</div>';
      this._readoutIn  = this.el.querySelector('[data-lb-timeline-readout-in]');
      this._readoutOut = this.el.querySelector('[data-lb-timeline-readout-out]');
      this._readoutDur = this.el.querySelector('[data-lb-timeline-readout-dur]');
      this._ruler = this.el.querySelector('[data-lb-timeline-ruler]');
      this._lane = this.el.querySelector('[data-lb-timeline-lane]');
      this._inH = this.el.querySelector('[data-lb-timeline-handle="in"]');
      this._outH = this.el.querySelector('[data-lb-timeline-handle="out"]');
      this._playheadEl = this.el.querySelector('[data-lb-timeline-playhead]');
      this._viewport = this.el.querySelector('[data-lb-timeline-viewport]');
      this._scroller = this.el.querySelector('[data-lb-timeline-scroller]');
      this._zoomField = this.el.querySelector('[data-lb-timeline-zoom]');
      this._zoomDisplay = this.el.querySelector('[data-lb-timeline-zoom-display]');
    }

    // Update CSS custom properties + readout text + ruler ticks. Called
    // after any state change. Cheap: no DOM creation, just inline style
    // writes and text updates, plus ruler tick re-paint (typically
    // ~6–10 nodes).
    _paint() {
      const d = this.duration;
      if (d <= 0) {
        this.el.classList.add('lb-timeline--empty');
        this._readoutIn.textContent = '—';
        this._readoutOut.textContent = '—';
        this._readoutDur.textContent = '—';
        this._ruler.innerHTML = '';
        return;
      }
      this.el.classList.remove('lb-timeline--empty');
      const inPct  = (this.inSec  / d) * 100;
      const outPct = (this.outSec / d) * 100;
      const phPct  = (this.playheadSec / d) * 100;
      this._lane.style.setProperty('--in',  inPct  + '%');
      this._lane.style.setProperty('--out', outPct + '%');
      this._lane.style.setProperty('--playhead', phPct + '%');
      this._readoutIn.textContent  = fmtTimelineTime(this.inSec, d);
      this._readoutOut.textContent = fmtTimelineTime(this.outSec, d);
      this._readoutDur.textContent = fmtTimelineTime(this.outSec - this.inSec, d);
      // ARIA values — handles + playhead each carry valuemin/max/now
      // matching their per-handle clamp (in clamps to outSec; out
      // clamps to inSec; playhead spans full duration). aria-valuetext
      // is the formatted time so screen readers announce "00:12" not 12.
      if (this._inH) {
        this._inH.setAttribute('aria-valuemin', '0');
        this._inH.setAttribute('aria-valuemax', String(this.outSec));
        this._inH.setAttribute('aria-valuenow', String(this.inSec));
        this._inH.setAttribute('aria-valuetext', fmtTimelineTime(this.inSec, d));
      }
      if (this._outH) {
        this._outH.setAttribute('aria-valuemin', String(this.inSec));
        this._outH.setAttribute('aria-valuemax', String(d));
        this._outH.setAttribute('aria-valuenow', String(this.outSec));
        this._outH.setAttribute('aria-valuetext', fmtTimelineTime(this.outSec, d));
      }
      if (this._playheadEl) {
        this._playheadEl.setAttribute('aria-valuemin', '0');
        this._playheadEl.setAttribute('aria-valuemax', String(d));
        this._playheadEl.setAttribute('aria-valuenow', String(this.playheadSec));
        this._playheadEl.setAttribute('aria-valuetext', fmtTimelineTime(this.playheadSec, d));
      }
      this._paintRuler();
    }

    _paintRuler() {
      const d = this.duration;
      if (d <= 0) { this._ruler.innerHTML = ''; return; }
      // Tick density adapts to ZOOM: when the user zooms in, the
      // viewport shows a shorter slice of the timeline at a time, so
      // we pick a finer step that gives ~6–10 major ticks per visible
      // screen. Ticks still position in % of the scroller's full
      // width (which is zoom × the viewport), so total tick count
      // scales linearly with zoom — but the DOM count stays modest
      // because zoom caps at 10×. Format label off total duration so
      // the SCALE choice (M:SS.mmm vs MM:SS vs HH:MM:SS) doesn't flip
      // mid-zoom — labels just get denser, not reformatted.
      const visibleDuration = d / Math.max(1, this.zoom);
      const { major, minor } = pickTimelineTickStep(visibleDuration);
      const parts = [];
      for (let t = 0; t <= d + 1e-6; t += minor) {
        const pct = (t / d) * 100;
        const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
        const cls = 'lb-timeline__tick ' + (isMajor ? 'lb-timeline__tick--major' : 'lb-timeline__tick--minor');
        parts.push('<span class="' + cls + '" style="left:' + pct.toFixed(3) + '%"></span>');
        if (isMajor) {
          // Right-anchor the last few labels (pct > 95) so their text
          // hangs LEFT of the tick line instead of overflowing the
          // scroller's right edge. Otherwise the final label at
          // pct ~96–100% extends past the viewport boundary and
          // forces a horizontal scrollbar even at zoom=1.
          const rightAnchor = pct > 95;
          const labelCls = 'lb-timeline__tick-label' + (rightAnchor ? ' lb-timeline__tick-label--right' : '');
          parts.push('<span class="' + labelCls + '" style="left:' + pct.toFixed(3) + '%">' + fmtTimelineTime(t, d) + '</span>');
        }
      }
      this._ruler.innerHTML = parts.join('');
    }

    // Wire up the zoom Slider — auto-init it (LB.init's DOM sweep
    // already ran when our innerHTML was empty, so the inner field
    // wouldn't be picked up otherwise), listen for lb-slider-change,
    // and on every change scale the scroller width + repaint the
    // ruler with adapted tick density.
    _enableZoom() {
      if (!this._zoomField) return;
      // Manually instantiate LB.Slider on our inner field so its track
      // fill + aria-valuenow update on drag. LB.init() already swept
      // the document before our _render replaced the timeline's
      // contents, so our inner field would otherwise be inert.
      try { if (!this._zoomField._lbSlider) this._zoomField._lbSlider = new Slider(this._zoomField); } catch (_) {}
      // Slice 4 keeps zoom local to the component for now; if a
      // consumer wants to programmatically zoom, they can call
      // el._lbTimeline.setZoom(n) which dispatches lb-timeline-zoom
      // (separate event — distinct from lb-timeline-change which is
      // for in/out/playhead state).
      this._zoomField.addEventListener('lb-slider-change', (e) => {
        const v = parseFloat(e.detail.value);
        if (isFinite(v) && v >= 1) this.setZoom(v);
      });
      this._applyZoom();
    }

    _applyZoom() {
      if (!this._scroller) return;
      const z = Math.max(1, this.zoom);
      this._scroller.style.width = (z * 100) + '%';
      if (this._zoomDisplay) this._zoomDisplay.textContent = z.toFixed(1) + '×';
      // Sync the slider UI (input value + track fill + ARIA) when zoom
      // changes via any path other than the slider itself — e.g. wheel
      // zoom, setZoom() API call. We bypass the slider's `value` setter
      // (which dispatches lb-slider-change) to avoid an infinite loop:
      //   slider input → lb-slider-change → setZoom → slider.value =
      //   → _update → lb-slider-change → setZoom → …
      // Direct DOM writes keep the visual state in sync without the
      // event round-trip.
      if (this._zoomField) {
        const input = this._zoomField.querySelector('.lb-slider');
        if (input && parseFloat(input.value) !== z) {
          input.value = String(z);
          input.setAttribute('aria-valuenow', String(z));
          const fill = this._zoomField.querySelector('.lb-slider-track__fill');
          if (fill) {
            const min = parseFloat(input.min) || 1;
            const max = parseFloat(input.max) || 10;
            fill.style.width = (((z - min) / (max - min)) * 100) + '%';
          }
        }
      }
    }

    setZoom(z) {
      if (!isFinite(z) || z < 1) return;
      // Zoom is ANCHORED TO THE PLAYHEAD. Before changing zoom, note
      // the playhead's pixel position relative to the visible viewport.
      // After zoom (which changes scroller width), adjust scrollLeft so
      // the playhead lands at the same viewport-relative pixel position
      // — feels like "magnifying around the playhead", matching the
      // convention in Premiere / DaVinci / Final Cut. If the playhead
      // is currently off-screen, target the viewport centre instead so
      // it becomes visible after the zoom (otherwise the user loses
      // their reference point).
      let anchorViewportX = null;
      if (this._viewport && this._scroller && this.duration > 0) {
        const vpRect = this._viewport.getBoundingClientRect();
        const oldScrollerWidth = this._scroller.getBoundingClientRect().width;
        const phPxInScroller = (this.playheadSec / this.duration) * oldScrollerWidth;
        const phPxInViewport = phPxInScroller - this._viewport.scrollLeft;
        anchorViewportX = (phPxInViewport >= 0 && phPxInViewport <= vpRect.width)
          ? phPxInViewport
          : vpRect.width / 2; // off-screen → bring playhead to centre
      }

      this.zoom = z;
      this._applyZoom();
      // Re-paint the ruler so tick step adapts to the new visible
      // duration. Position vars (--in / --out / --playhead) are
      // percentages so they don't need to change.
      this._paintRuler();

      // Restore playhead's visible position by adjusting scrollLeft.
      // Browser auto-clamps to [0, scrollWidth - clientWidth], so we
      // don't need to bound-check manually.
      if (anchorViewportX !== null) {
        const newScrollerWidth = this._scroller.getBoundingClientRect().width;
        const newPhPxInScroller = (this.playheadSec / this.duration) * newScrollerWidth;
        this._viewport.scrollLeft = newPhPxInScroller - anchorViewportX;
      }

      this.el.dispatchEvent(new CustomEvent('lb-timeline-zoom', {
        bubbles: true, detail: { zoom: this.zoom },
      }));
    }
    getZoom() { return this.zoom; }

    // Opt-in via data-lb-timeline-wheel-zoom. When enabled, Ctrl+scroll
    // (Cmd+scroll on Mac) over the viewport zooms the timeline. Anchor-
    // to-playhead from setZoom() makes the zoom feel like "magnifying
    // around the playhead". Plain wheel (no modifier) is NOT intercepted
    // so horizontal scroll via shift+wheel and any native trackpad
    // gestures continue to work. preventDefault is only called when we
    // actually handle the event — so when this attribute is absent, the
    // listener isn't even attached and browser page zoom works normally.
    //
    // Note on the Ctrl+wheel browser convention: page zoom (Ctrl++/-)
    // remains untouched on the rest of the page; only wheel events
    // whose target is INSIDE the viewport are intercepted. Consumers
    // opt in per-Timeline, so non-editor timelines stay browser-zoom-
    // friendly.
    _enableWheelZoom() {
      if (!this._viewport) return;
      // The browser fires wheel with ctrlKey=true for trackpad pinch
      // gestures too — so this single handler covers mouse-wheel +
      // trackpad pinch.
      this._viewport.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return; // honour browser default for plain scroll
        e.preventDefault();
        // deltaY > 0 = scroll down = zoom OUT. 1.1× per tick is the
        // editor convention; matches the slider's
        // exponential perceived speed at high zoom levels.
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.max(1, Math.min(10, this.zoom * factor));
        if (newZoom !== this.zoom) this.setZoom(newZoom);
      }, { passive: false }); // passive:false required for preventDefault to take effect
    }

    // Public API. Slice 1 only — drag wiring comes later. Consumers
    // can already build their own UI on top of these setters today.
    getRange() { return { inSec: this.inSec, outSec: this.outSec }; }
    getPlayhead() { return this.playheadSec; }
    getDuration() { return this.duration; }
    setRange({ inSec, outSec }) {
      if (isFinite(inSec))  this.inSec  = inSec;
      if (isFinite(outSec)) this.outSec = outSec;
      this._clampValues();
      this._paint();
      this._emit();
    }
    setPlayhead(sec) {
      if (!isFinite(sec)) return;
      this.playheadSec = sec;
      this._clampValues();
      this._paint();
      this._emit();
    }
    setDuration(sec) {
      if (!isFinite(sec) || sec < 0) return;
      this.duration = sec;
      this._clampValues();
      this._paint();
      this._emit();
    }
    _emit() {
      this.el.dispatchEvent(new CustomEvent('lb-timeline-change', {
        bubbles: true,
        detail: { inSec: this.inSec, outSec: this.outSec, playheadSec: this.playheadSec, duration: this.duration },
      }));
    }
    // Selection-rect emitter — fires alongside lb-timeline-change but
    // carries the SCREEN coordinates of the active selection so
    // consumers (the music/voice editor composition pattern from deep
    // analysis §09) can anchor a popover composer to it. Computed
    // lazily so callers that don't listen pay nothing.
    _emitSelection(reason) {
      if (!this._lane || this.duration <= 0) return;
      const laneRect = this._lane.getBoundingClientRect();
      const inPct  = this.inSec  / this.duration;
      const outPct = this.outSec / this.duration;
      const x = laneRect.left + laneRect.width * inPct;
      const width = Math.max(0, laneRect.width * (outPct - inPct));
      const rect = {
        x, y: laneRect.top,
        width, height: laneRect.height,
        top: laneRect.top, left: x, right: x + width, bottom: laneRect.bottom,
      };
      this.el.dispatchEvent(new CustomEvent('lb-timeline-selection', {
        bubbles: true,
        detail: {
          inSec: this.inSec,
          outSec: this.outSec,
          duration: this.duration,
          rect,                   // viewport-relative selection rect
          laneRect,               // full lane rect for context
          reason: reason || 'change',
        },
      }));
    }

    // Pointer-drag wiring for the in/out trim handles. Uses pointer
    // capture so the drag follows the pointer even when it leaves the
    // handle's hit area — the cleanest pattern for trim handles where
    // the user is expected to slide far beyond the original 4px bar.
    //
    // Coordinate conversion is lane-relative: a clientX inside the
    // lane's bounding rect maps linearly to [0, duration]. We re-read
    // getBoundingClientRect on pointerdown only (not every pointermove)
    // because the lane geometry can't change mid-drag — touch-action:
    // none on the handle stops the browser from scrolling/zooming, and
    // the lane width is fixed by the surrounding layout.
    //
    // Clamping: in handle locks to [0, outSec], out handle locks to
    // [inSec, duration] — they can touch but never cross. A11y for the
    // handles (keyboard nudge + ARIA role/values) lands in Slice 3
    // alongside the playhead a11y work.
    _enableHandleDrag() {
      // Drag wiring runs UNCONDITIONALLY at construction — the handle
      // refs are stable (created in _render, never removed). Empty
      // timelines have the handles display:none via .lb-timeline--empty,
      // so a pointerdown can't reach them while duration=0. When the
      // timeline is later populated via setDuration() (e.g. from
      // <audio> loadedmetadata in the composition demo), the listeners
      // are already wired and start firing on the now-visible handles.
      // The onMove callback's inner `if (this.duration <= 0) return`
      // is a safety belt for the lane-bg case (lane stays visible as
      // a dashed placeholder when empty).
      const inH  = this.el.querySelector('[data-lb-timeline-handle="in"]');
      const outH = this.el.querySelector('[data-lb-timeline-handle="out"]');
      if (!inH || !outH) return;

      // Lane-relative coordinate conversion. ctx.startRect is the lane's
      // rect (set via rectFrom below), not the handle's. We re-snap the
      // lane rect on pointerdown only — layout can't shift mid-drag
      // because touch-action:none on the handle stops the browser from
      // scrolling/zooming during touch drag.
      const xToSec = (clientX, rect) => {
        const pct = (clientX - rect.left) / (rect.width || 1);
        return Math.max(0, Math.min(1, pct)) * this.duration;
      };

      const wireHandle = (handle, which) => pointerDrag(handle, {
        rectFrom: () => this._lane.getBoundingClientRect(),
        draggingClass: 'lb-timeline__handle--dragging',
        onMove: (e, ctx) => {
          if (this.duration <= 0) return;
          const sec = xToSec(e.clientX, ctx.startRect);
          if (which === 'in') {
            // in clamps to [0, outSec] — can touch but not cross out
            this.inSec = Math.max(0, Math.min(sec, this.outSec));
          } else {
            this.outSec = Math.max(this.inSec, Math.min(sec, this.duration));
          }
          this._paint();
          this._emit();
        },
        // Selection-rect event fires once on drag end so consumers
        // (popover composer anchored to selection) don't get flooded
        // during the drag. reason='drag-end' lets the handler know it
        // came from user finishing a gesture vs. programmatic setIn /
        // setOut.
        onEnd: () => { this._emitSelection('drag-end'); },
      });
      wireHandle(inH, 'in');
      wireHandle(outH, 'out');
    }

    // Pointer-drag for the playhead + click-to-jump on the lane bg.
    // Mirrors the handle-drag pattern (pointer capture, lane-relative
    // coordinate conversion) but clamps to [0, duration] instead of a
    // neighbour-aware bound. Click-on-lane is the editor convention:
    // click empty space → playhead jumps; the same pointerdown then
    // continues as a drag if the user keeps moving, so quick-jump and
    // scrub are the same gesture.
    _enablePlayheadDrag() {
      // Same rationale as _enableHandleDrag: wire unconditionally so
      // timelines populated post-construction (via setDuration) gain
      // working playhead drag + click-on-lane scrubbing. The apply()
      // helper has its own `if (this.duration <= 0) return` guard for
      // the lane-bg case where the dashed empty lane is still clickable.
      if (!this._playheadEl || !this._lane) return;

      // Lane-relative coord conversion — same xToSec as _enableHandleDrag
      // but local to this scope. ctx.startRect is the lane via rectFrom.
      const xToSec = (clientX, rect) =>
        Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1))) * this.duration;

      // Apply pointer-current position immediately on start so click-on-
      // lane jumps the playhead without waiting for the first move; same
      // function also drives every onMove during the drag. Click + drag
      // are the same gesture.
      const apply = (e, ctx) => {
        if (this.duration <= 0) return;
        this.playheadSec = xToSec(e.clientX, ctx.startRect);
        this._paint();
        this._emit();
      };

      const laneRect = () => this._lane.getBoundingClientRect();

      // Playhead-element drag.
      pointerDrag(this._playheadEl, {
        rectFrom: laneRect,
        draggingClass: 'lb-timeline__playhead--dragging',
        // (draggingClassTarget defaults to captureEl = the playhead)
        onStart: apply,
        onMove: apply,
      });

      // Lane-bg click-and-scrub. Guard against pointerdowns on handles
      // or the playhead (those have their own drag wiring above). Cancel
      // by returning false from onStart — the util skips the drag
      // entirely, no dragging class added, no listeners attached.
      pointerDrag(this._lane, {
        rectFrom: laneRect,
        draggingClass: 'lb-timeline__playhead--dragging',
        draggingClassTarget: this._playheadEl, // class lives on the playhead, not the lane
        onStart: (e, ctx) => {
          if (e.target.closest('[data-lb-timeline-handle], [data-lb-timeline-playhead]')) return false;
          apply(e, ctx);
        },
        onMove: apply,
      });
    }

    // Keyboard nudge for handles + playhead: arrows ±1s, shift ±10s,
    // Home/End jump to bounds. Clamping uses the same per-target rules
    // as drag (in: [0, outSec]; out: [inSec, duration]; playhead: full).
    // Single keydown handler on the timeline root + event.target tells
    // us which slider to mutate.
    _enableKeyboard() {
      this.el.addEventListener('keydown', (e) => {
        if (this.duration <= 0) return;
        const t = e.target;
        const isIn  = t && t.matches && t.matches('[data-lb-timeline-handle="in"]');
        const isOut = t && t.matches && t.matches('[data-lb-timeline-handle="out"]');
        const isPh  = t && t.matches && t.matches('[data-lb-timeline-playhead]');
        if (!isIn && !isOut && !isPh) return;
        const step = e.shiftKey ? 10 : 1;
        let delta = 0, jumpTo = null;
        if (e.key === 'ArrowLeft')      delta = -step;
        else if (e.key === 'ArrowRight') delta = step;
        else if (e.key === 'Home')      jumpTo = 0;
        else if (e.key === 'End')       jumpTo = this.duration;
        else return; // not a key we handle — let it bubble
        e.preventDefault();
        const apply = (current, min, max) => {
          const next = jumpTo !== null ? jumpTo : current + delta;
          return Math.max(min, Math.min(next, max));
        };
        if (isIn)        this.inSec       = apply(this.inSec, 0, this.outSec);
        else if (isOut)  this.outSec      = apply(this.outSec, this.inSec, this.duration);
        else             this.playheadSec = apply(this.playheadSec, 0, this.duration);
        this._paint();
        this._emit();
      });
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Timeline = Timeline;
  LB.register('timeline', Timeline, '[data-lb-timeline]');
})();
