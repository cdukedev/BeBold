/* Builds the Chrome Web Store upload zip.
 *
 * Only the files the extension actually loads. Every tool, test, fixture, screenshot and
 * doc stays out, because anything shipped is anything a reviewer has to account for.
 *
 *   node tools/package.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

/* Derived from the manifest rather than hand-listed, so a new file referenced by the
   manifest can never be left out of the zip. */
const files = new Set(['manifest.json']);
for (const cs of manifest.content_scripts || []) {
  for (const j of cs.js || []) files.add(j);
  for (const c of cs.css || []) files.add(c);
}
if (manifest.background?.service_worker) files.add(manifest.background.service_worker);
if (manifest.action?.default_popup) files.add(manifest.action.default_popup);
if (manifest.options_ui?.page) files.add(manifest.options_ui.page);
for (const icon of Object.values(manifest.icons || {})) files.add(icon);

/* Scripts referenced by the extension's own HTML pages. */
for (const page of [manifest.action?.default_popup, manifest.options_ui?.page].filter(Boolean)) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) files.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) files.add(m[1]);
}

const missing = [...files].filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error('referenced but missing: ' + missing.join(', '));
  process.exit(1);
}

const outDir = path.join(ROOT, 'store');
fs.mkdirSync(outDir, { recursive: true });
const zip = path.join(outDir, `bebold-${manifest.version}.zip`);
fs.rmSync(zip, { force: true });

const list = [...files].sort();
execFileSync('zip', ['-q', '-X', zip, ...list], { cwd: ROOT });

const bytes = fs.statSync(zip).size;
console.log(`${path.relative(ROOT, zip)}  ${(bytes / 1024).toFixed(1)} KB`);
for (const f of list) console.log('  ' + f);
console.log(`\nversion ${manifest.version}, minimum Chrome ${manifest.minimum_chrome_version}, ` +
  `permissions [${(manifest.permissions || []).join(', ')}]`);
