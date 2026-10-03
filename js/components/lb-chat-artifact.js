/**
 * lb-chat-artifact.js — letbe-ds Artifact panel for AI Chat
 *
 * Loaded as a separate <script> after lb-chat.js. Self-registers via
 * LB.register(). Ships:
 *
 *   LB.Artifact    Right-rail panel for code / preview artifacts
 *                  (a side canvas for generated documents and code). Header
 *                  carries title + Preview/Code tabs (LB.Tabs) +
 *                  artifact switcher (LB.Select) + version selector
 *                  (LB.Select) + Copy/Download/Share/Close icon
 *                  buttons (.lb-icon-btn). Body has two tab panels:
 *                  Preview (consumer-supplied DOM/HTML/iframe) and
 *                  Code (powered by LB.CodeBlock — picks up the
 *                  Slice 6 dual-format Copy + Save + Open + Apply
 *                  actions automatically).
 *
 * Per the pluggable-engine HARD rule, this module does NOT:
 *   - run a sandbox / iframe sandboxing policy (consumer)
 *   - persist artifacts (consumer)
 *   - generate diffs between versions (consumer; we just switch source)
 *   - implement live preview rendering (consumer sets Preview HTML)
 *
 * Per the no-fork rule, this module consumes:
 *   - LB.Tabs                                          (Preview / Code)
 *   - LB.Select                                        (artifact + version)
 *   - LB.CodeBlock                                     (Code tab body)
 *   - .lb-icon-btn + .lb-btn--ghost / .lb-btn--primary (toolbar buttons)
 *   - .lb-segmented (none here — see ChatWorkspace)
 *
 * Dependencies — all from the public LB API:
 *   - LB.register, LB.init
 *   - LB.CodeBlock (Slice 6 module from lb.js)
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.LB) {
    console.error('[lb-chat-artifact] LB is not defined — load js/lb.js before js/components/lb-chat-artifact.js');
    return;
  }

  const LB = window.LB;

  // ─── HELPERS ───────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Stable counter for default ids — predictable and debuggable.
  let _artifactCounter = 0;

  // ─── ARTIFACT ──────────────────────────────────────────────
  //
  // Markup contract — the minimal case is just:
  //
  //   <div data-lb-artifact></div>
  //
  // The component injects its header, toolbar, and body. For finer
  // control, supply any of the slots upfront and the panel adopts
  // them:
  //
  //   <div data-lb-artifact>
  //     <header data-lb-artifact-header></header>
  //     <div data-lb-artifact-body></div>
  //   </div>
  //
  // Public API at el._lbArtifact:
  //   setArtifacts(arr)         bulk replace + render
  //   addArtifact(opts)         insert/replace one
  //   removeArtifact(id)
  //   setActive(id)             switch active artifact
  //   setVersion(versionId)     switch version of active artifact
  //   getActive()               { artifactId, versionId, source, lang }
  //   setView('preview'|'code')
  //   setPreviewHtml(html)      override Preview slot for the active artifact
  //   show() / hide() / isOpen()
  //   close()                   alias for hide() that also emits lb-artifact-close
  //
  // Artifact shape:
  //   { id, title, lang, source, versions? }
  // where versions is optional:
  //   [{ id, source, label?, timestamp? }]
  // If `versions` is omitted, the single source IS treated as v1
  // (with id 'v1', label 'v1'). The version selector hides when only
  // one version exists.
  //
  // Events (all bubbling CustomEvent):
  //   lb-artifact-change        {artifactId, versionId, source, lang}
  //   lb-artifact-view-change   {view}
  //   lb-artifact-share         {artifactId, versionId, source, lang}
  //   lb-artifact-close
  //
  // The Code tab's own actions (Copy / Save / Open / Apply) come from
  // LB.CodeBlock (Slice 6) — listen for `lb-code-copy`, `lb-code-save`,
  // `lb-code-open`, `lb-code-apply` for those.

  class Artifact {
    constructor(el) {
      this.el = el;
      this.el.classList.add('lb-artifact');
      this._artifacts = new Map();      // id → artifact
      this._order = [];                 // insertion order
      this._activeId = null;
      this._activeVersion = new Map();  // artifactId → versionId
      this._view = 'preview';           // 'preview' | 'code'
      this._previewOverrides = new Map(); // artifactId → html string (consumer override)
      this._open = !el.hidden;

      this._build();
    }

    // ── Build the shell ──
    _build() {
      // Adopt existing structure if provided, otherwise inject defaults.
      this._headerEl = this.el.querySelector('[data-lb-artifact-header]');
      this._bodyEl   = this.el.querySelector('[data-lb-artifact-body]');

      if (!this._headerEl) {
        this._headerEl = document.createElement('header');
        this._headerEl.setAttribute('data-lb-artifact-header', '');
        this.el.appendChild(this._headerEl);
      }
      this._headerEl.classList.add('lb-artifact__header');

      if (!this._bodyEl) {
        this._bodyEl = document.createElement('div');
        this._bodyEl.setAttribute('data-lb-artifact-body', '');
        this.el.appendChild(this._bodyEl);
      }
      this._bodyEl.classList.add('lb-artifact__body');

      this._buildHeader();
      this._buildBody();
    }

    _buildHeader() {
      // Two rows:
      //   __title-row    title + Close button
      //   __toolbar      Tabs (Preview / Code) | Artifact select | Version select | Copy / Download / Share
      this._headerEl.innerHTML = ''
        + '<div class="lb-artifact__title-row">'
        +   '<div class="lb-artifact__title-group">'
        +     '<span class="lb-artifact__icon" data-lb-artifact-icon data-lb-icon="file" aria-hidden="true"></span>'
        +     '<div class="lb-artifact__title" data-lb-artifact-title>Artifact</div>'
        +   '</div>'
        +   '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost lb-artifact__close" data-lb-artifact-close aria-label="Close artifact">'
        +     '<span data-lb-icon="x" aria-hidden="true"></span>'
        +   '</button>'
        + '</div>'
        + '<div class="lb-artifact__toolbar">'
        +   '<div class="lb-tabs lb-artifact__tabs" data-lb-tabs>'
        +     '<div class="lb-tab-list" role="tablist">'
        +       '<button type="button" class="lb-tab" data-lb-artifact-tab="preview" aria-selected="true">Preview</button>'
        +       '<button type="button" class="lb-tab" data-lb-artifact-tab="code" aria-selected="false">Code</button>'
        +     '</div>'
        +   '</div>'
        +   '<div class="lb-artifact__switcher lb-select-field" data-lb-artifact-switcher data-lb-select data-lb-size="small" data-lb-placeholder="Artifacts" hidden>'
        +     '<div class="lb-select-wrap"></div>'
        +   '</div>'
        +   '<div class="lb-artifact__versions lb-select-field" data-lb-artifact-versions data-lb-select data-lb-size="small" data-lb-placeholder="Version" hidden>'
        +     '<div class="lb-select-wrap"></div>'
        +   '</div>'
        +   '<div class="lb-artifact__actions">'
        +     '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost" data-lb-artifact-copy aria-label="Copy source"><span data-lb-icon="copy" aria-hidden="true"></span></button>'
        +     '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost" data-lb-artifact-download aria-label="Download"><span data-lb-icon="download" aria-hidden="true"></span></button>'
        +     '<button type="button" class="lb-icon-btn lb-icon-btn--small lb-btn--ghost" data-lb-artifact-share aria-label="Share"><span data-lb-icon="share-2" aria-hidden="true"></span></button>'
        +   '</div>'
        + '</div>';

      this._titleEl     = this._headerEl.querySelector('[data-lb-artifact-title]');
      this._iconEl      = this._headerEl.querySelector('[data-lb-artifact-icon]');
      this._tabsEl      = this._headerEl.querySelector('[data-lb-tabs]');
      this._switcherEl  = this._headerEl.querySelector('[data-lb-artifact-switcher]');
      this._versionsEl  = this._headerEl.querySelector('[data-lb-artifact-versions]');
      this._copyBtn     = this._headerEl.querySelector('[data-lb-artifact-copy]');
      this._downloadBtn = this._headerEl.querySelector('[data-lb-artifact-download]');
      this._shareBtn    = this._headerEl.querySelector('[data-lb-artifact-share]');
      this._closeBtn    = this._headerEl.querySelector('[data-lb-artifact-close]');

      // Close
      this._closeBtn.addEventListener('click', () => this.close());

      // Tabs — LB.Tabs auto-init will run when LB.init() sweeps later.
      // We also wire the tab buttons directly so the View setter can
      // respond. lb-tab-change handles both pointer + keyboard paths.
      this._headerEl.querySelectorAll('[data-lb-artifact-tab]').forEach((btn) => {
        btn.addEventListener('click', () => this.setView(btn.dataset.lbArtifactTab));
      });

      // Toolbar buttons
      this._copyBtn.addEventListener('click', () => this.copy());
      this._downloadBtn.addEventListener('click', () => this.download());
      this._shareBtn.addEventListener('click', () => this.share());

      // Switcher / version selects — wire change events.
      this._switcherEl.addEventListener('lb-select-change', (e) => {
        if (e.detail && e.detail.value) this.setActive(e.detail.value);
      });
      this._versionsEl.addEventListener('lb-select-change', (e) => {
        if (e.detail && e.detail.value) this.setVersion(e.detail.value);
      });
    }

    _buildBody() {
      // Two tab panels — Preview and Code. The Code panel hosts an
      // LB.CodeBlock; we let it own its action row (Copy/Save/Open/
      // Apply) so the panel-level toolbar is for the OUTER artifact
      // (cross-version, share, etc.).
      this._bodyEl.innerHTML = ''
        + '<div class="lb-tab-panel lb-artifact__panel lb-artifact__panel--preview" data-lb-artifact-tab-panel="preview">'
        +   '<div class="lb-artifact__preview-slot" data-lb-artifact-preview>'
        +     '<div class="lb-artifact__empty">No preview available for this artifact.</div>'
        +   '</div>'
        + '</div>'
        + '<div class="lb-tab-panel lb-artifact__panel lb-artifact__panel--code" data-lb-artifact-tab-panel="code" hidden>'
        +   '<pre data-lb-code-block data-lb-artifact-code data-lb-no-save data-lb-no-copy><code></code></pre>'
        + '</div>';

      this._previewSlot = this._bodyEl.querySelector('[data-lb-artifact-preview]');
      this._codeBlockEl = this._bodyEl.querySelector('[data-lb-artifact-code]');

      // Initialize the embedded primitives (Tabs in header, CodeBlock
      // in body, Selects in toolbar). LB.init() is idempotent and
      // attaches _lbX accessors on each element it sweeps.
      if (LB.init) LB.init(this.el);
    }

    // ── Data ──
    setArtifacts(arr) {
      this._artifacts.clear();
      this._order = [];
      this._activeVersion.clear();
      (arr || []).forEach((a) => this._ingest(a));
      this._renderSwitcher();
      const initial = this._order[0] || null;
      if (initial) this.setActive(initial);
      else this._renderEmpty();
    }
    addArtifact(opts) {
      const id = this._ingest(opts);
      this._renderSwitcher();
      if (!this._activeId) this.setActive(id);
      return id;
    }
    removeArtifact(id) {
      if (!this._artifacts.has(id)) return;
      this._artifacts.delete(id);
      this._activeVersion.delete(id);
      this._previewOverrides.delete(id);
      this._order = this._order.filter((x) => x !== id);
      if (this._activeId === id) this._activeId = null;
      this._renderSwitcher();
      const next = this._order[0] || null;
      if (next) this.setActive(next);
      else this._renderEmpty();
    }

    _ingest(opts) {
      opts = opts || {};
      const id = opts.id || ('artifact-' + (++_artifactCounter));
      // Normalize versions — guarantee at least a single 'v1' entry.
      let versions = Array.isArray(opts.versions) && opts.versions.length
        ? opts.versions.map((v, i) => ({
            id: v.id || ('v' + (i + 1)),
            source: v.source || '',
            label: v.label || ('v' + (i + 1)),
            timestamp: v.timestamp || null,
          }))
        : [{ id: 'v1', source: opts.source || '', label: 'v1', timestamp: opts.timestamp || null }];
      const artifact = {
        id,
        title: opts.title || id,
        lang: opts.lang || 'text',
        icon: opts.icon || null,    // override the file icon
        versions,
      };
      if (this._artifacts.has(id)) {
        // Replace + keep position
        this._artifacts.set(id, artifact);
      } else {
        this._artifacts.set(id, artifact);
        this._order.push(id);
      }
      // Default to the latest version on first ingest.
      if (!this._activeVersion.has(id)) {
        this._activeVersion.set(id, versions[versions.length - 1].id);
      }
      return id;
    }

    // ── Active selection ──
    setActive(id) {
      if (!this._artifacts.has(id)) return;
      const previous = this._activeId;
      this._activeId = id;

      const a = this._artifacts.get(id);

      // Update title + icon
      this._titleEl.textContent = a.title;
      if (this._iconEl) {
        this._iconEl.setAttribute('data-lb-icon', a.icon || iconForLang(a.lang));
        if (LB.initIcons) LB.initIcons(this._iconEl.parentElement);
      }

      // Update version selector
      this._renderVersions(a);

      // Update artifact switcher selected value (silent — don't trigger
      // change handler that would loop back here).
      this._updateSelectSilently(this._switcherEl, id);

      // Render content
      this._renderActive();

      // Emit
      if (previous !== id) {
        const v = this._activeVersion.get(id);
        const versionObj = a.versions.find((x) => x.id === v) || a.versions[0];
        this.el.dispatchEvent(new CustomEvent('lb-artifact-change', {
          bubbles: true,
          detail: {
            artifactId: id, versionId: versionObj.id,
            source: versionObj.source, lang: a.lang,
          },
        }));
      }
    }

    setVersion(versionId) {
      if (!this._activeId) return;
      const a = this._artifacts.get(this._activeId);
      if (!a) return;
      if (!a.versions.find((v) => v.id === versionId)) return;
      this._activeVersion.set(this._activeId, versionId);
      this._updateSelectSilently(this._versionsEl, versionId);
      this._renderActive();
      const versionObj = a.versions.find((v) => v.id === versionId);
      this.el.dispatchEvent(new CustomEvent('lb-artifact-change', {
        bubbles: true,
        detail: {
          artifactId: this._activeId, versionId,
          source: versionObj.source, lang: a.lang,
        },
      }));
    }

    setView(view) {
      if (view !== 'preview' && view !== 'code') return;
      if (this._view === view) return;
      this._view = view;
      // Update tab buttons + panels manually (LB.Tabs would otherwise
      // be the source of truth, but we want the public setter to
      // drive it).
      this._headerEl.querySelectorAll('[data-lb-artifact-tab]').forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.lbArtifactTab === view));
      });
      this._bodyEl.querySelectorAll('[data-lb-artifact-tab-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.lbArtifactTabPanel !== view;
      });
      this.el.dispatchEvent(new CustomEvent('lb-artifact-view-change', {
        bubbles: true, detail: { view },
      }));
    }

    setPreviewHtml(html) {
      if (!this._activeId) return;
      this._previewOverrides.set(this._activeId, html);
      this._renderActive();
    }

    // ── Render helpers ──
    _renderSwitcher() {
      if (this._order.length <= 1) {
        this._switcherEl.hidden = true;
        return;
      }
      this._switcherEl.hidden = false;
      const options = this._order.map((id) => {
        const a = this._artifacts.get(id);
        return { value: id, label: a.title };
      });
      this._setSelectOptions(this._switcherEl, options, this._activeId);
    }

    _renderVersions(a) {
      if (a.versions.length <= 1) {
        this._versionsEl.hidden = true;
        return;
      }
      this._versionsEl.hidden = false;
      const options = a.versions.map((v) => ({ value: v.id, label: v.label || v.id }));
      const activeV = this._activeVersion.get(a.id) || a.versions[a.versions.length - 1].id;
      this._setSelectOptions(this._versionsEl, options, activeV);
    }

    _renderActive() {
      if (!this._activeId) return this._renderEmpty();
      const a = this._artifacts.get(this._activeId);
      const v = this._activeVersion.get(a.id);
      const versionObj = a.versions.find((x) => x.id === v) || a.versions[0];

      // Code tab body — LB.CodeBlock owns the rendering.
      if (this._codeBlockEl && this._codeBlockEl._lbCodeBlock) {
        this._codeBlockEl._lbCodeBlock.setSource(versionObj.source || '', a.lang);
      } else if (this._codeBlockEl) {
        // Pre-init fallback (CodeBlock not yet attached)
        const codeEl = this._codeBlockEl.querySelector('code');
        if (codeEl) codeEl.textContent = versionObj.source || '';
        this._codeBlockEl.setAttribute('data-lb-lang', a.lang);
      }

      // Preview tab body — consumer override wins, else default empty.
      const overrideHtml = this._previewOverrides.get(this._activeId);
      if (overrideHtml != null) {
        this._previewSlot.innerHTML = overrideHtml;
      } else {
        this._previewSlot.innerHTML = ''
          + '<div class="lb-artifact__empty">'
          +   'No live preview rendered. Call <code class="lb-code">artifact.setPreviewHtml(...)</code> to fill this slot, '
          +   'or switch to the Code tab to view the source.'
          + '</div>';
      }
    }

    _renderEmpty() {
      this._titleEl.textContent = 'Artifact';
      this._previewSlot.innerHTML = '<div class="lb-artifact__empty">No artifact selected.</div>';
      if (this._codeBlockEl && this._codeBlockEl._lbCodeBlock) {
        this._codeBlockEl._lbCodeBlock.setSource('', 'text');
      }
      this._versionsEl.hidden = true;
    }

    // ── Toolbar actions ──
    copy() {
      const ctx = this.getActive();
      if (!ctx) return;
      // Reuse the embedded CodeBlock's own dual-format Copy (text/plain
      // + text/html with syntax highlighting). This is the same path
      // Slice 6 enabled for chat code blocks.
      const cb = this._codeBlockEl && this._codeBlockEl._lbCodeBlock;
      if (cb && typeof cb.copy === 'function') {
        cb.copy();
      } else {
        // Fallback: navigator.clipboard plain text.
        try { navigator.clipboard.writeText(ctx.source || ''); } catch (e) { /* swallow */ }
      }
    }
    download() {
      const ctx = this.getActive();
      if (!ctx) return;
      // Delegate to CodeBlock's Save (smart filename based on lang/title).
      const cb = this._codeBlockEl && this._codeBlockEl._lbCodeBlock;
      if (cb && typeof cb.save === 'function') {
        // CodeBlock reads its own data-lb-title for the filename. Push
        // the active artifact title up so the download filename is
        // meaningful.
        const a = this._artifacts.get(this._activeId);
        if (a) this._codeBlockEl.setAttribute('data-lb-title', a.title);
        cb.save();
      }
    }
    share() {
      const ctx = this.getActive();
      if (!ctx) return;
      this.el.dispatchEvent(new CustomEvent('lb-artifact-share', {
        bubbles: true,
        detail: ctx,
      }));
    }

    // ── Open / close ──
    show() {
      this.el.hidden = false;
      this._open = true;
    }
    hide() {
      this.el.hidden = true;
      this._open = false;
    }
    close() {
      this.hide();
      // Walk up to the workspace rail (if hosted in one) and collapse
      // it entirely — when the rail's only tenant goes away, the rail
      // should disappear from the layout, not linger as an empty
      // column. The rail's [hidden] CSS makes the workspace's flex
      // row reflow to fill the space.
      const rail = this.el.closest('[data-lb-chat-workspace-rail]');
      if (rail) {
        rail.hidden = true;
        rail.innerHTML = '';
      }
      this.el.dispatchEvent(new CustomEvent('lb-artifact-close', { bubbles: true }));
    }
    isOpen() { return this._open; }

    // ── Public introspection ──
    getActive() {
      if (!this._activeId) return null;
      const a = this._artifacts.get(this._activeId);
      if (!a) return null;
      const v = this._activeVersion.get(a.id);
      const versionObj = a.versions.find((x) => x.id === v) || a.versions[0];
      return {
        artifactId: a.id,
        title: a.title,
        lang: a.lang,
        versionId: versionObj.id,
        source: versionObj.source,
      };
    }
    getArtifacts() {
      return this._order.map((id) => Object.assign({}, this._artifacts.get(id)));
    }

    // ── Select helpers — LB.Select doesn't expose a setOptions /
    // setValue API that re-renders in place, so we keep the trigger
    // styled with our own text update and rebuild options on demand. ──
    _setSelectOptions(fieldEl, options, value) {
      // Stash options on the dataset so a later LB.Select init can
      // honour them; replace the visible text on the trigger button
      // if present.
      try { fieldEl.dataset.lbOptions = JSON.stringify(options); } catch (e) { /* ignore */ }
      const sel = fieldEl._lbSelect;
      if (sel) {
        sel.setOptions(options);
        sel._value = value;
        const textEl = fieldEl.querySelector('.lb-select__text');
        const match = options.find((o) => o.value === value);
        if (textEl && match) {
          textEl.textContent = match.label;
          textEl.classList.remove('lb-select__text--placeholder');
          // keep the full-label tooltip in sync with the trigger text
          const trig = textEl.closest('button.lb-select');
          if (trig) trig.title = match.label;
        }
      } else {
        // Pre-init path: set data-lb-value so Select picks it up.
        if (value != null) fieldEl.dataset.lbValue = value;
      }
    }

    _updateSelectSilently(fieldEl, value) {
      const sel = fieldEl._lbSelect;
      if (!sel) return;
      const opt = sel._options.find((o) => o.value === value);
      if (!opt) return;
      sel._value = value;
      const textEl = fieldEl.querySelector('.lb-select__text');
      if (textEl) {
        textEl.textContent = opt.label;
        textEl.classList.remove('lb-select__text--placeholder');
        const trig = textEl.closest('button.lb-select');
        if (trig) trig.title = opt.label;
      }
    }
  }

  // Lang → file icon. Falls back to 'file' for unknown.
  function iconForLang(lang) {
    if (!lang) return 'file';
    const l = String(lang).toLowerCase();
    if (l === 'html')               return 'code';
    if (l === 'css')                return 'palette';
    if (l === 'js' || l === 'ts')   return 'code';
    if (l === 'json')               return 'code';
    if (l === 'bash' || l === 'sh') return 'code';
    if (l === 'md' || l === 'markdown') return 'file-text';
    return 'file';
  }

  // ─── WORKSPACE INTEGRATION ─────────────────────────────────
  // If LB.ChatWorkspace is present, augment it with rail helpers:
  // openArtifact, closeArtifact, getArtifact. The chat workspace's
  // rail slot is the canonical mount point for an artifact panel.
  if (LB.ChatWorkspace) {
    const WS = LB.ChatWorkspace;
    if (!WS.prototype.openArtifact) {
      WS.prototype.openArtifact = function (opts) {
        const rail = this.getSlot('rail');
        if (!rail) return null;
        // Mount the artifact panel — clear any prior rail tenant (e.g.,
        // the workspace settings panel) so only one panel lives in the
        // rail at a time.
        let artifactEl = rail.querySelector('[data-lb-artifact]');
        if (!artifactEl) {
          if (rail.querySelector('[data-lb-settings-panel]') && typeof this.closeSettings === 'function') {
            this.closeSettings();
          } else {
            rail.innerHTML = '';
          }
          artifactEl = document.createElement('div');
          artifactEl.setAttribute('data-lb-artifact', '');
          rail.appendChild(artifactEl);
          if (LB.init) LB.init(rail);
        }
        const inst = artifactEl._lbArtifact;
        if (!inst) return artifactEl;
        if (opts && Array.isArray(opts.artifacts)) inst.setArtifacts(opts.artifacts);
        else if (opts && opts.id && opts.source != null) inst.addArtifact(opts);
        if (opts && opts.activeId) inst.setActive(opts.activeId);
        if (opts && opts.view) inst.setView(opts.view);
        rail.hidden = false;
        inst.show();
        return inst;
      };
      WS.prototype.closeArtifact = function () {
        const rail = this.getSlot('rail');
        if (!rail) return;
        const artifactEl = rail.querySelector('[data-lb-artifact]');
        if (artifactEl && artifactEl._lbArtifact) artifactEl._lbArtifact.close();
        rail.hidden = true;
      };
      WS.prototype.getArtifact = function () {
        const rail = this.getSlot('rail');
        if (!rail) return null;
        const artifactEl = rail.querySelector('[data-lb-artifact]');
        return artifactEl ? artifactEl._lbArtifact : null;
      };
    }
  }

  // ─── PUBLIC API + SELF-REGISTRATION ────────────────────────
  LB.Artifact = Artifact;
  LB.register('artifact', Artifact, '[data-lb-artifact]');
})();
