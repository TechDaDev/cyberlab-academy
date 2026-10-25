import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const sourceRoots = ["app", "components", "features", "hooks", "lib"].map((dir) =>
  path.join(root, dir)
);
const sourceFiles = sourceRoots.flatMap(collectSourceFiles);

/**
 * Milestone 01C.1 fixed a typography defect where `--font-sans`, `--font-display`
 * and `--font-mono` were declared as `var(--font-sans), …` — a cycle that is
 * invalid at computed-value time. The declaration was discarded and every text
 * node rendered in the browser default serif face.
 *
 * These tests fail if that cycle, or the unwired-variable condition that caused
 * it, ever returns.
 */
/** CSS with `/* … *\/` comments removed, so documentation may quote bad values. */
const stripCssComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("Typography configuration", () => {
  const css = read("styles/globals.css");
  const cssDeclarations = stripCssComments(css);

  it("has no self-referential font custom properties", () => {
    // A declaration whose value references the very property being defined.
    for (const token of ["--font-sans", "--font-display", "--font-mono"]) {
      const declaration = new RegExp(`${token}\\s*:\\s*([^;]+);`);
      const match = cssDeclarations.match(declaration);
      expect(match, `${token} is not declared`).not.toBeNull();
      const value = match![1];
      expect(
        value.includes(`var(${token})`),
        `${token} refers to itself: ${value.trim()}`
      ).toBe(false);
    }
  });

  it("binds the theme tokens to the next/font variables", () => {
    // The Tailwind theme must reference the variables that next/font actually
    // defines; otherwise the utilities resolve to an undefined custom property.
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-space-grotesk\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-jetbrains-mono\)/);
  });

  it("declares the three families in a single fonts module", () => {
    const fonts = read("lib/fonts.ts");
    expect(fonts).toContain('from "next/font/local"');
    for (const variable of [
      "--font-inter",
      "--font-space-grotesk",
      "--font-jetbrains-mono",
    ]) {
      expect(fonts, `missing font variable ${variable}`).toContain(variable);
    }
    // Fallbacks must be declared so a failed font fetch still renders sanely.
    expect(fonts).toContain("adjustFontFallback");
    // Monospace must not fall back to a proportional face.
    expect(fonts).toMatch(/adjustFontFallback:\s*false/);
  });

  it("ships every referenced font file", () => {
    const fonts = read("lib/fonts.ts");
    const referenced = [...fonts.matchAll(/"\.\.\/assets\/fonts\/([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(referenced.length).toBe(3);
    for (const file of referenced) {
      const full = path.resolve(root, "lib", "../assets/fonts", file);
      expect(existsSync(full), `missing font binary ${file}`).toBe(true);
      // Variable woff2 fonts are subset files; refuse accidental HTML error pages
      // or multi-megabyte full-font dumps being committed by mistake.
      const size = statSync(full).size;
      expect(size, `${file} looks empty`).toBeGreaterThan(5_000);
      expect(size, `${file} exceeds the 200 KB budget`).toBeLessThan(200_000);
    }
  });

  it("carries an OFL licence for every vendored family", () => {
    for (const licence of [
      "inter-OFL-1.1.txt",
      "space-grotesk-OFL-1.1.txt",
      "jetbrains-mono-OFL-1.1.txt",
    ]) {
      const full = path.join(root, "assets/fonts/licenses", licence);
      expect(existsSync(full), `missing licence ${licence}`).toBe(true);
      expect(readFileSync(full, "utf8")).toContain("SIL OPEN FONT LICENSE");
    }
  });

  it("applies the font variables to the document root", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("fontVariables");
    expect(layout).toContain("lib/fonts");
    // Must be on <html> so :root-level custom properties are inherited by portals
    // (dialogs, dropdowns, toasts) that render outside the body tree.
    expect(layout).toMatch(/<html[^>]*className=\{`[^`]*\$\{fontVariables\}/);
  });

  it("no longer needs the compatibility html font-family rule", () => {
    // Milestone 01C added `html { font-family: var(--font-sans), Inter … }` purely
    // to reproduce the broken serif rendering. With real fonts wired up that rule
    // is obsolete and must not come back.
    const htmlRule = css.match(/html\s*\{[^}]*\}/s);
    expect(htmlRule).not.toBeNull();
    expect(htmlRule![0]).not.toContain("font-family");
  });
});

