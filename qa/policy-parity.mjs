/* Proves the generated policy.js and engine.js's inline fallback are identical.
 *
 * engine.js carries a fallback copy of the policy because the live-site harness injects
 * that one file on its own, where policy.js is not present. A fallback that drifts is
 * worse than no fallback, because the QA numbers would then describe a policy the
 * shipped extension does not use.
 *
 *   node qa/policy-parity.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = fs.readFileSync(path.join(ROOT, 'policy.js'), 'utf8');
const ENGINE = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

const browser = await chromium.launch({ channel: 'chromium', headless: true });

const signatureWith = async (withPolicy) => {
  const page = await browser.newPage();
  await page.goto('about:blank');
  if (withPolicy) await page.evaluate(POLICY);
  await page.evaluate(ENGINE);
  const out = await page.evaluate(() => ({
    sig: window.BeBoldEngine.policySignature(),
    src: window.BeBoldEngine.policySource(),
  }));
  await page.close();
  return out;
};

const generated = await signatureWith(true);
const fallback = await signatureWith(false);
await browser.close();

let failed = false;
const check = (name, pass, detail) => {
  console.log(`${pass ? ' ok ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) failed = true;
};

check('policy.js is used when present', generated.src === 'policy.js', generated.src);
check('fallback is used when absent', fallback.src === 'inline-fallback', fallback.src);
check('generated policy and inline fallback are identical', generated.sig === fallback.sig);

if (generated.sig !== fallback.sig) {
  const a = generated.sig.split('\n'), b = fallback.sig.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`\n  differs on line ${i + 1}:`);
      console.log(`    policy.js: ${String(a[i]).slice(0, 220)}`);
      console.log(`    fallback : ${String(b[i]).slice(0, 220)}`);
    }
  }
}
process.exit(failed ? 1 : 0);
