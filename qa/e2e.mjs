/* End-to-end test of the PACKAGED extension.
 *
 * This is the test that was supposed to be impossible. Chrome 137 removed the
 * --load-extension switch, so stable Google Chrome silently loads nothing. But the
 * removal is a Chrome-branded anti-abuse measure: Playwright's `channel: 'chromium'`
 * is a Chrome for Testing build, and it still honours the switch. So the real
 * manifest, the real service worker, the real content script in its isolated world,
 * the real popup and the real options page all get exercised here.
 *
 * Note `headless: true` alone is not enough: Playwright's default headless build is
 * chromium_headless_shell, which cannot load extensions at all. The channel is
 * load-bearing.
 *
 *   node qa/e2e.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PROSE = 'The quick brown fox jumps over the lazy dog and keeps running across ' +
  'the field for a very long time indeed.';

const PAGES = {
  '/': `<!doctype html><meta charset=utf-8><title>prose</title><p id=p>${PROSE}</p>`,
  '/login': `<!doctype html><meta charset=utf-8><title>login</title>` +
    `<p id=p>${PROSE}</p><form><input type="password" name="pw"></form>`,
  '/hidden-login': `<!doctype html><meta charset=utf-8><title>hidden</title>` +
    `<p id=p>${PROSE}</p><div style="display:none"><form><input type="password"></form></div>`,
  '/optout': `<!doctype html><meta charset=utf-8><title>optout</title>` +
    `<meta name="bebold" content="off"><p id=p>${PROSE}</p>`,
};

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
}

const server = http.createServer((req, res) => {
  const body = PAGES[req.url.split('?')[0]] ?? PAGES['/'];
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-e2e-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  viewport: { width: 1280, height: 800 },
});

/* The service worker URL is how we learn the generated extension id. */
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
const EXT_ID = sw ? new URL(sw.url()).host : null;
check('MV3 service worker registers', !!EXT_ID, EXT_ID || 'no service worker');
if (!EXT_ID) { await ctx.close(); server.close(); process.exit(1); }

const state = (page) => page.evaluate(() => ({
  hasHighlight: 'highlights' in CSS && CSS.highlights.has('bebold-fixation'),
  ranges: ('highlights' in CSS && CSS.highlights.get('bebold-fixation'))
    ? CSS.highlights.get('bebold-fixation').size : 0,
  mainWorldEngine: typeof window.BeBoldEngine !== 'undefined',
  childNodes: document.getElementById('p') ? document.getElementById('p').childNodes.length : -1,
  elements: document.querySelectorAll('*').length,
  text: document.getElementById('p') ? document.getElementById('p').textContent : '',
}));

