/* BeBold 2.0 QA across real sites.
 *
 * For each page: settle, capture BEFORE state, run the real engine, capture AFTER
 * state, diff. The oracle is invariance, not pixels, because pixels are supposed to
 * change. The engine must leave geometry, text, line boxes, element count and the
 * accessibility tree untouched while treating as many words as possible.
 *
 * Chrome 137 removed --load-extension, so the engine is injected directly. engine.js
 * has no chrome.* dependency precisely so this works without shimming anything.
 *
 *   node qa/qa.mjs [--headed] [--sites=a,b] [--shots]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const HEADED = process.argv.includes('--headed');
const WANT_SHOTS = process.argv.includes('--shots');
const ONLY = (process.argv.find((a) => a.startsWith('--sites=')) || '').slice(8)
  .split(',').filter(Boolean);

const ENGINE_JS = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

const SITES = [
  ['wikipedia-en',      'https://en.wikipedia.org/wiki/Attention_deficit_hyperactivity_disorder'],
  ['wikipedia-mobile',  'https://en.m.wikipedia.org/wiki/Bionic_reading'],
  ['wikipedia-ar',      'https://ar.wikipedia.org/wiki/%D9%84%D8%BA%D8%A9_%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9'],
  ['wikipedia-ja',      'https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD'],
  ['wikipedia-th',      'https://th.wikipedia.org/wiki/%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%97%E0%B8%A8%E0%B9%84%E0%B8%97%E0%B8%A2'],
  ['wikipedia-hi',      'https://hi.wikipedia.org/wiki/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4'],
  ['wikipedia-he',      'https://he.wikipedia.org/wiki/%D7%99%D7%A9%D7%A8%D7%90%D7%9C'],
  ['mdn-highlight',     'https://developer.mozilla.org/en-US/docs/Web/CSS/::highlight'],
  ['mdn-grid',          'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout'],
  ['hackernews-front',  'https://news.ycombinator.com/'],
  ['hackernews-item',   'https://news.ycombinator.com/item?id=1'],
  ['github-repo',       'https://github.com/cdukedev/BeBold'],
  ['github-issue',      'https://github.com/cdukedev/BeBold/issues/2'],
  ['github-login',      'https://github.com/login'],
  ['bbc-news',          'https://www.bbc.com/news'],
  ['guardian',          'https://www.theguardian.com/international'],
  ['npm-package',       'https://www.npmjs.com/package/playwright'],
  ['nodejs-docs',       'https://nodejs.org/en/about'],
  ['python-docs',       'https://docs.python.org/3/tutorial/introduction.html'],
  ['rust-book',         'https://doc.rust-lang.org/book/ch01-02-hello-world.html'],
  ['go-docs',           'https://go.dev/doc/tutorial/getting-started'],
  ['arxiv-abs',         'https://arxiv.org/abs/1706.03762'],
  ['web-dev',           'https://web.dev/articles/css-custom-highlight-api'],
  ['tailwind-docs',     'https://tailwindcss.com/docs/flex-direction'],
  ['bootstrap-docs',    'https://getbootstrap.com/docs/5.3/layout/grid/'],
  ['playstation-store', 'https://store.playstation.com/en-us/product/UP3542-CUSA10675_00-0000000000000000'],
  ['youtube-home',      'https://www.youtube.com/'],
  ['apple',             'https://www.apple.com/'],
  ['csstricks',         'https://css-tricks.com/almanac/selectors/h/highlight/'],
  ['chromestatus',      'https://chromestatus.com/feature/5436441440026624'],
  ['gov-uk',            'https://www.gov.uk/browse/benefits'],
  ['substack',          'https://astralcodexten.substack.com/'],
  ['mozilla-blog',      'https://blog.mozilla.org/en/'],
  ['a11yproject',       'https://www.a11yproject.com/checklist/'],
  ['smashing',          'https://www.smashingmagazine.com/articles/'],
  ['archive-org',       'https://archive.org/'],
  ['chrome-developers', 'https://developer.chrome.com/docs/extensions/reference/api/storage'],
  ['wordpress-news',    'https://wordpress.org/news/'],
];

/* Runs inside the page. Returns a structural fingerprint that MUST be identical
   before and after, plus the raw material for a coverage number. */
