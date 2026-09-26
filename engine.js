/* BeBold 2.0 rendering engine.
 *
 * Paints a bionic-reading treatment using the CSS Custom Highlight API. It never
 * creates, removes, or modifies a single node in the page: the entire effect is
 * StaticRanges registered against CSS.highlights and styled by a ::highlight() rule.
 * That is what makes it layout-neutral, copy-safe, find-in-page-safe, and invisible
 * to the accessibility tree.
 *
 * Deliberately free of every chrome.* API so it can be driven directly by the QA
 * harness (Chrome 137 removed --load-extension, so the harness cannot install a real
 * extension and must run this file itself).
 *
 * Exposes window.BeBoldEngine.
 */
(function () {
  'use strict';
  if (window.BeBoldEngine) return;

  const HIGHLIGHT_NAME = 'bebold-fixation';

  // ---------------------------------------------------------------- config ---

  const DEFAULTS = {
    preset: 'bold',            // bold | underline | background
    strength: 3,               // 1..5
    ratio: 'default',          // shorter | default | longer
    scripts: {                 // opt-in families, all declined by default
      arabic: false, brahmic: false, cjk: false, seasia: false,
    },
  };

  // Measured in spike/RESULTS.md: .024em to .035em reads as genuine bold at 13px and
  // 16px in serif and sans, light and dark. .05em begins to smudge at 16px and above.
  const STRENGTH_EM = { 1: 0.018, 2: 0.023, 3: 0.028, 4: 0.035, 5: 0.045 };

  // The offset is em-relative, so one raw value over-inks headings and under-inks
  // small text. Clamping to an absolute range keeps 13px legible and 32px clean.
  const CLAMP_MIN = '0.30px';
  const CLAMP_MAX = '0.55px';

  // --------------------------------------------------------------- policy ----

  /* The refusal policy is data, not code. policy.js is generated from policy.v1.json
     so that someone who reads a writing system better than they read JavaScript can
     change a verdict and open a pull request. It is loaded first by the manifest.

     The inline fallback below exists because engine.js must stay runnable on its own:
     the live-site QA harness injects this one file into pages, where nothing else of
     ours is present. CI asserts the two agree. */
  const P = window.BeBoldPolicy || null;

  const NON_TEXT = P ? P.nonText : new Set(['script', 'style', 'noscript', 'template',
    'svg', 'math', 'canvas', 'video', 'audio', 'img', 'picture', 'source', 'track',
    'object', 'embed', 'iframe', 'frame', 'frameset', 'noframes', 'applet', 'map',
    'area', 'param', 'link', 'base', 'meta', 'head', 'title', 'col', 'colgroup']);

  const CONTROLS = P ? P.controls : new Set(['input', 'textarea', 'select', 'option',
    'optgroup', 'button', 'meter', 'progress']);

  const CODEISH = P ? P.codeish : new Set(['code', 'pre', 'kbd', 'samp', 'var', 'tt']);

  const SCRIPT_FAMILIES = P ? P.scriptFamilies : [
    ['arabic', /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Adlam}]/u],
    ['brahmic', /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Tibetan}]/u],
    ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u],
    ['seasia', /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u],
  ];

  const DENY_SPANS = P ? P.denySpans : [
    /\bhttps?:\/\/\S+/gi,
    /\bwww\.[^\s]+/gi,
    /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi,
    /\bv\d+(\.\d+)+(-[\w.]+)?\b|\b\d+\.\d+\.\d+(-[\w.]+)?\b/gi,
    /#[0-9a-fA-F]{3,8}\b/g,
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    /\b\d{5,}\b|\b\d{1,3}(,\d{3})+\b/g,
    /\b[A-Z]{2}\d{2}[ ]?[A-Z0-9][A-Z0-9 ]{8,28}\b/g,
    /[$€£¥₹]\s?\d[\d,.]*/g,
    /\b\d+(\.\d+)?\s?(mg|mcg|µg|ug|ml|mL|kg|IU|mmol|mEq|cc)\b/gi,
    /\/[\w.-]+\/[\w.-]+|\b[\w.-]+\/[\w.-]+\/[\w./-]+/g,
    /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu,
  ];

  const ICON_FONT = P ? P.iconFont
    : /font\s*awesome|material icons|material symbols|glyphicon|ionicons|feather|bootstrap-icons/i;

  const OPT_OUT_ATTR = P ? P.optOutAttribute : 'data-bebold-skip';
  const OPT_OUT_META = P ? P.optOutMeta : 'meta[name="bebold"][content="off"]';

  // ------------------------------------------------------------- internals ---

  let config = structuredCloneish(DEFAULTS);
  let running = false;
  let styleSheet = null;
  let observer = null;
  let rafHandle = 0;
  let docRefusal = null;

  // Highlight has no getRangesForNode() (verified absent on Chrome 151), and
  // Highlight.delete() needs the original object reference, so incremental
  // invalidation is impossible without our own index.
  const index = new WeakMap();      // Text -> StaticRange[]
  let allRanges = new Set();
  const dirty = new Set();

  const stats = { treated: 0, skipped: 0, reasons: Object.create(null), nodes: 0,
                  lastPassMs: 0, samples: [] };
  const SAMPLE_CAP = 40;

  function structuredCloneish(o) { return JSON.parse(JSON.stringify(o)); }
  function bump(reason, n) {
    stats.skipped += n;
    stats.reasons[reason] = (stats.reasons[reason] || 0) + n;
  }

  // ------------------------------------------------------------ segmenting ---

  const segCache = new Map();
  function segmenters(locale) {
    let s = segCache.get(locale);
    if (!s) {
      try {
        s = { word: new Intl.Segmenter(locale, { granularity: 'word' }),
              grapheme: new Intl.Segmenter(locale, { granularity: 'grapheme' }) };
      } catch {
        s = { word: new Intl.Segmenter('en', { granularity: 'word' }),
              grapheme: new Intl.Segmenter('en', { granularity: 'grapheme' }) };
      }
      segCache.set(locale, s);
    }
    return s;
  }

  function localeFor(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      const l = el.getAttribute && el.getAttribute('lang');
      if (l) return l;
    }
    return document.documentElement.lang || navigator.language || 'en';
  }

  function fixationLength(graphemeCount, mode) {
    const n = graphemeCount;
    let k;
    if (n <= 3) k = 1;
    else if (n === 4) k = 2;
    else if (n <= 7) k = 3;
    else if (n <= 9) k = 4;
    else k = Math.ceil(n * 0.4);
    if (mode === 'shorter') k = Math.max(1, k - 1);
    else if (mode === 'longer') k = k + 1;
    return Math.max(1, Math.min(k, n));
  }

  /* Cut offset in code units, chosen on grapheme boundaries so surrogate pairs,
     ZWJ emoji sequences, Hangul jamo and Devanagari aksharas are never split. */
  function cutOffset(word, seg) {
    const g = [];
    for (const s of seg.grapheme.segment(word)) g.push(s.index);
    const n = g.length;
    if (n === 0) return 0;
    if (n === 1) return word.length;
    const k = fixationLength(n, config.ratio);
    return k >= n ? word.length : g[k];
  }

  function denySpans(text) {
    const spans = [];
    for (const re of DENY_SPANS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        spans.push([m.index, m.index + m[0].length]);
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    return spans;
  }
  function inSpans(spans, a, b) {
    for (const [s, e] of spans) if (a < e && b > s) return true;
    return false;
  }

  function scriptVerdict(word) {
    for (const [family, re] of SCRIPT_FAMILIES) {
      if (re.test(word)) return config.scripts[family] ? null : family;
    }
    return null;
  }

  // ------------------------------------------------------------- filtering ---

  /* Why this text node is untouchable, or null if it is fair game. */
  function elementRefusal(el) {
    for (let p = el; p; p = p.parentElement) {
      const tag = p.nodeName.toLowerCase();
      if (NON_TEXT.has(tag)) return 'non-text-element';
      if (CONTROLS.has(tag)) return 'interactive-control';
      if (CODEISH.has(tag)) return 'code';
      if (p.isContentEditable) return 'editable';
      const role = p.getAttribute && p.getAttribute('role');
      if (role === 'textbox' || role === 'code') return 'editable';
      if (p.hasAttribute && p.hasAttribute(OPT_OUT_ATTR)) return 'site-opt-out';
      if (credentialForms.has(p)) return 'credential-form';
    }
    return null;
  }

  function isMonospace(el) {
    const ff = getComputedStyle(el).fontFamily || '';
    if (ICON_FONT.test(ff)) return 'icon-font';
    if (/\bmonospace\b|\bcourier\b|\bmenlo\b|\bconsolas\b|\bmonaco\b/i.test(ff)) return 'code';
    return null;
  }

  const CRED_SELECTOR = P ? P.credentialSelector
    : 'input[type="password"],[autocomplete*="cc-number" i],' +
      '[autocomplete*="cc-exp" i],[autocomplete*="cc-csc" i],[autocomplete*="cc-name" i],' +
      '[autocomplete*="one-time-code" i],[autocomplete*="current-password" i],' +
      '[autocomplete*="new-password" i]';

  let credentialForms = new WeakSet();

  function visible(el) {
    try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); }
    catch { return !!(el.offsetParent || el.getClientRects().length); }
  }

  /* Refusing a whole document needs a VISIBLE credential field. Requiring only
     presence was too blunt: a blog with a collapsed login form in its footer (measured
     on css-tricks.com) refused the entire article. Hidden credential forms still get
     their own subtree excluded, which is the proportionate response. */
  function documentRefusal() {
    if (document.querySelector(OPT_OUT_META)) return 'site-opt-out';
    credentialForms = new WeakSet();
    let visibleCredential = false;
    for (const field of document.querySelectorAll(CRED_SELECTOR)) {
      if (visible(field)) visibleCredential = true;
      const form = field.closest('form') || field.parentElement;
      if (form) credentialForms.add(form);
    }
    return visibleCredential ? 'credential-page' : null;
  }

  // --------------------------------------------------------------- ranges ----

  function rangesForTextNode(node) {
    const text = node.data;
    if (!text || !text.trim()) return null;

    const parent = node.parentElement;
    if (!parent) return null;

    const why = elementRefusal(parent);
    if (why) { bump(why, countWords(text, node)); return null; }
    const mono = isMonospace(parent);
    if (mono) { bump(mono, countWords(text, node)); return null; }

    const seg = segmenters(localeFor(node));
    const spans = denySpans(text);
    const out = [];

    for (const s of seg.word.segment(text)) {
      if (!s.isWordLike) continue;
      const start = s.index;
      const word = s.segment;
      const end = start + word.length;

      if (inSpans(spans, start, end)) {
        bump('accuracy-critical', 1);
        if (stats.samples.length < SAMPLE_CAP) {
          stats.samples.push(text.slice(Math.max(0, start - 10), end + 10).trim());
        }
        continue;
      }
      const declined = scriptVerdict(word);
      if (declined) { bump('script:' + declined, 1); continue; }

      const cut = cutOffset(word, seg);
      if (cut <= 0) { bump('unsegmentable', 1); continue; }

      out.push(new StaticRange({
        startContainer: node, startOffset: start,
        endContainer: node, endOffset: start + cut,
      }));
      stats.treated++;
    }
    return out.length ? out : null;
  }

  function countWords(text, node) {
    let n = 0;
    try {
      for (const s of segmenters(localeFor(node)).word.segment(text)) if (s.isWordLike) n++;
    } catch { /* ignore */ }
    return n;
  }

  /* TreeWalker that rejects whole subtrees rather than filtering leaf by leaf, so a
     <script> or a code block costs one check instead of one per text node. */
  function collect(root, sink) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = n.nodeName.toLowerCase();
          if (NON_TEXT.has(tag) || CONTROLS.has(tag) || CODEISH.has(tag)) return NodeFilter.FILTER_REJECT;
          if (n.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (n.hasAttribute && n.hasAttribute(OPT_OUT_ATTR)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return n.data && n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) sink.push(n);

    // Open shadow roots. A document-level ::highlight() rule paints inside them
    // (verified in the spike), so one registry and one stylesheet covers everything.
    const hosts = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of hosts) if (el.shadowRoot) collect(el.shadowRoot, sink);
  }

  function segmentRoot(root) {
    const nodes = [];
    try { collect(root, nodes); } catch { return; }
    stats.nodes += nodes.length;
    for (const node of nodes) {
      const prev = index.get(node);
      if (prev) { for (const r of prev) allRanges.delete(r); index.delete(node); }
      const ranges = rangesForTextNode(node);
      if (ranges) { index.set(node, ranges); for (const r of ranges) allRanges.add(r); }
    }
  }

  function paint() {
    if (!('highlights' in CSS)) return;
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...allRanges));
  }

  // ---------------------------------------------------------------- style ----

  function ruleText() {
    const em = STRENGTH_EM[config.strength] || STRENGTH_EM[3];
    const off = `clamp(${CLAMP_MIN}, ${em}em, ${CLAMP_MAX})`;
    // forced-colors strips text-shadow, so fall back to something that survives it.
    const forced = window.matchMedia && window.matchMedia('(forced-colors: active)').matches;
    const preset = forced && config.preset === 'bold' ? 'underline' : config.preset;

    if (preset === 'underline') {
      return `::highlight(${HIGHLIGHT_NAME}){text-decoration:underline;` +
             `text-underline-offset:.18em;text-decoration-thickness:.06em}`;
    }
    if (preset === 'background') {
      return `::highlight(${HIGHLIGHT_NAME}){background-color:color-mix(in srgb,currentColor 14%,transparent)}`;
    }
    // Default. currentColor resolves per originating element, so links keep their
    // colour and dark mode keeps its own for free. Note: highlight style inheritance
    // only landed in Chrome 134; 105 to 133 is untested here.
    return `::highlight(${HIGHLIGHT_NAME}){text-shadow:${off} 0 0 currentColor,` +
           `calc(-1 * ${off}) 0 0 currentColor}`;
  }

  function applyStyle() {
    const css = ruleText();
    // A constructed stylesheet is not subject to the page's style-src CSP, unlike an
    // injected <style> element. Confirmed necessary: gov.uk blocks the latter.
    try {
      if (!styleSheet) {
        styleSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
      }
      styleSheet.replaceSync(css);
      return;
    } catch { /* fall through */ }
    let el = document.getElementById('bebold-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'bebold-style';
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
  }

  // ------------------------------------------------------------- observer ---

  function scheduleFlush() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = 0;
      const roots = [...dirty];
      dirty.clear();
      const t0 = performance.now();
      for (const r of roots) {
        if (r.isConnected === false) continue;
        segmentRoot(r);
      }
      paint();
      stats.lastPassMs = +(performance.now() - t0).toFixed(1);
    });
  }

  function startObserver() {
    observer = new MutationObserver((records) => {
      if (!running) return;
      for (const rec of records) {
        if (rec.type === 'characterData') {
          const p = rec.target.parentElement;
          if (p) dirty.add(p);
        } else {
          for (const n of rec.addedNodes) {
            if (n.nodeType === Node.ELEMENT_NODE) dirty.add(n);
            else if (n.nodeType === Node.TEXT_NODE && n.parentElement) dirty.add(n.parentElement);
          }
          for (const n of rec.removedNodes) {
            if (n.nodeType === Node.TEXT_NODE) {
              const prev = index.get(n);
              if (prev) { for (const r of prev) allRanges.delete(r); index.delete(n); }
            }
          }
        }
      }
      if (dirty.size) scheduleFlush();
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
    });
  }

  // ------------------------------------------------------------------ api ---

  const api = {
    supported() {
      return typeof CSS !== 'undefined' && 'highlights' in CSS &&
             typeof Highlight === 'function' && typeof StaticRange === 'function' &&
             typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
    },

    start(userConfig) {
      if (running) return api.getStats();
      if (!api.supported()) return { error: 'unsupported' };
      if (userConfig) api.setConfig(userConfig, true);

      docRefusal = documentRefusal();
      if (docRefusal) return { refused: docRefusal };

      running = true;
      const t0 = performance.now();
      applyStyle();
      segmentRoot(document.body || document.documentElement);
      paint();
      stats.lastPassMs = +(performance.now() - t0).toFixed(1);
      startObserver();
      return api.getStats();
    },

    stop() {
      running = false;
      if (observer) { observer.disconnect(); observer = null; }
      if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
      try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch { /* ignore */ }
      if (styleSheet) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== styleSheet);
        styleSheet = null;
      }
      const el = document.getElementById('bebold-style');
      if (el) el.remove();
      allRanges = new Set();
      dirty.clear();
      stats.treated = 0; stats.skipped = 0; stats.nodes = 0;
      stats.reasons = Object.create(null); stats.samples = [];
      return true;
    },

    setConfig(next, quiet) {
      config = Object.assign({}, config, next || {});
      config.scripts = Object.assign({}, DEFAULTS.scripts, (next && next.scripts) || config.scripts);
      if (!quiet && running) {
        applyStyle();
        allRanges = new Set();
        stats.treated = 0; stats.skipped = 0; stats.reasons = Object.create(null); stats.samples = [];
        segmentRoot(document.body || document.documentElement);
        paint();
      }
    },

    getConfig() { return structuredCloneish(config); },

    /* A stable fingerprint of the policy actually in force, so CI can prove the
       generated policy.js and engine.js's inline fallback have not drifted apart. */
    policySignature() {
      const set = (s) => [...s].sort().join(',');
      const res = (list) => list.map((r) => r.source + '/' + r.flags).sort().join('|');
      return [
        'nonText:' + set(NON_TEXT),
        'controls:' + set(CONTROLS),
        'codeish:' + set(CODEISH),
        'scripts:' + SCRIPT_FAMILIES.map(([n, r]) => n + '=' + r.source + '/' + r.flags).sort().join('|'),
        'deny:' + res(DENY_SPANS),
        'icon:' + ICON_FONT.source + '/' + ICON_FONT.flags,
        'cred:' + CRED_SELECTOR,
        'optOut:' + OPT_OUT_META + ',' + OPT_OUT_ATTR,
      ].join('\n');
    },

    policySource() { return P ? 'policy.js' : 'inline-fallback'; },

    getStats() {
      return {
        running, refused: docRefusal,
        treated: stats.treated, skipped: stats.skipped, samples: stats.samples.slice(0, 20),
        reasons: Object.assign({}, stats.reasons),
        textNodes: stats.nodes, lastPassMs: stats.lastPassMs,
        ranges: allRanges.size,
      };
    },
  };

  window.BeBoldEngine = api;
})();
