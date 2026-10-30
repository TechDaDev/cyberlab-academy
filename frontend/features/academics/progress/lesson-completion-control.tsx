"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
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
import { ErrorState, LoadingState } from "@/components/shared/states";
import {
  CompletionStatusBadge,
  completionStateHint,
} from "@/features/academics/progress/completion-status-badge";
import {
  describeCompletionError,
  describeProgressError,
} from "@/features/academics/progress/progress-errors";
import { useSessionGuard } from "@/features/academics/progress/progress-session";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useToast } from "@/hooks/use-toast";
import { progressApi } from "@/lib/api/progress";
import type { ApiError } from "@/lib/api/errors";
import {
  COMPLETION_STATE_LABELS,
  formatPercent,
  isEnrollmentProgress,
  type CompletionResponse,
  type EnrollmentProgress,
} from "@/lib/types/progress";
import { formatDateTime } from "@/lib/utils";

/**
 * "Mark Lesson Complete" for one lesson inside one enrollment.
 *
 * Rules this control is built around:
 *
 * - **Explicit context only.** Completion is recorded against an enrollment, so
 *   the caller must pass the `enrollmentId` it came from. Nothing here guesses an
 *   enrollment or picks the first one: without context the lesson body still
 *   renders, but no mutation is offered.
 * - **The query parameter is not authorization.** The id is used to *read* the
 *   enrollment's own progress, which the API answers only for the caller's own
 *   enrollment, and it must list this lesson. A lesson from another course, or an
 *   enrollment that is not the student's, produces no button.
 * - **No version plumbing.** The body is always `{ completed: true }`; the server
 *   stamps the lesson's current content version. A `needs_review` lesson is
 *   re-completed through the same call.
 * - **No un-complete.** There is no toggle and no undo: completion is evidence.
 * - **Both 2xx outcomes are success.** `newly_recorded` distinguishes a new record
 *   from an idempotent repeat, and neither is reported as an error.
 */
export function LessonCompletionControl({
  lessonId,
  enrollmentId,
}: {
  lessonId: string;
  /** From `?enrollmentId=` — never inferred. */
  enrollmentId: string | null;
}) {
  if (!enrollmentId) {
    return <MissingEnrollmentContext />;
  }
  return (
    <EnrollmentCompletionControl lessonId={lessonId} enrollmentId={enrollmentId} />
  );
}

/**
 * The student arrived without enrollment context (e.g. from a module page).
 *
 * The lesson body is still visible — that read is gated on the class relationship
 * by the API — but completion stays unavailable, because completing "some
 * enrollment" would silently credit the wrong class.
 */
