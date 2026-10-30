import * as React from "react";
import { cn } from "@/lib/utils";

export type ProgressTone = "default" | "warning" | "muted";

const FILL: Record<ProgressTone, string> = {
  default: "bg-gradient-to-r from-cyan-500 to-teal-400",
  warning: "bg-gradient-to-r from-amber-500 to-amber-400",
  muted: "bg-muted-foreground/40",
};

/**
 * Determinate progress bar for server-reported completion.
 *
 * The value is always the API's own percentage; this component never derives one.
 * It exposes a `progressbar` role with a value text so the number is available to
 * assistive technology and is never conveyed by colour alone — callers render the
 * percentage and the `x / y` counts as text next to it.
 */
export function ProgressBar({
  value,
  label,
  valueText,
  tone = "default",
  size = "md",
  className,
}: {
  /** Server percentage, 0–100 (one decimal). */
  value: number;
  /** Accessible name, e.g. "Course progress". */
  label: string;
  /** Optional override for `aria-valuetext`; defaults to "<value>%". */
  valueText?: string;
  tone?: ProgressTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 10) / 10}
      aria-valuetext={valueText ?? `${value.toFixed(1)}%`}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-border/70",
        size === "sm" ? "h-1.5" : "h-2",
        className
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", FILL[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/**
 * Percentage plus bar plus counts, the recurring summary used by the student,
 * instructor and manager progress surfaces.
 */
export function ProgressSummaryLine({
  percent,
  completed,
  total,
  needsReview,
  label,
  tone = "default",
  className,
}: {
  percent: number;
  completed: number;
  total: number;
  needsReview?: number;
  label: string;
  tone?: ProgressTone;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {percent.toFixed(1)}%
        </span>
      </div>
      <ProgressBar
        value={percent}
        label={label}
        valueText={`${percent.toFixed(1)}% — ${completed} of ${total} published lessons completed`}
        tone={tone}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-mono">
          {completed} / {total} lessons
        </span>
        {needsReview !== undefined && needsReview > 0 ? (
          <span className="font-mono text-amber-600 dark:text-amber-300">
            {needsReview} needs review
          </span>
        ) : null}
        {total === 0 ? <span>No published lessons yet</span> : null}
      </div>
    </div>
  );
}
