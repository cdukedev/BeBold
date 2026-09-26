# BeBold

A Chrome extension that bolds the start of each word to give your eye an anchor.

Some people find it easier to hold their place while reading. The published research has
not found a reading-speed benefit, so treat it as a preference rather than a technique,
and keep it only if it helps you.

## What version 2.0 changed

1.4 rewrote the page: it replaced every text node with a sequence of `<strong>` and
`<span>` elements. That is why it broke layouts, destroyed whitespace, and did nothing at
all on most modern sites.

2.0 does not touch the DOM. It paints the effect with the
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API),
registering ranges against `CSS.highlights` and styling them with a `::highlight()` rule.
Measured consequences, across 37 real sites:

- **Zero layout movement.** Worst bounding-box shift on any element on any site: 0.00 px.
- **The accessibility tree is byte-identical** to the untreated page on all 37.
- Copy and paste, find-in-page, and text selection are unaffected, because no text node
  is ever split.
- Coverage went from 52.7% to **97.9%** on sites whose script we treat. YouTube went from
  0% to 100%; chromestatus.com, which is entirely nested shadow DOM, from 0% to 88.8%.

Full numbers in [`qa/RESULTS.md`](qa/RESULTS.md). The architecture spike that settled the
approach is in [`spike/RESULTS.md`](spike/RESULTS.md).

## Running it locally

```bash
git clone https://github.com/cdukedev/BeBold.git
cd BeBold
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repository directory.

Do not zip it first. Do not try to automate this with `--load-extension`: Chrome 137
removed that switch, and a browser launched with it silently loads no extension at all
while reporting success.

Requires Chrome 105 or later, which is where the CSS Custom Highlight API landed.

## Development

```bash
npm install                # Playwright and the image-diff tooling
npx playwright install chromium

npm test                   # the gate: 116 assertions, all hermetic
npm run fixtures           # 66, committed fixture pages, with and without the extension
npm run integration        # 16, the chrome.* wiring: storage, migration, teardown
npm run e2e                # 32, the REAL packaged extension in a real browser
npm run parity             # 3, generated policy vs the engine's inline fallback

npm run qa                 # invariance and coverage across 38 live sites
npm run qa:shots           # the same, writing before/after screenshots
npm run catalog            # build the browsable catalog from the last qa run

npm run build:policy       # regenerate policy.js from policy.v1.json
npm run package            # build the Chrome Web Store zip
npm run store:shots        # regenerate the store screenshots
```

### Testing a browser extension in 2026

Chrome 137 removed the `--load-extension` command line switch, and the
`DisableLoadExtensionCommandLineSwitch` escape hatch went with it. A stable Chrome
launched with those flags reports **zero installed extensions** and silently does
nothing, which is how an early version of this harness confidently measured 0% coverage
across 23 sites.

Two things make the end-to-end tests possible anyway:

- `channel: 'chromium'` is a **Chrome for Testing** build, and it still honours the
  switch. The removal is a Chrome-branded anti-abuse measure.
- `headless: true` alone is not enough, because Playwright's default headless build is
  `chromium_headless_shell`, which cannot load extensions at all. The channel is
  load-bearing.

Every harness here refuses to report a number unless a positive control transforms first.

The live-site harness asserts **invariance** rather than pixel equality, because the
pixels are supposed to change. It measures each page three times per load, using an idle
interval as a noise floor, so a lazy-loading image is never mistaken for an extension bug.

## Files

| file | role |
|---|---|
| `policy.v1.json` | the refusal policy, as pure data. The source of truth, so someone who reads a writing system better than they read JavaScript can change a verdict and open a pull request. |
| `policy.js` | **generated** from the above by `npm run build:policy`. CI fails if the two drift. |
| `engine.js` | the renderer. Segmentation, refusal policy, highlight registration, observer, teardown. Deliberately free of every `chrome.*` API so it can be tested directly. |
| `contentScript.js` | wiring only: reads preferences, decides whether this origin is enabled, drives the engine. |
| `background.js` | keyboard command handling. |
| `popup.html` / `popup.js` | the toolbar popup. Reads real state before rendering. |
| `options.html` / `options.js` | settings, with a live preview rendered by the real engine. |

## Privacy

BeBold makes no network requests of any kind. It collects nothing, sends nothing, and
stores only your preferences in Chrome's own sync storage. See [PRIVACY.md](PRIVACY.md).

That claim is enforced rather than promised: CI fails the build if any source file so
much as mentions `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` or
`EventSource`.

## Contributing

See [contribution.md](contribution.md).
