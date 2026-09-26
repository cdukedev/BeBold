# Chrome Web Store listing, BeBold 2.0

Everything needed to update the existing listing
`ckgjflmajkijpaipoijlpleihipnpjma`. This is an **edit to that listing**, not a new
submission: the map decided against a new listing because it would strand all 878 users
on a measurably broken 1.4 to escape a single one-star review.

---

## Name

```
BeBold
```

Unchanged. It carries the recognition of 878 users and four positive reviews.

## Short description (132 characters max)

```
Bolds the start of each word to give your eye an anchor. Never changes page layout or what screen readers read.
```

110 characters.

## Category

`Accessibility`. Unchanged.

---

## Detailed description

```
BeBold bolds the first part of every word, so your eye has an anchor to land on as it
moves along a line.

Some people find it easier to hold their place while reading. Others find it distracting.
The published research has not found a reading-speed benefit, and comprehension results
are mixed, so treat this as a preference rather than a technique, try it, and keep it only
if it actually helps you. You can turn it off for any single site, or everywhere, in one
click.


WHAT IS NEW IN 2.0

Version 2.0 is a complete rewrite of how the effect is drawn.

The old version rebuilt the page's text to bold it, which broke layouts on some sites and,
on many modern sites, quietly did nothing at all. Measured across a sample of real pages,
it treated about half the words, and on app-style sites far less than that.

2.0 never touches the page. It draws the effect with the browser's own highlight painting,
so:

• Nothing moves. Measured across 37 real sites, the worst layout shift of any element on
  any page was 0.00 pixels.
• Copy and paste, find in page, and text selection behave exactly as they did before,
  because no word is ever split in two.
• Screen readers hear the page exactly as it is written. The accessibility tree was
  byte-identical to the untreated page on all 37 sites tested.
• It works on the sites you actually use, including lists, headings, sidebars and pages
  built out of web components.


WHAT IT WILL NOT TOUCH

Reading speed is never worth a misread character, so BeBold leaves these exactly as
written:

• code, in blocks and inline
• dosages, account numbers, IBANs and long figures
• version strings, links and email addresses
• anything you can type into

It switches itself off completely on pages asking for a password or a card number, and any
site can opt out with a single meta tag.


WRITING SYSTEMS

Latin, Cyrillic, Greek and Hebrew are treated by default.

Arabic, Devanagari and other Indic scripts, Chinese, Japanese, Korean, Thai, Lao, Khmer
and Burmese are switched off by default. Not because they are unsupported, but because
"the first half of a word" is not a meaningful visual unit in a script where letters join,
where vowel signs reorder, or where a word is one or two characters. Each one can be
switched on individually if it works for you.


SETTINGS

Three treatments (bold, underline, background tint), five strengths, control over how much
of each word is emphasised, a per-site on and off switch, and a keyboard shortcut. Every
change previews live.


PRIVACY

BeBold makes no network requests of any kind. No analytics, no accounts, no tracking, no
remote configuration. Your settings are stored by Chrome and nothing leaves your browser.
The project's build fails automatically if any source file so much as mentions a network
API, so this is enforced rather than promised.

Open source: https://github.com/cdukedev/BeBold


NOT A MEDICAL PRODUCT

BeBold is a reading preference. It is not clinically tested, it is not a treatment for
anything, and it is not a substitute for medical advice.
```

### On the honesty framing

The old description said the extension "may benefit those who find it challenging to
focus" while also calling itself "not clinically tested", which manages to imply a benefit
and disclaim it in the same breath. The copy above claims a **rendering behaviour** rather
than a **reading outcome**, states plainly what the research does and does not show, and
keeps ADHD out of the claim while leaving it as a search keyword. That is defensible in an
Accessibility-category listing and it does not condescend to the four five-star reviewers
who genuinely find it useful.

---

## Screenshots

Five, at the required 1280x800, in `store/screenshots/`. All generated from the real
packaged extension by `node tools/store-shots.mjs`, not mocked up.

| file | what it shows |
|---|---|
| `1-works-everywhere.png` | a real article treated, including lists and headings |
| `2-before-after.png` | the same page off and on, side by side, layout identical |
| `3-stays-exact.png` | dosages, IBANs, versions, links and code left untouched |
| `4-controls.png` | the options page and the popup, with a genuine word count |
| `5-private.png` | the no-network claim |

**Replace all existing screenshots.** The current ones predate this work.

## Promo images

The existing marquee (1400x560) and small promo (440x280) also predate 2.0 and should be
replaced or removed. Removing them is acceptable; a stale promo image is worse than none.

## Demo video

The linked YouTube video (`oyP7TgbXGe8`) demonstrates 1.4 behaviour, **including the layout
damage that 2.0 fixes**. It is now actively misleading. Unlink it, or re-record.

