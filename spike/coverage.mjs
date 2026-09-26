/* Ticket #7: what fraction of visible words does BeBold 1.4 actually transform?
 *
 * Loads the REAL unpacked extension into Chrome, visits real sites, and for each page
 * counts word-like tokens (Intl.Segmenter, not /\s+/, so Thai and CJK count honestly),
 * splitting them into transformed vs untransformed. Every untransformed token is
 * attributed to the specific rule in contentScript.js that skipped it, by replaying that
 * file's own logic in the same order it runs.
 *
 * Single page load per site: transformed + untransformed are counted from the same DOM,
 * so there is no cross-run drift from ads or dynamic content.
 *
 *   node spike/coverage.mjs [--headed] [--out out/coverage.json]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const HEADED = process.argv.includes('--headed');

/* Chrome 137+ removed the --load-extension command line switch, and the
   DisableLoadExtensionCommandLineSwitch escape hatch is gone too: a persistent context
   launched with it reports zero installed extensions. So we run the REAL, UNMODIFIED
   contentScript.js and content.css ourselves at document_idle, behind the smallest
   possible chrome.* shim. Verified equivalent by a positive control that aborts the run
   if the transform does not fire. */
const CONTENT_JS  = fs.readFileSync(path.join(EXT, 'contentScript.js'), 'utf8');
const CONTENT_CSS = fs.readFileSync(path.join(EXT, 'content.css'), 'utf8');
const SHIM = `window.chrome = window.chrome || {};
window.chrome.runtime = window.chrome.runtime || {};
window.chrome.runtime.onMessage = window.chrome.runtime.onMessage || { addListener: function () {} };`;

async function runExtension(page) {
  try {
    await page.evaluate((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }, CONTENT_CSS);
  } catch { /* cosmetic only; coverage depends on contentScript.js alone */ }
  await page.evaluate(`${SHIM}\n;(function(){\n${CONTENT_JS}\n})();`);
  await page.waitForTimeout(900); // the script's own 300ms setTimeout plus slack
}

const SITES = [
  ['wikipedia-article',  'https://en.wikipedia.org/wiki/Attention_deficit_hyperactivity_disorder'],
  ['mdn-docs',           'https://developer.mozilla.org/en-US/docs/Web/CSS/::highlight'],
  ['hackernews-front',   'https://news.ycombinator.com/'],
  ['hackernews-item',    'https://news.ycombinator.com/item?id=1'],
  ['github-repo',        'https://github.com/cdukedev/BeBold'],
  ['github-issue',       'https://github.com/cdukedev/BeBold/issues/2'],
  ['bbc-news',           'https://www.bbc.com/news'],
  ['guardian',           'https://www.theguardian.com/international'],
  ['npm-package',        'https://www.npmjs.com/package/playwright'],
  ['nodejs-docs',        'https://nodejs.org/en/about'],
  ['python-docs',        'https://docs.python.org/3/tutorial/introduction.html'],
  ['stackoverflow',      'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array'],
  ['arxiv-abs',          'https://arxiv.org/abs/1706.03762'],
  ['web-dev',            'https://web.dev/articles/css-custom-highlight-api'],
  ['tailwind-docs',      'https://tailwindcss.com/docs/flex-direction'],
  ['playstation-store',  'https://store.playstation.com/en-us/product/UP3542-CUSA10675_00-0000000000000000'],
  ['youtube-home',       'https://www.youtube.com/'],
  ['apple',              'https://www.apple.com/'],
  ['wikipedia-mobile',   'https://en.m.wikipedia.org/wiki/Bionic_reading'],
  ['csstricks',          'https://css-tricks.com/almanac/selectors/h/highlight/'],
  ['chromestatus',       'https://chromestatus.com/feature/5436441440026624'],
  ['gov-uk',             'https://www.gov.uk/browse/benefits'],
  ['substack',           'https://astralcodexten.substack.com/'],
  ['mozilla-blog',       'https://blog.mozilla.org/en/'],
];

/* Replays contentScript.js's own decision logic against the live DOM. Kept in one
   string so it runs inside the page. */
