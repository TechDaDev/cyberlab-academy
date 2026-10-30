"use client";

import * as React from "react";
import { BarChart3, ClipboardCheck, RefreshCw, Users } from "lucide-react";
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
import { PaginationBar, SummaryTile } from "@/features/academics/cohorts/cohort-controls";
import { EnrollmentStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { describeProgressError } from "@/features/academics/progress/progress-errors";
import { useProgressSessionKey } from "@/features/academics/progress/progress-session";
import { useApiResource } from "@/features/academics/use-api-resource";
import { progressApi } from "@/lib/api/progress";
import {
  PROGRESS_PAGE_LIMITS,
  formatPercent,
  isClassProgress,
  type ClassProgress,
} from "@/lib/types/progress";

const PAGE_SIZE = PROGRESS_PAGE_LIMITS.limitDefault;

/**
 * Class progress report, shared by the instructor and manager surfaces.
 *
 * `GET /api/v1/instructor/cohorts/{id}/progress` and its `/admin/` twin return the
 * same `ClassProgress` payload, so one component serves both and `surface` only
 * selects the endpoint and the error copy. Neither surface can mutate anything
 * here: completion is recorded by the student, and there is no override, no grade
 * and no attendance control because none exists in the API.
 *
 * The class average is the backend's whole-class figure. It is computed over
 * **every** active enrollment before pagination, so it deliberately does not
 * change when the operator pages through students, and the panel never averages
 * the visible rows.
 */
export function ClassProgressPanel({
  cohortId,
  surface,
}: {
  cohortId: string;
  /** `instructor` reads the assigned-class endpoint; `manager` the admin one. */
  surface: "instructor" | "manager";
}) {
  const [offset, setOffset] = React.useState(0);
  const sessionKey = useProgressSessionKey();

  const { data, error, loading, refreshing, reload } = useApiResource<ClassProgress>(
    () =>
      surface === "instructor"
        ? progressApi.getInstructorClassProgress(cohortId, PAGE_SIZE, offset)
        : progressApi.getAdminClassProgress(cohortId, PAGE_SIZE, offset),
    `class-progress:${surface}:${sessionKey}:${cohortId}:${offset}`
  );

  const copy = describeProgressError(error, surface);
  // A report payload always carries a page of students. Anything else (a proxy or
  // backend that answered with a different record) is treated as unreadable rather
  // than dereferenced, so the panel degrades to an honest message.
  const page = isClassProgress(data) ? data.students : null;
  const students = page?.items ?? [];
  const needsReview = students.some((entry) => entry.needs_review_lessons > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Learning progress
          </CardTitle>
          <CardDescription className="text-xs">
            Self-reported learning progress: published lessons each student has
            marked as reviewed. These are not grades, and they are not a competency
            score.
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
        {loading && !data ? (
          <LoadingState label="Loading class progress..." rows={3} />
        ) : error ? (
          <ErrorState
            title={copy.title}
            description={copy.description}
            onRetry={copy.retryable ? reload : undefined}
          />
        ) : !data || !page ? (
          <ErrorState
            title="Class progress format not recognised"
            description="The backend answered, but without the class progress report this screen expects. No numbers are shown rather than guessed."
            onRetry={reload}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile
                label="Active students"
                value={data.total_active_enrollments}
                tone="info"
                hint="Withdrawn enrollments are excluded here and from the class average."
              />
              <SummaryTile
                label="Rows in report"
                value={data.total_visible_enrollments}
                hint="Active and withdrawn rows this report can page through."
              />
              <SummaryTile
                label="Published lessons"
                value={data.total_published_lessons}
                hint="Only published lessons count towards completion."
              />
              <div className="rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Class average
                </p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">
                  {formatPercent(data.average_percent_complete)}
                </p>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Whole-class mean of active enrollments, computed by the API.
                </p>
              </div>
            </div>

            <ProgressBar
              value={data.average_percent_complete}
              label="Class average progress"
              valueText={`${formatPercent(
                data.average_percent_complete
              )} average across ${data.total_active_enrollments} active enrollments`}
              tone={needsReview ? "warning" : "default"}
            />

            {data.cohort_status !== "active" ? (
              <Alert variant="info">
                <ClipboardCheck />
                <AlertDescription className="text-xs">
                  This class is {data.cohort_status}. Recorded completion stays
                  readable as history; students cannot record new completions while
                  the class is not active.
                </AlertDescription>
              </Alert>
            ) : null}

            {data.total_published_lessons === 0 ? (
              <Alert variant="warning">
                <ClipboardCheck />
                <AlertDescription className="text-xs">
                  This course has no published lessons, so every student reports 0
                  of 0 lessons and 0.0%. Total lessons are the published curriculum
                  only — planned-but-unwritten modules are never used as a
                  denominator.
                </AlertDescription>
              </Alert>
            ) : null}

            {students.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students in this class"
                description="A Manager or Administrator enrolls students into an active class. No placeholder rows are shown."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Self-reported learning progress for each student in this class
                    </caption>
                    <thead>
                      <tr className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Student
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Enrollment
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Completed
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Needs review
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Progress
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => (
                        <tr
                          key={student.enrollment_id}
                          className={
                            student.enrollment_status === "withdrawn"
                              ? "border-b border-border/40 align-middle text-muted-foreground last:border-0"
                              : "border-b border-border/40 align-middle last:border-0"
                          }
                        >
                          <td className="py-2.5 pr-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {student.student_full_name}
                              </span>
                              {student.enrollment_status === "withdrawn" ? (
                                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-300">
                                  Excluded from class average
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <EnrollmentStatusBadge status={student.enrollment_status} />
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-xs text-foreground">
                            {student.completed_current_lessons} /{" "}
                            {student.total_published_lessons}
                          </td>
                          <td className="py-2.5 pr-3">
                            {student.needs_review_lessons > 0 ? (
                              <Badge
                                variant="warning"
                                className="font-mono text-[10px] uppercase"
                              >
                                {student.needs_review_lessons}
                              </Badge>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">
                                0
                              </span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <div className="flex min-w-[8rem] items-center gap-2">
                              <ProgressBar
                                value={student.percent_complete}
                                label={`${student.student_full_name} progress`}
                                valueText={`${formatPercent(
                                  student.percent_complete
                                )} — ${student.completed_current_lessons} of ${
                                  student.total_published_lessons
                                } published lessons`}
                                size="sm"
                                tone={
                                  student.needs_review_lessons > 0
                                    ? "warning"
                                    : "default"
                                }
                              />
                              <span className="font-mono text-xs text-foreground">
                                {formatPercent(student.percent_complete)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  limit={page.limit}
                  offset={page.offset}
                  total={page.total}
                  shown={students.length}
                  onChange={setOffset}
                  itemLabel="students"
                />
              </>
            )}

            <Alert variant="info">
              <AlertDescription className="text-xs">
                Read-only reporting. {surface === "instructor" ? "Instructors" : "Managers"}{" "}
                cannot record, edit or reset a student&rsquo;s completion, and lesson
                bodies and student emails are not part of this report.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
