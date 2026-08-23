# `minimum_chrome_version` for BeBold 2.0, and whether to ship a fallback renderer

Research date: 2026-08-23. Chrome stable at time of writing: **151.0.7922.174**
([chromiumdash `fetch_releases`](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=3)).

## Recommendation up front

| Decision | Answer |
|---|---|
| `minimum_chrome_version` | **`"105"`** |
| Ship the legacy DOM-rewriting fallback | **No** |
| Handle the sub-floor case | Feature-detect anyway, and make `popup.html` say why nothing happened. No new permissions. |

Reasoning is in [§7](#7-recommendation). The short version: 105 is the real, verified floor
(confirmed against the M105 Blink source, not just an API-existence table), it strands
roughly **9 to 11 of the 878 existing users**, and every one of them stays on 1.4 silently
rather than losing anything. A fallback renderer would cost you the maintenance of the exact
code that earned the one-star review, in order to serve about one percent of the base
badly.

---

## 1. Support floors, verified

Primary source is [MDN browser-compat-data](https://github.com/mdn/browser-compat-data)
`main` branch, read as raw JSON rather than through the rendered MDN pages, cross-checked
against [chromestatus.com](https://chromestatus.com).

| Feature | BCD key | Chrome | Source |
|---|---|---|---|
| `CSS.highlights` | `api.CSS.highlights_static` | **105** | [`api/CSS.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/CSS.json) |
| `Highlight` constructor | `api.Highlight.Highlight` | **105** | [`api/Highlight.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Highlight.json) |
| `Highlight` (all members) | `api.Highlight.*` | **105** | same |
| `HighlightRegistry` (all members) | `api.HighlightRegistry.*` | **105** | [`api/HighlightRegistry.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HighlightRegistry.json) |
| `::highlight()` pseudo-element | `css.selectors.highlight` | **105** | [`css/selectors/highlight.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/selectors/highlight.json) |
| `StaticRange` interface | `api.StaticRange` | 60 | [`api/StaticRange.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/StaticRange.json) |
| **`new StaticRange()`** | `api.StaticRange.StaticRange` | **90** | same |
| `Intl.Segmenter` | `javascript.builtins.Intl.Segmenter` | **87** | [`javascript/builtins/Intl/Segmenter.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/Intl/Segmenter.json) |

Two corrections to the assumptions in the ticket:

- **`StaticRange` is not a single floor.** The interface has existed since Chrome 60, but the
  *constructor*, which is the only part BeBold uses, landed in Chrome 90. Anyone reading
  "StaticRange: Chrome 60" off the top-level MDN page and concluding the floor is 60 would be
  wrong by 30 milestones. It still does not bind, because 105 is higher.
- **Do not use `HighlightRegistry.highlightsFromPoint()`.** It is Chrome **140**
  (`api.HighlightRegistry.highlightsFromPoint`,
  [chromestatus 4552801607483392](https://chromestatus.com/feature/4552801607483392)). It is
  the one member of the API that would silently raise your floor by 35 milestones. If any
  hit-testing or hover behaviour is planned for 2.0, this is the trap.

**Binding constraint: Chrome 105.** Confirmed independently by Chrome Platform Status:
[Custom Highlight API, feature 5436441440026624](https://chromestatus.com/feature/5436441440026624),
status "Enabled by default", shipped desktop 105 / Android 105 / WebView 105.

Chrome 105 reached stable on **2022-08-30**
([chromiumdash `fetch_milestone_schedule?mstone=105`](https://chromiumdash.appspot.com/fetch_milestone_schedule?mstone=105)),
which makes the floor 46 milestones and almost exactly four years old today.

### 1a. The rendering technique also works in 105, not just the API

This matters more than the API floor, because the
[spike](../spike/RESULTS.md) established that `font-weight` is ignored inside `::highlight()`
and that `text-shadow` is the only usable weight lever. If `text-shadow` had only become
valid inside highlight pseudos later than 105, the effective floor would be higher than the
API floor and BCD would not tell you.

I checked the Blink source at the M105 release branch (`branch-heads/5195`, per
[chromiumdash `fetch_milestones?mstone=105`](https://chromiumdash.appspot.com/fetch_milestones?mstone=105))
rather than trunk:
[`third_party/blink/renderer/core/css/css_properties.json5`](https://chromium.googlesource.com/chromium/src/+/refs/branch-heads/5195/third_party/blink/renderer/core/css/css_properties.json5).

At M105, `valid_for_highlight: true` was already set on `text-shadow`, `color`,
`background-color`, `text-decoration-line`, `text-decoration-color` and
`text-decoration-thickness`, and was **not** set on `font-weight` or on any
`-webkit-text-stroke-*` property. That is the same property set the spike measured on
Chrome 151. **The faux-bold technique behaves in 105 the way it behaves today.**

One property did change: `text-underline-offset` was *not* `valid_for_highlight` at M105 and
is now. Do not depend on it if you set the floor at 105.

### 1b. The one real behavioural delta between 105 and today

[CSS Highlight Inheritance](https://chromestatus.com/feature/5090853643354112) shipped in
**Chrome 134**. Highlight pseudos now inherit through the highlight pseudo chain instead of
the originating element chain. Chrome Platform Status describes it as non-breaking, and it
is, but it changes how an unspecified `color` (and therefore `currentColor` inside your
`text-shadow`) resolves on nested elements. This is a **test matrix item for the 105 to 133
band**, not a reason to raise the floor. See [§7](#7-recommendation) for the cost of raising
it.

### 1c. About the March 2026 Baseline date

Confirmed, and confirmed to be irrelevant here.
[`web-features/features/highlight.yml.dist`](https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/highlight.yml.dist)
gives the "Custom highlights" feature `baseline: low`, `baseline_low_date: 2026-03-24`.

But the same file shows *why*. The JavaScript half of the API
(`api.CSS.highlights_static`, `api.Highlight.*`, `api.HighlightRegistry.*`) reached Baseline
low on **2025-06-24** with Firefox 140. The whole feature was held back to 2026-03-24 by
`css.selectors.highlight` alone, because Firefox's `::highlight()` was
`partial_implementation` until **Firefox 149** (it could not be combined with `text-shadow`
before 149, per [bug 1845447](https://bugzil.la/1845447), or with `text-decoration` before
146, per [bug 1845446](https://bugzil.la/1845446)).

So the March 2026 Baseline date is a statement about Firefox, and specifically about the
exact Firefox limitation that would have broken BeBold's technique. For a Chrome-only
extension, **Baseline should not enter the decision at all.** Chrome's number has been 105
since August 2022 and Baseline moving in March 2026 did not change it.

---

## 2. How many Chrome users are actually below 105?

**Answer: roughly 1 to 2 percent of real desktop Chrome users. For BeBold's specific
installed base the number is about 1 percent, or 9 to 11 of the 878. Confidence: high on
the range, high on the direction.**

Getting here required discarding a lot of the headline numbers, because both major public
datasets are heavily contaminated in exactly the version range in question.

### 2a. Wikimedia Foundation pageview telemetry (independent, best source)

Wikimedia publishes its own raw server-log browser breakdown, including major version:
[`all_sites_by_os_and_browser.tsv`](https://analytics.wikimedia.org/published/datasets/periodic/reports/metrics/browser/all_sites_by_os_and_browser.tsv).
This is genuine first-party telemetry, not a panel estimate, and it is not derived from
StatCounter. Latest week in the file: **2026-08-16**, 645,029,995 desktop-Chrome pageviews.

Headline: **8.795% of desktop Chrome pageviews were below v105.** That number is wrong, and
the dataset itself shows why. The sub-105 histogram looks like this:

```
v60  0.3526%   v66  0.3511%   v72  0.3400%   v78  0.3413%
v61  0.3406%   v67  0.3428%   v73  0.3401%   v79  0.3917%
v62  0.3471%   v68  0.3515%   v74  0.3476%   v80  0.3008%
v63  0.3447%   v69  0.3407%   v75  0.3603%
v64  0.3398%   v70  0.3621%   v76  0.3397%
v65  0.3867%   v71  0.3408%   v77  0.3402%
```

Twenty-one consecutive 2018-vintage versions at a near-identical ~0.34% each. Organic
version distributions decay; they do not form plateaus. This is automated traffic with
spoofed or rotated user agents. The OS mix confirms it: among sub-105 desktop Chrome the OS
split is **88.26% Windows / 5.39% Mac / 3.34% "Ubuntu"**, versus **56.77% Windows / 31.63%
Mac / 0.02% "Ubuntu"** for v105+. Real humans on ancient Chrome do not stop owning Macs.

Excluding the v55 to v90 plateau (7.570 of the 8.795 points), the residual sub-105 share is
**1.225%**.

### 2b. StatCounter (panel data, July 2026)

Pulled as CSV from StatCounter's own chart endpoint, worldwide, July 2026
([`gs.statcounter.com/chart.php?...&csv=1`](https://gs.statcounter.com/chart.php?device=Desktop%20%26%20Mobile%20%26%20Tablet%20%26%20Console&device_hidden=desktop%2Bmobile%2Btablet%2Bconsole&statType_hidden=browser_version&region_hidden=ww&granularity=monthly&statType=Browser%20Version&region=Worldwide&fromInt=202607&toInt=202607&fromMonthYear=2026-07&toMonthYear=2026-07&csv=1)).

Versioned Chrome below 105: **3.84%** of versioned Chrome (all devices) or **4.26%**
(desktop query). Same contamination pattern: Chrome 39 through 60 appear at an identical
0.02 points each. Strip that block and the residual is **1.7% to 1.9%**.

[caniuse](https://raw.githubusercontent.com/Fyrd/caniuse/main/fulldata-json/data-2.0.json)
(updated 2026-08-07) gives 4.27%, but caniuse's usage data is derived from StatCounter, so
it is not an independent third reading. It reproduces the same v39 to v60 flat block.

### 2c. The long tail, checked specifically

The ticket asked about enterprise, ChromeOS AUE, and forks. Each turns out to be reassuring:

- **Windows 7 / 8 / 8.1 pinned machines are above the floor.** Google states
  "Chrome 109 is the last version to support this operating system" for Windows 7 and
  Windows 8/8.1 ([support.google.com/chrome/a/answer/7100626](https://support.google.com/chrome/a/answer/7100626)).
  **109 > 105.** This is the single largest identifiable frozen cohort and it is safe. It is
  visible in the data as a distinct spike (Chrome 109 is 0.58 points in StatCounter, more
  than any other legacy version).
- **ChromeOS AUE devices are a small, identifiable cohort.** Within ChromeOS pageviews in
  the Wikimedia data, only **3.559%** are below 105, and they sit on exactly two versions:
  v103 (2.94%) and v93 (0.62%), which is what AUE pinning looks like. ChromeOS is about 2%
  of desktop Chrome, so this is roughly **0.07% of desktop Chrome overall**. Current policy
  is 10 years of updates ([support.google.com/chrome/a/answer/6220366](https://support.google.com/chrome/a/answer/6220366)),
  so this cohort shrinks rather than grows.
- **Chromium forks** mostly report as themselves (Brave, Opera, Yandex, Coc Coc, 360 all
  appear as separate rows in the StatCounter data) and are not Chrome Web Store install
  targets in the same way. Edge, which is, shows only **0.737%** below 105 in the Wikimedia
  data.

### 2d. The number that actually applies to BeBold

BeBold 1.4 is already Manifest V3. MV3 requires **Chrome 88**
([BCD `webextensions.manifest.manifest_version.v3`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/webextensions/manifest/manifest_version.json)),
and the manifest uses `chrome.action`, also Chrome 88
([BCD `webextensions.api.action`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/webextensions/api/action.json)).

So every one of the 878 existing users is on Chrome 88 or newer. The entire v39 to v87 tail,
which is where nearly all the contamination lives, **cannot contain a BeBold user**. The
population at risk is precisely the **v88 to v104** window:

| Source | v88-104 as share of v88+ Chrome | Applied to 878 users |
|---|---|---|
| Wikimedia, desktop Chrome, 2026-08-16 | 1.011% | **~9 users** |
| StatCounter, versioned Chrome, Jul 2026 | 1.253% | **~11 users** |

Two methodologically unrelated sources agreeing at ~1% is as good as this gets without
Chrome Web Store developer-dashboard data, which is the one thing that would answer it
exactly and which I could not access (see [§8](#8-what-i-could-not-establish)).

---

## 3. What `minimum_chrome_version` actually does

Authoritative doc:
[developer.chrome.com/docs/extensions/reference/manifest/minimum-chrome-version](https://developer.chrome.com/docs/extensions/reference/manifest/minimum-chrome-version).
It is optional, and the value "must be a substring of an existing Chrome browser version
string, such as `"107"` or `"107.0.5304.87"`"
([manifest key index](https://developer.chrome.com/docs/extensions/reference/manifest)).

### 3a. New installs: blocked, with a visible message

> "In versions of Chrome older than the minimum version, the Chrome Web Store will show a
> 'Not compatible' message in place of the install button. Users on these versions will not
> be able to install your extension."

So below-floor users are **blocked at the listing**, not allowed to install and fail later.
This is the good failure mode.

### 3b. Existing installs: pinned, and silent. This is the crux.

> "Existing users of your extension will not receive updates when the
> `minimum_chrome_version` is higher than their current browser version. This happens
> silently so you should exercise caution and consider ways of letting existing users know
> that they are no longer receiving updates."

Three things follow, and they answer the ticket's question directly:

1. **They do not lose the extension.** BeBold 1.4 keeps working exactly as it does today.
2. **They do not get an error.** They are not shown anything.
3. **They stay pinned on 1.4 indefinitely**, and will silently migrate to 2.0 the moment
   their Chrome crosses 105 through a normal browser update.

The mechanism is the Omaha update protocol's `prodversionmin` attribute, which the Web Store
sets from your manifest key. Chrome's own self-hosting documentation describes the same
attribute for developer-hosted extensions: "To ensure that a given update will apply only to
Google Chrome versions at or higher than a specific version, add the `prodversionmin`
attribute to the `<app>` element in the update response"
([host-on-linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)).
The updater filters the update out; nothing reaches the client to fail.

**This is the decisive fact for BeBold.** The extension's existing one-star review came from
2.0-style breakage in a 1.x context: the extension appearing installed and doing nothing.
`minimum_chrome_version` does not reproduce that. A pinned user is not running broken 2.0
code; they are running working 1.4 code. The silence is a silence about *updates*, not a
silence about *function*.

### 3c. It is enforced in the browser too, not just the store

This is not documented on the manifest page, and it matters for sideloading, unpacked
loading, and enterprise force-install. From the Chromium source,
[`chrome/common/extensions/manifest_handlers/minimum_chrome_version_checker.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/manifest_handlers/minimum_chrome_version_checker.cc):

```cpp
if (current_version.CompareTo(minimum_version) < 0) {
  *error = ErrorUtils::FormatErrorMessageUTF16(
      errors::kChromeVersionTooLow,
      l10n_util::GetStringUTF8(IDS_PRODUCT_NAME), *minimum_version_string);
  return false;
}
```

This runs inside `Parse()`, and the handler is registered unconditionally at
[`chrome/common/extensions/chrome_manifest_handlers.cc:37`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/chrome_manifest_handlers.cc).
A `false` return from a manifest handler means **manifest parsing fails and the extension
does not load at all**. The error string is defined in
[`extensions/common/manifest_constants.h`](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/manifest_constants.h):

```cpp
inline constexpr char kChromeVersionTooLow[] =
    "This extension requires * version * or greater.";
```

The two `*` placeholders fill with the product name and your declared minimum, producing
*"This extension requires Google Chrome version 105 or greater."*

So there is one path where the user does see explicit text, and it is the developer /
enterprise path, not the store path. Worth knowing if you ever ship a CRX directly.

### 3d. One enterprise gotcha

> "Enterprise users using ephemeral mode are treated as new users each time they sign in.
> This means that if they are using a Chrome version lower than the
> `minimum_chrome_version`, your extension will not be installed."

([ephemeral mode](https://support.google.com/chrome/a/answer/3538894).) An ephemeral-mode
user below the floor loses BeBold entirely at next sign-in rather than being pinned. Given
that ChromeOS below 105 is ~0.07% of desktop Chrome and ephemeral mode is a subset of that,
this rounds to zero users, but it is the only case where "pinned silently" is not the
outcome.

---

## 4. Does the Chrome Web Store surface it before install?

**Yes.** Per the manifest documentation quoted in §3a, the store replaces the install button
with a "Not compatible" message. The requirement is therefore visible at exactly the moment
it matters, before the user commits.

Caveat on confidence: this is a single-source claim. The manifest reference is the owning
document for the key, but I could not independently verify the current store UI string, and
the doc page carries an `updated: 2023-10-25` date in its
[source](https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/mv3/manifest/minimum_chrome_version/index.md).
Verifying would require driving a pre-105 Chrome against the live store. Nothing in the
Chrome Web Store publishing docs contradicts it.

---

## 5. Feature detection as an alternative

`'highlights' in CSS` is a correct and cheap detection for the whole cluster, because
`CSS.highlights`, `Highlight`, `HighlightRegistry` and `::highlight()` all shipped together
in 105 (§1). A belt-and-braces check would be:

```js
const supported =
  'highlights' in CSS &&
  typeof Highlight === 'function' &&
  typeof Intl.Segmenter === 'function' &&
  CSS.supports('selector(::highlight(x))');
```

`CSS.supports('selector(...)')` is the only way to test the pseudo-element itself, since
`::highlight()` never matches an element you can query.

### The three candidate behaviours

**Silently do nothing.** This is the current failure and it is what produced the one-star
review. Reject it. Note, though, that a version floor *avoids* this rather than causing it
(§3b), so "feature-detect" and "set a floor" are not competing on this axis.

**Fall back to the legacy DOM-rewriting path.** Analysed in §6. No.

**Show an honest message.** Correct. The question is the channel.

### Channels for a message with no page-level UI

| Channel | Permission cost | Verdict |
|---|---|---|
| `popup.html` (already in the manifest) | none | **Use this** |
| `chrome.action.setBadgeText` / `setTitle` | none, `action` is already declared | **Use this** |
| `chrome.notifications` | adds a warning | **Reject, see below** |
| `chrome.action.openPopup()` | none, but **Chrome 127+** | Unusable here |

`chrome.notifications` is the obvious-looking answer and it is a trap. The `notifications`
permission carries the install-time warning **"Display notifications"**
([permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)),
and Chrome's rule for updates that add a warning-bearing permission is that "the extension
will be disabled until the user accepts the new permission"
([permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)).

That means adding `notifications` in order to explain a failure to ~9 users would **disable
BeBold for all 878** until each one clicks through a re-approval dialog. On an extension
already losing ~14 users a week, a forced re-consent prompt is the single most damaging
thing you could ship. Do not do it.

`chrome.action.openPopup()` is Chrome 127+
([action API](https://developer.chrome.com/docs/extensions/reference/api/action)), so it
cannot reach the old browsers you would want to reach with it. The popup still works, the
user just has to click the icon, which is precisely what a confused user does.

The zero-cost combination is: badge text such as `!` plus a `setTitle` tooltip, and a popup
that states the requirement and the user's actual version. Nothing new in the manifest.

---

## 6. Should the legacy fallback ship? No.

The case against, in order of weight:

1. **It serves ~1% of the base** (§2d), and it serves them *badly*: the fallback is broken by
   the ticket's own description (destroys grid and flex layout, deletes whitespace, shreds
   the accessibility tree, silently no-ops on most modern sites). Shipping it means the
   ~9 affected users get the experience that generated the one-star review, while the
   1-star review is attributed to BeBold 2.0.
2. **It is not needed to protect those users.** This is the part that changes the calculus.
   With `minimum_chrome_version: "105"`, a below-floor user does not get 2.0 at all (§3b).
   They keep running 1.4, which contains the legacy renderer already. **The fallback ships
   itself, as version 1.4, to exactly the population that needs it, at zero maintenance
   cost.** Carrying the legacy path inside 2.0 duplicates something the store's version
   pinning already does for free.
3. **It doubles the test matrix permanently.** Two renderers means every layout, every
   site-compat report, and every accessibility fix gets validated twice, forever, for a
   shrinking audience.
4. **The population is shrinking on its own.** The largest legacy cohort (Chrome 109,
   Windows 7/8.1) is already above the floor (§2c), and ChromeOS AUE is now a 10-year
   window. There is no scenario where sub-105 Chrome grows.

The only argument for keeping it would be if 2.0's engine were unproven. It is not: the
[spike](../spike/RESULTS.md) measured the technique pixel-by-pixel, and §1a confirms the
property support it depends on was already present in M105.

---

## 7. Recommendation

### Set `minimum_chrome_version` to `"105"`

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "105"
}
```

**Why 105 and not lower or absent.** 105 is the true floor for the highest-floor feature in
the stack, confirmed by BCD, by Chrome Platform Status, and by the M105 Blink source for the
specific properties the renderer uses. Omitting the key would let sub-105 users install 2.0
and get a no-op, which is the failure mode you are explicitly trying to retire.

**Why not higher.** This is the interesting number. Raising the floor to 134, which is where
the highlight inheritance model matches what the spike measured (§1b), would cost:

| Floor | Users blocked or pinned, of 878 |
|---|---|
| **105** | ~9 (Wikimedia) to ~11 (StatCounter) |
| 134 | ~125 (Wikimedia) to ~160 (StatCounter) |

The Wikimedia v105-133 band alone is **13.2%** of MV3-capable desktop Chrome, about 116
additional users. That is a 13x increase in blast radius to avoid testing one inheritance
behaviour on one extra Chrome build. Handle 105 to 133 by writing the `::highlight()` rule
so it does not depend on inherited `color`, that is, set `color` explicitly on the highlight
rather than relying on `currentColor`, and spot-check on a Chrome 105-ish and a Chrome
120-ish build. Do not solve it with the manifest.

**Also:** do not use `HighlightRegistry.highlightsFromPoint()` anywhere in 2.0. It would
raise the real floor to 140 while the manifest still claimed 105, which is the worst of both
worlds: the store lets people install, and the extension silently no-ops.

### Do not ship the legacy fallback

Reasoning in §6. The one-line version: version pinning already delivers the legacy renderer
to the sub-105 population, as BeBold 1.4, and it does so without you maintaining it.

### Ship the feature detection anyway, and make it talk

The version floor and the feature detection are not alternatives; use both. The floor stops
the store path, and the detection covers everything the floor cannot see: sideloads,
enterprise force-installs, Chromium forks that report a high version but ship an older
Blink, and any future case where the API is present but disabled.

On detection failure: do not render, do not fall back. Set a badge, set the tooltip, and
have `popup.html` say plainly that BeBold 2.0 needs Chrome 105 or newer and report
`navigator.userAgentData` / the detected version. **No new permissions**, so no re-consent
prompt for the existing 878 (§5).

### One thing to do outside the code

The docs explicitly advise it: "consider ways of letting existing users know that they are no
longer receiving updates." The cheapest honest channel is the Chrome Web Store listing
description. Add a line stating that version 2.0 requires Chrome 105 or newer and that users
on older Chrome will continue to receive version 1.4. That converts the silent pin into a
disclosed one for the ~9 affected users, and costs nothing.

---

## 8. What I could not establish

- **The actual version distribution of BeBold's own 878 users.** This is the only number
  that would make §2d exact. It would be visible in the Chrome Web Store developer dashboard
  for item `ckgjflmajkijpaipoijlpleihipnpjma`, which requires the owning Google account.
  Everything in §2 is population-level inference. **If you can read that dashboard, do, and
  treat it as overriding my ~1% estimate.**
- **The live "Not compatible" store UI.** §4 rests on the manifest documentation alone. I
  could not drive a pre-105 Chrome against the current store to confirm the string is still
  what the docs say, and the doc page's own `updated` date is 2023-10-25.
- **Cloudflare Radar browser-version data.** The Radar API rejected unauthenticated requests
  (`code 9106, Missing X-Auth-Key`) and the Explorer UI returned 403 to fetching. I could not
  determine whether Radar exposes a major-version dimension for Chrome at all. A third
  independent telemetry source would have strengthened §2, though Wikimedia and StatCounter
  are already methodologically unrelated and agree.
- **Exactly which Chromium change added `valid_for_highlight` to `text-shadow`.** I verified
  the flag was present at the M105 branch, which is what the decision needs, but I did not
  trace the originating CL, so I cannot say whether it predates 105 by much.
- **Whether the contaminating plateau traffic in §2a/§2b is bots specifically.** The evidence
  is circumstantial but strong: an implausibly flat distribution across 21 consecutive
  versions, and an OS mix (5.39% Mac in sub-105 versus 31.63% Mac in v105+) that no organic
  population produces. Neither Wikimedia nor StatCounter labels the traffic. My residual
  estimates in §2 assume the plateau is entirely non-human; if some fraction of it is real,
  the true sub-105 share is higher than 1.2%, but it cannot include BeBold users regardless,
  because the plateau sits below Chrome 88 and BeBold 1.4 is MV3 (§2d).
