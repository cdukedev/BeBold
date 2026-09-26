/* Generates policy.js from policy.v1.json.
 *
 * The JSON is the contributor-facing source of truth; the JS is what the extension
 * actually loads. Keeping them separate means a native speaker of Thai or Hindi can
 * change a verdict in pure data without touching JavaScript, while the extension still
 * loads a plain script with no fetch (a fetch would also defeat the CI check that no
 * source file touches a network API).
 *
 *   node tools/build-policy.mjs         write policy.js
 *   node tools/build-policy.mjs --check  fail if policy.js is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy.v1.json'), 'utf8'));

const strip = (o) => Array.isArray(o) ? o.map(strip)
  : (o && typeof o === 'object')
    ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== '$comment' && k !== 'why')
        .map(([k, v]) => [k, strip(v)]))
    : o;

const clean = strip(src);
const out = `/* GENERATED FILE. Do not edit.
 *
 * Source of truth: policy.v1.json
 * Regenerate:      npm run build:policy
 *
 * Loaded before engine.js by the manifest, so the policy is available as
 * window.BeBoldPolicy with every pattern already compiled to a RegExp.
 */
(function () {
  'use strict';
  const RAW = ${JSON.stringify(clean, null, 2).split('\n').join('\n  ')};
  const re = (p) => new RegExp(p.pattern, p.flags);
  window.BeBoldPolicy = Object.freeze({
    version: RAW.version,
    nonText: new Set(RAW.elements.nonText.tags),
    controls: new Set(RAW.elements.controls.tags),
    codeish: new Set(RAW.elements.codeish.tags),
    scriptFamilies: Object.entries(RAW.scripts).map(([name, s]) => [name, re(s)]),
    denySpans: RAW.denySpans.patterns.map(re),
    denySpanNames: RAW.denySpans.patterns.map((p) => p.name),
    iconFont: re(RAW.iconFonts),
    credentialSelector: RAW.credentialFields.selector,
    optOutMeta: RAW.siteOptOut.metaSelector,
    optOutAttribute: RAW.siteOptOut.attribute,
  });
})();
`;

const target = path.join(ROOT, 'policy.js');
if (process.argv.includes('--check')) {
  const have = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (have !== out) {
    console.error('policy.js is stale. Run: npm run build:policy');
    process.exit(1);
  }
  console.log('policy.js is in sync with policy.v1.json');
} else {
  fs.writeFileSync(target, out);
  console.log(`wrote policy.js from policy.v1.json (version ${clean.version})`);
}
