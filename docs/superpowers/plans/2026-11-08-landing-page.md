# BeBold Landing Page Implementation Plan

> **For agentic workers:** Execute the scoped tasks and validate the combined result.

**Goal:** A polished, responsive extension landing page ready for GitHub Pages and Vercel.

**Architecture:** Isolated static HTML/CSS/JS under site/, copied to dist/ by a dependency-free Node build. Existing extension files remain unchanged.

**Tech Stack:** HTML, CSS, ES modules, local fonts/media, existing Playwright for QA.

**Spec:** docs/superpowers/specs/2026-11-08-landing-page-design.md

## Global constraints

- Film is the second content section.
- Save for later is explicitly upcoming; responses are illustrative and local.
- Relative URLs; no medical claims; no external fonts or analytics.
- Never stage existing untracked demos/ or change live deployment settings.

## Review focus

- Small mobile widths: no clipped reading sheet or feed controls.
- Keyboard navigation: visible focus, accessible toggle, usable player and forms.
- Reload: local preview data safely handles missing or invalid saved state.
- JavaScript disabled: content, links, video controls remain available.
- GitHub Pages subpath: media, fonts, privacy, and scripts resolve relatively.

## Tasks

- [x] Build page layout and local media assets from concept references.
- [x] Implement reading toggle, functional film player, sample collections, notes, and illustrative connections.
- [x] Add static build, GitHub Pages workflow, Vercel config, and deployment instructions.
- [x] Verify desktop/mobile, interactions, media, accessibility, original extension suite, and packaging; fix observed issues.

Low-impact layout is verified visually and in browser; avoid tests that merely duplicate markup. Functional browser checks cover meaningful interactive state changes.
