"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  FolderPlus,
  GraduationCap,
  RefreshCw,
  Users,
} from "lucide-react";
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
import { describeAcademicError } from "@/features/academics/error-message";
import { useApiResource } from "@/features/academics/use-api-resource";
import { CohortCreateDialog } from "@/features/academics/cohorts/cohort-create-dialog";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { CohortStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import {
  PaginationBar,
  SummaryTile,
  ToolbarSelect,
} from "@/features/academics/cohorts/cohort-controls";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import {
  COHORT_STATUSES,
  COHORT_STATUS_LABELS,
  type CohortPublic,
  type PageCohorts,
} from "@/lib/types/cohorts";
import type { PageCourses } from "@/lib/types/academic";
import { formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 20;

/**
 * Administrator/Manager class directory.
 *
 * Server-side filtering (`course_id`, `status`) and `limit`/`offset` paging are
 * used directly instead of filtering a downloaded list, so a class outside the
 * current page can still be found.
 */
export function CohortManager() {
  const [offset, setOffset] = React.useState(0);
  const [courseFilter, setCourseFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data, error, loading, reload } = useApiResource<PageCohorts>(
    () =>
      cohortsApi.listCohorts({
        courseId: courseFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    `admin-cohorts:${courseFilter}:${statusFilter}:${offset}`
  );

  const {
    data: coursePage,
    error: coursesError,
  } = useApiResource<PageCourses>(
    () => academicApi.listAdminCourses(100, 0),
    "cohort-manager-courses"
  );

  const courses = React.useMemo(() => coursePage?.items ?? [], [coursePage]);
  const courseById = React.useMemo(() => {
    const map = new Map<string, PageCourses["items"][number]>();
    for (const course of courses) map.set(course.id, course);
    return map;
  }, [courses]);

  const copy = describeCohortError(error, "manager");
  const courseCopy = describeAcademicError(coursesError);

  const applyFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setOffset(0);
  };

  const handleCreated = () => {
    setOffset(0);
    reload();
  };

  const items = data?.items ?? [];
  const activeCount = items.filter((c) => c.status === "active").length;
  const draftCount = items.filter((c) => c.status === "draft").length;
  const instructors = items.reduce((sum, c) => sum + c.active_instructor_count, 0);
  const learners = items.reduce((sum, c) => sum + c.active_enrollment_count, 0);

  return (
    <div className="space-y-6">
      <Card className="cyber-panel">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-4 w-4 text-cyan-400" />
              Classes &amp; Cohorts
            </CardTitle>
            <CardDescription>
              A class binds one course to an instructor and a student roster.
              Lifecycle changes are applied one step at a time and never through a
              metadata edit.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              aria-label="Refresh class list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>New class</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <ToolbarSelect
              label="Course"
              value={courseFilter}
              onChange={applyFilter(setCourseFilter)}
              allLabel="All courses"
              options={courses.map((course) => ({
                value: course.id,
                label: `${course.code} · ${course.title}`,
              }))}
            />
            <ToolbarSelect
              label="Status"
              value={statusFilter}
              onChange={applyFilter(setStatusFilter)}
              allLabel="All statuses"
              options={COHORT_STATUSES.map((status) => ({
                value: status,
                label: COHORT_STATUS_LABELS[status],
              }))}
            />
            {coursesError ? (
              <p className="text-[11px] text-amber-400" role="status">
                {courseCopy.title}: course labels may be unavailable.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryTile label="Classes (page)" value={items.length} />
            <SummaryTile label="Active (page)" value={activeCount} tone="success" />
            <SummaryTile label="Drafts (page)" value={draftCount} tone="warning" />
            <SummaryTile
              label="Assigned / enrolled"
              value={`${instructors} / ${learners}`}
              tone="info"
              hint="Live assignments and active enrollments on this page."
            />
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <LoadingState label="Loading class records..." rows={4} />
      ) : error ? (
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={
            courseFilter || statusFilter
              ? "No classes match these filters"
              : "No classes exist yet"
          }
          description={
            courseFilter || statusFilter
              ? "Clear the course or status filter to see the whole directory. Filters are applied by the API, so a match on another page would still be listed here."
              : "Create a draft class from an existing course. A class needs a published course and at least one assigned instructor before it can be activated."
          }
          actionLabel={
            courseFilter || statusFilter ? undefined : "Create draft class"
          }
          onAction={
            courseFilter || statusFilter ? undefined : () => setCreateOpen(true)
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Class directory</CardTitle>
            <CardDescription className="text-xs">
              Status changes only through the activate, complete and archive
              actions on each class page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Classes with course association, status and live counts
                </caption>
                <thead>
                  <tr className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Class
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Course
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Instructors
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Students
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Window
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((cohort) => (
                    <CohortRow
                      key={cohort.id}
                      cohort={cohort}
                      course={courseById.get(cohort.course_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              limit={data?.limit ?? PAGE_SIZE}
              offset={data?.offset ?? offset}
              total={data?.total ?? items.length}
              shown={items.length}
              onChange={setOffset}
              itemLabel="classes"
            />
          </CardContent>
        </Card>
      )}

      <CohortCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

function CohortRow({
  cohort,
  course,
}: {
  cohort: CohortPublic;
  course?: { code: string; title: string; status: "draft" | "published" | "archived" };
}) {
  return (
    <tr className="border-b border-border/40 align-top last:border-0">
      <td className="py-3 pr-3">
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-fit font-mono text-[10px]">
            {cohort.code}
          </Badge>
          <span className="font-medium text-foreground">{cohort.name}</span>
        </div>
      </td>
      <td className="py-3 pr-3">
        {course ? (
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-cyan-500 dark:text-cyan-300">
              {course.code}
            </span>
            <span className="text-xs text-muted-foreground">{course.title}</span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">
            {cohort.course_id}
          </span>
        )}
      </td>
      <td className="py-3 pr-3">
        <CohortStatusBadge status={cohort.status} />
      </td>
      <td className="py-3 pr-3 text-right">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {cohort.active_instructor_count}
        </span>
      </td>
      <td className="py-3 pr-3 text-right">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground">
          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
          {cohort.active_enrollment_count}
        </span>
      </td>
      <td className="py-3 pr-3">
        <span className="font-mono text-[10px] text-muted-foreground">
          {cohort.starts_at ? formatShortDate(cohort.starts_at) : "no start"} →{" "}
          {cohort.ends_at ? formatShortDate(cohort.ends_at) : "open"}
        </span>
      </td>
      <td className="py-3 text-right">
        <Button asChild size="sm" variant="outline">
          <Link href={`/academics/manage/cohorts/${cohort.id}`}>
            <span>Manage</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}
