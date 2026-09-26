/* Integration test for the parts qa.mjs cannot reach.
 *
 * qa.mjs drives engine.js directly, so it proves the renderer but not the extension
 * wiring: contentScript.js, chrome.storage, the legacy-preference migration, per-site
 * overrides, and the popup's state contract. Chrome 137 removed --load-extension, so
 * we run the real contentScript.js against a minimal chrome.* shim instead.
 *
 *   node qa/integration.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const CONTENT = fs.readFileSync(path.join(ROOT, 'contentScript.js'), 'utf8');

const PAGE_HTML = '<!doctype html><meta charset=utf-8><title>t</title>' +
  '<p id=p>The quick brown fox jumps over the lazy dog and keeps running across the ' +
  'field for a very long time indeed.</p>';

/* Smallest shim that contentScript.js actually touches. Storage is backed by a plain
   object so the test can inspect and seed it. */
const CHROME_SHIM = `
window.__store = window.__store || {};
window.__messages = [];
window.chrome = {
  storage: {
    sync: {
      get: (keys) => Promise.resolve(
        keys === null || keys === undefined ? { ...window.__store }
        : typeof keys === 'string' ? (keys in window.__store ? { [keys]: window.__store[keys] } : {})
        : Object.fromEntries(Object.keys(keys).map((k) => [k, window.__store[k] ?? keys[k]]))),
      set: (obj) => { Object.assign(window.__store, obj); return Promise.resolve(); },
      remove: (k) => { delete window.__store[k]; return Promise.resolve(); },
    },
    onChanged: { addListener: (fn) => { window.__onChanged = fn; } },
  },
  runtime: {
    onMessage: { addListener: (fn) => { window.__onMessage = fn; } },
  },
};
function ask(msg) {
  return new Promise((resolve) => { window.__onMessage(msg, null, resolve); });
}
window.ask = ask;
`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
}

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE_HTML);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function scenario(seed) {
  const page = await browser.newPage();
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(CHROME_SHIM);
  if (seed) await page.evaluate(seed);
  await page.evaluate(ENGINE);
  await page.evaluate(CONTENT);
  await page.waitForTimeout(400);
  return page;
}

// 1. Default install: runs, treats words, no stored preferences needed.
{
  const page = await scenario();
  const state = await page.evaluate(() => window.ask({ action: 'getState' }));
  check('default install runs the engine',
    !!(state && state.stats && state.stats.running && state.stats.treated > 0),
    `treated ${state?.stats?.treated}`);
  check('reports the page origin to the popup',
    typeof state.origin === 'string' && state.origin.startsWith('http://127.0.0.1'),
    state.origin);
  await page.close();
}

// 2. Legacy migration: 1.4 stored "false" in the PAGE's localStorage, per origin.
//    That preference must survive as a per-site override, and the legacy key must go.
{
  const page = await scenario(() => { localStorage.setItem('extensionEnabled', 'false'); });
  const out = await page.evaluate(() => ({
    store: { ...window.__store },
    legacy: localStorage.getItem('extensionEnabled'),
    running: window.BeBoldEngine.getStats().running,
  }));
  const key = 'site:' + new URL(URL_).origin;
  check('legacy off-switch migrates to chrome.storage', out.store[key] === 'off',
    JSON.stringify(out.store));
  check('legacy localStorage key is removed', out.legacy === null);
  check('migrated site stays off', out.running === false);
  await page.close();
}

// 3. A legacy "true" must NOT create a spurious override.
{
  const page = await scenario(() => { localStorage.setItem('extensionEnabled', 'true'); });
  const out = await page.evaluate(() => ({ store: { ...window.__store },
    running: window.BeBoldEngine.getStats().running }));
  check('legacy on-switch creates no override', Object.keys(out.store).length === 0,
    JSON.stringify(out.store));
  check('legacy on-switch still runs', out.running === true);
  await page.close();
}

// 4. Per-site override already stored: engine must not start.
{
  const key = 'site:' + new URL(URL_).origin;
  const page = await scenario(new Function(`window.__store[${JSON.stringify(key)}] = 'off';`));
  const running = await page.evaluate(() => window.BeBoldEngine.getStats().running);
  check('stored per-site override keeps the engine off', running === false);
  await page.close();
}

// 5. Global disable.
{
  const page = await scenario(() => { window.__store.enabled = false; });
  const running = await page.evaluate(() => window.BeBoldEngine.getStats().running);
  check('global disable keeps the engine off', running === false);
  await page.close();
}

// 6. Keyboard command round trip: toggles the origin off, then back on.
{
  const page = await scenario();
  const key = 'site:' + new URL(URL_).origin;
  const off = await page.evaluate(async () => {
    await window.ask({ action: 'toggleSite' });
    return { ...window.__store };
  });
  const on = await page.evaluate(async () => {
    await window.ask({ action: 'toggleSite' });
    return { ...window.__store };
  });
  check('toggleSite turns the origin off', off[key] === 'off', JSON.stringify(off));
  check('toggleSite turns the origin back on', !(key in on), JSON.stringify(on));
  await page.close();
}

// 7. localStorage that throws must not kill the content script. This is the exact
//    line that took 1.4 down on opaque origins.
{
  const page = await browser.newPage();
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(CHROME_SHIM);
  await page.evaluate(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Access is denied for this document', 'SecurityError'); },
    });
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.evaluate(ENGINE);
  await page.evaluate(CONTENT);
  await page.waitForTimeout(400);
  const running = await page.evaluate(() => window.BeBoldEngine.getStats().running);
  check('throwing localStorage does not kill the content script', running === true && !errs.length,
    errs[0] || '');
  await page.close();
}

// 8. Teardown really restores the document.
{
  const page = await scenario();
  const out = await page.evaluate(() => {
    const before = { html: document.body.innerHTML, text: document.body.innerText,
                     els: document.querySelectorAll('*').length };
    window.BeBoldEngine.stop();
    const after = { html: document.body.innerHTML, text: document.body.innerText,
                    els: document.querySelectorAll('*').length };
    return { same: before.html === after.html && before.text === after.text &&
                   before.els === after.els,
             highlights: CSS.highlights.size, sheets: document.adoptedStyleSheets.length };
  });
  check('stop() leaves the DOM byte-identical', out.same);
  check('stop() clears the highlight registry', out.highlights === 0, `size ${out.highlights}`);
  check('stop() removes the stylesheet', out.sheets === 0, `sheets ${out.sheets}`);
  await page.close();
}

// 9. Idempotence: a second pass must not double-treat.
{
  const page = await scenario();
  const out = await page.evaluate(() => {
    const first = window.BeBoldEngine.getStats().ranges;
    window.BeBoldEngine.setConfig({ strength: 4 });
    return { first, second: window.BeBoldEngine.getStats().ranges };
  });
  check('re-segmenting is idempotent', out.first === out.second,
    `${out.first} then ${out.second} ranges`);
  await page.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