async function storageSet(obj) {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/options.html`);
  await p.evaluate((o) => chrome.storage.sync.set(o), obj);
  await p.close();
}
async function storageGet() {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/options.html`);
  const v = await p.evaluate(() => chrome.storage.sync.get(null));
  await p.close();
  return v;
}
async function storageClear() {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/options.html`);
  await p.evaluate(() => chrome.storage.sync.clear());
  await p.close();
}

// ---------------------------------------------------------------- 1. renders ---
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const s = await state(page);
  check('content script paints a highlight', s.hasHighlight && s.ranges > 0,
    `${s.ranges} ranges`);
  check('engine stays in the isolated world', s.mainWorldEngine === false,
    'main world cannot see BeBoldEngine, so this is the real extension');
  check('paragraph is still one text node', s.childNodes === 1, `childNodes ${s.childNodes}`);
  check('text is unchanged', s.text === PROSE);
  await page.close();
}

// ------------------------------------------------------- 2. DOM is untouched ---
{
  const treated = await ctx.newPage();
  await treated.goto(`${BASE}/`, { waitUntil: 'load' });
  await treated.waitForTimeout(1500);
  const after = await treated.evaluate(() => ({
    html: document.body.innerHTML,
    els: document.querySelectorAll('*').length,
    inner: document.body.innerText,
  }));
  await treated.close();

  // same page with the extension disabled for this origin, as a control
  await storageSet({ [`site:${BASE}`]: 'off' });
  const control = await ctx.newPage();
  await control.goto(`${BASE}/`, { waitUntil: 'load' });
  await control.waitForTimeout(1200);
  const base = await control.evaluate(() => ({
    html: document.body.innerHTML,
    els: document.querySelectorAll('*').length,
    inner: document.body.innerText,
  }));
  const off = await state(control);
  await control.close();

  check('per-site "off" stops the highlight', off.ranges === 0, `${off.ranges} ranges`);
  check('treated DOM is byte-identical to untreated', after.html === base.html);
  check('element count identical', after.els === base.els);
  check('innerText identical', after.inner === base.inner);
  await storageClear();
}

// ------------------------------------------------------- 3. global disable -----
{
  await storageSet({ enabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const s = await state(page);
  check('global disable stops the highlight', s.ranges === 0, `${s.ranges} ranges`);
  await page.close();
  await storageClear();
}

// --------------------------------------------------------- 4. live reaction ----
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const before = await state(page);
  await storageSet({ enabled: false });          // flip while the tab is open
  await page.waitForTimeout(900);
  const during = await state(page);
  await storageSet({ enabled: true });
  await page.waitForTimeout(900);
  const restored = await state(page);
  check('open tab reacts to storage change without reload',
    before.ranges > 0 && during.ranges === 0 && restored.ranges > 0,
    `${before.ranges} -> ${during.ranges} -> ${restored.ranges}`);
  await page.close();
  await storageClear();
}

// -------------------------------------------------------- 5. refusal policy ----
{
  const login = await ctx.newPage();
  await login.goto(`${BASE}/login`, { waitUntil: 'load' });
  await login.waitForTimeout(1200);
  const s1 = await state(login);
  check('visible password field refuses the whole page', s1.ranges === 0, `${s1.ranges} ranges`);
  await login.close();

  const hidden = await ctx.newPage();
  await hidden.goto(`${BASE}/hidden-login`, { waitUntil: 'load' });
  await hidden.waitForTimeout(1200);
  const s2 = await state(hidden);
  check('hidden login form does NOT refuse the page', s2.ranges > 0, `${s2.ranges} ranges`);
  await hidden.close();

  const opt = await ctx.newPage();
  await opt.goto(`${BASE}/optout`, { waitUntil: 'load' });
  await opt.waitForTimeout(1200);
  const s3 = await state(opt);
  check('meta name=bebold content=off is honoured', s3.ranges === 0, `${s3.ranges} ranges`);
  await opt.close();
}

// ------------------------------------------------- 6. legacy 1.4 migration -----
{
  const seed = await ctx.newPage();
  await seed.goto(`${BASE}/`, { waitUntil: 'load' });
  await seed.evaluate(() => localStorage.setItem('extensionEnabled', 'false'));
  await seed.close();

  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const s = await state(page);
  const legacy = await page.evaluate(() => localStorage.getItem('extensionEnabled'));
  const store = await storageGet();
  check('1.4 localStorage off-switch migrates to chrome.storage',
    store[`site:${BASE}`] === 'off', JSON.stringify(store));
  check('legacy key is cleaned up', legacy === null);
  check('migrated origin stays off', s.ranges === 0, `${s.ranges} ranges`);
  await page.close();
  await storageClear();
}

// ------------------------------------------------------ 7. options page UI ----
{
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  await page.goto(`chrome-extension://${EXT_ID}/options.html`, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  check('options page loads without errors', errors.length === 0, errors[0] || '');

  const shape = await page.evaluate(() => ({
    presets: document.querySelectorAll('input[name=preset]').length,
    strengthMax: document.getElementById('strength').max,
    ariaValueText: document.getElementById('strength').getAttribute('aria-valuetext'),
    scripts: ['s-arabic', 's-brahmic', 's-cjk', 's-seasia'].filter((id) => document.getElementById(id)).length,
    labelled: [...document.querySelectorAll('input,select')].every((el) =>
      !!(el.id && document.querySelector(`label[for="${el.id}"]`)) || el.type === 'radio'
        ? true : !!el.getAttribute('aria-label')),
    previewHidden: document.getElementById('preview').getAttribute('aria-hidden') === 'true',
    // the preview is rendered by the real engine, bundled into the options page
    previewPainted: 'highlights' in CSS && CSS.highlights.size > 0,
  }));
  check('three presets offered', shape.presets === 3, `${shape.presets}`);
  check('strength slider is 1..5 with aria-valuetext', shape.strengthMax === '5' && !!shape.ariaValueText,
    shape.ariaValueText || 'missing aria-valuetext');
  check('four opt-in script families', shape.scripts === 4, `${shape.scripts}`);
  check('every control has a label', shape.labelled === true);
  check('live preview is aria-hidden', shape.previewHidden === true);
  check('live preview is rendered by the real engine', shape.previewPainted === true);

  // changing a control must persist
  await page.click('#preset-underline');
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => chrome.storage.sync.get(null));
  check('changing a preset persists to chrome.storage.sync', stored.preset === 'underline',
    JSON.stringify({ preset: stored.preset }));
  await page.close();
  await storageClear();
}

// -------------------------------------------------------- 8. popup renders ----
{
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  check('popup loads without errors', errors.length === 0, errors[0] || '');
  const ui = await page.evaluate(() => ({
    enabledChecked: document.getElementById('enabled').checked,
    summary: document.getElementById('summary').textContent.trim().slice(0, 60),
    hasOptionsLink: !!document.getElementById('options'),
  }));
  /* 1.4's popup hardcoded "Turn Off" on every open regardless of reality. The new one
     reads storage, so with nothing stored it must show the true default: enabled. */
  check('popup reads real enabled state', ui.enabledChecked === true);
  check('popup reports a status line', ui.summary.length > 0, ui.summary);
  check('popup links to settings', ui.hasOptionsLink === true);
  await page.close();
}

// ------------------------------------------------------------ 9. teardown -----
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const on = await state(page);
  await storageSet({ enabled: false });
  await page.waitForTimeout(900);
  const off = await page.evaluate(() => ({
    highlights: CSS.highlights.size,
    sheets: document.adoptedStyleSheets.length,
    styleEl: !!document.getElementById('bebold-style'),
    childNodes: document.getElementById('p').childNodes.length,
  }));
  check('teardown clears the highlight registry', off.highlights === 0, `size ${off.highlights}`);
  check('teardown removes the stylesheet', off.sheets === 0 && !off.styleEl);
  check('teardown leaves the DOM alone', off.childNodes === 1 && on.ranges > 0);
  await page.close();
  await storageClear();
}

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('failed: ' + failed.map((f) => f.name).join('; '));
  process.exit(1);
}
