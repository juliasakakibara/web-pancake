/**
 * token-exporter.js — Thin compat shim.
 *
 * The real export logic lives in theme-editor.js (single source of truth
 * model). This file just exposes a global so older HTML pages that still
 * reference window.LetbeTokenExporter don't break, and provides the
 * `downloadJson` helper used by gallery-layout.js's Export button.
 *
 * No CSS-var-to-JSON reverse-routing here. No inline-style reading.
 * The new model is: ask the editor for its merged JSON, hand it to
 * downloadJson(). That's the entire flow.
 */
(function () {
  'use strict';

  function downloadJson(obj, filename) {
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'letbe-tokens.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Build the export by asking the theme editor for its merged JSON.
   * Async because the editor may still be bootstrapping (canonical fetch).
   */
  async function buildExport() {
    const editor = window.LetbeThemeEditor;
    if (!editor) throw new Error('Theme editor not loaded.');
    // Wait up to ~2 s for canonical to arrive on first call
    if (!editor.isReady()) {
      const deadline = Date.now() + 2000;
      while (!editor.isReady() && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    if (!editor.isReady()) throw new Error('Theme editor canonical tokens not ready.');
    const json = editor.buildExportJson();
    return { json, applied: [], skipped: [] };
  }

  window.LetbeTokenExporter = { buildExport, downloadJson };
})();
