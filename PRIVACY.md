# BeBold privacy policy

Last updated: 26 September 2026. Applies to BeBold version 2.0 and later.

## The short version

BeBold makes no network requests of any kind. It collects nothing, sends nothing, and
stores only your own settings in Chrome's built-in sync storage.

## What BeBold does with the pages you visit

BeBold reads the text of the pages you open so it can decide which words to emphasise.
That reading happens entirely inside your browser, in memory, while the page is open. The
text is never copied, saved, logged, or transmitted anywhere. When you close the tab, it
is gone.

The extension needs access to all websites for the same reason a spell checker does: it
cannot know in advance which page you will want to read.

## What BeBold stores

Only your settings:

- whether the extension is on
- which treatment you chose, its strength, and how much of each word to emphasise
- which writing systems you have opted into
- the list of individual sites you have turned it off on

These live in `chrome.storage.sync`, which is Chrome's own storage. If you are signed in
to Chrome, Chrome syncs them across your devices, the same way it syncs your bookmarks.
That transfer is between you and Google. BeBold has no server and receives none of it.

Uninstalling the extension removes this data.

## What BeBold does not do

- No analytics, telemetry, crash reporting, or usage statistics.
- No accounts, logins, identifiers, or cookies.
- No advertising, and no data sold, shared, or transferred to anyone.
- No remote configuration, and no code loaded from anywhere at runtime.

## Pages BeBold deliberately refuses to touch

BeBold turns itself off completely on any page showing a visible password field or a
credit card entry field, and on any site that opts out with
`<meta name="bebold" content="off">`. It also never alters code, dosages, account numbers,
version strings, links, or editable text anywhere.

## How you can check this yourself

The extension is open source at https://github.com/cdukedev/BeBold and it is a handful of
plain JavaScript files with no build step and no bundler, so what is published is what you
can read.

The claim is also enforced automatically rather than merely asserted: continuous
integration fails the build if any source file so much as mentions `fetch`,
`XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, or `EventSource`. See
`.github/workflows/qa.yml`.

## Chrome Web Store data disclosures

For the store's data handling form, the answers are:

- Personally identifiable information: **not collected**
- Health information: **not collected**
- Financial and payment information: **not collected**
- Authentication information: **not collected**
- Personal communications: **not collected**
- Location: **not collected**
- Web history: **not collected**
- User activity: **not collected**
- Website content: **not collected**

And the three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Contact

Open an issue at https://github.com/cdukedev/BeBold/issues.
