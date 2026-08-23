# Spike results: CSS Custom Highlight API vs DOM rewriting

**Question.** Can BeBold render its bionic effect without mutating the page DOM, and does
the result still look bold?

**Answer.** Yes to both, with one hard constraint: `font-weight` does not work inside
`::highlight()`, and neither does `-webkit-text-stroke` despite MDN saying otherwise.
`text-shadow` is the only weight lever, and at `.024em` to `.035em` it is convincing.

Measured 2026-08-22 in **Google Chrome 151.0.7922.170** (arm64 macOS), headless, via
`run-spike.mjs`. Reproduce with `npm install && npm run spike`.

---

## 1. Which properties actually render inside `::highlight()`

Method: two identical specimens, one with a named highlight carrying the property under
test, one untouched. Screenshot both element boxes, pixel-diff. `getComputedStyle` is
useless here because it does not introspect highlight pseudos (verified: it returns the
originating element's own values).

**Rasterisation noise floor between two untouched cells: 0 pixels.** Every reading below
is signal.

| Declaration | Result | Pixels changed |
|---|---|---|
| `color` via `Range` (positive control) | **renders** | 4.53% |
| `color` via `StaticRange` (positive control) | **renders** | 4.53% |
| `background-color` | **renders** | 27.70% |
| `text-decoration: underline wavy` | **renders** | 2.45% |
| `text-shadow` faux-bold `.024em` | **renders** | 4.97% |
| `text-shadow` faux-bold `.035em` | **renders** | (see legibility) |
| `text-shadow` faux-bold `.05em` | **renders** | 7.83% |
| `font-weight: 900` | ignored | 0 |
| `font-weight: bold` | ignored | 0 |
| `-webkit-text-stroke: 2px` | ignored | 0 |
| `-webkit-text-stroke-width` / `-color` | ignored | 0 |
| `-webkit-text-fill-color` | ignored | 0 |
| `text-emphasis` | ignored | 0 |
| `paint-order` + stroke | ignored | 0 |
| `font-variation-settings 'wght' 900` | ignored | 0 |
| `font-synthesis-weight` + `font-weight` | ignored | 0 |
| negative controls: `letter-spacing`, `font-style`, `font-family`, `text-transform`, `opacity`, `filter` | ignored | 0 |

All six negative controls behaved. Both positive controls rendered, and `StaticRange`
produced a byte-identical result to a live `Range`, so **`StaticRange` is accepted** and is
the better choice (a live `Range` silently drifts or collapses when the page re-renders).

### Why MDN is wrong about `-webkit-text-stroke`

MDN's ::highlight and ::selection pages both list, verbatim:

> `-webkit-text-stroke-color`, `-webkit-text-fill-color` and `-webkit-text-stroke-width`

with no caveat that Chrome ignores them. The normative spec says the opposite.
css-pseudo-4 §3.2 lists `stroke-color, fill-color, stroke-width` (the **unprefixed**
fill-stroke-3 properties) and then states:

> Vendor-prefixed properties such as `-webkit-text-fill-color` are not applicable to the
> highlight pseudo-elements.

CSSWG issue #7580 resolved this on 2023-07-19: *"Do not support them until unprefixed."*
Blink agrees: in `third_party/blink/renderer/core/css/css_properties.json5`, `text-shadow`,
`color`, `background-color`, `text-underline-offset` and the `text-decoration-*` longhands
all carry `valid_for_highlight: true`, and **no `-webkit-text-*` property carries the flag.**
WPT `compat/webkit-text-fill-color-property-003.html` asserts the exclusion and Chromium
passes it.

So the pixel measurement, the normative spec, and the Blink source flags all agree, and the
documentation is simply stale. There is a future path to real stroke-based weight if Chrome
ever ships unprefixed `stroke-width` for text.

## 2. Legibility: does faux weight read as bold?

This was the load-bearing risk. **It did not fire.** See
`out/legibility-*-chrome-dsf1.png` (1x, the muddy-rendering worst case).

- `.024em` and `.035em` read as genuine bold at 13px and 16px, in both serif and sans, in
  light and dark.
- `.05em` starts to smudge at 16px and above. The offset is em-relative, so it over-inks
  large text and under-inks small text. Recommend `.028em` with a px clamp.
- **The faux-bold rows hold the exact same line wrap as untreated text; the real `<b>`
  reference row visibly reflows.** That is the whole thesis, visible in one screenshot.
- **Fading the suffix is not viable.** At `color-mix(... 70%, transparent)` on a `#111`
  background the suffix nearly disappears (`out/legibility-1-chrome-dsf1.png`). It is a
  direct contrast regression and it is worst in dark mode. Do not ship it. If de-emphasis
  is wanted, mix toward the background colour, never toward transparent, and floor it.
- Underlining the prefix is a legible, high-contrast alternative worth offering as a preset.

## 3. Invariance: control (A) vs current extension (B) vs highlight (C)

One paragraph, three copies, in an ordinary block container.

| | box height | line boxes | childNodes | descendant elements |
|---|---|---|---|---|
| A control | 76.78 | 3 | 1 | 0 |
| B current extension | **79.78** | 6 | **74** | **50** |
| C highlight | 76.78 | 3 | 1 | 0 |

C is identical to A on every metric. B changes layout **even in a plain paragraph**, before
any exotic container is involved.

**Accessibility tree** (Playwright `ariaSnapshot`):

- A: `- paragraph: The quick brown fox jumps over the lazy dog while reading…`
- B: `- paragraph:` then 50 alternating nodes: `- strong: T` / `- text: he` / `- strong: qu`
  / `- text: ick` / …
- C: byte-identical to A.

`aria(A) === aria(C)` is **true**. `aria(A) === aria(B)` is **false**. The current build
shreds every paragraph into ~50 accessibility nodes and asserts strong-importance semantics
on half of every word. That is the WCAG 1.3.1 problem, measured rather than argued.

Also: **25 elements share `id="custom-strong"` and 25 share `id="custom-span"`** in a single
short paragraph, and `document.getElementById('custom-strong')` resolves. Invalid HTML that
will collide with any host page using those ids.

## 4. GitHub issue #2, reproduced and root-caused

Each box holds one bare text node. See `out/issue2-chrome-dsf1.png`.

| container | control height | current extension | highlight |
|---|---|---|---|
| `display: flex` (row) | 44 | **23** (spaces deleted, text overflows) | 44 |
| `display: flex; column` | 44 | **380** | 44 |
| `display: grid` | 44 | **380** | 44 |
| children `inline-block` | 44 | 44 | 44 |

**Mechanism.** A bare text node in a flex or grid container is one anonymous item. Replacing
it with 2N inline elements creates 2N items. Under `grid-auto-flow: row` or
`flex-direction: column` each item takes its own track, which is exactly the reported
"each half of the words is displayed on a new line" (44px becomes 380px).

**A second, separate bug surfaced.** In a flex *row* container the inter-word spaces vanish
entirely, rendering `Thequickbrownfoxjumpsoverthelazydog`, because flex containers discard
whitespace-only anonymous children and the transform emits words joined by bare text spaces.
Flex rows are everywhere, so this is a strong candidate for part of *"it just doesn't work on
anything."*

The highlight path is 44px in all four containers. This class of bug is structurally
impossible when no text node is split.

## 5. Whitespace fidelity under `white-space: pre`

| | tabs | newlines | non-breaking spaces |
|---|---|---|---|
| source | 2 | 3 | 3 |
| current extension | **0** | **0** | **0** |
| highlight | 2 | 3 | 3 |

`content.split(/\s+/).join(" ")` destroys all of it (`\s` matches U+00A0 in JS). Block height
collapses from 81px to 39px.

## 6. Scope

- **Open shadow DOM: works.** A document-level `::highlight()` rule paints text inside an
  open shadow root (30.3% pixel change vs control). The DOM-rewriting version cannot safely
  reach there at all.
- **Iframes: needs `all_frames: true`.** A parent-document `Range` over child-document text
  is *accepted* without throwing (the range simply roots itself in the child document) but
  **paints nothing** (0 pixels changed). Each frame owns its own `CSS.highlights` registry,
  and registering inside the child works.

## 7. API surface notes

- `Highlight.prototype.getRangesForNode` **does not exist**. Incremental invalidation needs
  your own `WeakMap<Text, StaticRange[]>` index, because `Highlight.delete()` requires the
  original object reference.
- `CSS.highlights.highlightsFromPoint()` exists.
- `getComputedStyle(el, '::highlight(x)')` does **not** introspect the pseudo; it returns the
  element's own values. There is no runtime way to verify your highlight styling landed.
- Custom properties are permitted inside highlight pseudos, which is a clean theming hook.

## 8. Segmentation: `Intl.Segmenter` vs `Math.floor(word.length / 2)`

| script | current code | `Intl.Segmenter` |
|---|---|---|
| Thai `สวัสดีชาวโลก` | `[สวัสดี\|ชาวโลก]` one "word", cut by character count | `[สวั\|สดี] [ชา\|ว] [โล\|ก]` correct word breaks |
| Japanese `東京の天気は晴れです` | `[東京の天気\|は晴れです]` arbitrary mid-sentence cut | per-word segmentation |
| Emoji `👨‍👩‍👧‍👦` | `[👨‍👩\|‍👧‍👦]` **splits one grapheme cluster into two emoji** | skipped, not word-like |
| Devanagari `नमस्ते` | `[नमस\|्ते]` orphans the virama | `[नम\|स्ते]` cluster-safe |
| Arabic `مرحبا` | `[مر\|حبا]` split into two elements breaks cursive joining | `[مرح\|با]` cluster-safe, and the text node stays intact so joining survives |

Whether CJK and Arabic *should* be treated at all is a policy question, not a segmentation
one. But the current rule is wrong even on its own terms.

## 9. Bonus finding: the forced font

`content.css` declares `font-family: Helvetica !important` and then `font-family: inherit` in
the same rule. `!important` wins regardless of source order, so **every transformed word
renders in Helvetica**, whatever the site's typography.

Verified: on a Georgia paragraph, `getComputedStyle(injectedStrong).fontFamily === "Helvetica"`.
This is what produces the +3px height delta in section 3, and it directly contradicts the
five-star review praising BeBold for keeping "the site's look unchanged."

---

## Verdict

Ship the Custom Highlight API path. Use `text-shadow` at roughly `.028em` for weight, offer
underline and background presets, and do not ship suffix fading. Keep `StaticRange`, index
ranges in a `WeakMap`, add `all_frames: true`, and walk open shadow roots.

## Caveats on this spike

- Measured only in Chrome 151 on arm64 macOS. Firefox and Safari were not tested; the
  Playwright bundled-Chromium leg failed on a browser-version mismatch and was skipped.
- An independent adversarial review of this harness was commissioned but did not run (the
  agents failed on a billing limit). The internal controls are the noise floor of 0 pixels,
  two positive controls that fired, and six negative controls that stayed silent.
- Section 3's "line boxes" figure counts distinct rounded `top` values from
  `Range.getClientRects()`. For B this over-counts, because the injected Helvetica fragments
  sit on a different baseline than the surrounding Georgia text. The box-height delta is the
  reliable number there.