function MissingEnrollmentContext() {
  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4 text-amber-400" />
          Completion needs a class
        </CardTitle>
        <CardDescription className="text-xs">
          No enrollment was selected for this lesson.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Lesson completion is recorded per enrollment, so the class has to be
          explicit. Open this lesson from one of your classes to see the completion
          controls; completion is never recorded against a guessed or
          first-found enrollment.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/academics/learn">
            <span>Back to my classes</span>
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EnrollmentCompletionControl({
  lessonId,
  enrollmentId,
}: {
  lessonId: string;
  enrollmentId: string;
}) {
  const { sessionKey, isStale } = useSessionGuard();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<ApiError | null>(null);
  const [result, setResult] = React.useState<CompletionResponse | null>(null);

  const { data, error, loading, refreshing, reload } =
    useApiResource<EnrollmentProgress>(
      () => progressApi.getOwnProgress(enrollmentId),
      `lesson-completion:${sessionKey}:${enrollmentId}:${lessonId}`
    );

  const lessonEntry = data?.lessons.find((entry) => entry.lesson_id === lessonId);
  const activeEnrollment =
    data?.enrollment_status === "active" && data?.cohort_status === "active";

  const handleComplete = async () => {
    // Guards: one request at a time, and only for a lesson this enrollment knows.
    if (submitting || !lessonEntry || !activeEnrollment) return;
    const capturedSession = sessionKey;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await progressApi.completeLesson(enrollmentId, lessonId);
      if (isStale(capturedSession)) return;
      setResult(response);
      toast({
        variant: "success",
        title: response.newly_recorded ? "Lesson completed" : "Already completed",
        description: response.newly_recorded
          ? `Recorded against version ${response.lesson_version}.`
          : `Version ${response.lesson_version} was already completed; the original timestamp is kept.`,
      });
      reload();
    } catch (err) {
      if (isStale(capturedSession)) return;
      setSubmitError(err instanceof Error ? (err as ApiError) : null);
    } finally {
      if (!isStale(capturedSession)) setSubmitting(false);
    }
  };

  if (loading && !data) {
    return <LoadingState label="Loading your progress for this lesson..." rows={2} />;
  }

  if (error) {
    const copy = describeProgressError(error, "student");
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
        description="The backend answered, but without the progress record this control needs. Completion is not offered, so nothing can be recorded by mistake."
        onRetry={reload}
      />
    );
  }

  // The enrollment's progress lists only the published lessons of *its* course,
  // so a missing entry means this lesson is not part of this enrollment.
  if (!lessonEntry) {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription className="text-xs">
          This lesson is not part of the course for the selected enrollment, so no
          completion can be recorded here. Nothing is shown as completed.
        </AlertDescription>
      </Alert>
    );
  }

  const hint = completionStateHint(lessonEntry.status, lessonEntry.last_completed_version);
  const completionError = describeCompletionError(submitError);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDashed className="h-4 w-4 text-cyan-400" />
            Your progress for this lesson
          </CardTitle>
          <CardDescription className="text-xs">
            Self-reported study progress for this class — not a grade or a
            competency score.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <CompletionStatusBadge status={lessonEntry.status} />
          <Badge variant="outline" className="font-mono text-[10px]">
            v{lessonEntry.lesson_version}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Enrollment progress {formatPercent(data.percent_complete)} (
            {data.completed_current_lessons} / {data.total_published_lessons}{" "}
            published lessons)
          </span>
          {lessonEntry.status === "current" && lessonEntry.completed_at ? (
            <span className="font-mono">
              Completed {formatDateTime(lessonEntry.completed_at)}
            </span>
          ) : null}
        </p>

        {hint ? (
          <Alert variant={lessonEntry.status === "needs_review" ? "warning" : "default"}>
            <RefreshCw />
            <AlertDescription className="text-xs">{hint}</AlertDescription>
          </Alert>
        ) : null}

        {!activeEnrollment ? (
          <Alert variant="warning">
            <ShieldAlert />
            <AlertDescription className="text-xs">
              {data.enrollment_status === "withdrawn"
                ? "This enrollment is withdrawn. Recorded progress is shown as history, but you are no longer eligible to mark lessons complete."
                : `This class is ${data.cohort_status}, so new completions cannot be recorded.`}
            </AlertDescription>
          </Alert>
        ) : null}

        {submitError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription className="text-xs">
              <span className="font-medium">{completionError.title}. </span>
              {completionError.description}
            </AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <p
            role="status"
            className="flex items-start gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {result.newly_recorded
                ? "Completion recorded"
                : "This version was already completed — the original timestamp is kept"}
              {` · version ${result.lesson_version} · ${formatDateTime(
                result.completed_at
              )}`}
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {lessonEntry.status === "current" ? (
            <p className="text-[11px] text-muted-foreground">
              This lesson is complete for its current version. Completion cannot be
              undone here; if the lesson content changes, it moves to{" "}
              {COMPLETION_STATE_LABELS.needs_review.toLowerCase()} and can be
              completed again.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleComplete}
              disabled={submitting || !activeEnrollment}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>{submitting ? "Recording completion..." : "Mark Lesson Complete"}</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reload}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            <span>Refresh progress</span>
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Completion records the lesson&rsquo;s current content version, chosen by
          the server. When a lesson is edited, an earlier completion becomes{" "}
          {COMPLETION_STATE_LABELS.needs_review.toLowerCase()} and stops counting
          until you review it again.
        </p>
      </CardContent>
    </Card>
  );
}
