/**
 * lb-media.js — LB.Media audio/video player
 *
 * Loaded as a separate <script> after lb.js. Self-registers via
 * LB.register() so any [data-lb-media] element gets auto-init when
 * LB.init() runs (or immediately if registration happens AFTER
 * DOMContentLoaded).
 *
 * Dependencies — all from the public LB API:
 *   - LB.fmtTime          time formatter shared with Timeline
 *   - LB.pointerDrag      shared drag lifecycle (handles playlist reorder)
 *   - LB.iconPreload, LB.initIcons, LB.icon  (accessed via window.LB)
 *
 * No internal-only references to lb.js helpers — extraction is byte-
 * clean.
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-media] LB is not defined — load js/lb.js before js/components/lb-media.js');
    return;
  }

  const LB = window.LB;
  const fmtTime = LB.fmtTime;
  const pointerDrag = LB.pointerDrag;

  // ─── MEDIA (audio / video player) ───────────────────────────
  // Controls SKIN + a thin native-HTML5 controller. The engine stays
  // native by design: consumers who need HLS / DASH / DRM attach
  // hls.js / shaka-player to the same <audio>/<video> element — we
  // never bundle a streaming engine (see memory
  // reference_letbe_ds_pluggable_engines.md).
  //
  // Slice 1 — audio core: play/pause, seek (played + buffered + drag),
  // current/duration time, volume + mute, keyboard a11y. Video chrome,
  // speed, skip, captions, and playlist land in later slices.
  //
  // Markup (audio):
  //   <div class="lb-media" data-lb-media>
  //     <audio src="…" preload="metadata"></audio>
  //     <div class="lb-media__controls"> … </div>
  //   </div>
  // All colours come from existing L2/L3 tokens — no media-specific
  // tokens (see PLUGIN-HANDOFF items 12–14).

  // (fmtTime is imported from LB at the top of the IIFE.)

  class Media {
    constructor(el) {
      this.el = el;
      this.media = el.querySelector('video, audio');
      if (!this.media) return;
      this.isVideo = this.media.tagName === 'VIDEO';
      el.classList.add(this.isVideo ? 'lb-media--video' : 'lb-media--audio');

      this.playBtn   = el.querySelector('[data-lb-media-playpause]');
      this.seekWrap  = el.querySelector('[data-lb-media-seek]');
      this.seek      = this.seekWrap && this.seekWrap.querySelector('.lb-media__range');
      this.played    = el.querySelector('[data-lb-media-played]');
      this.buffered  = el.querySelector('[data-lb-media-buffered]');
      this.curTime   = el.querySelector('[data-lb-media-current]');
      this.durTime   = el.querySelector('[data-lb-media-duration]');
      this.muteBtn   = el.querySelector('[data-lb-media-mute]');
      this.volWrap   = el.querySelector('[data-lb-media-volume]');
      this.volInput  = this.volWrap && this.volWrap.querySelector('.lb-media__range');
      this.volFill   = el.querySelector('[data-lb-media-volume-fill]');
      this.skipBtns  = Array.from(el.querySelectorAll('[data-lb-media-skip]')); // value = seconds (±)
      this.speedBtn  = el.querySelector('[data-lb-media-speed]');
      this.prevBtn   = el.querySelector('[data-lb-media-prev]');
      this.nextBtn   = el.querySelector('[data-lb-media-next]');
      this.fsBtn     = el.querySelector('[data-lb-media-fullscreen]');
      this.plToggleBtn = el.querySelector('[data-lb-media-playlist-toggle]');
      this.qualityWrap = el.querySelector('[data-lb-media-quality]');
      this.qualityList = el.querySelector('[data-lb-media-quality-list]');
      this.qualityBtn  = this.qualityWrap ? this.qualityWrap.querySelector('.lb-menu__trigger') : null;
      this.captionsBtn = el.querySelector('[data-lb-media-captions]');
      this.captionsIsMenu = !!(this.captionsBtn && this.captionsBtn.classList.contains('lb-menu-wrapper'));
      this.captionsList = this.captionsIsMenu ? el.querySelector('[data-lb-media-captions-list]') : null;
      this.likeBtn   = el.querySelector('[data-lb-media-like]');
      this.dislikeBtn = el.querySelector('[data-lb-media-dislike]');
      this.pipBtn    = el.querySelector('[data-lb-media-pip]');
      this.holdToSkip = el.hasAttribute('data-lb-media-hold-to-skip');

      // Optional playlist: a [data-lb-media-playlist] container whose
      // [data-lb-media-track] buttons carry data-src (+ optional
      // data-title / data-artist / data-art). Clicking loads + plays;
      // the active track gets .lb-media__track--active; on ended we
      // auto-advance.
      this.playlist  = el.querySelector('[data-lb-media-playlist]');
      this.tracks    = this.playlist
        ? Array.from(this.playlist.querySelectorAll('[data-lb-media-track]'))
        : [];
      this._scrubbing = false;

      // Repeat-all mode (Vatroslav finding V7): when the LAST track
      // ends, wrap to track 1 and keep playing instead of stopping.
      // Opt-in via data-lb-media-loop on the root, or setLoop(true).
      this.loop = el.hasAttribute('data-lb-media-loop');

      // Optional now-playing block: cover art + title/artist. Entirely
      // opt-in — present only if the consumer includes the markup.
      // data-lb-media-art (an <img>) and data-lb-media-title /
      // -artist (text nodes) update as tracks load.
      this.art     = el.querySelector('[data-lb-media-art]');
      this.title   = el.querySelector('[data-lb-media-title]');
      this.titleBox = this.title ? this.title.closest('.lb-media__title') : null;
      this.artist  = el.querySelector('[data-lb-media-artist]');

      // Preload the icons we hot-swap so the first toggle doesn't flash.
      if (window.LB && window.LB.iconPreload) {
        window.LB.iconPreload(['play', 'pause', 'volume-2', 'volume-x', 'maximize', 'minimize', 'thumbs-up', 'thumbs-up-filled', 'thumbs-down', 'thumbs-down-filled', 'chevrons-left', 'chevrons-right', 'picture-in-picture-2', 'captions', 'x', 'grip-vertical']);
      }
      this._bind();
    }

    _bind() {
      const m = this.media;

      if (this.playBtn) this.playBtn.addEventListener('click', () => this.toggle());
      m.addEventListener('play',  () => this._reflectPlay(true));
      m.addEventListener('pause', () => this._reflectPlay(false));
      m.addEventListener('ended', () => this._reflectPlay(false));

      m.addEventListener('loadedmetadata', () => { this._fixInfiniteDuration(); this._reflectDuration(); });
      m.addEventListener('durationchange', () => this._reflectDuration());
      m.addEventListener('timeupdate',     () => this._reflectTime());
      m.addEventListener('progress',       () => this._reflectBuffered());

      if (this.seek) {
        // Seeking is ASYNC — timeupdate fires with stale values mid-seek,
        // so we paint the fill straight from the slider value here and
        // suppress timeupdate repaints while scrubbing (the _scrubbing
        // flag). Without this the fill doesn't trail and the thumb snaps
        // back to a stale position. (Volume has no such race — its value
        // maps directly to m.volume.)
        const applySeek = () => {
          const pct = parseFloat(this.seek.value) || 0;
          if (this.played) this.played.style.width = pct + '%';
          if (isFinite(m.duration)) m.currentTime = (pct / 100) * m.duration;
          if (this.curTime && isFinite(m.duration)) {
            this.curTime.textContent = fmtTime((pct / 100) * m.duration);
          }
        };
        const endScrub = () => { this._scrubbing = false; };
        this.seek.addEventListener('input',     () => { this._scrubbing = true; applySeek(); });
        this.seek.addEventListener('change',     endScrub);
        this.seek.addEventListener('pointerup',  endScrub);
        this.seek.addEventListener('pointercancel', endScrub);
        this.seek.addEventListener('blur',       endScrub);
      }

      if (this.volInput) {
        this.volInput.addEventListener('input', () => {
          m.volume = parseFloat(this.volInput.value);
          m.muted = m.volume === 0;
          this._reflectVolume();
        });
      }
      if (this.muteBtn) {
        this.muteBtn.addEventListener('click', () => { m.muted = !m.muted; this._reflectVolume(); });
      }
      m.addEventListener('volumechange', () => this._reflectVolume());

      // Skip buttons — data-lb-media-skip="-10" / "10" (seconds, relative).
      this.skipBtns.forEach((btn) => {
        const delta = parseFloat(btn.getAttribute('data-lb-media-skip')) || 0;
        btn.addEventListener('click', () => this.seekTo(m.currentTime + delta));
      });
      // Prev / Next track — walks the playlist by one. With no playlist,
      // prev rewinds to 0 and next is a no-op.
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prevTrack());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextTrack());

      // Speed — a button that cycles playback rate and shows it (e.g. "1×").
      if (this.speedBtn) {
        this.speedBtn.addEventListener('click', () => this._cycleSpeed());
        m.addEventListener('ratechange', () => this._reflectSpeed());
        this._reflectSpeed();
      }

      // Fullscreen — toggles the whole player element so controls overlay
      // the fullscreen video. Icon swaps maximize <-> minimize.
      if (this.plToggleBtn) {
        this.plToggleBtn.setAttribute('aria-expanded', 'false');
        this.plToggleBtn.addEventListener('click', () => {
          const open = this.el.classList.toggle('lb-media--playlist-open');
          this.plToggleBtn.setAttribute('aria-expanded', String(open));
        });
      }
      if (this.fsBtn) {
        this.fsBtn.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('fullscreenchange', () => this._reflectFullscreen());
      }

      // Like / Dislike — mutually exclusive toggle buttons; filled icons
      // signal the active state.
      const setReaction = (which) => {
        const liked = this.likeBtn && this.likeBtn.getAttribute('aria-pressed') === 'true';
        const disliked = this.dislikeBtn && this.dislikeBtn.getAttribute('aria-pressed') === 'true';
        const nextLike = which === 'like' ? !liked : false;
        const nextDislike = which === 'dislike' ? !disliked : false;
        if (this.likeBtn) {
          this.likeBtn.setAttribute('aria-pressed', String(nextLike));
          this._setIcon(this.likeBtn, nextLike ? 'thumbs-up-filled' : 'thumbs-up');
        }
        if (this.dislikeBtn) {
          this.dislikeBtn.setAttribute('aria-pressed', String(nextDislike));
          this._setIcon(this.dislikeBtn, nextDislike ? 'thumbs-down-filled' : 'thumbs-down');
        }
      };
      if (this.likeBtn) this.likeBtn.addEventListener('click', () => setReaction('like'));
      if (this.dislikeBtn) this.dislikeBtn.addEventListener('click', () => setReaction('dislike'));

      // Captions — two modes. (a) Plain button: toggle the first subtitle
      // track on/off. (b) .lb-menu-wrapper: render a per-track picker
      // Quality picker — plain multi-source switching (one file per
      // quality, declared as JSON on the root). Preserves position, rate
      // and play state across the swap. For ADAPTIVE streaming attach
      // hls.js/shaka to the same element instead (pluggable engines).
      if (this.qualityWrap && this.qualityList) {
        try {
          this._qualities = JSON.parse(this.el.dataset.lbMediaQualities || '[]');
        } catch (err) { this._qualities = []; }
        // One (or zero) qualities = nothing to choose: hide the control
        // entirely rather than shipping a dead/disabled trigger.
        if (this._qualities.length < 2) {
          this.qualityWrap.hidden = true;
        } else {
          this._qualityIdx = Math.max(0, this._qualities.findIndex((q) => this.media.currentSrc.includes(q.src.split('/').pop())));
          this._populateQualityMenu();
          this.qualityList.addEventListener('click', (e) => {
            const item = e.target.closest('.lb-list__item');
            if (!item) return;
            this._chooseQuality(Number(item.getAttribute('data-lb-id')));
            const wrap = this.qualityList.closest('.lb-menu-wrapper');
            if (wrap && wrap._lbMenu && wrap._lbMenu._close) wrap._lbMenu._close();
          });
        }
      }

      // (Off + every <track kind="subtitles|captions">). LB.Menu handles
      // open/close; we delegate item clicks to choose the active track.
      if (this.captionsBtn) {
        if (this.captionsIsMenu) {
          this._populateCaptionsMenu();
          this.media.textTracks && this.media.textTracks.addEventListener &&
            this.media.textTracks.addEventListener('addtrack', () => this._populateCaptionsMenu());
          if (this.captionsList) {
            this.captionsList.addEventListener('click', (e) => {
              const item = e.target.closest('.lb-list__item');
              if (!item) return;
              this._chooseCaption(item.getAttribute('data-lb-id'));
              const wrap = this.captionsList.closest('.lb-menu-wrapper');
              if (wrap && wrap._lbMenu && wrap._lbMenu._close) wrap._lbMenu._close();
            });
          }
        } else {
          this.captionsBtn.addEventListener('click', () => this.toggleCaptions());
        }
      }

      // Picture-in-Picture — toggles the browser's PiP window. Video only.
      if (this.pipBtn && this.isVideo) {
        this.pipBtn.addEventListener('click', () => this.togglePictureInPicture());
        this.media.addEventListener('enterpictureinpicture', () => this._reflectPip(true));
        this.media.addEventListener('leavepictureinpicture', () => this._reflectPip(false));
      }

      // Video-only behaviours: click the frame to play/pause (or, opt-in,
      // press-and-hold the left/right half of the frame to skip ±10s in
      // 1-second increments — a common pattern in mobile video players),
      // and auto-hide the controls after a few idle seconds during playback.
      if (this.isVideo) {
        if (this.holdToSkip) {
          // Inject skip-feedback badges on each side (icon + accumulating
          // seconds). Shown while holding; updated on every step.
          const mkFb = (side) => {
            const fb = document.createElement('div');
            fb.className = 'lb-media__skip-fb lb-media__skip-fb--' + (side < 0 ? 'left' : 'right');
            const iconName = side < 0 ? 'chevrons-left' : 'chevrons-right';
            const icon = '<span class="lb-media__skip-fb-icon" data-lb-icon="' + iconName + '"></span>';
            const time = '<span class="lb-media__skip-fb-time">0s</span>';
            fb.innerHTML = side < 0 ? (icon + time) : (time + icon);
            this.el.appendChild(fb);
            return fb;
          };
          this.skipFbLeft = mkFb(-1);
          this.skipFbRight = mkFb(1);

          // After 0.5s held on a half, start skipping ±10s every 500ms
          // and show the accumulated total in the side badge. Release
          // before 0.5s = it was a click → play/pause.
          let downTime = 0, side = 0, holdTimer = null, intervalId = null, holding = false, accum = 0;
          const start = (e) => {
            if (e.button !== undefined && e.button !== 0) return; // primary only
            const rect = this.media.getBoundingClientRect();
            side = (e.clientX - rect.left) < rect.width / 2 ? -1 : 1;
            downTime = Date.now();
            holding = false;
            accum = 0;
            holdTimer = setTimeout(() => {
              holding = true;
              this.el.classList.add(side < 0 ? 'lb-media--rewinding' : 'lb-media--ffwding');
              const fb = side < 0 ? this.skipFbLeft : this.skipFbRight;
              const timeEl = fb && fb.querySelector('.lb-media__skip-fb-time');
              const step = () => {
                this.seekTo(this.media.currentTime + side * 10);
                accum += 10;
                if (timeEl) timeEl.textContent = accum + 's';
              };
              step();
              intervalId = setInterval(step, 500);
            }, 500);
          };
          const end = () => {
            const wasHolding = holding;
            const elapsed = downTime ? Date.now() - downTime : 0;
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            this.el.classList.remove('lb-media--rewinding', 'lb-media--ffwding');
            if (!wasHolding && downTime && elapsed < 500) this.toggle();
            downTime = 0; holding = false; accum = 0;
          };
          this.media.addEventListener('pointerdown', start);
          this.media.addEventListener('pointerup', end);
          this.media.addEventListener('pointercancel', end);
          this.media.addEventListener('pointerleave', end);
        } else {
          m.addEventListener('click', () => this.toggle());
        }
        const wake = () => {
          this.el.classList.remove('lb-media--idle');
          clearTimeout(this._idleT);
          if (!m.paused) this._idleT = setTimeout(() => this.el.classList.add('lb-media--idle'), 2500);
        };
        this.el.addEventListener('pointermove', wake);
        this.el.addEventListener('pointerleave', () => { if (!m.paused) this.el.classList.add('lb-media--idle'); });
        m.addEventListener('play', wake);
        m.addEventListener('pause', () => { this.el.classList.remove('lb-media--idle'); clearTimeout(this._idleT); });
      }

      // Playlist: click-to-play + auto-advance on ended. The index is
      // looked up LIVE at event time (rather than captured at init) so a
      // playlist that's been reordered (drag-to-reorder) still resolves
      // the correct track. Auto-advance also uses live indices.
      if (this.tracks.length) {
        const onTrackClick = (e) => {
          const btn = e.currentTarget;
          this.loadTrack(this._liveTracks().indexOf(btn), true);
        };
        this.tracks.forEach((btn) => btn.addEventListener('click', onTrackClick));
        m.addEventListener('ended', () => {
          if (!this._currentBtn) return;
          const live = this._liveTracks();
          const idx = live.indexOf(this._currentBtn);
          if (idx >= 0 && idx < live.length - 1) this.loadTrack(idx + 1, true);
          // Repeat-all: last track ended → wrap to the first.
          else if (this.loop && idx === live.length - 1 && live.length > 1) this.loadTrack(0, true);
        });
        // Opt-in drag-to-reorder: a grip handle on the left, only the
        // handle starts a drag (so quick row clicks still play the track).
        if (this.playlist.hasAttribute('data-lb-media-playlist-reorderable')) {
          this._enableReorder();
        }
        // Opt-in inline (accordion) row menu: instead of the 3-dots
        // opening LB.Menu's dropdown, it expands a panel below the row
        // with the same menu items inline.
        if (this.playlist.getAttribute('data-lb-media-playlist-actions-mode') === 'inline') {
          this._enableInlineRowActions();
        }
      }

      // Keyboard shortcuts fire only when focus is on the player chrome
      // itself (not a specific control — those own their native keys).
      if (!this.el.hasAttribute('tabindex')) this.el.setAttribute('tabindex', '0');
      this.el.addEventListener('keydown', (e) => this._onKey(e));

      // Initial paint
      this._reflectDuration();
      this._reflectTime();
      this._reflectVolume();

      // Marquee: set up boxes, then measure now, after fonts load (text
      // width shifts once the webfont swaps in), and on resize.
      this._setupMarquees();
      this._measureMarquees();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => this._measureMarquees());
      }
      window.addEventListener('resize', () => {
        clearTimeout(this._titleT);
        this._titleT = setTimeout(() => this._measureMarquees(), 150);
      });
    }

    // Collect every marquee box in the player (now-playing title +
    // each playlist row title) and ensure each has an inner
    // .lb-media__marquee-text to translate. Playlist titles are
    // auto-wrapped so consumers write plain markup and still get the
    // hover-reveal — keeping the behaviour an integral part of the player.
    _setupMarquees() {
      this.marquees = [];
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Wire a hover trigger to reveal a marquee box. The reveal slides out
      // on enter; on leave it slides back but KEEPS the full text visible
      // until the transform finishes (transitionend), then restores the
      // ellipsis — so the return never flashes a clipped/ellipsised string.
      const wire = (box, trigger) => {
        if (reduce) return; // honour reduced-motion: no marquee animation
        trigger.addEventListener('pointerenter', () => {
          if (!box.classList.contains('lb-media__marquee--scrollable')) return;
          clearTimeout(box._returnT);
          box.classList.remove('lb-media__marquee--returning');
          box.classList.add('lb-media__marquee--revealing');
        });
        trigger.addEventListener('pointerleave', () => {
          if (!box.classList.contains('lb-media__marquee--revealing')) return;
          box.classList.remove('lb-media__marquee--revealing');
          box.classList.add('lb-media__marquee--returning');
          const inner = box.querySelector('.lb-media__marquee-text');
          const done = () => {
            clearTimeout(box._returnT);
            inner.removeEventListener('transitionend', done);
            box.classList.remove('lb-media__marquee--returning');
          };
          inner.addEventListener('transitionend', done);
          box._returnT = setTimeout(done, 3000); // fallback if transitionend doesn't fire
        });
      };

      if (this.titleBox && this.title) {
        this.title.classList.add('lb-media__marquee-text'); // now-playing inner
        this.titleBox.classList.add('lb-media__marquee');
        this.marquees.push(this.titleBox);
        wire(this.titleBox, this.titleBox);
      }
      this.tracks.forEach((btn) => {
        const tt = btn.querySelector('.lb-media__track-title');
        if (!tt) return;
        if (!tt.querySelector('.lb-media__marquee-text')) {
          const inner = document.createElement('span');
          inner.className = 'lb-media__marquee-text';
          while (tt.firstChild) inner.appendChild(tt.firstChild);
          tt.appendChild(inner);
        }
        tt.classList.add('lb-media__marquee');
        this.marquees.push(tt);
        wire(tt, btn); // hovering anywhere on the row reveals its title
      });
    }

    // For each marquee box: set a native tooltip (a11y fallback), then if
    // the text overflows mark it scrollable and set the shift + a
    // distance-scaled duration (a multiple of the 500ms token → constant
    // slow reveal speed).
    _measureMarquees() {
      (this.marquees || []).forEach((box) => {
        const inner = box.querySelector('.lb-media__marquee-text');
        if (!inner) return;
        box.title = inner.textContent;
        const overflow = inner.scrollWidth - inner.clientWidth;
        if (overflow > 1) {
          const mult = Math.max(2, Math.ceil(overflow / 40));
          box.style.setProperty('--lb-title-shift', (-overflow) + 'px');
          box.style.setProperty('--lb-title-duration', `calc(var(--lb-duration-500) * ${mult})`);
          box.classList.add('lb-media__marquee--scrollable');
        } else {
          box.classList.remove('lb-media__marquee--scrollable');
          box.style.removeProperty('--lb-title-shift');
        }
      });
    }

    // ── public API ──
    play()  { return this.media.play(); }
    pause() { this.media.pause(); }
    toggle() { this.media.paused ? this.media.play() : this.media.pause(); }
    seekTo(sec) { if (isFinite(this.media.duration)) this.media.currentTime = Math.max(0, Math.min(this.media.duration, sec)); }
    setRate(r) { this.media.playbackRate = r; } // ratechange listener updates the label

    prevTrack() {
      const live = this._liveTracks();
      const idx = live.indexOf(this._currentBtn);
      if (idx > 0) this.loadTrack(idx - 1, true);
      else this.seekTo(0); // already at start (or no playlist) → rewind
    }
    nextTrack() {
      const live = this._liveTracks();
      const idx = live.indexOf(this._currentBtn);
      if (idx >= 0 && idx < live.length - 1) this.loadTrack(idx + 1, true);
      // Repeat-all: Next on the last track wraps to the first.
      else if (this.loop && idx === live.length - 1 && live.length > 1) this.loadTrack(0, true);
    }

    // Repeat-all mode — programmatic control mirrors the
    // data-lb-media-loop attribute (kept in sync for CSS hooks).
    setLoop(on) {
      this.loop = !!on;
      this.el.toggleAttribute('data-lb-media-loop', this.loop);
    }
    getLoop() { return this.loop; }

    toggleCaptions() {
      const tracks = this.media.textTracks;
      if (!tracks || !tracks.length) return;
      let idx = -1;
      for (let k = 0; k < tracks.length; k++) {
        const kind = tracks[k].kind;
        if (kind === 'subtitles' || kind === 'captions') { idx = k; break; }
      }
      if (idx < 0) return;
      const t = tracks[idx];
      const on = t.mode === 'showing';
      t.mode = on ? 'disabled' : 'showing';
      if (this.captionsBtn) this.captionsBtn.setAttribute('aria-pressed', String(!on));
      this.el.classList.toggle('lb-media--captions-on', !on);
    }

    // Build a fresh list of menu items from the current <video> textTracks.
    // Call after dynamically adding tracks (e.g., user uploads a .vtt) so
    // the new track appears in the picker.
    _populateQualityMenu() {
      let html = '';
      this._qualities.forEach((q, k) => {
        html += '<li><button type="button" class="lb-list__item" data-lb-id="' + k + '"><span class="lb-list__icon" aria-hidden="true" data-lb-icon="' + (k === this._qualityIdx ? 'check' : 'monitor') + '"></span><span class="lb-list__label">' + q.label + '</span></button></li>';
      });
      this.qualityList.innerHTML = html;
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this.qualityList);
      if (this.qualityBtn) this.qualityBtn.textContent = this._qualities[this._qualityIdx] ? this._qualities[this._qualityIdx].label : '';
    }

    _chooseQuality(k) {
      const q = this._qualities[k];
      if (!q || k === this._qualityIdx) return;
      const m = this.media;
      const t = m.currentTime;
      const rate = m.playbackRate;
      const wasPlaying = !m.paused && !m.ended;
      this._qualityIdx = k;
      m.src = q.src;
      m.addEventListener('loadedmetadata', function once() {
        m.removeEventListener('loadedmetadata', once);
        m.currentTime = t;
        m.playbackRate = rate;
        if (wasPlaying) m.play();
      });
      m.load();
      this._populateQualityMenu();
      this.el.dispatchEvent(new CustomEvent('lb-media-quality-change', {
        bubbles: true, detail: { quality: q.label, src: q.src },
      }));
    }

    _populateCaptionsMenu() {
      if (!this.captionsList) return;
      const tracks = this.media.textTracks;
      let html = '<li><button type="button" class="lb-list__item" data-lb-id="off"><span class="lb-list__icon" aria-hidden="true" data-lb-icon="x"></span><span class="lb-list__label">Off</span></button></li>';
      for (let k = 0; k < tracks.length; k++) {
        if (tracks[k].kind !== 'subtitles' && tracks[k].kind !== 'captions') continue;
        const label = tracks[k].label || tracks[k].language || ('Track ' + (k + 1));
        html += '<li><button type="button" class="lb-list__item" data-lb-id="track-' + k + '"><span class="lb-list__icon" aria-hidden="true" data-lb-icon="captions"></span><span class="lb-list__label">' + label + '</span></button></li>';
      }
      this.captionsList.innerHTML = html;
      if (window.LB && window.LB.initIcons) window.LB.initIcons(this.captionsList);
      this._reflectCaptions();
    }

    _chooseCaption(id) {
      const tracks = this.media.textTracks;
      for (let k = 0; k < tracks.length; k++) {
        if (tracks[k].kind !== 'subtitles' && tracks[k].kind !== 'captions') continue;
        tracks[k].mode = (id === 'track-' + k) ? 'showing' : 'disabled';
      }
      this._reflectCaptions();
    }

    _reflectCaptions() {
      const tracks = this.media.textTracks;
      let showing = -1;
      for (let k = 0; k < tracks.length; k++) {
        if ((tracks[k].kind === 'subtitles' || tracks[k].kind === 'captions') && tracks[k].mode === 'showing') { showing = k; break; }
      }
      if (this.captionsBtn) {
        const trigger = this.captionsIsMenu ? this.captionsBtn.querySelector('.lb-menu__trigger') : this.captionsBtn;
        if (trigger) trigger.setAttribute('aria-pressed', String(showing >= 0));
      }
      this.el.classList.toggle('lb-media--captions-on', showing >= 0);
      if (this.captionsList) {
        this.captionsList.querySelectorAll('.lb-list__item').forEach((item) => {
          const id = item.getAttribute('data-lb-id');
          const isCurrent = (showing < 0 && id === 'off') || id === 'track-' + showing;
          if (isCurrent) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        });
      }
    }

    togglePictureInPicture() {
      if (!this.isVideo) return;
      if (document.pictureInPictureElement === this.media) {
        document.exitPictureInPicture && document.exitPictureInPicture();
      } else if (this.media.requestPictureInPicture) {
        this.media.requestPictureInPicture().catch(() => {});
      }
    }

    _reflectPip(on) {
      if (this.pipBtn) this.pipBtn.setAttribute('aria-pressed', String(on));
    }

    // Drag-to-reorder via POINTER events (not HTML5 drag-and-drop). HTML5
    // DnD is touch-unfriendly and has cross-browser quirks; pointer events
    // give consistent behaviour on mouse, pen, and touch. The grip handle
    // is the only initiator (so quick row clicks still play the track).
    // We use pointer capture so dragging keeps tracking even if the pointer
    // briefly leaves the grip.
    _enableReorder() {
      const playlist = this.playlist;
      // Inject grip handles on each row.
      playlist.querySelectorAll(':scope > li').forEach((li) => {
        if (li.querySelector('[data-lb-media-drag]')) return;
        const grip = document.createElement('span');
        grip.className = 'lb-media__track-drag';
        grip.setAttribute('data-lb-media-drag', '');
        grip.setAttribute('aria-hidden', 'true');
        grip.setAttribute('data-lb-icon', 'grip-vertical');
        li.insertBefore(grip, li.firstChild);
      });
      if (window.LB && window.LB.initIcons) window.LB.initIcons(playlist);

      // Edge auto-scroll now lives in LB.edgeAutoScroll (extracted when
      // the kanban board became the second consumer, as planned here).
      const findScrollContainer = (el) => {
        let p = el;
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p;
          p = p.parentElement;
        }
        return null;
      };

      // Swap evaluation. clientY is the current cursor y; the dragSrc
      // is moved relative to whichever live row contains that y.
      // Direction is inferred from current DOM position so a single
      // drag past several rows yields several swaps without flicker.
      const evaluateSwap = (clientY, dragSrc) => {
        const lis = Array.from(playlist.querySelectorAll(':scope > li'));
        const srcIdx = lis.indexOf(dragSrc);
        for (let i = 0; i < lis.length; i++) {
          const li = lis[i];
          if (li === dragSrc) continue;
          const rect = li.getBoundingClientRect();
          if (clientY >= rect.top && clientY <= rect.bottom) {
            const after = i > srcIdx;
            playlist.insertBefore(dragSrc, after ? li.nextSibling : li);
            this._renumberPlaylist();
            break;
          }
        }
      };

      pointerDrag(playlist, {
        onStart: (e, ctx) => {
          // Delegated drag: only proceed if pointerdown landed on a grip
          // handle. The util's primary-button filter already ran; we
          // return false here to skip everything else (no capture, no
          // listeners, no classes) when the gesture shouldn't start.
          const grip = e.target.closest('[data-lb-media-drag]');
          if (!grip) return false;
          const li = grip.closest('li');
          if (!li) return false;
          // Auto-close any expanded inline menu before starting the
          // drag — mixing two interactions would shift layout mid-drag.
          playlist.querySelectorAll('.lb-media__playlist-li--expanded').forEach((open) => {
            open.classList.remove('lb-media__playlist-li--expanded');
            const t = open.querySelector('.lb-media__track-actions .lb-menu__trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
          });
          ctx.dragSrc = li;
          ctx.lastClientY = e.clientY;
          ctx.auto = window.LB.edgeAutoScroll({
            scroller: findScrollContainer(playlist),
            onTick: () => {
              if (ctx.lastClientY !== null && ctx.dragSrc) evaluateSwap(ctx.lastClientY, ctx.dragSrc);
            },
          });
          // Drag class lives on the LI being dragged (per-gesture target),
          // not the playlist — managed manually since util's draggingClass
          // only supports one fixed target.
          li.classList.add('lb-media__playlist-li--dragging');
        },
        onMove: (e, ctx) => {
          if (!ctx.dragSrc) return;
          ctx.lastClientY = e.clientY;
          evaluateSwap(e.clientY, ctx.dragSrc);
          if (ctx.auto) ctx.auto.update(e.clientX, e.clientY);
        },
        onEnd: (e, ctx) => {
          if (ctx.dragSrc) ctx.dragSrc.classList.remove('lb-media__playlist-li--dragging');
          if (ctx.auto) ctx.auto.stop();
        },
      });

      // Initial numbering pass — fixes any stale numbers in markup so the
      // index column always reads 1..N in DOM order.
      this._renumberPlaylist();
    }

    // Opt-in INLINE row-actions mode (data-lb-media-playlist-actions-mode
    // ="inline"). Instead of the 3-dots opening LB.Menu's popup, the row
    // expands an in-place panel below the track button with the same menu
    // items. Clean for touch, never overflows the player container, and
    // reuses the same .lb-list primitive items so consumers' lb-menu-
    // select listeners keep working.
    _enableInlineRowActions() {
      const playlist = this.playlist;
      const rows = playlist.querySelectorAll(':scope > li');
      rows.forEach((li) => {
        const wrapper = li.querySelector('.lb-media__track-actions .lb-menu-wrapper');
        if (!wrapper) return;
        const oldTrigger = wrapper.querySelector('.lb-menu__trigger');
        const sourceUl = wrapper.querySelector('ul.lb-menu');
        if (!oldTrigger || !sourceUl) return;

        // Replace the trigger with a clone to drop LB.Menu's dropdown
        // click handler. cloneNode doesn't copy listeners.
        const trigger = oldTrigger.cloneNode(true);
        oldTrigger.parentNode.replaceChild(trigger, oldTrigger);
        trigger.setAttribute('aria-expanded', 'false');

        // Hide the wrapper's source ul (was the dropdown panel). We render
        // items in our own panel below the row, cloned from the source so
        // consumers' markup stays the source of truth.
        sourceUl.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'lb-media__track-panel';
        const panelUl = document.createElement('ul');
        panelUl.className = 'lb-list lb-media__track-panel-list';
        panelUl.setAttribute('role', 'menu');
        Array.from(sourceUl.children).forEach((item) => panelUl.appendChild(item.cloneNode(true)));
        // Cloned consumer markup is plain <li><button> — wire the menu
        // pattern the way LB.Menu does: li wrappers leave the a11y tree,
        // the actionable element is the menuitem.
        panelUl.querySelectorAll(':scope > li').forEach((li2) => {
          li2.setAttribute('role', 'none');
          const act = li2.querySelector('button, a, .lb-list__item');
          if (act) act.setAttribute('role', 'menuitem');
        });
        panel.appendChild(panelUl);
        li.appendChild(panel);
        if (window.LB && window.LB.initIcons) window.LB.initIcons(panel);

        const close = (target) => {
          target.classList.remove('lb-media__playlist-li--expanded');
          const t = target.querySelector('.lb-media__track-actions .lb-menu__trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        };

        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const expanded = li.classList.contains('lb-media__playlist-li--expanded');
          // Close any other expanded row first (single-open accordion).
          playlist.querySelectorAll('.lb-media__playlist-li--expanded').forEach((other) => {
            if (other !== li) close(other);
          });
          li.classList.toggle('lb-media__playlist-li--expanded', !expanded);
          trigger.setAttribute('aria-expanded', String(!expanded));
        });

        // Delegate item clicks: dispatch lb-menu-select (same event LB.Menu
        // would fire) so consumer listeners are unchanged, then collapse.
        panelUl.addEventListener('click', (e) => {
          const item = e.target.closest('.lb-list__item');
          if (!item) return;
          wrapper.dispatchEvent(new CustomEvent('lb-menu-select', {
            detail: { item, source: 'inline' },
            bubbles: true
          }));
          close(li);
        });
      });

      // Click outside a row collapses any open panel.
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.lb-media__playlist-li--expanded')) {
          playlist.querySelectorAll('.lb-media__playlist-li--expanded').forEach((other) => {
            other.classList.remove('lb-media__playlist-li--expanded');
            const t = other.querySelector('.lb-media__track-actions .lb-menu__trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
          });
        }
      });
    }

    // Rewrite the .lb-media__track-index cell of every row to its current
    // DOM position (1-based). The index column is a "position" indicator,
    // not a track identifier — it stays sequential as rows are reordered.
    _renumberPlaylist() {
      if (!this.playlist) return;
      const lis = this.playlist.querySelectorAll(':scope > li');
      lis.forEach((li, i) => {
        const idx = li.querySelector('.lb-media__track-index');
        if (idx) idx.textContent = String(i + 1);
      });
    }

    toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen && document.exitFullscreen();
      } else if (this.el.requestFullscreen) {
        this.el.requestFullscreen();
      }
    }

    // Fullscreen playlist panel: on entering fullscreen the playlist <ul>
    // moves into a floating right-side panel (own header + close button);
    // on exit it moves back to its original spot (marker comment).
    _mountPlaylistPanel() {
      if (this._plPanel || !this.playlist) return;
      const panel = document.createElement('div');
      panel.className = 'lb-media__playlist-panel';
      const head = document.createElement('div');
      head.className = 'lb-media__playlist-panel-head';
      const title = document.createElement('span');
      title.textContent = 'Playlist';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'lb-icon-btn lb-icon-btn--ghost lb-icon-btn--small';
      close.setAttribute('aria-label', 'Close playlist');
      const closeIcon = document.createElement('span');
      closeIcon.setAttribute('data-lb-icon', 'x');
      close.appendChild(closeIcon);
      close.addEventListener('click', () => {
        this.el.classList.remove('lb-media--playlist-open');
        if (this.plToggleBtn) this.plToggleBtn.setAttribute('aria-expanded', 'false');
      });
      head.append(title, close);
      panel.appendChild(head);
      this._plMarker = document.createComment('lb-media-playlist-home');
      this.playlist.parentNode.insertBefore(this._plMarker, this.playlist);
      panel.appendChild(this.playlist);
      this.el.appendChild(panel);
      this._plPanel = panel;
      if (window.LB && window.LB.initIcons) window.LB.initIcons(panel);
    }
    _unmountPlaylistPanel() {
      if (!this._plPanel) return;
      if (this._plMarker && this._plMarker.parentNode) {
        this._plMarker.parentNode.insertBefore(this.playlist, this._plMarker);
        this._plMarker.remove();
      }
      this._plPanel.remove();
      this._plPanel = null;
      this._plMarker = null;
    }

    _reflectFullscreen() {
      const fs = document.fullscreenElement === this.el;
      this.el.classList.toggle('lb-media--fullscreen', fs);
      if (fs) {
        if (this.plToggleBtn) this._mountPlaylistPanel();
      } else {
        this.el.classList.remove('lb-media--playlist-open');
        if (this.plToggleBtn) this.plToggleBtn.setAttribute('aria-expanded', 'false');
        this._unmountPlaylistPanel();
      }
      if (this.fsBtn) {
        this._setIcon(this.fsBtn, fs ? 'minimize' : 'maximize');
        this.fsBtn.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
      }
    }

    _cycleSpeed() {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; // ascending; wraps 2 → 0.5
      const cur = this.media.playbackRate;
      let i = rates.findIndex((r) => Math.abs(r - cur) < 0.001);
      if (i < 0) i = rates.indexOf(1); // unknown rate → resume from 1×
      this.media.playbackRate = rates[(i + 1) % rates.length];
    }

    _reflectSpeed() {
      if (!this.speedBtn) return;
      const r = this.media.playbackRate;
      this.speedBtn.textContent = r + '×'; // e.g. "1×" / "1.25×"
      this.speedBtn.setAttribute('aria-label', 'Playback speed ' + r + 'x (click to change)');
    }
    _liveTracks() {
      return this.playlist ? Array.from(this.playlist.querySelectorAll('[data-lb-media-track]')) : [];
    }

    loadTrack(i, autoplay) {
      const live = this._liveTracks();
      const btn = live[i];
      if (!btn) return;
      const src = btn.getAttribute('data-src');
      if (!src) return;
      this._currentBtn = btn;
      this.media.src = src;
      live.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('lb-media__track--active', active);
        if (active) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      // Update the optional now-playing block from this track's data.
      if (this.title) {
        const t = btn.getAttribute('data-title') || '';
        this.title.textContent = t;
        requestAnimationFrame(() => this._measureMarquees());
      }
      if (this.artist && btn.getAttribute('data-artist')) this.artist.textContent = btn.getAttribute('data-artist');
      const art = btn.getAttribute('data-art');
      if (this.art && art) this.art.src = art; // per-track cover override (optional)
      this.media.load();
      if (autoplay) this.media.play();
    }

    _setIcon(el, name) {
      if (!el) return;
      el.setAttribute('data-lb-icon', name);
      if (window.LB && window.LB.icon) window.LB.icon(name, el);
      el._lbIconDone = true; // keep the global initIcons sweep from clobbering
    }

    _reflectPlay(playing) {
      this.el.classList.toggle('lb-media--playing', playing);
      if (!this.playBtn) return;
      this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this._setIcon(this.playBtn, playing ? 'pause' : 'play');
    }

    _reflectDuration() {
      if (this.durTime) this.durTime.textContent = fmtTime(this.media.duration);
    }

    // VBR MP3s without a Xing/Info header report duration === Infinity,
    // which breaks every duration-dependent control (seek, skip, arrow
    // keys, buffered %). Force the browser to compute the real duration
    // by nudging currentTime past the end once, then snap back. Safety
    // net for arbitrary consumer media — well-formed files skip this.
    _fixInfiniteDuration() {
      const m = this.media;
      if (m.duration !== Infinity || this._durFixed) return;
      this._durFixed = true;
      const onUpdate = () => {
        m.removeEventListener('timeupdate', onUpdate);
        if (isFinite(m.duration)) { m.currentTime = 0; this._reflectDuration(); this._reflectTime(); }
      };
      m.addEventListener('timeupdate', onUpdate);
      try { m.currentTime = 1e101; } catch (e) { /* ignore */ }
    }

    _reflectTime() {
      const m = this.media;
      // While the user is scrubbing, the input handler owns the fill +
      // thumb + time label — don't let stale mid-seek timeupdate events
      // fight it.
      if (this._scrubbing) return;
      const pct = m.duration ? (m.currentTime / m.duration) * 100 : 0;
      if (this.played) this.played.style.width = pct + '%';
      if (this.seek) this.seek.value = pct;
      if (this.curTime) this.curTime.textContent = fmtTime(m.currentTime);
    }

    _reflectBuffered() {
      const m = this.media;
      if (!this.buffered || !m.duration || !m.buffered.length) return;
      const end = m.buffered.end(m.buffered.length - 1);
      this.buffered.style.width = (end / m.duration) * 100 + '%';
    }

    _reflectVolume() {
      const m = this.media;
      const level = m.muted ? 0 : m.volume;
      // Always sync the thumb (no activeElement guard): during a drag the
      // value we set equals what the user dragged to (harmless no-op), but
      // for keyboard arrow changes the thumb must follow the new level.
      if (this.volInput) this.volInput.value = level;
      if (this.volFill) this.volFill.style.width = (level * 100) + '%';
      if (this.muteBtn) {
        this.muteBtn.setAttribute('aria-label', (m.muted || m.volume === 0) ? 'Unmute' : 'Mute');
        this._setIcon(this.muteBtn, (m.muted || m.volume === 0) ? 'volume-x' : 'volume-2');
      }
      this.el.classList.toggle('lb-media--muted', m.muted || m.volume === 0);
    }

    _onKey(e) {
      const m = this.media;
      const tag = e.target.tagName;
      switch (e.key) {
        // Arrows are handled here for ALL targets (incl. the range inputs)
        // and preventDefault stops the native range from also moving — so
        // ←/→ always seek ±5s and ↑/↓ always change volume, regardless of
        // which control has focus. This removes any native-range direction
        // ambiguity.
        case 'ArrowLeft':  e.preventDefault(); this.seekTo(m.currentTime - 5); break;
        case 'ArrowRight': e.preventDefault(); this.seekTo(m.currentTime + 5); break;
        case 'ArrowUp':    e.preventDefault(); m.volume = Math.min(1, m.volume + 0.1); m.muted = false; this._reflectVolume(); break;
        case 'ArrowDown':  e.preventDefault(); m.volume = Math.max(0, m.volume - 0.1); this._reflectVolume(); break;
        // Space/K toggle play — but if a BUTTON is focused, let its native
        // click fire instead (avoids a double toggle).
        case ' ':
        case 'k':          if (tag === 'BUTTON') return; e.preventDefault(); this.toggle(); break;
        case 'm':          e.preventDefault(); m.muted = !m.muted; this._reflectVolume(); break;
      }
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Media = Media;
  LB.register('media', Media, '[data-lb-media]');
})();
