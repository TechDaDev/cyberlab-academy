import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const sourceRoots = ["app", "components", "features", "hooks", "lib"].map((dir) =>
  path.join(root, dir)
);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const sourceFiles = sourceRoots.flatMap(collectSourceFiles);

describe("Tailwind v4 migration guardrails", () => {
  it("has no utilities that Tailwind v4 removed or renamed", () => {
    // `outline-none`, `shadow-sm`, `blur-sm`, and `backdrop-blur-sm` changed meaning in
    // v4, so a reintroduced v3 name would silently alter the design system.
    const banned = [
      /\boutline-none\b/,
      /\bshadow-sm\b/,
      /\bbackdrop-blur-sm\b/,
      /\bblur-sm\b/,
      /\bbg-opacity-\d+\b/,
      /\btext-opacity-\d+\b/,
      /\bborder-opacity-\d+\b/,
      /\bring-opacity-\d+\b/,
      /\bflex-shrink-\d+\b/,
      /\boverflow-ellipsis\b/,
    ];
    const offenders = sourceFiles.flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return banned
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path.relative(root, file)}: ${pattern.source}`);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the CSS-first Tailwind configuration", () => {
    const css = readFileSync(path.join(root, "styles/globals.css"), "utf8");
    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain('@import "tw-animate-css"');
    expect(css).toContain("@custom-variant dark");
    expect(css).not.toContain("@tailwind base");
    expect(css).not.toContain("@tailwind utilities");
    for (const token of [
      "--color-background",
      "--color-foreground",
      "--color-surface-elevated",
      "--color-cyber-cyan",
      "--shadow-cyber-panel",
      "--radius-lg",
      "--font-display",
    ]) {
      expect(css, `missing design token ${token}`).toContain(token);
    }
    // Both palettes must survive so light/dark theming keeps working.
    expect(css).toMatch(/\.dark \{/);
  });

  it("declares Tailwind v4 packages and drops the v3-only plugins", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.devDependencies.tailwindcss).toMatch(/^[~^]?4\./);
    expect(pkg.devDependencies["@tailwindcss/postcss"]).toMatch(/^[~^]?4\./);
    expect(pkg.devDependencies["tw-animate-css"]).toBeDefined();
    expect(pkg.devDependencies.autoprefixer).toBeUndefined();
    expect(pkg.dependencies?.["tailwindcss-animate"]).toBeUndefined();
  });
});

describe("Dependency security guardrails", () => {
  it("pins Vitest and its mocker above the reported advisory ranges", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const version = String(pkg.devDependencies.vitest);
    const [major, minor, patch] = version.replace(/[^\d.]/g, "").split(".").map(Number);
    const patched = major > 4 || (major === 4 && (minor > 1 || (minor === 1 && patch >= 12)));
    expect(patched, `vitest ${version} is inside the GHSA-82fw-gwwq-j7x9 range`).toBe(true);
  });

  it("keeps the vulnerable tinypool release out of the lockfile", () => {
    const lock = readFileSync(path.join(root, "package-lock.json"), "utf8");
    expect(lock).not.toMatch(/"node_modules\/tinypool"/);
    expect(lock).not.toMatch(/"node_modules\/tailwindcss-animate"/);
    expect(lock).not.toMatch(/"node_modules\/postcss-nested"/);
    expect(lock).not.toMatch(/"node_modules\/postcss-selector-parser"/);
  });
});
