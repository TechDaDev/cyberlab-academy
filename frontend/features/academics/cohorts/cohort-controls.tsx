"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Native select styled to match the form controls in the design system. */
export function NativeSelect({
  id,
  value,
  onChange,
  disabled,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {children}
    </select>
  );
}

export function ToolbarSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <NativeSelect
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="min-w-[10rem]"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

export function SummaryTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "success" | "info";
  hint?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-500 dark:text-amber-300"
      : tone === "success"
        ? "text-emerald-500 dark:text-emerald-300"
        : tone === "info"
          ? "text-cyan-500 dark:text-cyan-300"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-display text-xl font-bold", toneClass)}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Offset pagination for the contract's `limit`/`offset`/`total` pages.
 *
 * The API reports `total`, so the last page is arithmetic rather than a guess,
 * and "Next" is disabled exactly when the server says there is nothing after
 * the current window.
 */
export function PaginationBar({
  limit,
  offset,
  total,
  shown,
  onChange,
  itemLabel = "records",
}: {
  limit: number;
  offset: number;
  total: number;
  /** Number of rows actually rendered on this page. */
  shown: number;
  onChange: (offset: number) => void;
  itemLabel?: string;
}) {
  if (total === 0) return null;
  const first = offset + 1;
  const last = offset + shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <p className="text-xs text-muted-foreground">
        Showing {first}–{last} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Previous</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={last >= total}
          onClick={() => onChange(offset + limit)}
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
