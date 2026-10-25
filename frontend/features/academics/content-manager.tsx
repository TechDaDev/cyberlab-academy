"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  PencilRuler,
  RefreshCw,
  Sprout,
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
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { CourseCreateDialog } from "@/features/academics/course-create-dialog";
import { describeAcademicError } from "@/features/academics/error-message";
import { useApiResource } from "@/features/academics/use-api-resource";
import { academicApi } from "@/lib/api/academic";
import type { CoursePublic, PageCourses } from "@/lib/types/academic";
import { formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 20;

export function ContentManager() {
  const [offset, setOffset] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);

  const { data, error, loading, reload } = useApiResource<PageCourses>(
    () => academicApi.listAdminCourses(PAGE_SIZE, offset),
    `admin-courses:${offset}`
  );

  const copy = describeAcademicError(error);

  const handleCreated = (course: CoursePublic) => {
    setCreated(`Draft course "${course.title}" created.`);
    setOffset(0);
    reload();
  };

  if (loading && !data) {
    return (
      <LoadingState label="Loading content-management workspace..." rows={4} />
    );
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

  const drafts = data.items.filter((c) => c.status === "draft").length;
  const published = data.items.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-6">
      <Card className="cyber-panel">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PencilRuler className="h-4 w-4 text-cyan-400" />
              Course Drafts &amp; Publication
            </CardTitle>
            <CardDescription>
              Draft courses are private to Managers and Administrators. Publishing
              catalog metadata does not publish the modules inside it.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              aria-label="Refresh course list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5" />
              <span>New course draft</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Total courses" value={data.total} />
          <SummaryTile label="Drafts (page)" value={drafts} tone="warning" />
          <SummaryTile label="Published (page)" value={published} tone="success" />
        </CardContent>
      </Card>

      {created ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {created}
        </div>
      ) : null}

      {data.total === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No courses exist yet"
          description="Create the first draft course to begin authoring curriculum. Locally you can also seed the CEH v12 draft course and Module 01 shell with `python -m app.seed_catalog` in the backend — it creates metadata only and no lesson content."
          actionLabel="Create course draft"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <section aria-labelledby="admin-courses-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="admin-courses-heading"
                className="font-display text-lg font-semibold text-foreground"
              >
                All Courses
              </h2>
              <p className="text-xs text-muted-foreground">
                Showing {data.offset + 1}–{data.offset + data.items.length} of{" "}
                {data.total}. Includes drafts and archived records.
              </p>
            </div>
            {data.total > PAGE_SIZE ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.offset + data.items.length >= data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((course) => (
              <Card key={course.id} className="cyber-panel-interactive">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="font-mono text-[10px]">
                      {course.code}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {course.edition}
                    </Badge>
                    <ContentStatusBadge status={course.status} className="ml-auto" />
                  </div>
                  <CardTitle className="pt-1 text-base leading-tight">
                    {course.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {course.summary || "No summary provided."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <Metric
                      label="Planned"
                      value={course.planned_module_count}
                    />
                    <Metric
                      label="Published"
                      value={course.published_module_count}
                    />
                    <Metric label="Version" value={`v${course.content_version}`} />
                  </dl>
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {course.published_at
                        ? `Published ${formatShortDate(course.published_at)}`
                        : "Never published"}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/academics/manage/courses/${course.id}`}>
                        <span>Edit</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <CourseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-500 dark:text-amber-300"
      : tone === "success"
        ? "text-emerald-500 dark:text-emerald-300"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface-elevated/30 px-2 py-1.5">
      <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
