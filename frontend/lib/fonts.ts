import localFont from "next/font/local";

/**
 * CyberLab Academy type system.
 *
 * Three self-hosted variable webfonts are wired through `next/font/local`, which
 * provides the same optimisation pipeline as `next/font/google`: build-time
 * subsetting/serving, `<link rel="preload">` emission, `size-adjust` fallback
 * metrics (so swapping in the real face does not shift layout), and zero
 * third-party requests at runtime.
 *
 * Why local files instead of `next/font/google`:
 *   1. A cybersecurity training platform should not make users' browsers contact
 *      a third-party font CDN (privacy, tracking, and CSP surface).
 *   2. Builds stay reproducible in air-gapped or egress-restricted environments
 *      (this sandbox cannot reach fonts.googleapis.com; neither can many CI
 *      runners behind a proxy).
 *   3. The binaries are SIL Open Font License 1.1 and are committed under
 *      `assets/fonts/`, with the licence texts in `assets/fonts/licenses/`.
 *
 * The CSS variable names are intentionally distinct from the Tailwind theme
 * tokens (`--font-sans` / `--font-display` / `--font-mono`). The previous defect
 * was a self-referential `--font-sans: var(--font-sans), …` declaration; using
 * `--font-inter` & friends removes that cycle permanently.
 */

export const fontSans = localFont({
  src: [
    {
      path: "../assets/fonts/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
  // Inter's stylistic alternates (`cv02`, `cv03`, `cv04`, `cv11`) are applied on
  // `body` in `styles/globals.css`; passing them here would break Next's option
  // serialisation because the value contains quotes.
});

export const fontDisplay = localFont({
  src: [
    {
      path: "../assets/fonts/space-grotesk-latin-wght-normal.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const fontMono = localFont({
  src: [
    {
      path: "../assets/fonts/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
  // The face is only used for short technical strings, so a preload would cost
  // more than it saves; it still uses `display: swap`.
  preload: false,
  // A synthesised fallback would substitute a *proportional* face, which breaks
  // column alignment in terminals and log tables. Fall through to a genuine
  // monospace stack instead.
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
});

/** Applied to `<html>` so every font variable is available to the document. */
export const fontVariables = `${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`;
