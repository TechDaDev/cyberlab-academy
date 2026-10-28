"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
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
import { useApiResource } from "@/features/academics/use-api-resource";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { CohortStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { PaginationBar } from "@/features/academics/cohorts/cohort-controls";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import type { PageCourses } from "@/lib/types/academic";
import type { PageCohorts } from "@/lib/types/cohorts";
import { formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 20;

/**
 * Instructor teaching workspace.
 *
 * `GET /instructor/cohorts` returns only classes with a live assignment, so this
 * list is the complete set of classes the signed-in instructor may see — there is
 * no "all classes" view to fall back to.
 */
export function TeachingOverview() {
  const [offset, setOffset] = React.useState(0);

  const { data, error, loading, reload } = useApiResource<PageCohorts>(
    () => cohortsApi.listTeachingCohorts(PAGE_SIZE, offset),
    `teaching-cohorts:${offset}`
  );

  const { data: coursePage } = useApiResource<PageCourses>(
    () => academicApi.listCourses(100, 0),
    "teaching-courses"
  );

  const courseById = React.useMemo(() => {
    const map = new Map<string, PageCourses["items"][number]>();
    for (const course of coursePage?.items ?? []) map.set(course.id, course);
    return map;
  }, [coursePage]);

  const copy = describeCohortError(error, "instructor");
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <Card className="cyber-panel">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-4 w-4 text-teal-400" />
              Assigned classes
            </CardTitle>
            <CardDescription>
              Classes with a live assignment to your account. Removing an
              assignment revokes this view immediately.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </CardHeader>
      </Card>

      {loading && !data ? (
        <LoadingState label="Loading assigned classes..." rows={3} />
      ) : error ? (
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes assigned"
          description="A Manager or Administrator must assign you to a class before you can read its roster or open its lesson content."
        />
      ) : (
        <section aria-labelledby="teaching-classes-heading" className="space-y-3">
          <h2
            id="teaching-classes-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            {data?.total ?? items.length} assigned class
            {(data?.total ?? items.length) === 1 ? "" : "es"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((cohort) => {
              const course = courseById.get(cohort.course_id);
              return (
                <Card key={cohort.id} className="cyber-panel-interactive">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {cohort.code}
                      </Badge>
                      <CohortStatusBadge status={cohort.status} className="ml-auto" />
                    </div>
                    <CardTitle className="pt-1 text-base leading-tight">
                      {cohort.name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {course
                        ? `${course.code} · ${course.title}`
                        : "Course is not in the published catalog."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <dl className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-md border border-border/60 bg-surface-elevated/30 px-2 py-1.5">
                        <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          Students
                        </dt>
                        <dd className="font-mono text-sm font-semibold text-foreground">
                          {cohort.active_enrollment_count}
                        </dd>
                      </div>
                      <div className="rounded-md border border-border/60 bg-surface-elevated/30 px-2 py-1.5">
                        <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          Starts
                        </dt>
                        <dd className="font-mono text-[11px] font-semibold text-foreground">
                          {cohort.starts_at ? formatShortDate(cohort.starts_at) : "TBD"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {cohort.active_instructor_count} instructor
                        {cohort.active_instructor_count === 1 ? "" : "s"}
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/academics/teach/${cohort.id}`}>
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Open class</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <PaginationBar
            limit={data?.limit ?? PAGE_SIZE}
            offset={data?.offset ?? offset}
            total={data?.total ?? items.length}
            shown={items.length}
            onChange={setOffset}
            itemLabel="classes"
          />
        </section>
      )}
    </div>
  );
}
