"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  MailCheck,
  MailX,
  RefreshCw,
  Users,
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
import { useApiResource } from "@/features/academics/use-api-resource";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { EnrollmentStatusBadge, CohortStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { PaginationBar, SummaryTile } from "@/features/academics/cohorts/cohort-controls";
import { ClassProgressPanel } from "@/features/academics/progress/class-progress-panel";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import type { ModulePublic, PageCourses } from "@/lib/types/academic";
import type { CohortPublic, PageRoster } from "@/lib/types/cohorts";
import { formatShortDate } from "@/lib/utils";

const ROSTER_PAGE_SIZE = 20;

/**
 * One assigned class, from the instructor's point of view.
 *
 * Read-only by design: instructors can see the roster, the course curriculum and
 * the class progress report (`GET /instructor/cohorts/{id}/progress`), but cannot
 * publish content, change enrollments or alter a student's completion. A `404` here means the
 * assignment is not live (or was removed), which is exactly the state after an
 * assignment is withdrawn, so no cached roster is kept.
 */
export function TeachingCohort({ cohortId }: { cohortId: string }) {
  const [offset, setOffset] = React.useState(0);

  const { data: cohort, error, loading, reload } = useApiResource<CohortPublic>(
    () => cohortsApi.getTeachingCohort(cohortId),
    `teaching-cohort:${cohortId}`
  );

  const roster = useApiResource<PageRoster>(
    () => cohortsApi.listCohortRoster(cohortId, ROSTER_PAGE_SIZE, offset),
    `teaching-roster:${cohortId}:${offset}`
  );

  const { data: coursePage } = useApiResource<PageCourses>(
    () => academicApi.listCourses(100, 0),
    "teaching-catalog"
  );

  const course = coursePage?.items.find((entry) => entry.id === cohort?.course_id);

  const { data: modules, error: modulesError } = useApiResource<ModulePublic[]>(
    () =>
      course
        ? academicApi.listCourseModules(course.id)
        : Promise.resolve<ModulePublic[]>([]),
    `teaching-modules:${course?.id ?? "none"}`
  );

  const publishedModules = (modules ?? []).filter(
    (entry) => entry.status === "published"
  );

  const copy = describeCohortError(error, "instructor");
  const rosterCopy = describeCohortError(roster.error, "instructor");

  const refreshAll = () => {
    reload();
    roster.reload();
  };

  if (loading && !cohort) {
    return <LoadingState label="Verifying class assignment..." rows={3} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/teach">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to assigned classes</span>
          </Link>
        </Button>
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
      </div>
    );
  }

  if (!cohort) return null;

  const rosterItems = roster.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/teach">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to assigned classes</span>
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {cohort.code}
            </Badge>
            <CohortStatusBadge status={cohort.status} />
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{cohort.name}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {course ? `${course.code} · ${course.title}` : "Course is not published."}{" "}
              · {cohort.starts_at ? formatShortDate(cohort.starts_at) : "no start"} →{" "}
              {cohort.ends_at ? formatShortDate(cohort.ends_at) : "open ended"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Active enrollments"
            value={cohort.active_enrollment_count}
            tone="info"
          />
          <SummaryTile
            label="Live instructors"
            value={cohort.active_instructor_count}
          />
          <SummaryTile
            label="Curriculum modules"
            value={modules ? publishedModules.length : "—"}
            hint="Published course modules visible through the catalog."
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-teal-400" />
              Class roster
            </CardTitle>
            <CardDescription className="text-xs">
              Enrollments in this class only. Withdrawn students keep a record but
              no lesson access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roster.loading && !roster.data ? (
              <LoadingState label="Loading roster..." rows={3} />
            ) : roster.error ? (
              <ErrorState
                title={rosterCopy.title}
                description={rosterCopy.description}
                onRetry={rosterCopy.retryable ? roster.reload : undefined}
              />
            ) : rosterItems.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students enrolled"
                description="A Manager or Administrator enrolls students into an active class. Instructors cannot add or remove enrollments."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Enrolled students with verification and enrollment status
                    </caption>
                    <thead>
                      <tr className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Student
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Email
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Status
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Enrolled
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterItems.map((entry) => (
                        <tr
                          key={entry.user_id}
                          className="border-b border-border/40 align-middle last:border-0"
                        >
                          <td className="py-2.5 pr-3 font-medium text-foreground">
                            {entry.full_name}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                              {entry.email_verified ? (
                                <MailCheck className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <MailX className="h-3.5 w-3.5 text-amber-400" />
                              )}
                              {entry.email}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <EnrollmentStatusBadge status={entry.status} />
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-muted-foreground">
                            {new Date(entry.enrolled_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  limit={roster.data?.limit ?? ROSTER_PAGE_SIZE}
                  offset={roster.data?.offset ?? offset}
                  total={roster.data?.total ?? rosterItems.length}
                  shown={rosterItems.length}
                  onChange={setOffset}
                  itemLabel="students"
                />
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-cyan-400" />
                Course curriculum
              </CardTitle>
              <CardDescription className="text-xs">
                Read-only. Publishing curriculum is a content-management action, not
                an instructor one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {course ? (
                <>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link href={`/academics/courses/${course.id}`}>
                      <span>Open course overview</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {modulesError ? (
                    <p role="alert" className="text-[11px] text-red-400">
                      Modules could not be loaded. {modulesError.detail}
                    </p>
                  ) : publishedModules.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      This course has no published modules yet.
                    </p>
                  ) : (
                    <ol className="space-y-1.5">
                      {publishedModules.map((entry) => (
                        <li key={entry.id}>
                          <Link
                            href={`/academics/modules/${entry.id}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-elevated/30 px-3 py-2 text-xs text-foreground transition-colors hover:border-cyan-500/40"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {String(entry.sequence).padStart(2, "0")}
                              </span>
                              <span className="truncate">{entry.title}</span>
                            </span>
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px] uppercase"
                            >
                              {entry.status}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  The course for this class is not in the published catalog. Lesson
                  access requires a published course, so no curriculum links are
                  offered here.
                </p>
              )}
            </CardContent>
          </Card>

          <Alert variant="info">
            <AlertDescription className="text-xs">
              Instructors do not have global publish rights and cannot record,
              change or reset a student&rsquo;s completion. Grading, attendance and
              certificates do not exist in the API, so this screen offers none of
              them.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <ClassProgressPanel cohortId={cohortId} surface="instructor" />
    </div>
  );
}
