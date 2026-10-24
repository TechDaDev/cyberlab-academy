# Frontend Dependency Security Remediation Report

**Date:** 2026-10-24
**Scope:** `frontend/` dependency advisories identified in Milestone 01C. No backend files were modified.
**Branch:** `arena/milestone-01c-dependency-security` (based on `arena/milestone-01c-frontend` @ `8728c29`)
**Base branch:** `arena/milestone-01c-frontend` (open PR #4) — integration branch for the frontend

## 1. Outcome

| Check | Before | After |
| --- | --- | --- |
| `npm audit` | 7 vulnerabilities (5 moderate, **2 critical**) | **0 vulnerabilities** |
| `npm audit --omit=dev` | 4 moderate | **0 vulnerabilities** |
| `npm run typecheck` | pass | pass |
| `npm run lint` | pass | pass |
| `npm test` | 15 passed (4 files) | **20 passed (5 files)** |
| `npm run build` | pass | pass |

All five reported advisories are absent from the resolved dependency tree. `npm audit fix --force` was **not** used; both fixes were deliberate version changes with the resulting tree inspected before and after.

## 2. Vulnerabilities before remediation

Audited at `8728c29` (`arena/milestone-01c-frontend`).

| Advisory | Severity | Package | Vulnerable range | Dependency path | Status |
| --- | --- | --- | --- | --- | --- |
| GHSA-5gmw-xhrv-c9v3 | 🔴 critical | `tinypool` | `<=2.1.1` | `vitest@3.2.7` → `tinypool@1.1.1` | Removed |
| GHSA-85c8-ppgw-ccpr | 🔴 critical | `tinypool` | `<=2.1.1` | `vitest@3.2.7` → `tinypool@1.1.1` | Removed |
| GHSA-82fw-gwwq-j7x9 | 🟡 moderate | `@vitest/mocker` | `<=4.1.11` | `vitest@3.2.7` → `@vitest/mocker@3.2.7` | Patched |
| GHSA-qxg6-89mg-rqv8 | 🟡 moderate | `@vitest/mocker` / `vitest` | `vitest 0.0.95–4.1.10` | `vitest@3.2.7` | Patched |
| GHSA-rj75-hqrm-r3gf | 🟡 moderate | `postcss-selector-parser` | `<7.1.6` | `tailwindcss@3.4.19` → `postcss-nested@6.2.0` → `postcss-selector-parser@6.x` (also reached through `tailwindcss-animate@1.0.7`) | Removed from tree |

`npm audit` reported "No fix available" for the PostCSS advisory, because no Tailwind v3-compatible release depends on `postcss-selector-parser >= 7.1.6`.

### Reachability of the PostCSS parser advisory

`postcss-selector-parser` was reachable only during **build-time** CSS transforms of repository-owned stylesheets (`styles/globals.css` and files in `components/`/`features/`). It was not bundled into any client or server runtime chunk, and the application never parses user-supplied CSS or selectors — no runtime endpoint, form, or preview feature accepts CSS. The vulnerability is a quadratic-complexity CPU-exhaustion issue in flat selector parsing, so exploitation required attacker-controlled selector text to be fed to the parser. The practical risk was therefore **low**, but the package also represented unnecessary supply-chain surface, so it was removed rather than suppressed.

The two `tinypool` critical advisories (prototype pollution → RCE through worker options) applied only to the Vitest test runner and never to a shipped artifact; they were still remediated because developer/CI execution of untrusted input (fixtures, preview branches) is a realistic attack path.

## 3. Dependency versions changed

| Package | Before | After | Note |
| --- | --- | --- | --- |
| `vitest` | 3.2.7 | **4.1.12** | Latest release outside the advisory ranges |
| `@vitest/mocker` | 3.2.7 | **4.1.12** | Pinned by `vitest` 4.1.12 |
| `tinypool` | 1.1.1 | **absent** | Vitest 4 no longer depends on it |
| `vite` | 7.3.7 (transitive) | **7.3.7 (direct devDependency, `^7.3.7`)** | Keeps `@vitejs/plugin-react@4.7.0` inside its supported `^4.2–^7` peer range |
| `tailwindcss` | 3.4.19 | **4.3.3** | CSS-first configuration |
| `@tailwindcss/postcss` | absent | **4.3.3** | Official v4 PostCSS plugin |
| `tw-animate-css` | absent | **1.4.0** | Replaces `tailwindcss-animate` |
| `tailwindcss-animate` | 1.0.7 | **removed** | v3-only plugin; superseded by `tw-animate-css` |
| `autoprefixer` | 10.6.1 | **removed** | v4 handles vendor prefixing and imports internally |
| `postcss-nested` | 6.2.0 | **absent** | No longer a Tailwind dependency |
| `postcss-selector-parser` | 6.x | **absent** | No longer in the tree |
| `postcss` | 8.5.31 | 8.5.31 | Unchanged (Next.js still bundles its own 8.5.23 internally) |

An `overrides` entry pins `vitest` to `4.1.12`. Without it, `npm install` aborts with `npm error Cannot read properties of null (reading 'edgesOut')` — an npm 10.9.4 arborist bug triggered while expanding Vitest's optional browser peers (`@vitest/devtools-vitest` requests `vitest@*`, which resolves to 5.0.5 and crashes the peer-set loader). The override pins the peer resolution to the intended version; it does not hide a vulnerability, and `npm ci` succeeds against the committed lockfile.

## 4. Tailwind CSS v4 migration

Performed following the official upgrade guide, manually rather than with `npx @tailwindcss/upgrade` so each configuration change stayed reviewable.

1. `tailwindcss@3.4.19` + `autoprefixer` → `tailwindcss@4.3.3` + `@tailwindcss/postcss@4.3.3`; `tailwindcss-animate` → `tw-animate-css@1.4.0`.
2. `postcss.config.mjs` now registers only `@tailwindcss/postcss`.
3. `tailwind.config.ts` deleted. Every token moved into `@theme inline` in `styles/globals.css`:
   - Semantic colors (`border`, `input`, `ring`, `background`, `foreground`, `surface*`, `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, `card`) remain bound to the same `hsl(var(--…))` runtime variables.
   - Cyber palette (`--color-cyber-*`), radii (`lg`/`md`/`sm` derived from `--radius`), `--shadow-cyber-glow` / `--shadow-cyber-panel`, font stacks, and the `pulse-subtle` / `scan-line` keyframes/animations are preserved.
4. `@custom-variant dark (&:is(.dark *))` keeps class-based dark mode; the `.dark` token block is unchanged.
5. `@tailwind base/components/utilities` → `@import "tailwindcss"`; custom utilities (`cyber-grid-bg`, `cyber-radial-spotlight`, `cyber-panel`, `cyber-panel-interactive`) converted to v4 `@utility` definitions.
6. Renamed utilities applied to preserve appearance: `outline-none` → `outline-hidden` (14), `shadow-sm` → `shadow-xs` (7), `backdrop-blur-sm` → `backdrop-blur-xs` (3).
7. `space-y`/`divide-y` selectors changed in v4 (documented breaking change); see §6 for the measured effect.

### Preserved typography indirection

Milestone 01C's `tailwind.config.ts` declared `font-sans`/`font-display`/`font-mono` as `var(--font-sans)`, `var(--font-display)`, `var(--font-mono)`, but no `next/font` integration ever defined those variables. Every family therefore resolved to the browser default (Times New Roman) and `.font-mono` was never monospaced — a pre-existing defect, unrelated to dependency security. Because Tailwind v4 preflight supplies its own system font stack, the migration adds an explicit `html { font-family: var(--font-sans), Inter, system-ui, sans-serif; }` rule to reproduce the shipped rendering byte-for-byte instead of silently changing the design. Verified in-browser: `font-family` computes to `"Times New Roman"` on `body`, `h1`, and `font-mono` elements in both builds. Fixing webfont loading is explicitly out of scope; see §7.

## 5. Test results

Commands run from `frontend/` after `npm ci` on a clean `node_modules`:

| Command | Result |
| --- | --- |
| `npm ci` | pass (lockfile in sync) |
| `npm run typecheck` | pass — `tsc --noEmit`, no output |
| `npm run lint` | pass — `eslint .`, no findings |
| `npm test` | **20 passed / 20, 5 files** in ~3.0 s |
| `npm run build` | pass — 17 routes prerendered/dynamic as before |
| `npm audit` | **0 vulnerabilities** |
| `npm audit --omit=dev` | **0 vulnerabilities** |

Vitest 4 runs the unchanged suite without configuration changes (`environment: "jsdom"`, `globals: true`, `setupFiles`, path alias all still supported).

New regression test: `frontend/__tests__/security-and-design-guardrails.test.ts` (5 tests)

1. No source file reintroduces a utility that Tailwind v4 removed or renamed (`outline-none`, `shadow-sm`, `blur-sm`, `backdrop-blur-sm`, `*-opacity-*`, `flex-shrink-*`, `overflow-ellipsis`).
2. `styles/globals.css` still imports both stylesheets, declares the `dark` variant, contains the required design tokens, and no longer uses `@tailwind` directives.
3. `package.json` declares Tailwind v4 packages and no longer declares `tailwindcss-animate` or `autoprefixer`.
4. `vitest` is outside the GHSA-82fw-gwwq-j7x9 range.
5. The lockfile contains no `tinypool`, `tailwindcss-animate`, `postcss-nested`, or `postcss-selector-parser` entries.

## 6. Visual regression results

**Method.** Production builds of the baseline commit `8728c29` and the migrated branch were served locally (`127.0.0.1:3300` and `127.0.0.1:3200`) with `CYBERLAB_BACKEND_URL` pointed at a closed port so the labeled Cloud Preview Demo adapter could be activated. Chrome (via DevTools MCP) captured full-page PNGs at a 1065 × 1777 CSS-pixel layout viewport; diffs computed with Pillow.

**Pages captured.** Landing (dark + light), login, register, forgot-password, and all four role dashboards (student, instructor, manager, admin) in dark mode, plus the admin dashboard in light mode. Dashboard states were reached by signing in through the demo adapter and switching roles through the real role switcher, including the Administrator step-up MFA dialog.

**Findings.**

| Page | Diff > 4/255 | Diff > 64/255 | Assessment |
| --- | --- | --- | --- |
| Landing (dark) | 18.0 % | 5.0 % | Text-edge only; geometry identical |
| Landing (light) | 20.0 % | 5.3 % | Text-edge only; geometry identical |
| Login | 5.1 % | 1.1 % | Text-edge only |
| Register | 6.8 % | 1.6 % | Text-edge only |
| Forgot password | 3.5 % | 0.5 % | Text-edge only |
| Dashboard — student | 9.8 % | 0.3 % | Text-edge only |
| Dashboard — instructor | 8.9 % | 0.4 % | Text-edge only |
| Dashboard — manager | 13.4 % | 1.6 % | Text-edge only |
| Dashboard — admin | 11.6 % | 1.9 % | Text-edge only |

The nonzero diffs are dominated by glyph anti-aliasing: dark-pixel counts and mean luminance of the same text regions differ by <0.15 %, computed `font-family`, `font-size`, `font-weight`, `letter-spacing`, `line-height`, `font-feature-settings`, and `-webkit-font-smoothing` are identical, and sampled surface colors match within ±1/255 (v3 alpha compositing vs v4 `color-mix` rounding).

**The only layout change** is the documented `space-y-*` selector change. Landing section offsets are identical until the "Platform Architecture" section, whose height decreases by 6 px; total document height changes 2543 → 2537 px. On the login card, a field group with an empty helper node shrinks by 8 px (v3 added `margin-top` to every sibling, including empty nodes; v4 uses `margin-bottom` on all but the last child). No colors, palette values, radii, shadows, borders, animations, or dark/light tokens changed. Responsive and dark utilities are still generated: the built stylesheet contains the `40/48/64/80/96rem` breakpoints, 15 media queries, class-based `.dark` rules, and `tw-animate-css` `enter` keyframes.

**Limitation.** The browser window could not be resized to mobile widths in this environment (the window manager refused, `Browser.setContentsSize: Restore window to normal state`), so responsive behavior was verified through generated breakpoint utilities and the existing automated suites rather than mobile-width pixel captures.

## 7. Remaining risks

1. **Pre-existing typography defect (not fixed).** No webfont is loaded, so all text renders in the browser default serif and `font-mono`/`font-display` are inert. Preserved deliberately to avoid an unreviewed visual change inside a security patch. Recommended follow-up: wire `next/font` for Inter/Space Grotesk/JetBrains Mono, define `--font-sans`/`--font-display`/`--font-mono`, then delete the compatibility `html` rule in `styles/globals.css` and re-run visual regression.
2. **npm peer-resolution workaround.** `overrides.vitest` is required because npm 10.9.4 crashes on Vitest's optional browser peers. Upgrade npm (>= 11) or drop the override once the arborist bug is fixed upstream, and re-verify `npm ci`.
3. **Vitest 4 remains a development dependency** (~9 MB of extra tooling is not shipped). Production bundles are unaffected: `npm audit --omit=dev` reports zero findings.
4. **Dependabot/CI gap.** The repository has a backend workflow only; no workflow runs `npm audit`, `npm ci`, or the frontend suite, so regressions in these guardrails would not be caught automatically. Recommended follow-up: add a frontend CI job.
5. **Advisory database drift.** A clean audit reflects the advisory database at run time (npm 10.9.4, 2026-10-24). New advisories can appear for any pinned version; the guardrail tests cover the five known ones.
6. **No penetration testing** of the frontend was performed; this report covers dependency advisories only.

## 8. Git status

| Item | Value |
| --- | --- |
| Development branch | `arena/milestone-01c-dependency-security` |
| Base | `arena/milestone-01c-frontend` @ `8728c29` |
| Commit 1 | `5e1d886` — fix(frontend): upgrade Vitest to a patched release |
| Commit 2 | `bf2d561` — fix(frontend): migrate Tailwind to v4 and drop vulnerable PostCSS chain |
| Commit 3 | this report |
| Files changed | `frontend/package.json`, `frontend/package-lock.json`, `frontend/postcss.config.mjs`, `frontend/styles/globals.css`, `frontend/tailwind.config.ts` (deleted), 13 component/feature files (utility renames), `frontend/README.md`, `frontend/__tests__/security-and-design-guardrails.test.ts`, this document |
| Backend files | none modified |
| Merge | not performed; pull request left open for review |

`arena/milestone-01c-frontend` was restored to its remote tip (`8728c29`) so the security work is isolated in its own pull request.

## 9. Recommendation

Ship the dependency upgrade. Both audits report zero vulnerabilities on the committed lockfile, and the migrated design is visually equivalent apart from a documented 6 px spacing correction. Production readiness still depends on the open items in §7, especially the missing frontend CI audit job and the pre-existing webfont defect.
