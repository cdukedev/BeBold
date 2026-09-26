/* Turns a qa.mjs run into one browsable page.
 *
 * A JSON file is not evidence anyone will actually look at. This is: a sortable table
 * of every site with its coverage and invariance verdict, and a drag slider over the
 * before/after screenshots for each one.
 *
 *   node qa/qa.mjs --shots && node qa/catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'qa.json'), 'utf8'));
const { agg, rows } = data;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shot = (n, which) =>
  fs.existsSync(path.join(OUT, 'shots', `${n}-${which}.png`)) ? `shots/${n}-${which}.png` : null;

const measured = rows.filter((r) => !r.error && !r.refused);
const declined = new Set(['wikipedia-ar', 'wikipedia-ja', 'wikipedia-th', 'wikipedia-hi']);
const applied = measured.filter((r) => !declined.has(r.name));
const appliedPct = applied.length
  ? ((applied.reduce((a, r) => a + r.treated, 0) /
      applied.reduce((a, r) => a + r.treated + r.skipped, 0)) * 100).toFixed(1) : '0';

const tiles = [
  ['Sites measured', measured.length, `${rows.filter((r) => r.error).length} errors, ${rows.filter((r) => r.refused).length} refused`],
  ['Clean', `${agg.clean} / ${measured.length}`, 'zero invariance violations'],
  ['Worst layout shift', `${agg.worstBoxShiftPx} px`, 'any element, any site'],
  ['Accessibility tree', `${agg.ariaIdenticalOn} / ${agg.ariaComparable}`, 'byte-identical'],
  ['Coverage', `${appliedPct}%`, 'sites whose script we treat'],
  ['Median pass', `${agg.medianPassMs} ms`, `slowest ${agg.slowestPassMs} ms`],
];

const head = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BeBold 2.0 before and after</title>
<style>
  :root{color-scheme:light dark;--line:color-mix(in srgb,CanvasText 14%,transparent);
        --dim:color-mix(in srgb,CanvasText 62%,transparent);
        --ok:#1a7f37;--bad:#cf222e;--skip:#8250df}
  @media (prefers-color-scheme:dark){:root{--ok:#3fb950;--bad:#f85149;--skip:#a371f7}}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 80px;max-width:78rem;margin-inline:auto;
       font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}
  h1{font-size:26px;margin:0 0 4px}h1 b{font-weight:800}
  .lede{margin:0 0 26px;color:var(--dim);max-width:62ch}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 34px}
  .tile{border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .tile .k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
  .tile .v{font-size:26px;font-weight:700;margin:4px 0 2px;font-variant-numeric:tabular-nums}
  .tile .s{font-size:12px;color:var(--dim)}
  h2{font-size:17px;margin:34px 0 10px}
  table{border-collapse:collapse;width:100%;font-size:14px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}
  th{cursor:pointer;user-select:none;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim)}
  th:hover{color:CanvasText}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600}
  .pill.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
  .pill.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
  .pill.skip{color:var(--skip);background:color-mix(in srgb,var(--skip) 14%,transparent)}
  .bar{height:6px;border-radius:3px;background:color-mix(in srgb,CanvasText 12%,transparent);overflow:hidden;min-width:70px}
  .bar i{display:block;height:100%;background:var(--ok)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:20px}
  .card{border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .card h3{margin:0;padding:11px 14px;font-size:14px;border-bottom:1px solid var(--line);
           display:flex;justify-content:space-between;gap:10px;align-items:center}
  .card h3 a{color:inherit;text-decoration:none}.card h3 a:hover{text-decoration:underline}
  .cmp{position:relative;aspect-ratio:1440/900;background:#fff;overflow:hidden;cursor:ew-resize}
  .cmp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
  .cmp .after{clip-path:inset(0 0 0 50%)}
  .cmp .handle{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#ff3b30;pointer-events:none}
  .cmp .handle::after{content:"";position:absolute;top:50%;left:50%;width:26px;height:26px;
    transform:translate(-50%,-50%);border-radius:50%;background:#ff3b30}
  .cmp .tag{position:absolute;top:8px;font:11px/1 ui-monospace,Menlo,monospace;color:#fff;
    background:rgba(0,0,0,.65);padding:4px 7px;border-radius:4px;pointer-events:none}
  .cmp .tag.l{left:8px}.cmp .tag.r{right:8px}
  footer{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
  :focus-visible{outline:2px solid Highlight;outline-offset:2px}
</style></head><body>
<h1><b>Be</b>Bold 2.0 before and after</h1>
<p class="lede">Every page below was measured twice in one load, with an idle interval in
between as a noise floor, so a lazy-loading image is never mistaken for an extension bug.
The test is invariance, not pixel equality: the pixels are supposed to change, the layout
and the accessibility tree are not. Drag any image to wipe between untreated and treated.</p>
<div class="tiles">
${tiles.map(([k, v, s]) => `  <div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('\n')}
</div>
<h2>Every site</h2>
<table id="t"><thead><tr>
<th data-k="name">Site</th><th data-k="verdict">Verdict</th>
<th data-k="coveragePct" class="num">Coverage</th><th></th>
<th data-k="treated" class="num">Treated</th><th data-k="skipped" class="num">Skipped</th>
<th data-k="worstBoxPx" class="num">Worst shift</th><th data-k="passMs" class="num">Time</th>
</tr></thead><tbody>`;

const verdictOf = (r) => r.error ? ['bad', 'error'] : r.refused ? ['skip', 'refused']
  : r.clean ? ['ok', 'clean'] : ['bad', 'violations'];

const tbody = rows.map((r) => {
  const [cls, label] = verdictOf(r);
  const pct = r.coveragePct ?? 0;
  return `<tr data-name="${esc(r.name)}" data-verdict="${label}" data-coveragepct="${pct}" ` +
    `data-treated="${r.treated || 0}" data-skipped="${r.skipped || 0}" ` +
    `data-worstboxpx="${r.worstBoxPx ?? 0}" data-passms="${r.passMs || 0}">` +
    `<td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></td>` +
    `<td><span class="pill ${cls}">${esc(label)}</span></td>` +
    `<td class="num">${r.error || r.refused ? '&mdash;' : pct + '%'}</td>` +
    `<td>${r.error || r.refused ? '' : `<div class="bar"><i style="width:${pct}%"></i></div>`}</td>` +
    `<td class="num">${(r.treated || 0).toLocaleString()}</td>` +
    `<td class="num">${(r.skipped || 0).toLocaleString()}</td>` +
    `<td class="num">${r.error || r.refused ? '&mdash;' : (r.worstBoxPx ?? 0) + ' px'}</td>` +
    `<td class="num">${r.passMs ? r.passMs + ' ms' : '&mdash;'}</td></tr>`;
}).join('\n');

const withShots = rows.filter((r) => shot(r.name, 'before') && shot(r.name, 'after'));
const cards = withShots.map((r) => {
  const [cls, label] = verdictOf(r);
  return `  <figure class="card" style="margin:0">
    <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
      <span class="pill ${cls}">${esc(label)}${r.coveragePct ? ' &middot; ' + r.coveragePct + '%' : ''}</span></h3>
    <div class="cmp" role="img" aria-label="Before and after comparison for ${esc(r.name)}">
      <img class="before" src="${shot(r.name, 'before')}" alt="" loading="lazy">
      <img class="after" src="${shot(r.name, 'after')}" alt="" loading="lazy">
      <span class="tag l">untreated</span><span class="tag r">BeBold 2.0</span>
      <span class="handle"></span>
    </div>
  </figure>`;
}).join('\n');

const tail = `</tbody></table>
<h2>Before and after, ${withShots.length} pages</h2>
<div class="cards">
${cards}
</div>
<footer>
Generated ${new Date().toISOString().slice(0, 10)} from <code>qa/out/qa.json</code>.
Chrome for Testing, 1440&times;900. Regenerate with
<code>npm run qa:shots &amp;&amp; npm run catalog</code>.
</footer>
<script>
  // wipe
  for (const cmp of document.querySelectorAll('.cmp')) {
    const set = (e) => {
      const r = cmp.getBoundingClientRect();
      const x = Math.min(Math.max(((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width, 0), 1);
      cmp.querySelector('.after').style.clipPath = 'inset(0 0 0 ' + (x * 100) + '%)';
      cmp.querySelector('.handle').style.left = (x * 100) + '%';
    };
    cmp.addEventListener('pointermove', set);
    cmp.addEventListener('touchmove', set, { passive: true });
  }
  // sort
  const tb = document.querySelector('#t tbody');
  let dir = 1, last = '';
  for (const th of document.querySelectorAll('#t th[data-k]')) {
    th.addEventListener('click', () => {
      const k = th.dataset.k.toLowerCase();
      dir = last === k ? -dir : 1; last = k;
      const rows = [...tb.rows].sort((a, b) => {
        const x = a.dataset[k], y = b.dataset[k];
        const nx = parseFloat(x), ny = parseFloat(y);
        return (isNaN(nx) || isNaN(ny)) ? dir * String(x).localeCompare(String(y)) : dir * (nx - ny);
      });
      for (const r of rows) tb.appendChild(r);
    });
  }
</script>
</body></html>`;

fs.writeFileSync(path.join(OUT, 'catalog.html'), head + '\n' + tbody + '\n' + tail);
console.log(`wrote qa/out/catalog.html  (${rows.length} rows, ${withShots.length} comparisons)`);
