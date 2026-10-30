"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ProgressBar } from "@/components/shared/progress-bar";
import { describeProgressError } from "@/features/academics/progress/progress-errors";
import {
  CompletionStatusBadge,
  completionStateHint,
} from "@/features/academics/progress/completion-status-badge";
import { useProgressSessionKey } from "@/features/academics/progress/progress-session";
import { useApiResource } from "@/features/academics/use-api-resource";
import { progressApi } from "@/lib/api/progress";
import {
  formatLessonCounts,
  formatPercent,
  isEnrollmentProgress,
  type EnrollmentProgress,
} from "@/lib/types/progress";
import { formatDateTime } from "@/lib/utils";

/** Lesson link that keeps the enrollment context explicit. */
export function lessonHref(lessonId: string, enrollmentId: string): string {
  return `/academics/lessons/${encodeURIComponent(
    lessonId
  )}?enrollmentId=${encodeURIComponent(enrollmentId)}`;
}

/**
 * Progress for one of the student's own enrollments.
 *
 * Everything numeric here is the API's: `percent_complete`, the counts, the
 * per-module roll-up and each lesson's state. The panel never derives a
 * percentage and never treats an older completion as current.
 *
 * One enrollment is one scope, so the panel is always opened for an explicit
 * `enrollmentId` — completion evidence recorded in one class is never shown as
 * credit for another class of the same course.
 */
export function StudentProgressPanel({
  enrollmentId,
  canReadLessons,
  refreshNonce = 0,
}: {
  enrollmentId: string;
  /** False when the enrollment or class is not active: history still readable. */
  canReadLessons: boolean;
  /** Bumped by the parent so a refresh also re-reads this panel. */
  refreshNonce?: number;
}) {
  const sessionKey = useProgressSessionKey();
  const { data, error, loading, refreshing, reload } =
    useApiResource<EnrollmentProgress>(
      () => progressApi.getOwnProgress(enrollmentId),
      `own-progress:${sessionKey}:${enrollmentId}:${refreshNonce}`
    );

  const copy = describeProgressError(error, "student");

  if (loading && !data) {
    return <LoadingState label="Loading your progress..." rows={3} />;
  }

  if (error) {
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={copy.retryable ? reload : undefined}
      />
    );
  }

  if (!data) return null;

  if (!isEnrollmentProgress(data)) {
    return (
      <ErrorState
        title="Progress format not recognised"
        description="The backend answered, but without the progress record this screen expects. No percentage is displayed rather than guessed."
        onRetry={reload}
      />
    );
  }

  const active =
    data.enrollment_status === "active" && data.cohort_status === "active";
  const lessonsReachable = canReadLessons && active;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="h-4 w-4 text-cyan-400" />
              Course progress
            </CardTitle>
            <CardDescription className="text-xs">
              Self-reported learning progress: lessons you marked as reviewed.
              This is not a grade or an assessment result.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            <span>Refresh progress</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-3xl font-bold text-foreground">
                {formatPercent(data.percent_complete)}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {formatLessonCounts(
                  data.completed_current_lessons,
                  data.total_published_lessons
                )}{" "}
                published lessons completed
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.is_complete ? (
                <Badge variant="success" className="font-mono text-[10px] uppercase">
                  Course complete
                </Badge>
              ) : (
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  In progress
                </Badge>
              )}
              {data.needs_review_lessons > 0 ? (
                <Badge variant="warning" className="font-mono text-[10px] uppercase">
                  {data.needs_review_lessons} needs review
                </Badge>
              ) : null}
            </div>
          </div>

          <ProgressBar
            value={data.percent_complete}
            label="Course progress"
            valueText={`${formatPercent(data.percent_complete)} — ${
              data.completed_current_lessons
            } of ${data.total_published_lessons} published lessons completed`}
            tone={data.needs_review_lessons > 0 ? "warning" : "default"}
          />

          {data.total_published_lessons === 0 ? (
            <Alert variant="info">
              <AlertDescription className="text-xs">
                This course has no published lessons yet, so progress is 0 of 0
                lessons and 0.0%. A course is never reported as complete until it
                has published lessons and all of them are done.
              </AlertDescription>
            </Alert>
          ) : null}

          {!active ? (
            <Alert variant="warning">
              <ShieldAlert />
              <AlertDescription className="text-xs">
                {data.enrollment_status === "withdrawn"
                  ? "This enrollment is withdrawn. Your recorded progress stays visible as history, but you cannot mark new lessons complete."
                  : `This class is ${data.cohort_status}. Recorded progress stays visible as history, but new completions need an active class.`}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-teal-400" />
            Module progress
          </CardTitle>
          <CardDescription className="text-xs">
            Derived by the API from each module&rsquo;s published lessons. Modules
            with no published lessons are not counted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.modules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No published module contributes to this course yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.modules.map((moduleEntry) => (
                <li
                  key={moduleEntry.module_id}
                  className="rounded-lg border border-border/70 bg-surface-elevated/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Module {String(moduleEntry.sequence).padStart(2, "0")}
                      </Badge>
                      <span className="truncate text-sm font-medium text-foreground">
                        {moduleEntry.title}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {formatPercent(moduleEntry.percent_complete)}
                    </span>
                  </div>
                  <ProgressBar
                    value={moduleEntry.percent_complete}
                    label={`${moduleEntry.title} progress`}
                    valueText={`${formatPercent(moduleEntry.percent_complete)} — ${
                      moduleEntry.completed_current_lessons
                    } of ${moduleEntry.published_lesson_count} published lessons completed`}
                    tone={moduleEntry.needs_review_lessons > 0 ? "warning" : "default"}
                    size="sm"
                    className="mt-2"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      {formatLessonCounts(
                        moduleEntry.completed_current_lessons,
                        moduleEntry.published_lesson_count
                      )}{" "}
                      lessons
                    </span>
                    {moduleEntry.needs_review_lessons > 0 ? (
                      <span className="font-mono text-amber-600 dark:text-amber-300">
                        {moduleEntry.needs_review_lessons} needs review
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpenCheck className="h-4 w-4 text-violet-400" />
            Published lessons
          </CardTitle>
          <CardDescription className="text-xs">
            Curriculum order, as returned by the API. A completed lesson counts
            only for the lesson&rsquo;s current content version.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.lessons.length === 0 ? (
            <EmptyState
              icon={Lock}
              title="No published lessons"
              description="This course has no published lessons yet. Progress will appear here once content is published; nothing is simulated in the meantime."
            />
          ) : (
            <ul className="space-y-2">
              {data.lessons.map((lesson) => {
                const hint = completionStateHint(
                  lesson.status,
                  lesson.last_completed_version
                );
                return (
                  <li
                    key={lesson.lesson_id}
                    className="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface-elevated/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(lesson.sequence).padStart(2, "0")}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {lesson.title}
                        </span>
                        <CompletionStatusBadge status={lesson.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="font-mono">v{lesson.lesson_version}</span>
                        {lesson.status === "current" && lesson.completed_at ? (
                          <span>Completed {formatDateTime(lesson.completed_at)}</span>
                        ) : null}
                        {hint ? <span>{hint}</span> : null}
                      </div>
                    </div>
                    {lessonsReachable ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={lessonHref(lesson.lesson_id, enrollmentId)}>
                          <span>Open lesson</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="w-fit shrink-0 font-mono text-[9px] uppercase"
                      >
                        No lesson access
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
