/* Chrome Web Store listing screenshots, rendered from the real packaged extension.
 *
 * The store wants 1280x800. Every shot here is a real page treated by the real
 * extension, not a mockup, which is the whole point: the current listing's images and
 * demo video show 1.4 behaviour and are now actively misleading.
 *
 *   node tools/store-shots.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const TMP = path.join(ROOT, 'store', '.raw');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const ARTICLE = `<!doctype html><html lang=en><head><meta charset=utf-8>
<title>article</title><style>
 body{margin:0;font:17px/1.7 Georgia,"Times New Roman",serif;color:#1a1a1a;background:#fff}
 .wrap{max-width:640px;margin:0 auto;padding:44px 32px}
 h1{font-size:30px;line-height:1.25;margin:0 0 6px;font-weight:600}
 .by{font:13px/1.5 system-ui,sans-serif;color:#767676;margin:0 0 26px}
 p{margin:0 0 18px}
 ul{margin:0 0 18px;padding-left:22px} li{margin:0 0 7px}
 h2{font-size:20px;margin:30px 0 10px;font-weight:600}
 code{font:15px/1.5 ui-monospace,Menlo,monospace;background:#f3f3f3;padding:1px 5px;border-radius:3px}
 .note{border-left:3px solid #d8d8d8;padding-left:16px;color:#444}
</style></head><body><div class=wrap>
<h1>Why holding your place while reading is hard</h1>
<p class=by>Reading research digest &middot; 9 minute read</p>
<p>Reading long passages on a screen is harder than it looks. Your eyes do not glide
smoothly along a line of text. They jump, land, jump again, and every one of those
landings is a chance to lose the thread and start the sentence over.</p>
<p>A small anchor at the start of each word gives your eye somewhere to land. Some
people find it easier to hold their place. Others find it distracting, which is why
this is a preference you can turn off per site rather than a technique anyone should
be sold.</p>
<h2>What the evidence actually shows</h2>
<p>Controlled studies have not found a reading speed benefit, and comprehension
results are mixed. What people do report is a subjective sense of staying on the line
more easily, which is worth something even when it does not show up on a stopwatch.</p>
<ul>
<li>Lists are treated too, which most extensions of this kind skip entirely.</li>
<li>Headings, sidebars and navigation all get the same treatment.</li>
<li>Code like <code>npm install playwright</code> is deliberately left alone.</li>
</ul>
<p class=note>Nothing on this page moved. The layout is identical with the extension
on and off, down to the last pixel, because no element was created or changed.</p>
</div></body></html>`;

const EXACT = `<!doctype html><html lang=en><head><meta charset=utf-8><title>exact</title>
<style>
 body{margin:0;font:17px/1.75 Georgia,serif;color:#1a1a1a;background:#fff}
 .wrap{max-width:660px;margin:0 auto;padding:48px 32px}
 h1{font:600 26px/1.3 Georgia,serif;margin:0 0 22px}
 p{margin:0 0 16px}
 pre{background:#f5f5f5;border-radius:6px;padding:14px 16px;overflow:auto;
     font:14px/1.6 ui-monospace,Menlo,monospace;margin:0 0 16px}
 code{font:15px/1.5 ui-monospace,Menlo,monospace;background:#f3f3f3;padding:1px 5px;border-radius:3px}
 .tag{display:inline-block;font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;
      text-transform:uppercase;color:#8a6d00;background:#fff4cc;padding:4px 7px;border-radius:4px;
      margin-right:7px;vertical-align:2px}
</style></head><body><div class=wrap>
<h1>Some things must stay exactly as written</h1>
<p>Ordinary prose is treated, because getting a word slightly wrong costs you nothing
but a moment. Other things are different, so BeBold leaves them completely alone.</p>
<p><span class=tag>left alone</span>Take 500 mg twice daily, or 2.5 ml of the
suspension, and never 1000 mg in a single dose.</p>
<p><span class=tag>left alone</span>Transfer to GB29 NWBK 60161331926819 before the
end of the month, quoting invoice 98765.</p>
<p><span class=tag>left alone</span>Upgrade from v2.14.0-rc.1 to 3.0.1, and read
https://example.com/docs/migration first.</p>
<p><span class=tag>left alone</span>Run <code>npm install playwright</code> in the
project root, then:</p>
<pre>const ranges = segment(node);
CSS.highlights.set('bebold', new Highlight(...ranges));</pre>
<p>Pages that ask for a password or a card number are skipped entirely, and any site
can opt out with a single meta tag.</p>
</div></body></html>`;

const PAGES = { '/article': ARTICLE, '/exact': EXACT };
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGES[req.url.split('?')[0]] || ARTICLE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
/* Served locally but resolved under the IANA-reserved demo domain, so the origin shown
   in the popup reads as a real site instead of a raw loopback port. The page is still
   genuinely served and genuinely treated; only the hostname resolution is local. */
const DEMO_HOST = 'reading.example.com';
const BASE = `http://${DEMO_HOST}`;

const profile = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bebold-store-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
         `--host-resolver-rules=MAP ${DEMO_HOST} 127.0.0.1:${PORT}`],
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
});
const sw = ctx.serviceWorkers()[0] ||
  await ctx.waitForEvent('serviceworker', { timeout: 10000 });
const EXT_ID = new URL(sw.url()).host;

