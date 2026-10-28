"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronRight,
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
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useApiResource } from "@/features/academics/use-api-resource";
import { CohortEnrollmentPanel } from "@/features/academics/cohorts/cohort-enrollment-panel";
import { CohortInstructorPanel } from "@/features/academics/cohorts/cohort-instructor-panel";
import { CohortLifecyclePanel } from "@/features/academics/cohorts/cohort-lifecycle-panel";
import { CohortMetadataForm } from "@/features/academics/cohorts/cohort-metadata-form";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { CohortStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { SummaryTile } from "@/features/academics/cohorts/cohort-controls";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import type { PageCourses } from "@/lib/types/academic";
import type { CohortPublic } from "@/lib/types/cohorts";
import { formatShortDate } from "@/lib/utils";

/**
 * One class, managed.
 *
 * Everything on this screen is scoped to the class in the URL: metadata, the
 * lifecycle path, instructor assignments and the enrollment roster. Mutating a
 * section reloads the record so the header counts shown here can never drift away
 * from the authoritative values the API returns.
 */
export function CohortDetail({ cohortId }: { cohortId: string }) {
  const { data, error, loading, reload } = useApiResource<CohortPublic>(
    () => cohortsApi.getCohort(cohortId),
    `admin-cohort:${cohortId}`
  );

  const { data: coursePage, error: coursesError } = useApiResource<PageCourses>(
    () => academicApi.listAdminCourses(100, 0),
    "cohort-detail-courses"
  );

  // A mutation response is the newest record this screen has seen; it wins over
  // the last list fetch until the next reload replaces it.
  const [patched, setPatched] = React.useState<CohortPublic | null>(null);
  const cohort = patched && patched.id === cohortId ? patched : data;

  const course = coursePage?.items.find(
    (entry) => entry.id === cohort?.course_id
  );
  const courseKnown = Boolean(coursePage);
  const coursePublished = course?.status === "published";

  const copy = describeCohortError(error, "manager");

  const handleRecordChanged = (updated: CohortPublic) => {
    setPatched(updated);
    reload();
  };

  const handleCountsChanged = () => {
    setPatched(null);
    reload();
  };

  if (loading && !cohort) {
    return <LoadingState label="Loading class record..." rows={4} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/manage/cohorts">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to classes</span>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/manage/cohorts">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to classes</span>
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              {cohort.code}
            </Badge>
            <CohortStatusBadge status={cohort.status} />
            <Badge variant="outline" className="font-mono text-[10px]">
              Cohort {cohort.id.slice(0, 8)}
            </Badge>
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{cohort.name}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                {cohort.starts_at ? formatShortDate(cohort.starts_at) : "No start"} →{" "}
                {cohort.ends_at ? formatShortDate(cohort.ends_at) : "open ended"}
              </span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Live instructors"
            value={cohort.active_instructor_count}
            tone={cohort.active_instructor_count > 0 ? "success" : "warning"}
          />
          <SummaryTile
            label="Active enrollments"
            value={cohort.active_enrollment_count}
            tone="info"
          />
          <div className="rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Course
            </p>
            {course ? (
              <>
                <p className="mt-1 font-mono text-sm font-semibold text-cyan-500 dark:text-cyan-300">
                  {course.code}
                </p>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {course.title} · {course.status}
                </p>
              </>
            ) : (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {courseKnown ? "Not in catalog" : "Unavailable"}
              </p>
            )}
          </div>
          <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Course workspace
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/academics/manage/courses/${cohort.course_id}`}>
                <BookOpen className="h-3.5 w-3.5" />
                <span>Open curriculum</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {coursesError ? (
        <p role="status" className="text-[11px] text-amber-400">
          Course metadata could not be loaded, so activation prerequisites are
          unverified here. The API still enforces them.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <CohortLifecyclePanel
          cohort={cohort}
          coursePublished={coursePublished}
          courseKnown={courseKnown}
          onChanged={handleRecordChanged}
        />
        <CohortMetadataForm
          cohort={cohort}
          courseLabel={course ? `${course.code} · ${course.title}` : undefined}
          onSaved={handleRecordChanged}
          disabled={false}
        />
      </div>

      <CohortInstructorPanel cohort={cohort} onCohortChanged={handleCountsChanged} />

      <CohortEnrollmentPanel cohort={cohort} onCohortChanged={handleCountsChanged} />

      <aside className="rounded-xl border border-border/70 bg-surface/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Users className="h-3.5 w-3.5 text-cyan-400" />
          What this screen does not do
        </p>
        <p className="mt-1">
          There is no grading, attendance or progress tracking: those capabilities
          do not exist in the API, and nothing here fabricates them. Class records
          are never replaced with demonstration data — if the backend is
          unreachable the screen says so.
        </p>
      </aside>
    </div>
  );
}
