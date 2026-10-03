/**
 * slot-engine.js — the letbe brand/accent slot engine (pure math, no DOM)
 *
 * ONE engine, two tools: letbe.design's theme editor consumes this file
 * directly; the letbe tokens Figma plugin vendors it VERBATIM and pins its
 * copy against ENGINE_VERSION with a same-seed → byte-identical regression
 * fixture. Anything that changes generated output MUST bump ENGINE_VERSION.
 *
 * Exposes window.LetbeSlotEngine:
 *   ENGINE_VERSION, CANON            — version stamp + canonical hex anchors
 *   STEPS, PALETTE_STEPS             — the step scale + OKLCH ramp spec
 *   stepIndex, snapToStep, shiftStep — step arithmetic
 *   hexToRgb, rgbToHex, rgbToOklch, oklchToRgb, srgbToLinear
 *   contrastRatio(hexA, hexB)        — WCAG 2.x ratio
 *   generatePalette(seedHex)         — 11-step luminance-normalized ramp
 *   computeAccentRemap(emphasisStep, themeMode, palette?, hexes?)
 *   planBrandPrimary(palette, emphasisStep, hexes?)
 *   computeValueFillStep(palette, themeMode, hexes?) — value fill vs track
 *   auditAccentPairs(wcagPairs, mergedJson)          — pure pair evaluation
 *
 * The hexes parameter defaults to CANON (the canonical letbe-ds neutrals:
 * dark page, light/dark ink, light/dark track). Pass overrides only when
 * auditing against a retuned neutral scale.
 */
