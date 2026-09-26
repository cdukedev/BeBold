/* Fast, hermetic fixture suite. This is the per-commit gate.
 *
 * Every fixture is loaded twice: once in a context with the packaged extension and
 * once in a context without it. Fixtures are static local files, so the two runs are
 * directly comparable and the DOM must come out byte-identical. Per-fixture
 * expectations below pin the behaviour that matters for each hard case.
 *
 *   node qa/fixtures.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIR = path.join(HERE, 'fixtures');

/* selector -> expected treatment. `true` means "must have ranges", `false` means
   "must have none". Anything not listed is only covered by the invariance check. */
const EXPECT = {
  'containers.html': { treated: ['#flexrow', '#flexcol', '#gridbox', '#ib', '#minc', '#fl'] },
  /* <pre> is deliberately refused: it is code-ish by the refusal policy. The point of
     this fixture is that whitespace SURVIVES either way, which the textContent check
     proves. #prewrap is a plain div carrying white-space:pre-wrap, so it is treated
     while still holding tabs, runs and a newline. */
  'whitespace.html': { treated: ['#prewrap'], untreated: ['#pre'] },
  'scripts.html': {
    treated: ['#latin', '#hebrew', '#cyrillic', '#greek'],
    untreated: ['#arabic', '#thai', '#cjk', '#hindi'],
    noSplitGrapheme: '👨‍👩‍👧‍👦',
  },
  'accuracy.html': {
    treated: ['#prose'],
    untreated: ['#codeblock'],
    noRangeOver: { '#dosage': ['500 mg', '2.5 ml', '1000 mg'],
                   '#iban': ['GB29'], '#semver': ['v2.14.0-rc.1', '3.0.1'],
                   '#url': ['https://example.com/docs/page', 'support@example.com'],
                   '#money': ['$24.99', '1,250.00'], '#numbers': ['1,250,000', '98765'],
                   '#hex': ['#1a2b3c'], '#inlinecode': ['npm install playwright'] },
  },
  'editable.html': { treated: ['#prose'], untreated: ['#ce', '#tb', '#ta', '#btn', '#sel'] },
  'shadow.html': { treated: ['#light'], shadowTreated: true },
  'hostile.html': { treated: ['#prose'], maxMutations: 5 },
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1).split('?')[0]);
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-fx-'));
const withExt = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  viewport: { width: 1280, height: 900 },
});
const plainProfile = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-fx0-'));
const noExt = await chromium.launchPersistentContext(plainProfile, {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
});

const sw = withExt.serviceWorkers()[0] ||
  await withExt.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
check('extension loaded', !!sw, sw ? new URL(sw.url()).host : 'no service worker');

/* Range counts per selector, read out of the live highlight registry. */
const PROBE = (sels) => {
  const hl = ('highlights' in CSS) && CSS.highlights.get('bebold-fixation');
  const ranges = hl ? [...hl] : [];
  const within = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    let n = 0;
    for (const r of ranges) {
      const c = r.startContainer;
      const node = c.nodeType === 3 ? c.parentElement : c;
      if (node && el.contains(node)) n++;
    }
    return n;
  };
  const texts = [];
  for (const r of ranges) {
    const c = r.startContainer;
    if (c.nodeType === 3) texts.push(c.data.slice(r.startOffset, r.endOffset));
  }
  let shadowRanges = 0;
  for (const r of ranges) {
    const c = r.startContainer;
    const root = c.getRootNode && c.getRootNode();
    if (root && root !== document) shadowRanges++;
  }
  return {
    total: ranges.length,
    per: Object.fromEntries(sels.map((s) => [s, within(s)])),
    texts,
    shadowRanges,
    dom: {
      html: document.body.innerHTML,
      els: document.querySelectorAll('*').length,
      inner: document.body.innerText,
      text: document.body.textContent,
    },
  };
};

for (const file of files) {
  const expect = EXPECT[file] || {};
  const sels = [...(expect.treated || []), ...(expect.untreated || []),
                ...Object.keys(expect.noRangeOver || {})];

  const a = await withExt.newPage();
  await a.goto(`${BASE}/${file}`, { waitUntil: 'load' });
  await a.waitForTimeout(1200);
  const got = await a.evaluate(PROBE, sels);

  const b = await noExt.newPage();
  await b.goto(`${BASE}/${file}`, { waitUntil: 'load' });
  await b.waitForTimeout(1200);
  const base = await b.evaluate(PROBE, sels);

  // --- invariance: the DOM must be identical with and without the extension ---
  check(`${file}: DOM byte-identical`, got.dom.html === base.dom.html);
  check(`${file}: element count identical`, got.dom.els === base.dom.els,
    `${got.dom.els} vs ${base.dom.els}`);
  check(`${file}: textContent identical`, got.dom.text === base.dom.text);

  for (const sel of expect.treated || []) {
    check(`${file}: ${sel} is treated`, got.per[sel] > 0, `${got.per[sel]} ranges`);
  }
  for (const sel of expect.untreated || []) {
    check(`${file}: ${sel} is NOT treated`, got.per[sel] === 0, `${got.per[sel]} ranges`);
  }
  for (const [sel, needles] of Object.entries(expect.noRangeOver || {})) {
    for (const needle of needles) {
      const hit = got.texts.some((t) => t.length > 1 && needle.includes(t) &&
        needle.indexOf(t) === 0 && needle !== t);
      const covered = got.texts.some((t) => needle.startsWith(t) && t.length >= 2);
      check(`${file}: "${needle}" is left intact`, !covered,
        covered ? `prefix range found in ${sel}` : '');
      void hit;
    }
  }
  if (expect.noSplitGrapheme) {
    const bad = got.texts.some((t) => expect.noSplitGrapheme.startsWith(t) &&
      t !== expect.noSplitGrapheme);
    check(`${file}: ZWJ emoji is never split`, !bad);
  }
  if (expect.shadowTreated) {
    check(`${file}: open shadow roots are treated`, got.shadowRanges > 0,
      `${got.shadowRanges} ranges in shadow roots`);
  }
  if (expect.maxMutations !== undefined) {
    const n = Number(await a.evaluate(() => (window.__mutations ? window.__mutations() : -1)));
    check(`${file}: page observer barely fires`, n <= expect.maxMutations, `${n} mutations`);
  }

  await a.close();
  await b.close();
}

await withExt.close();
await noExt.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
fs.rmSync(plainProfile, { recursive: true, force: true });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('failed: ' + failed.map((f) => f.name).join('; ')); process.exit(1); }
