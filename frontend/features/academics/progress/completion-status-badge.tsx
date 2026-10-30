import * as React from "react";
import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  COMPLETION_STATE_LABELS,
  type CompletionState,
} from "@/lib/types/progress";

const VARIANT: Record<
  CompletionState,
  "success" | "outline" | "warning"
> = {
  current: "success",
  not_started: "outline",
  needs_review: "warning",
};

const ICON: Record<CompletionState, React.ComponentType<{ className?: string }>> = {
  current: CheckCircle2,
  not_started: CircleDashed,
  needs_review: RefreshCw,
};

/**
 * Lesson completion state, labelled in words as well as colour.
 *
 * `current` means the lesson's **current** content version was completed.
 * `needs_review` means only an older version was completed and the content has
 * changed since — it is never rendered as a completed lesson.
 */
export function CompletionStatusBadge({
  status,
  className,
}: {
  status: CompletionState;
  className?: string;
}) {
  const Icon = ICON[status];
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn("font-mono text-[10px] uppercase", className)}
    >
      <Icon className="h-3 w-3" />
      {COMPLETION_STATE_LABELS[status]}
    </Badge>
  );
}

/** One-line explanation shown next to a lesson row or in the lesson viewer. */
export function completionStateHint(
  status: CompletionState,
  lastCompletedVersion: number | null
): string | null {
  if (status === "needs_review") {
    return lastCompletedVersion === null
      ? "Content updated — review this lesson again."
      : `Content updated — review this lesson again. You completed version ${lastCompletedVersion}.`;
  }
  if (status === "not_started") {
    return "No completion has been recorded for this lesson.";
  }
  return null;
}
