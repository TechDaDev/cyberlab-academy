import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Deliberately small, dependency-free Markdown renderer for lesson bodies.
 *
 * Safety model: this module never emits raw HTML. The source string is parsed
 * into an AST that is projected onto React elements, so any `<script>`, `on*`
 * handler, `<iframe>` or malformed tag in lesson content is rendered as literal
 * text instead of being executed. `dangerouslySetInnerHTML` is not used
 * anywhere, which makes stored-XSS through authored content structurally
 * impossible rather than dependent on a sanitiser's blocklist.
 *
 * Supported subset: ATX headings, paragraphs, unordered/ordered lists, fenced
 * code blocks, blockquotes, horizontal rules, and inline `code`, **bold**,
 * *italic* and [links](https://…). Link targets are restricted to absolute
 * http(s) URLs; anything else (including `javascript:` and `data:`) falls back
 * to plain text.
 *
 * Not supported (rendered literally): HTML blocks, tables, images, footnotes,
 * reference-style links, and nested lists deeper than one level. Lesson bodies
 * that need those would require a reviewed Markdown library instead.
 */

const INLINE_PATTERN =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(__[^_\n]+__)|(\[[^\]\n]+\]\([^)\s]+\))/g;

const SAFE_LINK = /^https?:\/\//i;

function renderLink(rawText: string, rawHref: string, key: string): React.ReactNode {
  const href = rawHref.trim();
  if (!SAFE_LINK.test(href)) {
    // Reject javascript:, data:, vbscript:, relative and protocol-relative
    // targets: show the original markdown instead of an executable link.
    return <React.Fragment key={key}>{`[${rawText}](${rawHref})`}</React.Fragment>;
  }
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-cyan-600 underline underline-offset-2 hover:text-cyan-500 dark:text-cyan-400"
    >
      {rawText}
    </a>
  );
}

/** Parse inline spans (`code`, bold, italic, links) into React nodes. */
export function renderInline(text: string, keyPrefix = "i"): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-600 dark:text-cyan-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(renderLink(linkMatch[1], linkMatch[2], key));
      } else {
        nodes.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" };

const FENCE = /^```([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const UL_ITEM = /^[-*+]\s+(.*)$/;
const OL_ITEM = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/** Split a Markdown body into block-level nodes. Exported for tests. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1; // consume closing fence (or EOF)
      blocks.push({ kind: "code", lang: fence[1], lines: codeLines });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (HR.test(line.trim())) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoteLines.push(QUOTE.exec(lines[index])![1]);
        index += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    if (UL_ITEM.test(line)) {
      const items: string[] = [];
      while (index < lines.length && UL_ITEM.test(lines[index])) {
        items.push(UL_ITEM.exec(lines[index])![1]);
        index += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (OL_ITEM.test(line)) {
      const items: string[] = [];
      while (index < lines.length && OL_ITEM.test(lines[index])) {
        items.push(OL_ITEM.exec(lines[index])![1]);
        index += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !HR.test(lines[index].trim()) &&
      !QUOTE.test(lines[index]) &&
      !UL_ITEM.test(lines[index]) &&
      !OL_ITEM.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

const HEADING_CLASSES: Record<number, string> = {
  2: "mt-6 mb-2 font-display text-xl font-semibold tracking-tight text-foreground",
  3: "mt-5 mb-2 font-display text-lg font-semibold tracking-tight text-foreground",
  4: "mt-4 mb-1.5 font-display text-base font-semibold text-foreground",
  5: "mt-4 mb-1.5 font-display text-sm font-semibold text-foreground",
};

export function Markdown({
  source,
  className,
  emptyLabel = "No lesson body has been authored yet.",
}: {
  source: string;
  className?: string;
  emptyLabel?: string;
}) {
  if (!source.trim()) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  const blocks = parseBlocks(source);

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground/90", className)}>
      {blocks.map((block, blockIndex) => {
        const key = `b-${blockIndex}`;
        switch (block.kind) {
          case "heading": {
            // Lesson pages already render an <h1>; shift Markdown levels down one
            // so the document keeps a single, ordered heading outline.
            const level = Math.min(block.level + 1, 6);
            const Tag = `h${Math.max(level, 2)}` as "h2" | "h3" | "h4" | "h5" | "h6";
            return (
              <Tag key={key} className={HEADING_CLASSES[level] ?? HEADING_CLASSES[5]}>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={key}>
                {renderInline(block.lines.join(" "), key)}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5 marker:text-cyan-500">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5 marker:text-cyan-500">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg border border-border/80 bg-slate-950/80 p-3 text-xs text-cyan-100"
              >
                <code className="font-mono">{block.lines.join("\n")}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-cyan-500/50 pl-3 text-muted-foreground italic"
              >
                {renderInline(block.lines.join(" "), key)}
              </blockquote>
            );
          case "hr":
            return <hr key={key} className="border-border/70" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
