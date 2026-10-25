"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Layers,
  Lock,
  PencilRuler,
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
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { describeAcademicError } from "@/features/academics/error-message";
import { useApiResource } from "@/features/academics/use-api-resource";
import { academicApi } from "@/lib/api/academic";
import type { CoursePublic, ModulePublic } from "@/lib/types/academic";
import { formatShortDate } from "@/lib/utils";

interface OverviewPayload {
  course: CoursePublic;
  modules: ModulePublic[];
}

export function CourseOverview({
  courseId,
  canManage,
}: {
  courseId: string;
  canManage: boolean;
}) {
  const { data, error, loading, reload } = useApiResource<OverviewPayload>(
    async () => {
      const course = await academicApi.getCourse(courseId);
      const modules = await academicApi.listCourseModules(courseId);
      return { course, modules };
    },
    `course:${courseId}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading course curriculum..." rows={4} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
        {canManage && error.status === 404 ? (
          <Alert variant="info">
            <ShieldAlert />
            <AlertDescription className="space-y-2">
              <p>
                This course may still be a draft. Public catalog reads hide
                unpublished courses, so a draft is indistinguishable from a
                missing record here.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/academics/manage">Open Content Management</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (!data) return null;

  const { course, modules } = data;
  const missing = Math.max(0, course.planned_module_count - modules.length);

  return (
    <div className="space-y-6">
      <BackLink />

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              {course.code}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {course.edition}
            </Badge>
            <ContentStatusBadge status={course.status} />
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Published {formatShortDate(course.published_at)}
            </span>
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{course.title}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed">
              {course.summary || "No summary has been provided for this course."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label="Planned modules" value={course.planned_module_count} tone="violet" />
          <Stat label="Published modules" value={modules.length} tone="emerald" />
          <Stat label="Content version" value={`v${course.content_version}`} tone="cyan" />
        </CardContent>
      </Card>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface-elevated/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            You hold a content-management role. Draft modules and lesson bodies
            are only visible in the authoring workspace.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/academics/manage/courses/${course.id}`}>
              <PencilRuler className="h-3.5 w-3.5" />
              <span>Manage this course</span>
            </Link>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="modules-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="modules-heading"
              className="font-display text-lg font-semibold text-foreground"
            >
              Curriculum Sequence
            </h2>
            <p className="text-xs text-muted-foreground">
              Published modules in their authoritative order. Positions without
              authored content are intentionally absent.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {modules.length} of {course.planned_module_count} available
          </Badge>
        </div>

        {modules.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No modules published"
            description={`This course declares ${course.planned_module_count} planned modules, but none have been authored and published yet. Module titles are never generated to fill the gap.`}
          />
        ) : (
          <ol className="space-y-3">
            {modules.map((module) => (
              <li key={module.id}>
                <Card className="cyber-panel-interactive">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-500/10 font-mono text-xs font-semibold text-cyan-500 dark:text-cyan-300">
                        {String(module.sequence).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-semibold text-foreground">
                            {module.title}
                          </h3>
                          <ContentStatusBadge status={module.status} showDot={false} />
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {module.summary ||
                            "No module summary has been authored."}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/academics/modules/${module.id}`}>
                        <span>Explore</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}

        {missing > 0 ? (
          <Alert variant="warning">
            <Lock />
            <AlertDescription>
              <strong className="font-semibold">
                {missing} planned module{missing === 1 ? "" : "s"} not yet
                available.
              </strong>{" "}
              Only supplied source material is authored. Titles and lesson
              content for those positions are intentionally not fabricated, and
              they are excluded from the sequence above.
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/academics">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to catalog</span>
      </Link>
    </Button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "cyan" | "violet" | "emerald";
}) {
  const toneClass = {
    cyan: "text-cyan-500 dark:text-cyan-300",
    violet: "text-violet-500 dark:text-violet-300",
    emerald: "text-emerald-500 dark:text-emerald-300",
  }[tone];

  return (
    <div className="rounded-lg border border-border/70 bg-surface-elevated/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
