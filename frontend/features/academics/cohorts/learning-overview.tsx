"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  GraduationCap,
  Library,
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
import { useApiResource } from "@/features/academics/use-api-resource";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import {
  CohortStatusBadge,
  EnrollmentStatusBadge,
} from "@/features/academics/cohorts/cohort-status-badge";
import { PaginationBar, SummaryTile } from "@/features/academics/cohorts/cohort-controls";
import { cohortsApi } from "@/lib/api/cohorts";
import type { PageStudentEnrollments } from "@/lib/types/cohorts";
import { formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 20;

/**
 * Student enrollment list.
 *
 * `GET /me/enrollments` is scoped to the signed-in account by the API, so this
 * view cannot show another learner's records even if an id is guessed. Withdrawn
 * enrollments stay listed — they are history, not access — and are labelled as
 * such rather than hidden.
 */
export function LearningOverview() {
  const [offset, setOffset] = React.useState(0);

  const { data, error, loading, reload } = useApiResource<PageStudentEnrollments>(
    () => cohortsApi.listOwnEnrollments(PAGE_SIZE, offset),
    `my-enrollments:${offset}`
  );

  const copy = describeCohortError(error, "student");
  const items = data?.items ?? [];
  const active = items.filter((entry) => entry.status === "active").length;
  const withdrawn = items.filter((entry) => entry.status === "withdrawn").length;

  return (
    <div className="space-y-6">
      <Card className="cyber-panel">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-4 w-4 text-cyan-400" />
              My classes
            </CardTitle>
            <CardDescription>
              Every class you are enrolled in. Lesson content unlocks only while an
              enrollment is active and its class is active.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Enrollments (page)" value={items.length} />
          <SummaryTile label="Active" value={active} tone="success" />
          <SummaryTile
            label="Withdrawn"
            value={withdrawn}
            tone={withdrawn > 0 ? "warning" : "default"}
            hint="Retained records without lesson access."
          />
        </CardContent>
      </Card>

      {loading && !data ? (
        <LoadingState label="Loading your enrollments..." rows={3} />
      ) : error ? (
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
      ) : items.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Library}
            title="No enrollments yet"
            description="Enrollment is created by a Manager or Administrator for an active class. Students cannot enroll themselves, so there is nothing to show until an administrator adds you."
          />
          <div className="flex justify-center">
            <Button asChild size="sm" variant="outline">
              <Link href="/academics">
                <Library className="h-3.5 w-3.5" />
                <span>Browse the published catalog</span>
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <section aria-labelledby="my-classes-heading" className="space-y-3">
          <h2
            id="my-classes-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Enrolled classes
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((entry) => {
              const hasAccess =
                entry.status === "active" && entry.cohort_status === "active";
              return (
                <Card key={entry.id} className="cyber-panel-interactive">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {entry.cohort_code}
                      </Badge>
                      <EnrollmentStatusBadge status={entry.status} />
                      <CohortStatusBadge
                        status={entry.cohort_status}
                        className="ml-auto"
                      />
                    </div>
                    <CardTitle className="pt-1 text-base leading-tight">
                      {entry.cohort_name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {entry.course_code} · {entry.course_title}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!hasAccess ? (
                      <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {entry.status === "withdrawn"
                            ? "Withdrawn: the class remains visible, but lesson content is not available."
                            : "The class is not active, so lesson content is not available."}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Active since {formatShortDate(entry.enrolled_at)}.
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {entry.ended_at
                          ? `Ended ${formatShortDate(entry.ended_at)}`
                          : "No end date"}
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/academics/learn/enrollments/${entry.id}`}>
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
            itemLabel="enrollments"
          />

          <Alert variant="info">
            <AlertDescription className="text-xs">
              A withdrawn enrollment is not access: the record stays for audit, but
              this account cannot read lesson bodies for that class until a manager
              reactivates it.
            </AlertDescription>
          </Alert>
        </section>
      )}
    </div>
  );
}
