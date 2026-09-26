/* BeBold spike: does the CSS Custom Highlight API give us a usable bionic
   treatment without touching the DOM?  Every claim here is measured, not asserted.
   Page-side half: builds the specimens and computes the DOM-level metrics.
   The pixel measurements are taken by spike/run-spike.mjs. */

const SPECIMEN = 'Hamburgefonstiv 0123';

/* Mixed-script paragraph. Deliberately contains the cases the current
   Math.floor(word.length / 2) rule cannot express. */
const PARA =
  'The quick brown fox jumps over the lazy dog while reading 500 mg of ' +
  'v2.14.0-rc.1 documentation. مرحبا بالعالم ' +
  'اليوم. สวัสดีชาวโลก. ' +
  '東京の天気は晴れです。 ' +
  '👨‍👩‍👧‍👦 naïve café résumé.';

const WS_TEXT =
  'Line one has\ttabs\tbetween words here\n' +
  'Line two   has   runs   of   spaces\n' +
  'Line three has non breaking spaces in it\n';

/* ------------------------------------------------------------------ *
 * The current extension, copied verbatim from contentScript.js.
 * Lines 18-37 (processTextNode) and 89-97 (the innerHTML surgery).
 * ------------------------------------------------------------------ */
function processTextNode(node) {
  let content = node.textContent;
  let words = content.split(/\s+/);
  if (words.length < 5) {
    return null;
  }
  let newHTML = words
    .map((word) => {
      let halfLength = Math.floor(word.length / 2);
      let firstHalf = word.slice(0, halfLength);
      let secondHalf = word.slice(halfLength);
      return `<strong id="custom-strong">${firstHalf}</strong><span id="custom-span">${secondHalf}</span>`;
    })
    .join(" ");
  return newHTML;
}

