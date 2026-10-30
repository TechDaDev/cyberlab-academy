"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { describeProgressError } from "@/features/academics/progress/progress-errors";
import { useProgressSessionKey } from "@/features/academics/progress/progress-session";
import { useApiResource } from "@/features/academics/use-api-resource";
import { progressApi } from "@/lib/api/progress";
import {
  formatLessonCounts,
  formatPercent,
  isEnrollmentProgress,
  type EnrollmentProgress,
} from "@/lib/types/progress";

/**
 * Compact progress line for one enrollment on the student's class list.
 *
 * The numbers are exactly what `GET /me/enrollments/{id}/progress` returned for
 * this enrollment: completed current lessons, total published lessons and the
 * percentage the backend computed. Nothing is summed across classes and the
 * 20-module CEH plan is never used as a denominator — the denominator is whatever
 * the API reports for published lessons.
 *
 * A failure here is scoped to this card: the class itself is still listed, and the
 * card says progress could not be loaded instead of showing an invented 0%.
 */
export function EnrollmentProgressSummary({
  enrollmentId,
  refreshNonce = 0,
}: {
  enrollmentId: string;
  refreshNonce?: number;
}) {
  const sessionKey = useProgressSessionKey();
  const { data, error, loading } = useApiResource<EnrollmentProgress>(
    () => progressApi.getOwnProgress(enrollmentId),
    `learn-progress:${sessionKey}:${enrollmentId}:${refreshNonce}`
  );

  if (loading && !data) {
    return (
      <div className="space-y-1.5" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  if (error) {
    const copy = describeProgressError(error, "student");
    return (
      <p
        role="alert"
        className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {copy.title}: progress could not be loaded. {copy.description}
        </span>
      </p>
    );
  }

  if (!data) return null;

  if (!isEnrollmentProgress(data)) {
    return (
      <p
        role="alert"
        className="text-[11px] text-muted-foreground"
      >
        Progress unavailable: the backend did not return a progress record for this
        enrollment. Nothing is shown in its place.
      </p>
    );
  }

  const eligible =
    data.enrollment_status === "active" && data.cohort_status === "active";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
        <span className="font-mono uppercase tracking-wider text-muted-foreground">
          Progress
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {formatPercent(data.percent_complete)}
        </span>
      </div>
      <ProgressBar
        value={data.percent_complete}
        label="Class progress"
        valueText={`${formatPercent(data.percent_complete)} — ${
          data.completed_current_lessons
        } of ${data.total_published_lessons} published lessons completed`}
        size="sm"
        tone={data.needs_review_lessons > 0 ? "warning" : "default"}
      />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="font-mono">
          {formatLessonCounts(
            data.completed_current_lessons,
            data.total_published_lessons
          )}{" "}
          published lessons
        </span>
        {data.total_published_lessons === 0 ? (
          <span>· no published lessons yet</span>
        ) : null}
        {data.needs_review_lessons > 0 ? (
          <span className="font-mono text-amber-600 dark:text-amber-300">
            · {data.needs_review_lessons} needs review
          </span>
        ) : null}
        {data.is_complete ? (
          <span className="font-mono text-emerald-600 dark:text-emerald-300">
            · complete
          </span>
        ) : null}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {eligible
          ? "Self-reported learning progress, not a grade."
          : data.enrollment_status === "withdrawn"
            ? "History only — a withdrawn enrollment cannot record new completions."
            : `The class is ${data.cohort_status}; new completions are paused.`}
      </p>
      <Link
        href={`/academics/learn/enrollments/${encodeURIComponent(enrollmentId)}`}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-600 hover:underline dark:text-cyan-300"
      >
        <span>View lesson-by-lesson progress</span>
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
