# Marketing site deployment

The website lives in `site/`. The extension remains at the repository root. Both
hosts publish the generated `dist/` directory, which contains only copies of
`site/` files. The extension package script still includes only its existing
manifest-derived files.

## Store links and attribution

All three main calls to action use the supplied Chrome Web Store listing:
`https://chromewebstore.google.com/detail/bebold/ckgjflmajkijpaipoijlpleihipnpjma?pli=1`.
They append `utm_source=bebold`, `utm_medium=website`,
`utm_campaign=bebold_launch`, and a distinct `utm_content` of `header`, `hero`,
or `footer`. These tag outbound links; this website does not run analytics.

The Save for later feed is an interactive upcoming-feature prototype. Its
comments and saved state use local storage; connection responses are curated
examples. No AI service is called. The two editorial photographs were generated
with Image Gen for the page. The supplied film, captions, and transcript are
hosted locally. Manrope and Source Serif font licenses are in `site/fonts/`.

## Preview and build

Use Node.js 22 or later and Python 3. No dependency installation is needed for
the site.

```sh
npm run dev:site
```

Open <http://localhost:4173>. Stop the server with Ctrl+C.

```sh
npm run build:site
python3 -m http.server 4173 --directory dist
```

The build validates the source, removes the previous `dist/`, and copies only
`site/`. It rejects symlinks and other non-file assets. Keep documentation and
development files outside `site/` because everything inside it is public.
Generated `dist/` is ignored by Git.

Use relative URLs such as `./media/film.mp4` for assets and `./PRIVACY.html` for
the privacy page. The same artifact then works at the GitHub project path
`/BeBold/` and at the root of a Vercel domain. Keep the existing public
`/BeBold/PRIVACY.html` URL available when updating the privacy page.

## GitHub Pages

At preparation time (November 8, 2026), `cdukedev/BeBold` uses legacy GitHub Pages
publishing from `main` and the repository root. GitHub reports the current URL
as <http://cdukedev.me/BeBold/>. Adding this workflow does not change that setting.

When ready to publish:

1. Commit and push the reviewed site and deployment files to `main`.
2. In the repository's **Settings → Pages → Build and deployment**, change
   **Source** from **Deploy from a branch** to **GitHub Actions**.
3. Open **Actions → Deploy marketing site → Run workflow**, select `main`, and
   run it. If the initial push ran before the source switch, rerun after the
   switch.
4. Open the URL reported by the `github-pages` deployment and check the page,
   film playback, captions, and privacy link.

Subsequent pushes to `main` touching `site/` or the workflow's listed build and
configuration paths deploy automatically. Other branches cannot publish through
this workflow. The existing extension QA workflow continues separately.

The Pages workflow uses Node.js to build `dist/` without `npm install`, then
uploads that directory alone. It does not change the repository's Pages source
setting automatically. Custom HTTP headers in `vercel.json` apply only on Vercel;
GitHub Pages controls its own response headers.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Vercel

When ready to publish, import `cdukedev/BeBold` into Vercel or run the Vercel CLI
from the repository root. Use the repository root (`.`), not `site/`, as the
project's Root Directory. The checked-in `vercel.json` supplies:

- Framework: **Other** (`null` in configuration).
- Build command: `npm run build:site`.
- Install command: empty, so Vercel skips dependency installation.
- Output directory: `dist`.

Use Node.js 22 or later in the project settings. The site needs no environment
variables. The `.vercelignore` allowlist limits CLI uploads to `site/`, the build
script, package metadata, and Vercel configuration; it excludes `demos/`, the
extension, tests, and generated output. Vercel's Git integration checks out the
repository, but the configured output directory still limits the served files
to `dist/`.

For a CLI preview deployment, run `vercel` and select or create the intended
project. Review the preview before running `vercel --prod` to publish production.
These commands create deployments; they are not needed for local preview or
build verification. Local project links are stored in ignored `.vercel/`.

The Vercel configuration adds MIME-sniffing, frame-embedding, referrer, and
device-permission response headers. It keeps normal HTML navigation and local
video/font assets available.

See [Vercel's static configuration](https://vercel.com/docs/project-configuration/vercel-json)
and [deployment-file exclusions](https://vercel.com/docs/deployments/vercel-ignore).
