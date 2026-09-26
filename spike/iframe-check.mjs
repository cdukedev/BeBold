import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
await p.setContent(`<body style="margin:0;font:16px/28px Georgia,serif">
<iframe id="f1" style="width:240px;height:34px;border:0" srcdoc="<body style='margin:2px;font:16px/28px Georgia,serif'>Hamburgefonstiv 0123</body>"></iframe><br>
<iframe id="f2" style="width:240px;height:34px;border:0" srcdoc="<body style='margin:2px;font:16px/28px Georgia,serif'>Hamburgefonstiv 0123</body>"></iframe>
</body>`);
await p.waitForTimeout(300);
const r = await p.evaluate(() => {
  const out = {};
  const t = document.getElementById('f1').contentDocument.body.firstChild;
  const st = document.createElement('style');
  st.textContent = '::highlight(x){background-color:#ff0;color:#d00}';
  document.head.appendChild(st);
  try {
    const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, 11);
    CSS.highlights.set('x', new Highlight(rg));
    out.parentAccepted = true;
    out.rangeRootIsChildDoc = rg.commonAncestorContainer.ownerDocument === document.getElementById('f1').contentDocument;
  } catch (e) { out.parentAccepted = false; out.err = String(e.message); }
  return out;
});
await p.waitForTimeout(200);
const [a, c] = await Promise.all([p.locator('#f1').screenshot(), p.locator('#f2').screenshot()]);
const ia = PNG.sync.read(a), ic = PNG.sync.read(c);
const n = pixelmatch(ia.data, ic.data, null, ia.width, ia.height, { threshold: 0.08 });
console.log(JSON.stringify({ ...r, changedPixels: n, painted: n > 0 }, null, 1));
await b.close();