const SNAPSHOT = () => {
  const lineCount = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = new Set();
    for (const rect of r.getClientRects()) {
      if (rect.width > 0 || rect.height > 0) tops.add(Math.round(rect.top));
    }
    return tops.size;
  };

  const textBearing = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    let direct = false;
    for (const c of el.childNodes) {
      if (c.nodeType === Node.TEXT_NODE && c.data && c.data.trim()) { direct = true; break; }
    }
    if (direct) textBearing.push(el);
  }
  // cap the sample so a 40k-element page does not blow up the payload
  const step = Math.max(1, Math.floor(textBearing.length / 900));
  const sample = textBearing.filter((_, i) => i % step === 0).slice(0, 900);

  const boxes = [];
  const lines = [];
  for (const e of sample) {
    const b = e.getBoundingClientRect();
    boxes.push([+(b.x + window.scrollX).toFixed(2), +(b.y + window.scrollY).toFixed(2),
                +b.width.toFixed(2), +b.height.toFixed(2)]);
    lines.push(lineCount(e));
  }

  let textNodes = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) textNodes++;

  return {
    elementCount: document.querySelectorAll('*').length,
    textNodes,
    innerText: document.body.innerText || '',
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    sampled: sample.length,
    boxes, lines,
  };
};

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function diffSnapshots(before, after) {
  const problems = [];
  if (before.elementCount !== after.elementCount) {
    problems.push({ kind: 'element-count', before: before.elementCount, after: after.elementCount });
  }
  if (before.textNodes !== after.textNodes) {
    problems.push({ kind: 'text-node-count', before: before.textNodes, after: after.textNodes });
  }
  if (before.innerText !== after.innerText) {
    problems.push({
      kind: 'innerText',
      beforeLen: before.innerText.length, afterLen: after.innerText.length,
      beforeHash: sha(before.innerText), afterHash: sha(after.innerText),
    });
  }
  if (before.scrollHeight !== after.scrollHeight) {
    problems.push({ kind: 'scrollHeight', before: before.scrollHeight, after: after.scrollHeight });
  }
  if (before.scrollWidth !== after.scrollWidth) {
    problems.push({ kind: 'scrollWidth', before: before.scrollWidth, after: after.scrollWidth });
  }
  if (before.sampled === after.sampled) {
    let worstBox = 0, movedBoxes = 0, changedLines = 0;
    for (let i = 0; i < before.boxes.length; i++) {
      const a = before.boxes[i], b = after.boxes[i];
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
                         Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      if (d > worstBox) worstBox = d;
      if (d > 0.5) movedBoxes++;
      if (before.lines[i] !== after.lines[i]) changedLines++;
    }
    if (movedBoxes) problems.push({ kind: 'box-shift', movedBoxes, worstPx: +worstBox.toFixed(2) });
    if (changedLines) problems.push({ kind: 'line-count', changedElements: changedLines });
    return { problems, worstBoxPx: +worstBox.toFixed(2), movedBoxes, changedLines };
  }
  problems.push({ kind: 'sample-size', before: before.sampled, after: after.sampled });
  return { problems };
}