(function () {
  'use strict';

  // Bump on ANY output-affecting change; the plugin pins against this.
  const ENGINE_VERSION = '1.0.0'; // 2026-08-31 · letbe-ds post-a9aa8bf extraction

  // Canonical neutral anchors (letbe-ds factory values).
  const CANON = {
    pageDark:  '#060504',  // dark bg.default
    inkLight:  '#f7f5f1',  // fg.inverse-strong / light page
    inkDark:   '#13110e',  // dark ink ({fg.inverse} resolved in dark)
    trackLight:'#dfdcd7',  // light slider/progress track
    trackDark: '#272522',  // dark slider/progress track
  };


  const PALETTE_STEPS = [
    { step: 50,  L: 0.97, cMul: 0.15 },
    { step: 100, L: 0.94, cMul: 0.30 },
    { step: 200, L: 0.88, cMul: 0.55 },
    { step: 300, L: 0.80, cMul: 0.75 },
    { step: 400, L: 0.68, cMul: 0.95 },
    { step: 500, L: 0.56, cMul: 1.00 },
    { step: 600, L: 0.46, cMul: 0.95 },
    { step: 700, L: 0.36, cMul: 0.85 },
    { step: 800, L: 0.26, cMul: 0.70 },
    { step: 900, L: 0.16, cMul: 0.50 },
    { step: 950, L: 0.08, cMul: 0.35 },
  ];

  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const n = m.length === 3
      ? m.split('').map(c => parseInt(c + c, 16))
      : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
    return { r: n[0] / 255, g: n[1] / 255, b: n[2] / 255 };
  }
  function rgbToHex({ r, g, b }) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return '#' + [c(r), c(g), c(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function srgbToLinear(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(v) {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }
  function rgbToOklch({ r, g, b }) {
    const rL = srgbToLinear(r), gL = srgbToLinear(g), bL = srgbToLinear(b);
    const l = 0.4122214708 * rL + 0.5363325363 * gL + 0.0514459929 * bL;
    const m = 0.2119034982 * rL + 0.6806995451 * gL + 0.1073969566 * bL;
    const s = 0.0883024619 * rL + 0.2817188376 * gL + 0.6299787005 * bL;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    const c = Math.sqrt(a * a + b2 * b2);
    let h = Math.atan2(b2, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { L, c, h };
  }
  function oklchToRgb({ L, c, h }) {
    const hRad = h * Math.PI / 180;
    const a = c * Math.cos(hRad);
    const b = c * Math.sin(hRad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const rL =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gL = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bL = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return {
      r: Math.max(0, Math.min(1, linearToSrgb(rL))),
      g: Math.max(0, Math.min(1, linearToSrgb(gL))),
      b: Math.max(0, Math.min(1, linearToSrgb(bL))),
    };
  }
  function generatePalette(baseHex) {
    const rgb = hexToRgb(baseHex);
    const oklch = rgbToOklch(rgb);
    const baseC = oklch.c;
    const result = {};
    for (const { step, L, cMul } of PALETTE_STEPS) {
      const c = baseC * cMul;
      result[step] = rgbToHex(oklchToRgb({ L, c, h: oklch.h }));
    }
    return result;
  }

  function relLuminance({ r, g, b }) {
    const rL = srgbToLinear(r), gL = srgbToLinear(g), bL = srgbToLinear(b);
    return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
  }
  function contrastRatio(hexA, hexB) {
    const lA = relLuminance(hexToRgb(hexA));
    const lB = relLuminance(hexToRgb(hexB));
    const lighter = Math.max(lA, lB);
    const darker  = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function snapToStep(L) {
    let bestStep = 500, bestDist = Infinity;
    for (const { step, L: stepL } of PALETTE_STEPS) {
      const d = Math.abs(stepL - L);
      if (d < bestDist) { bestDist = d; bestStep = step; }
    }
    return bestStep;
  }
  const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  function stepIndex(step) { return STEPS.indexOf(step); }
  function shiftStep(step, delta) {
    const i = Math.max(0, Math.min(STEPS.length - 1, stepIndex(step) + delta));
    return STEPS[i];
  }

  function computeAccentRemap(emphasisStep, themeMode, palette, hexes) {
    const H = hexes || CANON;
    const dir = emphasisStep <= 500 ? +1 : -1;
    const bold      = shiftStep(emphasisStep, dir);
    const boldest   = shiftStep(emphasisStep, dir * 2);
    const softer    = 200;
    const softerer  = 100;

    if (themeMode === 'dark') {
      const complement = 1000 - emphasisStep;
      const darkEmphasis = STEPS.reduce((best, s) =>
        Math.abs(s - complement) < Math.abs(best - complement) ? s : best, 500);
      const darkDir = darkEmphasis <= 500 ? +1 : -1;
      // Dark-mode SHAPE is invariant regardless of where the seed snaps:
      // ink lives on the light side, washes on the dark side. The old
      // ±darkDir walk inverted BOTH for seeds snapping ≤400 (complement
      // >500 → darkDir −1): dark fg landed at 700/800/900 (invisible ink,
      // 2.1:1-class) and washes at 300/100 (light fills on the dark page)
      // — the item-29 follow-up bug. Washes now always walk darker; the
      // ink walk is MEASURED when the palette is provided: first candidate
      // (the structural pick — byte-identical for ≥500 snaps, so preset
      // output does not move) that clears 4.5 vs the dark page AND vs its
      // own subtle wash, escalating toward lighter stops.
      // Floor the wash anchor at 400 so very dark seeds (darkEmphasis 200-300)
      // still get canon-side washes (≥700/≥900) — a 600 "subtle wash" starves
      // every light ink candidate of wash contrast. Byte-stable for
      // darkEmphasis ≥ 400 (every ≥500-snapping seed, incl. all presets).
      const washAnchor = Math.max(darkEmphasis, 400);
      const washSubtle = shiftStep(washAnchor, +3);
      const washMuted  = shiftStep(washAnchor, +5);
      const structural = shiftStep(darkEmphasis, -1);
      let fgPick = structural;
      if (palette) {
        const PAGE_DARK = H.pageDark;
        const candidates = [...new Set([
          structural, shiftStep(darkEmphasis, -2), shiftStep(darkEmphasis, -3),
          400, 300, 200, 100,
        ])];
        const worstOf = (s) => Math.min(
          contrastRatio(palette[s], PAGE_DARK),
          contrastRatio(palette[s], palette[washSubtle]));
        fgPick = null;
        for (const s of candidates) {
          if (worstOf(s) >= 4.5) { fgPick = s; break; }
        }
        if (fgPick == null) {
          fgPick = candidates.reduce((a, b) => (worstOf(a) >= worstOf(b) ? a : b));
        }
      }
      return {
        'fg-accent':          fgPick,
        'fg-accent-muted':    shiftStep(fgPick, -1),
        'fg-accent-subtle':   shiftStep(fgPick, -2),
        'bg-accent-subtle':   washSubtle,
        'bg-accent-muted':    washMuted,
        'bg-accent':          darkEmphasis,
        'bg-accent-strong':   shiftStep(darkEmphasis, -darkDir * 1),
        'bg-accent-bolder':   shiftStep(darkEmphasis, -darkDir * 2),
        'border-accent':      shiftStep(darkEmphasis, +darkDir * 2),
        'border-focus':       darkEmphasis,
      };
    }

    const MIN_FG_STEP = 700;
    const rawFgAccent       = emphasisStep <= 500 ? shiftStep(emphasisStep, +1) : emphasisStep;
    const rawFgAccentMuted  = emphasisStep <= 500 ? shiftStep(emphasisStep, +1) : emphasisStep;
    const rawFgAccentSubtle = emphasisStep <= 500 ? shiftStep(emphasisStep, +2) : shiftStep(emphasisStep, -1);
    return {
      'fg-accent':          Math.max(rawFgAccent,       MIN_FG_STEP),
      'fg-accent-muted':    Math.max(rawFgAccentMuted,  MIN_FG_STEP),
      'fg-accent-subtle':   Math.max(rawFgAccentSubtle, MIN_FG_STEP),
      'bg-accent-subtle':   softer,
      'bg-accent-muted':    softerer,
      'bg-accent':          emphasisStep,
      'bg-accent-strong':   bold,
      'bg-accent-bolder':   boldest,
      'border-accent':      softer,
      'border-focus':       emphasisStep,
    };
  }

  // ── Measured brand-primary planner ──────────────────────────
  // Plans the primary button family BY MEASUREMENT, both modes at once —
  // the discipline the value fill got, now for interaction steps. The
  // component tier is single-bucket, so the text must be ONE ref valid in
  // both modes:
  //   {fg.inverse-strong} — stable light ink → dark fills in BOTH modes
  //   {fg.inverse}        — light ink in light mode, dark ink in dark
  // Strategy choice = least total step-walking from the structural remap
  // (stays closest to the brand identity); every default/hover/pressed
  // step is then ≥4.5 vs the resolved ink by construction, states walking
  // AWAY from the ink so hover/pressed only gain contrast.
  function planBrandPrimary(palette, emphasisStep, hexes) {
    const H = hexes || CANON;
    const INK_LIGHT = H.inkLight, INK_DARK = H.inkDark;
    const inkFor = (ref, mode) =>
      ref === '{fg.inverse-strong}' ? INK_LIGHT : (mode === 'dark' ? INK_DARK : INK_LIGHT);
    const planMode = (mode, ref) => {
      const start = computeAccentRemap(emphasisStep, mode)['bg-accent'];
      const ink = inkFor(ref, mode);
      const dir = ink === INK_LIGHT ? +1 : -1; // toward darker / lighter steps
      let i = STEPS.indexOf(start);
      let walked = 0;
      while (i + dir >= 0 && i + dir < STEPS.length
             && contrastRatio(palette[STEPS[i]], ink) < 4.5) { i += dir; walked++; }
      const at = (j) => STEPS[Math.min(STEPS.length - 1, Math.max(0, j))];
      const d = at(i), st = at(i + dir), b = at(i + 2 * dir);
      return {
        walked,
        steps: { default: d, strong: st, bolder: b },
        ratios: {
          default: contrastRatio(palette[d], ink),
          strong: contrastRatio(palette[st], ink),
          bolder: contrastRatio(palette[b], ink),
        },
      };
    };
    const evaluate = (ref) => {
      const light = planMode('light', ref), dark = planMode('dark', ref);
      const minRatio = Math.min(
        light.ratios.default, light.ratios.strong, light.ratios.bolder,
        dark.ratios.default, dark.ratios.strong, dark.ratios.bolder);
      return { ref, light, dark, minRatio, ok: minRatio >= 4.5, walked: light.walked + dark.walked };
    };
    const candidates = [evaluate('{fg.inverse-strong}'), evaluate('{fg.inverse}')];
    const passing = candidates.filter((c) => c.ok);
    if (passing.length) {
      passing.sort((a, b) => a.walked - b.walked || (a.ref === '{fg.inverse-strong}' ? -1 : 1));
      return passing[0];
    }
    candidates.sort((a, b) => b.minRatio - a.minRatio);
    return candidates[0];
  }

  // ── Value-display fill — measured vs the canonical tracks ──
  // The step a value fill (slider/progress/spinner) wears, picked per theme
  // so it clears 3:1 against the track; candidates walk brand-identity-first.
  function computeValueFillStep(palette, themeMode, hexes) {
    const H = hexes || CANON;
    const TRACK = themeMode === 'dark' ? H.trackDark : H.trackLight;
    const candidates = themeMode === 'dark' ? [400, 300, 500] : [600, 700, 500];
    for (const s of candidates) {
      if (contrastRatio(palette[s], TRACK) >= 3) return s;
    }
    return candidates.reduce((a, b) =>
      contrastRatio(palette[a], TRACK) >= contrastRatio(palette[b], TRACK) ? a : b);
  }

  // ── Pure manifest-pair audit for the accent families ──
  // Evaluates the shipped $schema.wcag_pairs entries that involve accent /
  // accent-2 / accent-3 against a fully-merged DTCG theme, both modes.
  // No closure state: callers pass the pairs and the merged JSON.
  function auditAccentPairs(wcagPairs, mergedJson) {
    const pairs = wcagPairs || [];
    const merged = mergedJson || {};
    const resolveRef = (mode, val, depth) => {
      if (depth > 6 || typeof val !== 'string') return null;
      const m = val.match(/^\{([^}]+)\}$/);
      if (!m) return val.startsWith('#') ? val : null;
      const parts = m[1].split('.');
      for (const root of [merged.primitives, merged.semantic && merged.semantic[mode], merged.component]) {
        let node = root;
        for (const p of parts) node = node && node[p];
        if (node && node.$value !== undefined) return resolveRef(mode, node.$value, depth + 1);
      }
      return null;
    };
    const tokenHex = (mode, name) => {
      if (name.startsWith('#')) return name;
      const slash = name.indexOf('/');
      const grp = name.slice(0, slash), rest = name.slice(slash + 1);
      let node = null;
      if (grp === 'fg' || grp === 'bg' || grp === 'border') {
        node = merged.semantic && merged.semantic[mode] && merged.semantic[mode][grp] && merged.semantic[mode][grp][rest];
      } else {
        node = merged.component && merged.component[grp] && merged.component[grp][rest];
      }
      return node && node.$value !== undefined ? resolveRef(mode, node.$value, 0) : null;
    };
    const rows = [], fails = [];
    for (const p of pairs) {
      const touches = (p.fg + ' ' + p.bg).includes('accent');
      if (!touches || p.status === 'exempt' || p.status === 'advisory' || p.over) continue;
      for (const mode of ['light', 'dark']) {
        const fgHex = tokenHex(mode, p.fg), bgHex = tokenHex(mode, p.bg);
        if (!fgHex || !bgHex) continue;
        const ratio = Math.round(contrastRatio(fgHex, bgHex) * 100) / 100;
        const row = { pair: p.what, mode, fg: p.fg, bg: p.bg, ratio, min: p.min, pass: ratio >= p.min };
        rows.push(row);
        if (!row.pass) fails.push(row);
      }
    }
    return { rows, fails };
  }

  window.LetbeSlotEngine = {
    ENGINE_VERSION, CANON,
    STEPS, PALETTE_STEPS, stepIndex, snapToStep, shiftStep,
    hexToRgb, rgbToHex, rgbToOklch, oklchToRgb, srgbToLinear,
    contrastRatio, generatePalette,
    computeAccentRemap, planBrandPrimary, computeValueFillStep,
    auditAccentPairs,
  };
})();
