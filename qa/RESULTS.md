# BeBold 2.0 QA: 38 real sites

Run 2026-08-29 against **Google Chrome 151.0.7922.170**, arm64 macOS, 1440x900.
Reproduce with `npm install && npm run qa` (add `--shots` for the before/after catalog).

## Headline

| | |
|---|---|
| Sites attempted | 38 |
| Measured | 37 |
| Load errors | **0** |
| Correctly refused | 1 (github.com/login, credential page) |
| **Clean, zero invariance violations** | **37 of 37** |
| **Worst layout shift, any element, any site** | **0.00 px** |
| **Accessibility tree byte-identical** | **37 of 37** |
| Coverage on applied-script sites | **97.9%** (median 98.8%, min 87.2%) |
| Median time to treat a page | 13.9 ms |
| Slowest page | 173.3 ms for 33,435 words (English Wikipedia) |

The overall figure across *all* sites is 56.7%, and that number is honest but misleading:
four of the 37 pages are Arabic, Japanese, Thai and Hindi Wikipedia, where the script
policy declines by design. 76,463 of the 78,831 skipped words on the whole run are those
four pages. **97.9% is the number that describes the product working; 56.7% is the number
that includes deliberately declining to work.**

## What changed against 1.4, same pages, same harness methodology

| site | 1.4 | 2.0 |
|---|---:|---:|
| youtube.com | 0% | **100%** |
| chromestatus.com | 0% (0 of 0 reachable) | **88.8%** |
| theguardian.com | 4.2% | **99.7%** |
| apple.com | 16.1% | **99.4%** |
| tailwindcss.com | 21.8% | **93.4%** |
| gov.uk | 25.3% | **99.8%** |
| github.com (repo) | 40.6% | **96.9%** |
| en.wikipedia.org | 51.9% | **97.3%** |
| store.playstation.com | 75.4% | **99.1%** |
| bbc.com/news | 89.9% | **98.7%** |

chromestatus is the clearest case: its entire page is nested shadow DOM, so 1.4 could not
see a single word. YouTube is the same story.

## The oracle

Pixels are supposed to change, so pixel equality proves nothing. Each page is measured
three times in one load:

1. **A** with the engine loaded but idle
2. **B** after a 700 ms wait, still idle, which establishes the page's own **noise floor**
3. **C** after the engine runs

The engine is only blamed for a difference between B and C that did not also appear
between A and B. Without that control, lazy-loading images and sticky headers on live
sites would be attributed to the extension. Across this run the noise floor caught nothing
that needed subtracting, and no site showed page churn.

Asserted identical between B and C: element count, text-node count, `document.body.innerText`
character for character, `scrollHeight`, `scrollWidth`, every sampled element's
document-relative bounding box within 0.5px, per-element line-box count, and the Playwright
`ariaSnapshot()` of `<body>`.

## Refusal policy in the field

| reason | words skipped | verdict |
|---|---:|---|
| `script:seasia` | 26,238 | by design, Thai Wikipedia |
| `script:cjk` | 20,774 | by design, Japanese Wikipedia |
| `script:arabic` | 17,510 | by design, Arabic Wikipedia |
| `script:brahmic` | 11,941 | by design, Hindi Wikipedia |
| `accuracy-critical` | 2,211 | URLs, version strings, WCAG criterion numbers like `2.4.1` |
| `code` | 130 | inline `<code>` and code blocks |
| `credential-form` | 14 | a hidden login form's subtree |
| `icon-font` | 13 | ligature glyph text |

Sampled refusals were inspected to confirm the policy is not eating prose. Every sample was
a genuine URL, dotted version reference, or numeric identifier.

Hebrew Wikipedia scored **98.7%**, which is the policy distinction working: Hebrew square
script letters do not connect, so a prefix reads as a prefix, while Arabic joins and is
declined. The Arabic screenshot (`out/shots/wikipedia-ar-after.png`) shows the page
completely untouched with cursive joining and RTL layout intact.

## Two policy bugs found and fixed during this run

1. **A whole-document credential refusal was too blunt.** css-tricks.com was refused
   entirely because it has a collapsed login form in its chrome. Now a document is only
   refused when a credential field is *visible*; hidden ones get their own form subtree
   excluded instead. css-tricks went from `refused` to 91.4%.
2. **A character class began with a literal Private Use Area character**, making the
   intended PUA range match a vastly wider span than intended. Replaced with explicit
   `\u{E000}-\u{F8FF}` and plane 15/16 ranges. Three over-greedy patterns (version
   strings, long numbers, paths) were tightened in the same pass so `and/or` and `1.5`
   are no longer treated as accuracy-critical.

## Extension wiring: 16 of 16 integration tests pass

`qa.mjs` drives `engine.js` directly, so it proves the renderer but not the extension
plumbing. `qa/integration.mjs` runs the real `contentScript.js` against a minimal
`chrome.*` shim:

- default install runs and treats words; origin is reported to the popup
- the 1.4 legacy `localStorage` off-switch migrates to a `chrome.storage.sync` per-site
  override, the legacy key is removed, and the site stays off
- a legacy "true" creates no spurious override
- stored per-site override and global disable both keep the engine off
- `toggleSite` round-trips off and back on
- **a `localStorage` getter that throws does not kill the content script**, which is the
  exact line that took 1.4 down on opaque origins
- `stop()` leaves the DOM byte-identical, clears the highlight registry, removes the sheet
- re-segmenting is idempotent

## Caveats, stated plainly

- ~~The packaged extension has not been loaded end to end in a browser.~~ **Resolved.**
  Chrome 137 removed the `--load-extension` switch, but that is a Chrome-branded measure:
  Playwright's `channel: 'chromium'` is a Chrome for Testing build and still honours it.
  `qa/e2e.mjs` installs the real extension, service worker and all, and asserts against
  it (32 checks), and `qa/_zipcheck` confirmed the uploadable zip unpacks into a working
  extension. Note `headless: true` alone is not enough: the default headless build is
  `chromium_headless_shell`, which cannot load extensions at all.
- **Chrome 151 only.** `minimum_chrome_version` is 105, and highlight style inheritance
  only landed in 134, so the 105 to 133 range is unverified. If `currentColor` does not
  resolve there, the fix is to set `color` explicitly.
- **Live sites, one moment in time.** Sites redesign; these numbers will drift.
- `forced-colors: active` falls back to the underline preset by code inspection, not by
  measurement. Verify on Windows High Contrast before shipping.
