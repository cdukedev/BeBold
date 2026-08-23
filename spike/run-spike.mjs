/* Measures the spike page in a real browser.
 *
 * The question "is property X honoured inside ::highlight()" cannot be answered
 * with getComputedStyle, which does not introspect highlight pseudos. So we render
 * two identical specimens, one highlighted and one not, and count differing pixels.
 *
 *   node spike/run-spike.mjs
 *
 * Playwright + pixelmatch + pngjs are resolved from NODE_PATH so the extension repo
 * itself stays dependency-free.
 */
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + path.join(HERE, 'highlight-vs-strong.html');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

function diffPixels(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) {
    return { differs: true, pct: 100, reason: `size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const total = a.width * a.height;
  const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.08 });
  return { differs: n > 0, changed: n, total, pct: +((n / total) * 100).toFixed(3) };
}

async function run({ channel, label, dsf }) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1200 },
    deviceScaleFactor: dsf,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e)));

  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SPIKE_READY === true, null, { timeout: 15000 });
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => window.__SPIKE);
  data.browser = { label, channel: channel || 'bundled-chromium', dsf };
  data.browserVersion = browser.version();
  data.consoleErrors = consoleErrors;

  // ---- pixel probes -------------------------------------------------
  for (const p of data.probes) {
    const test = page.locator(`#cell-${p.id}-test`);
    const ctrl = page.locator(`#cell-${p.id}-ctrl`);
    try {
      const [ta, tb] = await Promise.all([test.screenshot(), ctrl.screenshot()]);
      p.pixels = diffPixels(ta, tb);
      p.renders = p.pixels.differs;
    } catch (e) {
      p.pixels = { error: String(e && e.message || e) };
      p.renders = null;
    }
  }

  // Rasterisation noise floor: two untouched control cells at different y.
  try {
    const [n1, n2] = await Promise.all([
      page.locator('#cell-ctl-range-ctrl').screenshot(),
      page.locator('#cell-bg-ctrl').screenshot(),
    ]);
    data.noiseFloor = diffPixels(n1, n2);
  } catch (e) { data.noiseFloor = { error: String(e) }; }

  // Shadow DOM probe.
  try {
    const [s1, s2] = await Promise.all([
      page.locator('#shadow-test').screenshot(),
      page.locator('#shadow-ctrl').screenshot(),
    ]);
    data.scope.shadowPixels = diffPixels(s1, s2);
    data.scope.shadowPainted = data.scope.shadowPixels.differs;
  } catch (e) { data.scope.shadowPixels = { error: String(e) }; }

  // Iframe: can a parent-document Range even be built over child-document text,
  // and does the child's own registry work?
  data.scope.iframe = await page.evaluate(() => {
    const out = {};
    const f = document.getElementById('frame-test');
    const doc = f.contentDocument;
    const t = doc.body.firstChild;
    try {
      const r = document.createRange();
      r.setStart(t, 0); r.setEnd(t, 5);
      CSS.highlights.set('probe-iframe-parent', new Highlight(r));
      out.parentRegistryAccepted = true;
    } catch (e) { out.parentRegistryAccepted = false; out.parentError = String(e && e.message || e); }
    try {
      const w = f.contentWindow;
      out.childHasHighlights = 'highlights' in w.CSS;
      const r2 = doc.createRange();
      r2.setStart(t, 0); r2.setEnd(t, 5);
      w.CSS.highlights.set('own', new w.Highlight(r2));
      const st = doc.createElement('style');
      st.textContent = '::highlight(own){background-color:#ff0;color:#d00}';
      doc.head ? doc.head.appendChild(st) : doc.body.appendChild(st);
      out.childRegistryAccepted = true;
    } catch (e) { out.childRegistryAccepted = false; out.childError = String(e && e.message || e); }
    return out;
  });

  // ---- accessibility snapshots -------------------------------------
  data.aria = {};
  for (const id of ['inv-a', 'inv-b', 'inv-c']) {
    try {
      data.aria[id] = await page.locator(`#${id} p`).ariaSnapshot();
    } catch (e) { data.aria[id] = 'ARIASNAPSHOT_UNAVAILABLE: ' + String(e && e.message || e); }
  }
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const tree = await cdp.send('Accessibility.getFullAXTree');
    const textOf = (prefix) => tree.nodes
      .filter((n) => n.name && n.name.value && String(n.name.value).includes(prefix))
      .map((n) => ({ role: n.role && n.role.value, name: String(n.name.value).slice(0, 120) }));
    data.axTreeSample = {
      totalNodes: tree.nodes.length,
      quickBrownMatches: textOf('quick brown').length,
      sample: textOf('quick brown').slice(0, 6),
    };
  } catch (e) { data.axTreeSample = { error: String(e && e.message || e) }; }

  // ---- screenshots --------------------------------------------------
  const shot = async (sel, name) => {
    try { await page.locator(sel).screenshot({ path: path.join(OUT, `${name}-${label}-dsf${dsf}.png`) }); }
    catch (e) { /* non-fatal */ }
  };
  await shot('#matrix-rows', 'matrix');
  await shot('#repro-grid', 'issue2');
  await shot('#leg-panels', 'legibility-all');
  for (let i = 0; i < 4; i++) await shot(`#legpanel-${i}`, `legibility-${i}`);
  await page.screenshot({ path: path.join(OUT, `fullpage-${label}-dsf${dsf}.png`), fullPage: true });

  fs.writeFileSync(path.join(OUT, `results-${label}-dsf${dsf}.json`), JSON.stringify(data, null, 2));
  await browser.close();
  return data;
}

const runs = [];
for (const cfg of [
  { channel: undefined, label: 'chromium', dsf: 1 },
  { channel: 'chrome', label: 'chrome', dsf: 1 },
  { channel: 'chrome', label: 'chrome', dsf: 2 },
]) {
  try {
    runs.push(await run(cfg));
    console.log(`ok: ${cfg.label} dsf${cfg.dsf}`);
  } catch (e) {
    console.log(`FAILED: ${cfg.label} dsf${cfg.dsf}: ${e && e.message}`);
  }
}

// ---- console summary -------------------------------------------------
for (const d of runs) {
  console.log('\n' + '='.repeat(78));
  console.log(`${d.browser.label} dsf${d.browser.dsf}  ${d.browserVersion}`);
  console.log(`noise floor between two untouched cells: ${JSON.stringify(d.noiseFloor)}`);
  console.log('-'.repeat(78));
  for (const p of d.probes) {
    const verdict = p.renders === null ? 'ERROR' : p.renders ? 'RENDERS' : 'ignored';
    const flag = p.expect === 'yes' && !p.renders ? '  !! POSITIVE CONTROL FAILED'
               : p.expect === 'no' && p.renders ? '  !! NEGATIVE CONTROL FAILED' : '';
    console.log(
      `${verdict.padEnd(8)} ${String((p.pixels && p.pixels.pct) ?? '').padStart(7)}%  ${p.label}${flag}`
    );
  }
}
console.log('\nwrote ' + OUT);
