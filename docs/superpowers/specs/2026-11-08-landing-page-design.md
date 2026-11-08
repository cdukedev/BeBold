# BeBold marketing page

Build a memorable, restrained marketing landing page for the existing Chrome extension. The supplied 4:05 film is the second section, directly after a substantial hero. Introduce upcoming Save for later through an explicitly labeled interactive prototype: a personal visual feed, notes, and illustrative AI connections to work and everyday life.

## Design

Warm ivory (#f7f5f0), near-black (#20201d), and vermilion (#ed4f36). Manrope UI and display type paired with Source Serif for italic accents and editorial reading. Large editorial hero, a tangible reading sheet with working emphasis toggle, quiet navigation, generous whitespace. The film has a charcoal stage and a clear play action. Save for later pairs editorial copy with a visual feed; the final coral band provides the closing action. All text and controls remain real HTML. Mobile layout stacks without horizontal overflow. Motion respects reduced-motion preferences.

## Content and boundaries

Primary headline: “Find your focus. Keep your spark.” Main action leads to the store listing already linked by the repository. The reading extension is live; Save for later is upcoming. The preview operates locally with illustrative responses, never claiming a live AI backend. Avoid medical or reading-speed claims. Privacy wording applies to the current extension. The film uses the supplied MP4, existing poster, and matching caption file.

## Implementation approach

Use a standalone static site under site/, with HTML, CSS, and a small ES module. This is simpler than adding React to an existing extension repository and deploys identically to GitHub Pages and Vercel. A framework application would add runtime and build dependencies without serving the requested page; a hosted website builder would conflict with the requested deployment targets. These are implementation choices made for this task.

Build copies only site/ into dist/. Keep the extension source and existing QA intact. Relative asset paths support GitHub Pages subdirectories. Provide deployment configuration, but do not change a live site or remote repository unless requested. Current request says the user will deploy to GitHub and Vercel.

## Acceptance

Hero → film → reading benefits → upcoming Save for later preview → final call to action. Reading toggle, video playback, sample-feed filters, saved-item actions, notes, and illustrative AI connections work. No broken links, console errors, missing media, or mobile overflow. Preserve the existing extension tests and packaging whitelist.
