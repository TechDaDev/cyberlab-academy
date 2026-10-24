# Milestone 01C.1 Report — Typography, Responsive Polish and Frontend CI

- **Date:** 2026-10-24
- **Branch:** `feat/01c1-typography-responsive-ci`
- **Base branch:** `arena/milestone-01c-dependency-security` (stacked on PR #5)
- **Pull request:** [#6](https://github.com/TechDaDev/cyberlab-academy/pull/6) — open, **not merged**, targeting the dependency-security branch, **not** `main`
- **Commit:** `8a71418af91e73045299645426daa4c936a0fa3a`
- **Scope:** `frontend/**`, `.github/workflows/frontend.yml`, this report. No backend, contract, `package.json` or lockfile changes.

---

## 1. Summary

| Objective | Status |
|---|---|
| Fix the self-referential font variables | **Done** — verified in a real browser |
| Apply Inter / Space Grotesk / JetBrains Mono consistently | **Done** — 37 display and 98 mono call sites now resolve to real faces |
| Remove obsolete compatibility CSS | **Done** — only after browser verification |
| Preserve the existing visual identity | **Done** — tokens, palette, shell and components untouched |
| Verify 9 pages at 4 viewports | **Done** — headless Chromium, 36 combinations |
| Fix confirmed responsive defects | **Done** — 4 defects found by measurement, all fixed |
| Add frontend GitHub Actions CI | **Done** — `.github/workflows/frontend.yml` |
| Regression tests | **Done** — 19 new tests (39 total) |
| No vulnerable dependencies reintroduced | **Done** — both audits report 0, no dependency changes |

---

## 2. Typography changes

### 2.1 Root cause

`frontend/styles/globals.css` declared three custom properties that referenced
themselves:

```css
--font-sans:    var(--font-sans), Inter, system-ui, sans-serif;
--font-display: var(--font-display), "Space Grotesk", Inter, system-ui, sans-serif;
--font-mono:    var(--font-mono), "JetBrains Mono", ui-monospace, monospace;
```

A custom property whose value contains a reference to itself is **invalid at
computed-value time**. The `font-family` declaration is therefore dropped
entirely — the valid fallbacks after the `var()` are *not* used — and rendering
falls back to the user agent default, which is a **serif** face. Nothing in the
application ever defined `--font-sans`, `--font-display` or `--font-mono`,
because no `next/font` integration existed. Consequently:

- all body copy, navigation and form text rendered in Times New Roman;
- `.font-display` (37 call sites) was inert;
- `.font-mono` (98 call sites) was inert, so terminals, IDs and timestamps were
  **not** monospaced.

The Milestone 01C.1 Tailwind v4 migration deliberately preserved this behaviour
byte-for-byte with an extra `html { font-family: var(--font-sans), … }` rule.
That rule is the "obsolete compatibility CSS" removed in this milestone.

### 2.2 Fix

| Change | File |
|---|---|
| New font module wiring three self-hosted variable faces | `frontend/lib/fonts.ts` (new) |
| Variables bound to real families; cycle removed | `frontend/styles/globals.css` |
| `fontVariables` applied to `<html>` | `frontend/app/layout.tsx` |
| Compatibility `html { font-family: … }` rule removed | `frontend/styles/globals.css` |
| Vendored binaries + licences | `frontend/assets/fonts/` (new) |

```css
--font-sans:    var(--font-inter), "Inter Variable", Inter, ui-sans-serif, system-ui, …;
--font-display: var(--font-space-grotesk), "Space Grotesk", var(--font-inter), …;
--font-mono:    var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, …;
```

`next/font/local` generates, per family, a real `@font-face` **and** a
size-adjusted fallback face (`size-adjust`, `ascent-override`,
`descent-override`). The fallback occupies the same space as the real face, so
the swap on load does not shift layout.

### 2.3 Why `next/font/local` rather than `next/font/google`

The task asked for Next.js font optimisation "where appropriate". Both APIs share
the same optimisation pipeline; the *source* differs. Local was chosen for three
concrete reasons, two of which were directly observed in this environment:

1. **No third-party runtime dependency.** A cybersecurity training platform
   should not make every learner's browser contact a font CDN. Self-hosting
   removes that request, its privacy surface, and a CSP allowance.
2. **Builds work without egress to Google.** `fonts.googleapis.com` and
   `fonts.gstatic.com` are **unreachable from this sandbox** (`curl` → `000`).
   A `next/font/google` build here would fail; on a locked-down CI runner it can
   fail too. The committed workflow therefore passes deterministically.
3. **Reproducibility.** The exact binaries are pinned in Git and reviewed like
   any other asset.

The three files are the *latin subset, normal style, variable weight* `woff2`
builds taken from the upstream Fontsource variable packages (`5.3.0`), which
redistribute the same SIL OFL 1.1 fonts used by Google Fonts:

| Family | File | Size | `@font-face` weight range |
|---|---|---|---|
| Inter | `inter-latin-wght-normal.woff2` | 48,256 B | `100 900` |
| Space Grotesk | `space-grotesk-latin-wght-normal.woff2` | 22,288 B | `300 700` |
| JetBrains Mono | `jetbrains-mono-latin-wght-normal.woff2` | 40,404 B | `100 800` |

Total committed payload: **144 KB** including the three licence texts.

Licences are committed at `frontend/assets/fonts/licenses/`
(`inter-OFL-1.1.txt`, `space-grotesk-OFL-1.1.txt`,
`jetbrains-mono-OFL-1.1.txt`) and a test asserts they are present and genuine.
Inter and JetBrains Mono also ship `latin-ext`; only `latin` is registered.

### 2.4 One deliberate deviation: monospace fallback

For `fontMono`, `adjustFontFallback` is set to `false`. Next's synthesised
fallback substitutes **Arial** — a *proportional* face — for the monospace
family. In the source-ordered fallback list that meant terminals, log tables and
aligned technical columns would render proportional whenever JetBrains Mono had
not yet loaded. Disabling it lets the stack fall through to
`ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace`,
which is metrically correct for technical text. Verified in-browser: the resolved
monospace fallback is `Liberation Mono`, not Arial.

### 2.5 Verification of the fix

Confirmed by inspecting the compiled production stylesheet and the served HTML,
not by assumption:

- `--font-inter` compiles to `"fontSans", "fontSans Fallback", system-ui, …`;
- `--font-sans` resolves to `var(--font-inter), …` with **no self-reference**;
- `body` computes `font-family: var(--font-inter), "Inter Variable", Inter, …`;
- the rendered document is
  `<html lang="en" class="dark rYeSla_variable _97jSLq_variable _65q-La_variable">`
  — all three variable classes present;
- in Chromium, `document.fonts` reports `fontSans:100 900:loaded`,
  `fontDisplay:300 700:loaded`, `fontMono:100 800:loaded`;
- computed `font-family` on `<h1>` resolves to the `fontDisplay` family and on
  `.font-mono` to the `fontMono` family.

| Requirement | Verified | Evidence |
|---|---|---|
| Navigation uses the interface font | **Yes** | `body`/`nav` compute to the `fontSans` family |
| Landing headings use the display font | **Yes** | `<h1>` computes to the `fontDisplay` family |
| Dashboard titles use the display font | **Yes** | all four dashboard `<h1>` carry `font-display`; asserted by test |
| Body text uses the interface font | **Yes** | `body` rule uses `font-sans` |
| Technical info uses monospace | **Yes** | `.font-mono` resolves to the `fontMono` family, not Arial |
| Inputs remain readable | **Yes** | inputs inherit `font-sans`; 16 px base below `sm` prevents iOS zoom-on-focus |
| Light and dark remain consistent | **Yes** | font tokens live in `@theme inline`, absent from `.dark`; asserted by test |
| Responsive type scaling | **Yes** | existing `sm:`/`lg:` scale preserved (`text-2xl sm:text-3xl`, `sm:text-5xl lg:text-[3.35rem]`) |
| No new layout shift | **Yes** | Next generates `size-adjust` fallbacks; `80.5 % → 80.5 %` metrics on Inter |

---

## 3. Preserving the existing design

No design-system replacement. Unchanged: the midnight-navy canvas
(`#060b16`/`#070D19`), cyan/electric-blue accents (`#06b6d4`, `#38bdf8`), slate
dashboard surfaces, `cyber-panel`/`cyber-panel-interactive` utilities, the card
and dialog primitives, the sidebar/`AppShell` layout, spacing scale, and both
palettes. The Tailwind v4 `@theme inline` token block is untouched apart from the
three font lines.

Typography-only refinements added: `text-rendering: optimizeLegibility`,
`-webkit-text-size-adjust: 100%`, and `whitespace-nowrap` on the logo wordmark.

---

## 4. Responsive corrections

### 4.1 Method

Browser automation **was** available, so nothing in this section is inferred.
Chromium (headless 153.0.8010.0, driven by `puppeteer-core`) loaded the
**production build** (`next start`) served by `next start` with the real
`/api/v1/[...path]` proxy pointed at a contract-conformant mock of
`shared-contracts/openapi.json` v0.2.0 (test data only, no backend modified).
Each page was loaded at 375 / 768 / 1024 / 1440 px, `document.fonts.ready` was
awaited, and the DOM was measured.

Detectors:

1. **Horizontal overflow** — `documentElement.scrollWidth - clientWidth`, with
   descendants inside an `overflow-x: auto|scroll|hidden` ancestor excluded (a
   table scrolled inside its container is not a page defect).
2. **Top-bar collision** — overlap of the header's leading and trailing
   clusters.

### 4.2 Defects found and fixed

| # | Page | Viewport | Measurement | Cause | Fix |
|---|---|---|---|---|---|
| 1 | Landing | 768 px | **+16 px** page overflow | Section nav appeared at `md`; it needs ~474 px plus a 117 px logo and 256 px CTA cluster | Nav moved to `lg`; action cluster made shrink-safe |
| 2 | Landing | 375 px | +5 px overflow; tagline in 3-line fragments | "Create Account" + arrow + Sign In + theme toggle exceeded the row | Sign In hidden below `sm`; arrow hidden below `sm`; authenticated CTA shortened; tagline hidden below `sm` |
| 3 | Administrator dashboard | 375 px | **+84 px** page overflow | Non-wrapping `flex` role rows set a min-content width that widened the grid track | Rows `flex-wrap`, text block `flex-1 min-w-0`, cards `min-w-0` |
| 4 | All authenticated pages | 375 px | Heading collided with top-bar actions | Leading cluster could not shrink; breadcrumb clamped the wrong end | Leading cluster `flex-1 min-w-0`; breadcrumbs `overflow-hidden`/`nowrap`; only the current crumb renders below `sm`; role switcher collapses to icon-only |
| 5 | Administrator dashboard (light) | 1440 px | Dark navy panel behind `text-foreground` | Unconditional `via-slate-900/95` gradient stop | Gradient made theme-aware (`dark:` scoped) |

Defect 5 was found by screenshot inspection during light-mode verification and
is a contrast bug rather than an overflow bug.

### 4.3 Results after fixes

**0 / 36** overflow cases and **0 / 36** top-bar collisions.

| Page | 375 | 768 | 1024 | 1440 |
|---|---|---|---|---|
| Landing | ok | ok | ok | ok |
| Login | ok | ok | ok | ok |
| Registration | ok | ok | ok | ok |
| Student dashboard | ok | ok | ok | ok |
| Instructor dashboard | ok | ok | ok | ok |
| Manager dashboard | ok | ok | ok | ok |
| Administrator dashboard | ok | ok | ok | ok |
| Profile settings | ok | ok | ok | ok |
| MFA settings | ok | ok | ok | ok |

### 4.4 What was checked per area

- **Navigation behaviour** — public nav collapses at the right breakpoint (now
  `lg`), and the authenticated sidebar is hidden below `lg` behind a drawer.
- **Sidebar responsiveness** — mobile drawer opens at 375 px and occupies
  exactly the 375 px viewport with no right-edge overflow; desktop collapse
  behaviour unchanged.
- **Card layouts** — all cards stack to a single column below `md`.
- **Form readability** — login/register/profile/MFA forms render full-width,
  labels visible, no clipped helper text.
- **Table overflow** — the user directory and instructor cohort tables keep
  their `overflow-x-auto` wrapper, so they scroll inside the card rather than
  widening the page.
- **Dashboard charts** — Recharts containers render with non-zero dimensions;
  no console "width(0)" warnings in the production build.
- **Buttons and dialogs** — profile dropdown at 375 px renders 256 px wide,
  `left: 103`, `right: 359` inside a 375 px viewport (fully on-screen).
- **Heading wrapping** — dashboard `h1`s wrap to two lines at 375 px without
  clipping; wordmark no longer wraps.
- **Font rendering** — real faces confirmed loaded at every viewport.

### 4.5 Verification limitations (explicit)

- Chromium was **not** installed in the sandbox and no package manager was
  available (no root, `deb.debian.org` unreachable). Browser binaries and the
  three missing NSS/NSPR shared libraries were provided locally for this
  verification only; **nothing about that setup is committed**. On a machine
  with a normal browser install, `npx playwright`/`puppeteer` works directly.
- Because TLS/NSS was stubbed, pages were served over **plain HTTP**. HTTPS,
  HSTS and service-worker behaviour were therefore **not** exercised.
- Verification covered **layout and computed typography only**. It did not
  perform a WCAG audit, screen-reader testing, touch-target sizing checks, or
  cross-browser comparison (Safari/Firefox were not available).
- Screenshots were captured at a 900 px viewport height; very short landscape
  viewports (e.g. 375 × 400) were not separately profiled.
- The light/dark checks used the real `ThemeProvider` (`localStorage`
  `cyberlab.ui_theme`) and confirmed palette + contrast on 4 pages; other pages
  were reviewed in dark mode only.

---

## 5. Automated tests

`frontend/__tests__/typography-and-responsive.test.ts` — **19 tests**.

**Typography configuration**

1. No self-referential font custom property (CSS comments stripped first, since
   the file documents the historical bad value).
2. Theme tokens bind to the `next/font` variables.
3. One fonts module declares all three families with fallbacks, and monospace
   does not use a synthesised proportional fallback.
4. Every referenced font binary exists and is between 5 KB and 200 KB
   (guards against an empty file or an accidental full-font dump).
5. An OFL 1.1 licence ships for each family.
6. Font variables are applied to `<html>` (so portals inherit them).
7. The compatibility `html { font-family }` rule is gone.

**Typography application**

8. Display and mono utilities are still exposed and `body` uses `font-sans`.
9. App shell and logo use the display face; all four dashboard `h1`s carry
   `font-display`.
10. Technical surfaces still use `font-mono`.
11. No source file hardcodes a serif or Times fallback.

**Theme compatibility**

12. Both palettes and the class-based `.dark` variant survive.
13. Font tokens are not duplicated inside `.dark`.
14. Tinted gradient stops are `dark:`-scoped (light-mode contrast guard).

**Responsive guardrails**

15. Landing nav does not reappear at `md`.
16. Logo tagline stays hidden below `sm`; wordmark is `nowrap`.
17. Top bar can shrink and breadcrumbs are clamped.
18. Privileged role rows wrap and cards are `min-w-0`.
19. Every data table stays inside an `overflow-x-auto` wrapper.

**Regression tests were validated by reintroducing the defect.** Restoring
`--font-sans: var(--font-sans),` made tests 1 and 2 fail; restoring the fixed
value made all 19 pass again.

Full suite result:

| Suite | Tests |
|---|---|
| `auth-validation-and-recovery` | 4 |
| `roles-navigation-and-permissions` | 6 |
| `api-sessions-and-states` | 3 |
| `preview-demo-and-dashboards` | 2 |
| `security-and-design-guardrails` | 5 |
| `typography-and-responsive` (new) | 19 |
| **Total** | **39 passed / 39, 6 files** |

---

## 6. Production build

```
✓ Compiled successfully
✓ Generating static pages (18/18)
18 routes: / , /_not-found , /api/v1/[...path] , /dashboard ,
/dashboard/{admin,instructor,manager,student} , /forgot-password , /login ,
/register , /reset-password , /settings , /settings/{mfa,profile,security,sessions} ,
/verify-email
```

Build succeeded **with no backend reachable**, which is the CI condition.

---

## 7. npm audit results

| Command | Result |
|---|---|
| `npm ci` | pass — 596 packages, lockfile in sync, `found 0 vulnerabilities` |
| `npm audit` | **0 vulnerabilities** |
| `npm audit --omit=dev` | **0 vulnerabilities** |

No dependency was added, removed, or changed: `frontend/package.json` and
`frontend/package-lock.json` are byte-identical to the base branch. The Vitest
`4.1.12` pin and the Tailwind v4 migration are untouched, and the existing
`security-and-design-guardrails` suite (tinypool / `postcss-*` / Vitest advisory
guardrails) still passes.

---

## 8. Visual verification

Captured with headless Chromium at 375 / 768 / 1024 / 1440 px, full-page, for
all 9 pages (36 full-page PNGs), plus 4 light-mode captures and 3 interaction
captures (mobile drawer, profile dropdown, dialog). Screenshots are **not**
committed; they were used to confirm:

- real Inter body text and Space Grotesk headings on the landing page;
- JetBrains Mono in the range-preview terminal, breadcrumb IDs and audit rows;
- the single-line 375 px landing header and the restored `sm`+ tagline;
- correct light-mode contrast on the administrator hero card;
- the current-page breadcrumb ("Administrator Control Center") at 375 px
  instead of the truncated ancestor;
- the profile dropdown fully inside a 375 px viewport.

---

## 9. GitHub Actions

### 9.1 Workflow

`.github/workflows/frontend.yml`, job `Verify (Node 22)`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node **22**, `cache: npm`, keyed on
   `frontend/package-lock.json`
3. `npm ci` (working directory `frontend/`)
4. `npm run typecheck`
5. `npm run lint`
6. `npm test`
7. `npm run build`
8. `npm audit --omit=dev`
9. `npm audit`
10. upload `build-manifest.json` / `trace` on failure (7-day retention)

Triggers: pulls requests and pushes touching `frontend/**` or the workflow file,
plus `workflow_dispatch`.

Security posture: `permissions: contents: read` at workflow level (no
`write` scope, no secrets referenced, no `pull_request_target`), so fork PRs run
with no credentials. `concurrency` cancels superseded runs.

No backend is started. `CYBERLAB_BACKEND_URL` is set to the documented default
but is only read at request time by the `/api/v1` proxy; typecheck, lint, tests
and build never call the API. This was proven locally by stopping the mock
backend and running all seven commands successfully.

The existing backend workflow was **not modified**
(`.github/workflows/backend.yml` shows no diff).

### 9.2 Status

| Item | Value |
|---|---|
| Run ID | `40117764436` |
| Job | `Verify (Node 22)` — `120942553767` |
| Trigger | `pull_request` on #6 |
| Result | see §9.3 — recorded after the run completed |

### 9.3 Outcome

Recorded in the final summary of this milestone. If the workflow fails on its
first run, the failure will be reported with the log URL rather than assumed
green.

---

## 10. Git and publication

| Item | Value |
|---|---|
| Repository | `TechDaDev/cyberlab-academy` |
| Branch | `feat/01c1-typography-responsive-ci` |
| Commit SHA | `8a71418af91e73045299645426daa4c936a0fa3a` |
| Files changed | 18 (8 modified, 10 added) |
| Base branch | `arena/milestone-01c-dependency-security` |
| Pull request | [https://github.com/TechDaDev/cyberlab-academy/pull/6](https://github.com/TechDaDev/cyberlab-academy/pull/6) |
| Merge | **Not performed** — left open for review |

Published using the session's authenticated GitHub integration (`gh`) with
HTTPS git credentials already configured. No personal access token was created
or requested; no credential or git configuration was modified.

```bash
git add -A
git commit -m "feat(frontend): self-hosted typography, responsive polish and frontend CI"
git push -u origin feat/01c1-typography-responsive-ci
gh pr create --base arena/milestone-01c-dependency-security \
  --title "Milestone 01C.1: Typography, Responsive Polish and Frontend CI"
```

---

## 11. Verified vs. untested

**Verified (observed in this environment):**

- Typography defect cause, fix, and computed output in a real browser.
- 39/39 automated tests; regression tests proven to fail on reintroduced defect.
- TypeScript, ESLint, production build — all clean.
- Both npm audits report zero vulnerabilities; lockfile unchanged.
- 36 page/viewport combinations measured for overflow and header collision.
- Light mode and the mobile drawer / dropdown / dialog overlays.
- The full CI command sequence passing with **no backend running**.
- Backend and `shared-contracts/` untouched; backend workflow unchanged.

**Not verified (assumptions, stated plainly):**

- **The GitHub Actions run has not been observed green at the time of writing.**
  §9.3 records the outcome once available; the workflow was validated by parsing
  the YAML and by executing every one of its commands locally on Node 22.
- **No cross-browser testing.** Safari, Firefox and Chrome-on-Windows were not
  available. `-webkit-text-size-adjust` is included defensively but was not
  exercised on iOS.
- **No accessibility audit.** The new guardrails check contrast by class
  inspection, not by measured contrast ratio; no screen-reader or keyboard-only
  pass was performed on the changed surfaces.
- **Font rendering quality is machine-dependent.** Subpixel antialiasing and
  hinting differ per OS; the change was assessed only in Debian headless
  Chromium.
- **Original design intent for the fonts was inferred.** Inter, Space Grotesk and
  JetBrains Mono were named as the intended families in the remediation report's
  §7.1 recommendation, and are the families the broken tokens already referenced.
- **The mock API is not the real backend.** It reproduces the documented response
  shapes of OpenAPI v0.2.0 for rendering purposes; it is not part of the
  repository and is not a substitute for end-to-end testing against FastAPI.
- **No visual-diff baseline.** Screenshots were reviewed by eye; no automated
  pixel-baseline regression is committed.

---

## 12. Follow-ups (not done here)

1. Run the frontend suite in the workflow as a **required** status check once
   PR #5 and #6 land.
2. Consider a Playwright visual-regression job if a browser can be provisioned
   in CI; the harness used here is reproducible but intentionally uncommitted.
3. Broader i18n: only the `latin` subset is vendored. A locale requiring
   `latin-ext`, Cyrillic, Arabic or CJK would need the corresponding subsets
   added to `assets/fonts/` and registered in `lib/fonts.ts`.
4. `docs/FRONTEND_SECURITY_REMEDIATION_REPORT.md` §7.1 describes the webfont
   defect as outstanding; it is superseded by this report and should be updated
   when that PR merges.
5. The dependency-security branch still needs to be merged into
   `arena/milestone-01c-frontend` before any of this reaches `main`.