async function main() {
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-qa-')), {
      channel: 'chrome',
      headless: !HEADED,
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });

  // ---- positive control. A dead engine and a broken harness both report zero. ----
  const ctlServer = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset=utf-8><p>The quick brown fox jumps over the ' +
      'lazy dog and keeps running across the field for a very long time indeed.</p>');
  });
  await new Promise((r) => ctlServer.listen(0, '127.0.0.1', r));
  const cp = await context.newPage();
  await cp.goto(`http://127.0.0.1:${ctlServer.address().port}/`, { waitUntil: 'load' });
  await cp.evaluate(ENGINE_JS);
  const ctl = await cp.evaluate(() => window.BeBoldEngine.start());
  if (!ctl || !ctl.treated) {
    console.error('POSITIVE CONTROL FAILED, engine treated nothing:', JSON.stringify(ctl));
    process.exit(1);
  }
  console.log(`positive control ok: treated ${ctl.treated} words, ${ctl.ranges} ranges, ` +
    `${ctl.lastPassMs}ms\n`);
  await cp.close();
  ctlServer.close();

  const list = ONLY.length ? SITES.filter(([n]) => ONLY.includes(n)) : SITES;
  const rows = [];

  for (const [name, url] of list) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    const row = { name, url };
    try {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); // one retry
      }
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);

      row.title = (await page.title()).slice(0, 70);

      /* Evaluate rather than addScriptTag: an injected inline <script> is subject to
         the page's script-src CSP (github.com and chromestatus.com both block it),
         while CDP evaluation is not, which is also how a real content script behaves.
         It adds no element to the page either, so the baseline stays honest. */
      await page.evaluate(ENGINE_JS);

      const snapA = await page.evaluate(SNAPSHOT);
      const ariaA = await page.locator('body').ariaSnapshot().catch(() => null);
      if (WANT_SHOTS) {
        await page.screenshot({ path: path.join(SHOTS, `${name}-before.png`) }).catch(() => {});
      }

      /* NOISE FLOOR. Live pages move on their own: lazy images, sticky headers, ads,
         hydration. Measure the same interval with the engine still idle, so page churn
         is never attributed to the engine. */
      await page.waitForTimeout(700);
      const snapB = await page.evaluate(SNAPSHOT);
      const ariaB = await page.locator('body').ariaSnapshot().catch(() => null);
      const noise = diffSnapshots(snapA, snapB);
      if (ariaA !== null && ariaB !== null && ariaA !== ariaB) {
        noise.problems.push({ kind: 'aria-tree' });
      }

      const errorsBeforeEngine = errors.length;
      const stats = await page.evaluate(() => {
        try { return window.BeBoldEngine.start(); }
        catch (e) { return { error: String(e && e.message || e) }; }
      });
      await page.waitForTimeout(700);

      const after = await page.evaluate(SNAPSHOT);
      const ariaAfter = await page.locator('body').ariaSnapshot().catch(() => null);
      if (WANT_SHOTS) {
        await page.screenshot({ path: path.join(SHOTS, `${name}-after.png`) }).catch(() => {});
      }

      const d = diffSnapshots(snapB, after);
      if (ariaB !== null && ariaAfter !== null && ariaB !== ariaAfter) {
        d.problems.push({
          kind: 'aria-tree',
          beforeHash: sha(ariaB), afterHash: sha(ariaAfter),
          beforeLen: ariaB.length, afterLen: ariaAfter.length,
        });
      }
      /* The page's own failed requests are not the engine's fault. Keep uncaught
         exceptions and anything naming our code; drop resource-load noise. */
      const engineErrors = errors.slice(errorsBeforeEngine).filter((e) =>
        !/^Failed to load resource/i.test(e) && !/\bnet::/.test(e));

      /* A problem the idle page also produced is churn, not an engine defect. */
      const noiseKinds = new Set(noise.problems.map((p) => p.kind));
      const attributed = d.problems.map((p) => ({ ...p, churn: noiseKinds.has(p.kind) }));
      const engineProblems = attributed.filter((p) => !p.churn);

      Object.assign(row, {
        stats,
        treated: stats && stats.treated || 0,
        skipped: stats && stats.skipped || 0,
        refused: stats && stats.refused || null,
        passMs: stats && stats.lastPassMs || null,
        coveragePct: stats && (stats.treated + stats.skipped)
          ? +((stats.treated / (stats.treated + stats.skipped)) * 100).toFixed(1) : 0,
        problems: engineProblems,
        churnProblems: attributed.filter((p) => p.churn),
        noiseProblems: noise.problems,
        worstBoxPx: d.worstBoxPx,
        noiseWorstBoxPx: noise.worstBoxPx,
        ariaIdentical: ariaB !== null && ariaAfter !== null ? ariaB === ariaAfter : null,
        engineErrors,
        clean: engineProblems.length === 0 && engineErrors.length === 0,
      });
    } catch (e) {
      row.error = String(e && e.message || e).split('\n')[0].slice(0, 130);
    }
    rows.push(row);

    const mark = row.error ? 'ERR ' : row.refused ? 'SKIP' : row.clean ? ' ok ' : 'FAIL';
    const detail = row.error ? row.error
      : row.refused ? `refused: ${row.refused}`
      : `${String(row.coveragePct).padStart(5)}%  ${String(row.treated).padStart(6)} treated` +
        `  ${String(row.passMs).padStart(6)}ms` +
        (row.problems && row.problems.length ? `  << ${row.problems.map((p) => p.kind).join(',')}` : '') +
        (row.churnProblems && row.churnProblems.length ? `  (page churn: ${row.churnProblems.map((p) => p.kind).join(',')})` : '') +
        (row.engineErrors && row.engineErrors.length ? `  << ${row.engineErrors.length} console errors` : '');
    console.log(`${mark} ${name.padEnd(20)} ${detail}`);
    await page.close();
  }

  const ok = rows.filter((r) => !r.error && !r.refused);
  const sum = (k) => ok.reduce((a, r) => a + (r[k] || 0), 0);
  const reasons = {};
  for (const r of ok) for (const [k, v] of Object.entries((r.stats && r.stats.reasons) || {})) {
    reasons[k] = (reasons[k] || 0) + v;
  }
  const pcts = ok.map((r) => r.coveragePct).sort((a, b) => a - b);
  const median = pcts.length
    ? (pcts.length % 2 ? pcts[(pcts.length - 1) / 2]
       : (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2) : 0;

  const agg = {
    sitesAttempted: rows.length,
    sitesMeasured: ok.length,
    sitesErrored: rows.filter((r) => r.error).length,
    sitesRefused: rows.filter((r) => r.refused).map((r) => `${r.name} (${r.refused})`),
    clean: ok.filter((r) => r.clean).length,
    withProblems: ok.filter((r) => !r.clean).map((r) => ({
      name: r.name,
      problems: r.problems,
      engineErrors: r.engineErrors,
    })),
    treated: sum('treated'),
    skipped: sum('skipped'),
    overallCoveragePct: +((sum('treated') / Math.max(1, sum('treated') + sum('skipped'))) * 100).toFixed(2),
    medianCoveragePct: median,
    worstBoxShiftPx: Math.max(0, ...ok.map((r) => r.worstBoxPx || 0)),
    sitesWithPageChurn: ok.filter((r) => r.churnProblems && r.churnProblems.length).map((r) => r.name),
    ariaIdenticalOn: ok.filter((r) => r.ariaIdentical === true).length,
    ariaComparable: ok.filter((r) => r.ariaIdentical !== null).length,
    slowestPassMs: Math.max(0, ...ok.map((r) => r.passMs || 0)),
    medianPassMs: (() => {
      const v = ok.map((r) => r.passMs || 0).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : 0;
    })(),
    skipReasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
  };

  fs.writeFileSync(path.join(OUT, 'qa.json'), JSON.stringify({ agg, rows }, null, 2));
  console.log('\n===== AGGREGATE =====');
  console.log(JSON.stringify(agg, null, 2));
  await context.close();
}

await main();