---

## Data handling form

Tick nothing in the data collection list. Full answers and the three required
certifications are in [`PRIVACY.md`](../PRIVACY.md).

Privacy policy URL:

```
https://github.com/cdukedev/BeBold/blob/main/PRIVACY.md
```

Verified reachable (HTTP 200) and public. GitHub Pages is now enabled on the repo, but it
inherits an account-level custom domain, `cdukedev.me`, which currently has **no DNS
records**, so `cdukedev.github.io/BeBold/` 301-redirects into a domain that does not
resolve. Point that domain at GitHub and `https://cdukedev.me/BeBold/PRIVACY.html` starts
working; until then use the blob URL above.

## Permission justifications

| item | justification |
|---|---|
| `storage` | Stores the user's own settings: treatment, strength, and which sites it is switched off on. Nothing else is written, and nothing is transmitted. |
| Host access to all sites | The extension renders text on the page the user is reading. It cannot know in advance which sites those will be. It reads page text in memory to decide which words to emphasise, and never transmits or stores it. |

---

## Release plan

**Percentage rollout is not available for this extension.** The Chrome Web Store restricts
it to items with more than 10,000 active users; BeBold has 878. The earlier plan in this
document called for a 10% rollout, which cannot be done.

Source: [Publish your extension](https://developer.chrome.com/docs/extensions/develop/migrate/publish-mv3),
"Gradually roll-out your release": *"This is only available for extensions with more than
10,000 active users."*

What is available instead, and is arguably better for a change this size:

### 1. Submit with deferred publish

When you submit, **uncheck "Publish automatically"**. The item goes through review but does
not go live until you press publish, so review time and release timing are decoupled and
you choose the moment. Most extensions are reviewed within three days.

### 2. Optional, a trusted-tester pass first

Available at any user count, unlike percentage rollout. Developer Dashboard → **Account**
tab → **Management** → **Trusted Testers**, add email addresses, then set the item's
**Distribution → Visibility** to **Private**. A Google group or an unlisted direct link
work the same way.

Worth doing because 2.0 will visibly do something on pages where 1.4 appeared inert, and
that is a large behavioural change arriving for people who did not ask for it today.

### 3. If something goes wrong

The Web Store supports [rollback](https://developer.chrome.com/docs/webstore/rollback) to a
previous version, so a bad release is recoverable without shipping a hasty fix.

### Who does not get the update

Roughly 9 to 11 users are below the `minimum_chrome_version` of 105. They are not stranded:
the store does not offer them the update, they stay on a working 1.4, and they receive 2.0
automatically once their Chrome crosses 105.

---

## Submission checklist

Developer Dashboard → the BeBold item → work down the tabs.

**Package**
- [ ] Upload `store/bebold-2.0.zip` (19 KB, built by `npm run package`, verified loadable)

**Store listing**
- [ ] Description: replace with the block above
- [ ] Screenshots: delete the existing ones, upload all five from `store/screenshots/`
- [ ] Promo tile and marquee: replace or remove (the current ones predate 2.0)
- [ ] Video: unlink `oyP7TgbXGe8`, it demonstrates the layout damage 2.0 fixes
- [ ] Category: Accessibility, unchanged

**Privacy**
- [ ] Single purpose: "Bolds the start of each word on web pages to make text easier to read."
- [ ] Permission justifications: the table above
- [ ] Data usage: tick nothing, then all three certifications
- [ ] Privacy policy URL: the blob URL above

**Submit**
- [ ] Uncheck **Publish automatically**
- [ ] Submit for review
- [ ] On approval, publish when you are ready
- [ ] After it is live, post the reviewer replies below

## Reviewer replies, to post once 2.0 is live

### To the one-star, "yeah it just doesn't work on anything", December 2025

```
You were right, and thank you for saying so plainly.

I measured it after reading this. On a sample of real sites, version 1.4 was treating
about half the words on a page on average, and on the sites most people actually spend
their time on it was close to none: 0% on YouTube, 4% on the Guardian, 16% on apple.com.
It was not crashing, it was silently skipping. Anything inside a list was skipped, which
on a modern site is most of the page.

Version 2.0 is a rewrite of how the effect is drawn. On the same sites it now treats
around 98% of the words, and because it no longer rebuilds the page's text it cannot break
layouts either. If you still have it installed, it will update itself. If you do not, I
would understand, but it is worth another look.
```

### To the three positive reviews

```
Thank you for this. Version 2.0 is a full rewrite of how the effect is drawn: it no longer
alters the page, so nothing shifts, copy and paste and screen readers are unaffected, and
it now works on sites where earlier versions quietly did nothing. There are also settings
now, including a per-site switch. Same idea, it just reaches a lot more of what you read.
```