describe("Typography application", () => {
  it("exposes a display utility, a mono utility and a sans default", () => {
    const css = read("styles/globals.css");
    // Tailwind v4 derives these from the `--font-*` theme entries.
    expect(css).toContain("--font-display");
    expect(css).toContain("--font-mono");
    // body text resolves through font-sans
    expect(css).toMatch(/body\s*\{[^}]*font-sans/s);
  });

  it("uses the display face for navigation and dashboard headings", () => {
    const shells = ["components/layout/app-shell.tsx", "components/shared/cyber-logo.tsx"];
    for (const file of shells) {
      expect(read(file), `${file} lost its display font`).toContain("font-display");
    }
    for (const dashboard of [
      "features/dashboards/student/student-dashboard.tsx",
      "features/dashboards/instructor/instructor-dashboard.tsx",
      "features/dashboards/manager/manager-dashboard.tsx",
      "features/dashboards/admin/admin-dashboard.tsx",
    ]) {
      const source = read(dashboard);
      // The primary <h1> of each dashboard carries the display face.
      expect(source, `${dashboard} h1 is missing font-display`).toMatch(
        /<h1 className="[^"]*font-display/
      );
    }
  });

  it("uses the monospace face for technical output", () => {
    // Terminal-ish surfaces must stay monospaced so columns line up.
    const technical = [
      "features/admin/user-directory-panel.tsx",
      "features/auth/reauth-modal.tsx",
      "components/layout/backend-mode-bar.tsx",
    ];
    for (const file of technical) {
      expect(read(file), `${file} lost its monospace font`).toContain("font-mono");
    }
  });

  it("never hardcodes a serif fallback anywhere in the source", () => {
    // The original defect surfaced as Times New Roman; no component should opt
    // back into a serif stack.
    const offenders = sourceFiles.filter((file) => {
      const contents = readFileSync(file, "utf8");
      return /font-family:\s*(serif|Times)/i.test(contents);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe("Theme compatibility", () => {
  const css = read("styles/globals.css");

  it("keeps both palettes and the class-based dark variant", () => {
    expect(css).toContain("@custom-variant dark");
    expect(css).toMatch(/\.dark\s*\{/);
    // A light palette must still exist at :root.
    const rootBlock = css.match(/:root\s*\{[^}]*\}/s);
    expect(rootBlock).not.toBeNull();
    expect(rootBlock![0]).toContain("--background");
    expect(rootBlock![0]).toContain("--foreground");
  });

  it("keeps tinted gradients theme-aware so text stays legible in light mode", () => {
    // The admin banner used an unconditional `via-slate-900` gradient; in light
    // mode that produced dark navy text surfaces behind `text-foreground`.
    // Any hardcoded dark gradient stop must be scoped to the `dark` variant.
    const offenders = sourceFiles.flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return [...contents.matchAll(/className="([^"]*)"/g)]
        .filter((m) => /(?:^|\s)(?:from|via|to)-(?:slate|gray|zinc|neutral|stone)-(?:8|9)\d\d/.test(m[1]))
        .filter((m) => !/\bdark:/.test(m[1]))
        .map((m) => `${path.relative(root, file)}: ${m[1].slice(0, 90)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("does not let typography depend on a theme class", () => {
    // Font tokens live in @theme inline and must not be duplicated inside .dark,
    // which would desynchronise typography between light and dark mode.
    const darkBlock = css.match(/\.dark\s*\{[^}]*\}/s);
    expect(darkBlock).not.toBeNull();
    expect(darkBlock![0]).not.toContain("--font-");
  });
});

describe("Responsive guardrails", () => {
  it("keeps the landing navigation from appearing before it fits", () => {
    // The public section nav needs ~474px plus logo and CTAs, so it may only
    // appear at `lg` (1024px). At `md` it overflowed the viewport by 16px.
    const landing = read("app/page.tsx");
    expect(landing).not.toMatch(/className="hidden md:flex items-center gap-6/);
    expect(landing).toMatch(/hidden items-center gap-6 text-sm text-muted-foreground lg:flex/);
  });

  it("keeps the logo tagline hidden on the smallest viewports", () => {
    const logo = read("components/shared/cyber-logo.tsx");
    const wordmark = logo.match(/className="([^"]*font-display[^"]*)"/);
    expect(wordmark, "wordmark lost font-display").not.toBeNull();
    expect(wordmark![1]).toContain("whitespace-nowrap");
    // The subtitle is hidden below `sm`; otherwise it wraps into fragments.
    const subtitle = logo.match(/className="([^"]*font-mono[^"]*)"/);
    expect(subtitle, "subtitle lost font-mono").not.toBeNull();
    expect(subtitle![1]).toContain("hidden");
    expect(subtitle![1]).toContain("sm:block");
  });

  it("allows the top bar to shrink without colliding", () => {
    const shell = read("components/layout/app-shell.tsx");
    // Leading cluster must be allowed to shrink; trailing cluster must not grow.
    expect(shell).toMatch(/flex min-w-0 flex-1 items-center gap-3/);
    const breadcrumbs = read("components/layout/breadcrumbs.tsx");
    expect(breadcrumbs).toContain("overflow-hidden");
    expect(breadcrumbs).toContain("flex-nowrap");
  });

  it("wraps the privileged role rows instead of forcing a wide grid track", () => {
    const admin = read("features/dashboards/admin/admin-dashboard.tsx");
    // Non-wrapping flex rows set a min-content width that pushed the card past
    // a 375px viewport (84px of horizontal overflow).
    expect(admin).toContain("flex flex-wrap items-center justify-between gap-2 rounded-lg border");
    expect(admin).toContain("min-w-0 lg:col-span-6");
  });

  it("keeps every data table inside a horizontal scroll container", () => {
    for (const file of [
      "features/admin/user-directory-panel.tsx",
      "features/dashboards/instructor/instructor-dashboard.tsx",
    ]) {
      const source = read(file);
      expect(source, `${file} renders a table without an overflow wrapper`).toContain(
        '<div className="overflow-x-auto">'
      );
      expect(source).toContain("<table");
    }
  });
});