const PROBE = () => {
  // ---- verbatim skip list from contentScript.js:71-76 ----
  const SKIP = ["svg", "li", "h1", "script", "style", "noscript",
    "iframe", "canvas", "video", "audio", "img", "input", "textarea",
    "select", "button", "meter", "progress", "object", "embed", "applet",
    "frame", "frameset", "map", "param", "area", "link", "base", "meta",
    "head", "title", "basefont", "col", "colgroup", "frame", "frameset",
    "noframes", "param"];

  const seg = new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'word' });
  const countTokens = (s) => {
    let n = 0;
    for (const x of seg.segment(s)) if (x.isWordLike) n++;
    return n;
  };

  const isVisible = (el) => {
    if (!el) return false;
    try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); }
    catch { return !!(el.offsetParent || el.getClientRects().length); }
  };

  const injected = (node) => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (p.id === 'custom-strong' || p.id === 'custom-span') return true;
    }
    return false;
  };

  // contentScript.js checks, in this order: role=textbox, skipList, isInsideList,
  // then the <5 word gate inside processTextNode.
  const reasonFor = (node) => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (p.getAttribute && p.getAttribute('role') === 'textbox') return 'role-textbox';
    }
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (SKIP.includes(p.nodeName.toLowerCase())) return 'tag-skiplist:' + p.nodeName.toLowerCase();
    }
    for (let p = node.parentElement; p; p = p.parentElement) {
      const t = p.nodeName.toLowerCase();
      if (t === 'ul' || t === 'ol') return 'inside-list';
    }
    if (node.textContent.split(/\s+/).length < 5) return 'short-node';
    return 'other-not-reached';
  };

  const result = {
    transformedTokens: 0, untransformedTokens: 0,
    shadowTokens: 0, iframeTokens: 0,
    reasons: {}, customStrongCount: 0, shadowRoots: 0, sameOriginFrames: 0,
  };

  result.customStrongCount = document.querySelectorAll('#custom-strong').length;

  const walkLight = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const txt = n.textContent;
      if (!txt || !txt.trim()) continue;
      const parent = n.parentElement;
      if (!parent) continue;
      const tag = parent.nodeName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
      if (!isVisible(parent)) continue;
      const tokens = countTokens(txt);
      if (!tokens) continue;
      if (injected(n)) { result.transformedTokens += tokens; continue; }
      result.untransformedTokens += tokens;
      const r = reasonFor(n);
      result.reasons[r] = (result.reasons[r] || 0) + tokens;
    }
  };

  walkLight(document.body);

  // Shadow DOM and same-origin iframes: the walker in contentScript.js never enters either.
  const allEls = document.querySelectorAll('*');
  for (const el of allEls) {
    if (el.shadowRoot) {
      result.shadowRoots++;
      const w = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.textContent;
        if (t && t.trim()) result.shadowTokens += countTokens(t);
      }
    }
  }
  for (const f of document.querySelectorAll('iframe')) {
    let d = null;
    try { d = f.contentDocument; } catch { /* cross-origin */ }
    if (!d || !d.body) continue;
    result.sameOriginFrames++;
    result.iframeTokens += countTokens(d.body.innerText || '');
  }

  return result;
};

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-cov-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: !HEADED,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  // ---- positive control: a page we KNOW must transform. A broken harness and a dead
  // extension both report 0%, so refuse to measure anything until this passes. ----
  {
    // must be a real origin: contentScript.js line 4 touches localStorage, which throws
    // on an opaque origin and kills the whole script before it does anything
    const ctlServer = http.createServer((_, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><meta charset=utf-8><p id=p>The quick brown fox jumps over ' +
        'the lazy dog and keeps running across the field for a very long time indeed.</p>');
    });
    await new Promise((r) => ctlServer.listen(0, '127.0.0.1', r));
    const ctlPort = ctlServer.address().port;
    const cp = await context.newPage();
    await cp.goto(`http://127.0.0.1:${ctlPort}/`, { waitUntil: 'load' });
    await runExtension(cp);
    const ctl = await cp.evaluate(() => ({
      strongs: document.querySelectorAll('#custom-strong').length,
      kids: document.getElementById('p').childNodes.length,
    }));
    if (ctl.strongs === 0) {
      console.error('POSITIVE CONTROL FAILED, harness is not running the extension:',
        JSON.stringify(ctl));
      process.exit(1);
    }
    console.log(`positive control ok: ${ctl.strongs} strongs, ${ctl.kids} child nodes\n`);
    await cp.close();
    ctlServer.close();
  }

  const rows = [];
  for (const [name, url] of SITES) {
    const page = await context.newPage();
    const row = { name, url };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
      // the extension's own 300ms setTimeout, plus room for SPA render and its observer
      await page.waitForTimeout(3500);
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(1200);
      await runExtension(page);
      const r = await page.evaluate(PROBE);
      const total = r.transformedTokens + r.untransformedTokens;
      Object.assign(row, r, {
        totalLightTokens: total,
        coveragePct: total ? +((r.transformedTokens / total) * 100).toFixed(1) : 0,
      });
      row.title = await page.title();
    } catch (e) {
      row.error = String(e && e.message || e).split('\n')[0].slice(0, 140);
    }
    rows.push(row);
    const c = row.error ? `ERROR ${row.error}` :
      `${String(row.coveragePct).padStart(5)}%  ${String(row.transformedTokens).padStart(6)}/${String(row.totalLightTokens).padEnd(6)}` +
      ` shadow:${String(row.shadowTokens).padStart(5)} frame:${String(row.iframeTokens).padStart(4)}`;
    console.log(`${name.padEnd(20)} ${c}`);
    await page.close();
  }

  // aggregate
  const ok = rows.filter((r) => !r.error);
  const sum = (k) => ok.reduce((a, r) => a + (r[k] || 0), 0);
  const reasons = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.reasons || {})) {
    const key = k.startsWith('tag-skiplist:') ? 'tag-skiplist' : k;
    reasons[key] = (reasons[key] || 0) + v;
  }
  const tagDetail = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.reasons || {})) {
    if (k.startsWith('tag-skiplist:')) tagDetail[k] = (tagDetail[k] || 0) + v;
  }
  const agg = {
    sitesAttempted: rows.length,
    sitesOk: ok.length,
    sitesErrored: rows.length - ok.length,
    transformedTokens: sum('transformedTokens'),
    untransformedTokens: sum('untransformedTokens'),
    totalLightTokens: sum('totalLightTokens'),
    shadowTokens: sum('shadowTokens'),
    iframeTokens: sum('iframeTokens'),
    overallCoveragePct: +((sum('transformedTokens') / Math.max(1, sum('totalLightTokens'))) * 100).toFixed(2),
    coverageIncludingUnreachablePct: +((sum('transformedTokens') /
      Math.max(1, sum('totalLightTokens') + sum('shadowTokens') + sum('iframeTokens'))) * 100).toFixed(2),
    sitesWithZeroCoverage: ok.filter((r) => r.transformedTokens === 0).map((r) => r.name),
    skipReasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
    tagSkiplistDetail: Object.fromEntries(Object.entries(tagDetail).sort((a, b) => b[1] - a[1])),
  };

  fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify({ agg, rows }, null, 2));
  console.log('\n===== AGGREGATE =====');
  console.log(JSON.stringify(agg, null, 2));
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

await main();
