import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext()).newPage();
await p.goto('file://' + path.join(HERE, 'highlight-vs-strong.html'));
await p.waitForFunction(() => window.__SPIKE_READY === true);
console.log(JSON.stringify(await p.evaluate(() => {
  const s = document.querySelector('#inv-b #custom-strong');
  const para = document.querySelector('#inv-a p');
  return {
    paragraphFont: getComputedStyle(para).fontFamily,
    injectedStrongFont: getComputedStyle(s).fontFamily,
    injectedStrongWeight: getComputedStyle(s).fontWeight,
    note: 'content.css declares font-family:Helvetica !important then font-family:inherit in the same rule',
  };
}), null, 1));
await b.close();