function applyLegacy(textNode) {
  const newContent = processTextNode(textNode);
  if (newContent && newContent !== "undefined") {
    const tempElement = document.createElement("div");
    tempElement.innerHTML = newContent;
    Array.from(tempElement.childNodes).forEach((newChild) => {
      textNode.parentNode.insertBefore(newChild, textNode);
    });
    textNode.parentNode.removeChild(textNode);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * The proposed replacement: grapheme-safe segmentation into ranges.
 * ------------------------------------------------------------------ */
function graphemeCut(word, locale) {
  const g = [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(word)];
  const n = g.length;
  if (n === 0) return 0;
  if (n === 1) return word.length;
  const k = Math.max(1, Math.ceil(n / 2));
  return k >= n ? g[n - 1].index : g[k].index;
}

function segmentTextNode(textNode, locale, RangeCtor) {
  const text = textNode.data;
  const prefix = [], suffix = [];
  const mk = (a, b) => RangeCtor === 'static'
    ? new StaticRange({ startContainer: textNode, startOffset: a,
                        endContainer: textNode, endOffset: b })
    : (() => { const r = document.createRange();
               r.setStart(textNode, a); r.setEnd(textNode, b); return r; })();
  for (const s of new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)) {
    if (!s.isWordLike) continue;
    const start = s.index, word = s.segment;
    const cut = graphemeCut(word, locale);
    if (cut <= 0) continue;
    prefix.push(mk(start, start + cut));
    if (cut < word.length) suffix.push(mk(start + cut, start + word.length));
  }
  return { prefix, suffix };
}

function wholeNodeRange(textNode, kind) {
  if (kind === 'static') {
    return new StaticRange({ startContainer: textNode, startOffset: 0,
                             endContainer: textNode, endOffset: textNode.data.length });
  }
  const r = document.createRange();
  r.setStart(textNode, 0);
  r.setEnd(textNode, textNode.data.length);
  return r;
}

/* ------------------------------------------------------------------ *
 * Measurement helpers
 * ------------------------------------------------------------------ */
function lineCount(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const tops = new Set();
  for (const rect of r.getClientRects()) {
    if (rect.width > 0 || rect.height > 0) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

function selectionTextOf(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.toString();
}

function boxOf(el) {
  const b = el.getBoundingClientRect();
  return { w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
}

/* ------------------------------------------------------------------ *
 * Panel 1: property support matrix
 * ------------------------------------------------------------------ */
const PROBES = [
  { id: 'ctl-range',   label: 'CONTROL color:#d00 via Range',        decl: 'color:#d00', kind: 'live',   expect: 'yes' },
  { id: 'ctl-static',  label: 'CONTROL color:#d00 via StaticRange',  decl: 'color:#d00', kind: 'static', expect: 'yes' },
  { id: 'bg',          label: 'background-color:#ff0',               decl: 'background-color:#ff0' },
  { id: 'deco',        label: 'text-decoration:underline wavy #d00', decl: 'text-decoration:underline wavy #d00' },
  { id: 'shadow024',   label: 'text-shadow faux-bold .024em',        decl: 'text-shadow:.024em 0 0 currentColor,-.024em 0 0 currentColor' },
  { id: 'shadow05',    label: 'text-shadow faux-bold .05em',         decl: 'text-shadow:.05em 0 0 currentColor,-.05em 0 0 currentColor' },
  { id: 'shadow4way',  label: 'text-shadow faux-bold 4-way .03em',   decl: 'text-shadow:.03em 0 0 currentColor,-.03em 0 0 currentColor,0 .02em 0 currentColor,0 -.02em 0 currentColor' },
  { id: 'fw900',       label: 'font-weight:900   << THE CRUX',       decl: 'font-weight:900' },
  { id: 'fwbold',      label: 'font-weight:bold',                    decl: 'font-weight:bold' },
  { id: 'stroke',      label: '-webkit-text-stroke:2px #d00  << CONTESTED', decl: '-webkit-text-stroke:2px #d00' },
  { id: 'strokew',     label: '-webkit-text-stroke-width:2px',       decl: '-webkit-text-stroke-width:2px' },
  { id: 'strokewc',    label: '-webkit-text-stroke-width + -color',  decl: '-webkit-text-stroke-width:2px;-webkit-text-stroke-color:#d00' },
  { id: 'fill',        label: '-webkit-text-fill-color:#0a0',        decl: '-webkit-text-fill-color:#0a0' },
  { id: 'emphasis',    label: 'text-emphasis:filled circle #d00  << CONTESTED', decl: 'text-emphasis:filled circle #d00' },
  { id: 'paintorder',  label: 'paint-order:stroke fill + stroke 2px', decl: 'paint-order:stroke fill;-webkit-text-stroke:2px #d00' },
  { id: 'fvs',         label: "font-variation-settings 'wght' 900",  decl: "font-variation-settings:'wght' 900" },
  { id: 'fsynth',      label: 'font-synthesis-weight + font-weight:900', decl: 'font-synthesis-weight:auto;font-weight:900' },
  { id: 'neg-ls',      label: 'NEG letter-spacing:6px',              decl: 'letter-spacing:6px',    expect: 'no' },
  { id: 'neg-it',      label: 'NEG font-style:italic',               decl: 'font-style:italic',     expect: 'no' },
  { id: 'neg-ff',      label: 'NEG font-family:monospace',           decl: 'font-family:monospace', expect: 'no' },
  { id: 'neg-tt',      label: 'NEG text-transform:uppercase',        decl: 'text-transform:uppercase', expect: 'no' },
  { id: 'neg-op',      label: 'NEG opacity:.2',                      decl: 'opacity:.2',            expect: 'no' },
  { id: 'neg-fil',     label: 'NEG filter:blur(2px)',                decl: 'filter:blur(2px)',      expect: 'no' },
];

const probeStyles = [];

function buildMatrix() {
  const host = document.getElementById('matrix-rows');
  for (const p of PROBES) {
    const row = document.createElement('div');
    row.className = 'probe';
    row.innerHTML =
      `<div class="label">${p.label}</div>` +
      `<div class="cell" id="cell-${p.id}-test"></div>` +
      `<div class="cell" id="cell-${p.id}-ctrl"></div>`;
    host.appendChild(row);

    const test = document.getElementById(`cell-${p.id}-test`);
    const ctrl = document.getElementById(`cell-${p.id}-ctrl`);
    test.appendChild(document.createTextNode(SPECIMEN));
    ctrl.appendChild(document.createTextNode(SPECIMEN));

    probeStyles.push(`::highlight(probe-${p.id}){${p.decl}}`);
    try {
      const hl = new Highlight(wholeNodeRange(test.firstChild, p.kind === 'static' ? 'static' : 'live'));
      CSS.highlights.set(`probe-${p.id}`, hl);
      p.registered = true;
    } catch (e) {
      p.registered = false;
      p.error = String(e && e.message || e);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Panel 2: invariance
 * ------------------------------------------------------------------ */
function buildInvariance() {
  const a = document.querySelector('#inv-a p');
  const b = document.querySelector('#inv-b p');
  const c = document.querySelector('#inv-c p');
  for (const el of [a, b, c]) el.appendChild(document.createTextNode(PARA));

  const before = {
    a: { box: boxOf(a), lines: lineCount(a), text: a.textContent, inner: a.innerText, kids: a.childNodes.length },
    b: { box: boxOf(b), lines: lineCount(b), text: b.textContent, inner: b.innerText, kids: b.childNodes.length },
    c: { box: boxOf(c), lines: lineCount(c), text: c.textContent, inner: c.innerText, kids: c.childNodes.length },
  };

  const bApplied = applyLegacy(b.firstChild);

  const { prefix, suffix } = segmentTextNode(c.firstChild, 'en', 'static');
  CSS.highlights.set('bb-prefix', new Highlight(...prefix));
  CSS.highlights.set('bb-suffix', new Highlight(...suffix));
  probeStyles.push('::highlight(bb-prefix){text-shadow:.028em 0 0 currentColor,-.028em 0 0 currentColor}');
  probeStyles.push('::highlight(bb-suffix){}');

  return {
    bApplied,
    prefixRanges: prefix.length,
    suffixRanges: suffix.length,
    before,
    after: {
      a: { box: boxOf(a), lines: lineCount(a), text: a.textContent, inner: a.innerText, kids: a.childNodes.length, sel: selectionTextOf(a), descendants: a.querySelectorAll('*').length },
      b: { box: boxOf(b), lines: lineCount(b), text: b.textContent, inner: b.innerText, kids: b.childNodes.length, sel: selectionTextOf(b), descendants: b.querySelectorAll('*').length },
      c: { box: boxOf(c), lines: lineCount(c), text: c.textContent, inner: c.innerText, kids: c.childNodes.length, sel: selectionTextOf(c), descendants: c.querySelectorAll('*').length },
    },
    duplicateIds: {
      customStrong: document.querySelectorAll('#custom-strong').length,
      customSpan: document.querySelectorAll('#custom-span').length,
      getElementByIdReturnsOne: !!document.getElementById('custom-strong'),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Panel 3: issue #2
 * ------------------------------------------------------------------ */
const REPRO_MODES = [
  { cls: 'flexrow',     label: 'display:flex' },
  { cls: 'flexcol',     label: 'display:flex; column' },
  { cls: 'gridbox',     label: 'display:grid' },
  { cls: 'inlineblock', label: 'children inline-block' },
];

function buildIssue2() {
  const host = document.getElementById('repro-grid');
  const out = [];
  for (const mode of REPRO_MODES) {
    for (const variant of ['a', 'b', 'c']) {
      const wrap = document.createElement('div');
      wrap.className = 'repro';
      wrap.innerHTML = `<span class="tag">${mode.label} / ${variant.toUpperCase()}</span>` +
                       `<div class="box ${mode.cls}" id="box-${mode.cls}-${variant}"></div>`;
      host.appendChild(wrap);
      const box = document.getElementById(`box-${mode.cls}-${variant}`);
      box.appendChild(document.createTextNode('The quick brown fox jumps over the lazy dog'));
    }
  }
  for (const mode of REPRO_MODES) {
    const a = document.getElementById(`box-${mode.cls}-a`);
    const b = document.getElementById(`box-${mode.cls}-b`);
    const c = document.getElementById(`box-${mode.cls}-c`);
    const baseline = { box: boxOf(a), lines: lineCount(a), items: a.childElementCount };
    applyLegacy(b.firstChild);
    const seg = segmentTextNode(c.firstChild, 'en', 'static');
    CSS.highlights.set(`bb-repro-${mode.cls}`, new Highlight(...seg.prefix));
    probeStyles.push(`::highlight(bb-repro-${mode.cls}){text-shadow:.028em 0 0 currentColor,-.028em 0 0 currentColor}`);
    out.push({
      mode: mode.label,
      baseline,
      legacy: { box: boxOf(b), lines: lineCount(b), items: b.childElementCount },
      highlight: { box: boxOf(c), lines: lineCount(c), items: c.childElementCount },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Panel 4: whitespace fidelity
 * ------------------------------------------------------------------ */
function buildWhitespace() {
  const a = document.getElementById('ws-a');
  const b = document.getElementById('ws-b');
  const c = document.getElementById('ws-c');
  for (const el of [a, b, c]) el.appendChild(document.createTextNode(WS_TEXT));
  const baseline = { text: a.textContent, box: boxOf(a), lines: lineCount(a) };
  applyLegacy(b.firstChild);
  const seg = segmentTextNode(c.firstChild, 'en', 'static');
  CSS.highlights.set('bb-ws', new Highlight(...seg.prefix));
  probeStyles.push('::highlight(bb-ws){text-shadow:.028em 0 0 currentColor,-.028em 0 0 currentColor}');
  return {
    baseline,
    legacy: { text: b.textContent, box: boxOf(b), lines: lineCount(b) },
    highlight: { text: c.textContent, box: boxOf(c), lines: lineCount(c) },
    legacyIdentical: b.textContent === WS_TEXT,
    highlightIdentical: c.textContent === WS_TEXT,
  };
}

/* ------------------------------------------------------------------ *
 * Panel 5: legibility
 * ------------------------------------------------------------------ */
const LEG_SENTENCE = 'Reading long passages of text on a screen is hard when your attention keeps sliding off the line.';

const LEG_VARIANTS = [
  { id: 'plain',   label: 'plain (no treatment)',            decl: null,  real: false },
  { id: 'realb',   label: 'REAL <b> bold prefix (reference)', decl: null,  real: true  },
  { id: 'sh024',   label: 'highlight text-shadow .024em',    decl: 'text-shadow:.024em 0 0 currentColor,-.024em 0 0 currentColor' },
  { id: 'sh035',   label: 'highlight text-shadow .035em',    decl: 'text-shadow:.035em 0 0 currentColor,-.035em 0 0 currentColor' },
  { id: 'sh05',    label: 'highlight text-shadow .05em',     decl: 'text-shadow:.05em 0 0 currentColor,-.05em 0 0 currentColor' },
  { id: 'fade70',  label: 'highlight fade suffix to 70%',    decl: null, fade: 70 },
  { id: 'fade55',  label: 'highlight fade suffix to 55%',    decl: null, fade: 55 },
  { id: 'underl',  label: 'highlight underline prefix',      decl: 'text-decoration:underline;text-underline-offset:.18em;text-decoration-thickness:.06em' },
];

function buildLegibility() {
  const host = document.getElementById('leg-panels');
  const panels = [
    { font: 'serif', theme: 'light', size: 16 },
    { font: 'serif', theme: 'dark',  size: 16 },
    { font: 'sans',  theme: 'light', size: 16 },
    { font: 'serif', theme: 'light', size: 13 },
  ];
  panels.forEach((cfg, pi) => {
    const panel = document.createElement('div');
    panel.className = `legpanel ${cfg.theme === 'dark' ? 'dark' : ''} ${cfg.font === 'sans' ? 'sans' : ''}`;
    panel.id = `legpanel-${pi}`;
    panel.innerHTML = `<div class="tag" style="font:11px ui-monospace,monospace;margin-bottom:8px">` +
                      `${cfg.font} / ${cfg.theme} / ${cfg.size}px</div>`;
    host.appendChild(panel);

    LEG_VARIANTS.forEach((v) => {
      const row = document.createElement('div');
      row.className = 'legrow';
      row.innerHTML = `<span class="tag">${v.label}</span>` +
                      `<div class="legtext" id="leg-${pi}-${v.id}" style="font-size:${cfg.size}px"></div>`;
      panel.appendChild(row);
      const el = document.getElementById(`leg-${pi}-${v.id}`);

      if (v.real) {
        el.innerHTML = LEG_SENTENCE.split(' ').map((w) => {
          const cut = Math.max(1, Math.ceil(w.length / 2));
          return `<b>${w.slice(0, cut)}</b>${w.slice(cut)}`;
        }).join(' ');
        return;
      }
      el.appendChild(document.createTextNode(LEG_SENTENCE));
      if (!v.decl && !v.fade) return;
      const seg = segmentTextNode(el.firstChild, 'en', 'static');
      const name = `leg-${pi}-${v.id}`;
      if (v.fade) {
        CSS.highlights.set(name, new Highlight(...seg.suffix));
        probeStyles.push(`::highlight(${name}){color:color-mix(in srgb,currentColor ${v.fade}%,transparent)}`);
      } else {
        CSS.highlights.set(name, new Highlight(...seg.prefix));
        probeStyles.push(`::highlight(${name}){${v.decl}}`);
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Panel 6: scope probes
 * ------------------------------------------------------------------ */
function buildScope() {
  const host = document.getElementById('scope-probes');
  const result = {};

  host.innerHTML =
    '<div style="display:flex;gap:12px;align-items:flex-start">' +
    '<div><span class="tag" style="font:11px ui-monospace,monospace">open shadow root / test</span>' +
    '<div id="shadow-test" class="cell"></div></div>' +
    '<div><span class="tag" style="font:11px ui-monospace,monospace">open shadow root / ctrl</span>' +
    '<div id="shadow-ctrl" class="cell"></div></div>' +
    '<div><span class="tag" style="font:11px ui-monospace,monospace">same-origin iframe</span>' +
    '<iframe id="frame-test" style="width:240px;height:40px;border:1px solid #ddd"></iframe></div>' +
    '</div>';

  for (const id of ['shadow-test', 'shadow-ctrl']) {
    const hostEl = document.getElementById(id);
    const root = hostEl.attachShadow({ mode: 'open' });
    const p = document.createElement('div');
    p.style.font = '16px/32px Georgia, serif';
    p.appendChild(document.createTextNode(SPECIMEN));
    root.appendChild(p);
  }
  try {
    const shadowText = document.getElementById('shadow-test').shadowRoot.firstChild.firstChild;
    CSS.highlights.set('probe-shadow', new Highlight(wholeNodeRange(shadowText, 'static')));
    probeStyles.push('::highlight(probe-shadow){color:#d00;background-color:#ff0}');
    result.shadowRegistered = true;
  } catch (e) {
    result.shadowRegistered = false;
    result.shadowError = String(e && e.message || e);
  }

  const frame = document.getElementById('frame-test');
  frame.srcdoc = `<body style="margin:4px;font:16px/28px Georgia,serif">${SPECIMEN}</body>`;
  result.iframeDeferred = true;
  return result;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
const results = {
  ua: navigator.userAgent,
  api: {
    cssHighlights: typeof CSS !== 'undefined' && 'highlights' in CSS,
    HighlightCtor: typeof Highlight !== 'undefined',
    StaticRangeCtor: typeof StaticRange !== 'undefined',
    IntlSegmenter: typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined',
    getRangesForNode: typeof Highlight !== 'undefined' &&
      typeof Highlight.prototype.getRangesForNode === 'function',
    highlightsFromPoint: typeof CSS !== 'undefined' && 'highlights' in CSS &&
      typeof CSS.highlights.highlightsFromPoint === 'function',
    highlightProto: typeof Highlight !== 'undefined'
      ? Object.getOwnPropertyNames(Highlight.prototype) : [],
  },
};

buildMatrix();
results.invariance = buildInvariance();
results.issue2 = buildIssue2();
results.whitespace = buildWhitespace();
buildLegibility();
results.scope = buildScope();

document.getElementById('probe-styles').textContent = probeStyles.join('\n');

/* Does getComputedStyle introspect a highlight pseudo?  Claimed not to. */
try {
  const el = document.getElementById('cell-stroke-test');
  const cs = getComputedStyle(el, '::highlight(probe-stroke)');
  results.api.computedStyleIntrospects = {
    strokeWidth: cs.webkitTextStrokeWidth,
    color: cs.color,
    elementOwnStrokeWidth: getComputedStyle(el).webkitTextStrokeWidth,
  };
} catch (e) {
  results.api.computedStyleIntrospects = { error: String(e && e.message || e) };
}

/* Segmentation sanity across scripts. */
results.segmentation = {};
for (const [name, s] of Object.entries({
  latin: 'reading comprehension',
  arabic: 'مرحبا بالعالم',
  thai: 'สวัสดีชาวโลก',
  japanese: '東京の天気は晴れです',
  emoji: '👨‍👩‍👧‍👦 family',
  devanagari: 'नमस्ते दुनिया',
})) {
  const words = [...new Intl.Segmenter(name === 'thai' ? 'th' : name === 'japanese' ? 'ja' : 'en',
    { granularity: 'word' }).segment(s)].filter((x) => x.isWordLike);
  results.segmentation[name] = words.map((w) => {
    const cut = graphemeCut(w.segment, 'en');
    return { word: w.segment, cut, prefix: w.segment.slice(0, cut), suffix: w.segment.slice(cut) };
  });
  const legacyWords = s.split(/\s+/).map((w) => {
    const h = Math.floor(w.length / 2);
    return { word: w, prefix: w.slice(0, h), suffix: w.slice(h) };
  });
  results.segmentation[name + '_LEGACY'] = legacyWords;
}

results.probes = PROBES.map((p) => ({
  id: p.id, label: p.label, decl: p.decl, expect: p.expect || null,
  registered: p.registered, error: p.error || null,
}));
results.registeredHighlights = CSS.highlights.size;

window.__SPIKE = results;
window.__SPIKE_READY = true;
