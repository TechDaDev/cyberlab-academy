"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Library,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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
import { useApiResource } from "@/features/academics/use-api-resource";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import {
  CohortStatusBadge,
  EnrollmentStatusBadge,
} from "@/features/academics/cohorts/cohort-status-badge";
import { SummaryTile } from "@/features/academics/cohorts/cohort-controls";
import { StudentProgressPanel } from "@/features/academics/progress/student-progress-panel";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import type { ModulePublic } from "@/lib/types/academic";
import type { OwnEnrollmentCourse } from "@/lib/types/cohorts";
import { formatShortDate } from "@/lib/utils";

/**
 * One of the student's own enrollments.
 *
 * `GET /me/enrollments/{id}/course` answers `404` for an enrollment that belongs
 * to somebody else, so a guessed id reveals nothing. The response carries the
 * enrollment, the class and the course in one payload, which is what this screen
 * renders — no additional guesswork about class status.
 */
export function StudentEnrollment({ enrollmentId }: { enrollmentId: string }) {
  // Bumped by "Refresh" so the progress section re-reads the API in the same
  // gesture as the access record. Progress is never merged from cached values.
  const [progressNonce, setProgressNonce] = React.useState(0);

  const { data, error, loading, reload } = useApiResource<OwnEnrollmentCourse>(
    () => cohortsApi.getOwnEnrollmentCourse(enrollmentId),
    `own-enrollment:${enrollmentId}`
  );

  const { data: modules, error: modulesError } = useApiResource<ModulePublic[]>(
    () =>
      data
        ? academicApi.listCourseModules(data.course.id)
        : Promise.resolve<ModulePublic[]>([]),
    `enrollment-modules:${data?.course.id ?? "none"}`
  );

  const copy = describeCohortError(error, "student");

  if (loading && !data) {
    return <LoadingState label="Loading your class..." rows={3} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/learn">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to my classes</span>
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

  if (!data) return null;

  const { enrollment, cohort, course } = data;
  const enrollmentActive = enrollment.status === "active";
  const classActive = cohort.status === "active";
  const hasAccess = enrollmentActive && classActive;
  const publishedModules = (modules ?? []).filter(
    (entry) => entry.status === "published"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/learn">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to my classes</span>
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            reload();
            setProgressNonce((nonce) => nonce + 1);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh access</span>
        </Button>
      </div>

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {cohort.code}
            </Badge>
            <EnrollmentStatusBadge status={enrollment.status} />
            <CohortStatusBadge status={cohort.status} className="ml-auto" />
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{cohort.name}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {course.code} · {course.title} ({course.edition})
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Enrolled"
            value={formatShortDate(enrollment.enrolled_at)}
          />
          <SummaryTile
            label="Ended"
            value={enrollment.ended_at ? formatShortDate(enrollment.ended_at) : "—"}
          />
          <SummaryTile
            label="Lesson access"
            value={hasAccess ? "Granted" : "Not granted"}
            tone={hasAccess ? "success" : "warning"}
            hint="Requires an active enrollment in an active class."
          />
        </CardContent>
      </Card>

      {hasAccess ? (
        <Alert variant="success">
          <ShieldCheck />
          <AlertDescription>
            Your enrollment is active and the class is open. Published lessons of
            this course are readable; unpublished lessons stay hidden, and the API
            re-checks access on every request.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertDescription>
            {enrollment.status === "withdrawn"
              ? "This enrollment is withdrawn. The record and this page stay available for reference, but lesson bodies are not readable until a Manager or Administrator reactivates the enrollment."
              : `This class is ${cohort.status}. Lesson bodies are only readable while the class is active.`}
          </AlertDescription>
        </Alert>
      )}

      <StudentProgressPanel
        enrollmentId={enrollmentId}
        canReadLessons={hasAccess}
        refreshNonce={progressNonce}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-cyan-400" />
              Course curriculum
            </CardTitle>
            <CardDescription className="text-xs">
              Published modules only. Module pages list their published lessons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {modulesError ? (
              <p role="alert" className="text-[11px] text-red-400">
                Modules could not be loaded. {modulesError.detail}
              </p>
            ) : !modules ? (
              <p className="text-[11px] text-muted-foreground">Loading modules...</p>
            ) : publishedModules.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                This course has no published modules yet. Nothing is shown in their
                place.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {publishedModules.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/academics/modules/${entry.id}?enrollmentId=${encodeURIComponent(
                        enrollmentId
                      )}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-elevated/30 px-3 py-2 text-sm text-foreground transition-colors hover:border-cyan-500/40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(entry.sequence).padStart(2, "0")}
                        </span>
                        <span className="truncate">{entry.title}</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Library className="h-4 w-4 text-violet-400" />
                Course catalog
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href={`/academics/courses/${course.id}`}>
                  <span>Course overview</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="w-full">
                <Link href="/academics">
                  <span>All published courses</span>
                </Link>
              </Button>
            </CardContent>
          </Card>

          <p className="rounded-xl border border-border/70 bg-surface/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Withdrawn is not the same as deleted: the enrollment record remains, and
            losing access never leaves lesson text on screen — this page refetches
            the enrollment on every visit.
          </p>
        </div>
      </div>
    </div>
  );
}