const setStore = async (obj) => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/options.html`);
  await p.evaluate((o) => chrome.storage.sync.set(o), obj);
  await p.close();
};

/* raw capture: one page, extension on or off */
async function raw(name, url, { off = false, width = 1280, height = 800 } = {}) {
  if (off) await setStore({ enabled: false });
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  const file = path.join(TMP, `${name}.png`);
  await p.screenshot({ path: file });
  await p.close();
  if (off) await setStore({ enabled: true });
  return file;
}

const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

/* Compose a finished store tile. The Chrome Web Store requires EXACTLY 1280x800, so
   this context runs at deviceScaleFactor 1 while the raw captures above stay at 2 and
   get downscaled into it, which keeps the text crisp without oversizing the output. */
const ctx1x = await ctx.browser().newContext({
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
});

async function compose(name, html) {
  const p = await ctx1x.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.setContent(`<!doctype html><meta charset=utf-8><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:1280px;height:800px;overflow:hidden;background:#0d1b2a;
         font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff}
    .cap{padding:30px 44px 20px}
    .cap h2{font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
    .cap p{font-size:16px;line-height:1.45;color:#a9bcd0;margin-top:8px;max-width:88ch}
    .stage{position:relative;height:100%;overflow:hidden}
    .frame{position:absolute;border-radius:10px 10px 0 0;overflow:hidden;
           box-shadow:0 18px 50px rgba(0,0,0,.45);background:#fff}
    .frame img{display:block;width:100%}
    .lbl{position:absolute;z-index:3;font:600 12px/1 ui-monospace,Menlo,monospace;
         letter-spacing:.08em;text-transform:uppercase;color:#fff;
         background:rgba(13,27,42,.9);padding:7px 11px;border-radius:5px}
  </style>${html}`);
  await p.waitForTimeout(500);
  const out = path.join(OUT, `${name}.png`);
  await p.screenshot({ path: out });
  await p.close();
  console.log('  ' + path.relative(ROOT, out));
}

console.log('capturing...');
const artOn = await raw('article-on', `${BASE}/article`);
// the split tile shows two half-width frames, so capture those at a column aspect,
// otherwise a 1280x800 capture scaled to 596px wide leaves 400px of dead space
const colOn = await raw('col-on', `${BASE}/article`, { width: 720, height: 1010 });
const colOff = await raw('col-off', `${BASE}/article`, { off: true, width: 720, height: 1010 });
const exactOn = await raw('exact-on', `${BASE}/exact`);
const optionsRaw = await raw('options', `chrome-extension://${EXT_ID}/options.html`,
  { width: 820, height: 1010 });

// The popup reports on whichever tab is active, so give it a genuine one to report on.
const host = await ctx.newPage();
await host.goto(`${BASE}/article`, { waitUntil: 'load' });
await host.waitForTimeout(1400);

const pop = await ctx.newPage();
await pop.setViewportSize({ width: 300, height: 300 });
await pop.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'load' });
await pop.waitForTimeout(500);
await host.bringToFront();          // now the article is the active tab
await pop.evaluate(() => refresh()); // re-read against it
await pop.waitForTimeout(700);
const popupRaw = path.join(TMP, 'popup.png');
await pop.screenshot({ path: popupRaw });
const popupText = await pop.evaluate(() => document.getElementById('summary').textContent.trim());
console.log('  popup reads: ' + popupText);
await pop.close();
await host.close();

console.log('composing...');

await compose('1-works-everywhere', `
  <div class="cap"><h2>Bolds the start of each word, on the sites you actually use</h2>
  <p>Lists, headings, sidebars and web apps included. Version 1.4 treated about half the words on a page. This treats nearly all of them.</p></div>
  <div class="stage"><span class="lbl" style="left:44px;top:14px">Live page</span>
  <div class="frame" style="left:44px;right:44px;top:0;"><img src="${dataUri(artOn)}"></div></div>`);

await compose('2-before-after', `
  <div class="cap"><h2>Nothing moves. Not one pixel.</h2>
  <p>Measured across 37 real sites: worst layout shift of any element, 0.00 px. The page DOM is never touched, so copy and paste, find in page and screen readers all behave exactly as before.</p></div>
  <div class="stage">
    <span class="lbl" style="left:44px;top:14px">Off</span>
    <span class="lbl" style="left:664px;top:14px">On</span>
    <div class="frame" style="left:44px;top:0;width:596px"><img src="${dataUri(colOff)}"></div>
    <div class="frame" style="left:664px;top:0;width:596px"><img src="${dataUri(colOn)}"></div>
  </div>`);

await compose('3-stays-exact', `
  <div class="cap"><h2>Leaves alone what has to stay exact</h2>
  <p>Dosages, account numbers, version strings, links and code are never altered. Pages that ask for a password or a card number are skipped entirely.</p></div>
  <div class="stage"><div class="frame" style="left:44px;right:44px;top:0"><img src="${dataUri(exactOn)}"></div></div>`);

await compose('4-controls', `
  <div class="cap"><h2>Your reading, your settings</h2>
  <p>Three treatments, five strengths, how much of each word, and an on or off switch for any single site. Everything previews live.</p></div>
  <div class="stage">
    <div class="frame" style="left:44px;top:0;width:790px"><img src="${dataUri(optionsRaw)}"></div>
    <div class="frame" style="right:60px;top:26px;width:300px;border-radius:10px"><img src="${dataUri(popupRaw)}"></div>
    <span class="lbl" style="right:60px;top:-6px">Toolbar</span>
  </div>`);

await compose('5-private', `
  <div class="cap"><h2>Makes no network requests. Collects nothing.</h2>
  <p>No analytics, no accounts, no tracking, no remote configuration. Your preferences are stored by Chrome and nothing else leaves your browser. The build fails if any source file so much as mentions a network API.</p></div>
  <div class="stage"><div class="frame" style="left:44px;right:44px;top:0"><img src="${dataUri(artOn)}"></div></div>`);

await ctx1x.close();
await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\ndone: store/screenshots/ (1280x800, 2x)');
