"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  FileText,
  Info,
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
import type { LessonSummary, ModulePublic } from "@/lib/types/academic";
import { formatShortDate } from "@/lib/utils";

interface ModulePayload {
  module: ModulePublic;
  lessons: LessonSummary[];
}

export function ModuleExplorer({
  moduleId,
  canManage,
  enrollmentId = null,
}: {
  moduleId: string;
  canManage: boolean;
  /**
   * Forwarded from the URL. A student who opened this module from a class keeps
   * that class on every lesson link, so the lesson viewer has explicit completion
   * context instead of guessing an enrollment.
   */
  enrollmentId?: string | null;
}) {
  const { data, error, loading, reload } = useApiResource<ModulePayload>(
    async () => {
      const moduleRecord = await academicApi.getModule(moduleId);
      const lessons = await academicApi.listModuleLessons(moduleId);
      return { module: moduleRecord, lessons };
    },
    `module:${moduleId}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading module lessons..." rows={3} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink courseId={null} />
        <ErrorState
          title={copy.title}
          description={copy.description}
          onRetry={copy.retryable ? reload : undefined}
        />
      </div>
    );
  }

  if (!data) return null;

  const { module, lessons } = data;

  return (
    <div className="space-y-6">
      <BackLink courseId={module.course_id} />

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              Module {String(module.sequence).padStart(2, "0")}
            </Badge>
            <ContentStatusBadge status={module.status} />
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatShortDate(module.published_at)}
            </span>
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{module.title}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed">
              {module.summary || "No module summary has been authored yet."}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <section aria-labelledby="lessons-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="lessons-heading"
              className="font-display text-lg font-semibold text-foreground"
            >
              Lessons
            </h2>
            <p className="text-xs text-muted-foreground">
              Lesson metadata in sequence order. Bodies are withheld from
              learners until enrollment exists.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {lessons.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No lessons published"
            description="This module has no published lessons yet. A module only becomes publishable once at least one lesson is published, so an empty list means the curriculum is still being authored."
          />
        ) : (
          <ol className="space-y-2.5">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Card className="cyber-panel-interactive">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated font-mono text-[11px] text-muted-foreground">
                        {String(lesson.sequence).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-sm font-semibold text-foreground">
                            {lesson.title}
                          </h3>
                          <ContentStatusBadge
                            status={lesson.status}
                            showDot={false}
                          />
                          <Badge variant="outline" className="font-mono text-[10px]">
                            v{lesson.content_version}
                          </Badge>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          Lesson ID {lesson.id.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link
                        href={
                          enrollmentId
                            ? `/academics/lessons/${lesson.id}?enrollmentId=${encodeURIComponent(
                                enrollmentId
                              )}`
                            : `/academics/lessons/${lesson.id}`
                        }
                      >
                        <span>{canManage ? "Open lesson" : "Lesson details"}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Alert variant="info">
        <Info />
        <AlertDescription>
          <strong className="font-semibold">Read-only module metadata.</strong>{" "}
          Mission briefings, lab sandboxes and assessments are not part of
          Milestone 02A and no API can record results yet. Nothing on this screen
          implies they are operational.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function BackLink({ courseId }: { courseId: string | null }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href={courseId ? `/academics/courses/${courseId}` : "/academics"}>
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{courseId ? "Back to course" : "Back to catalog"}</span>
      </Link>
    </Button>
  );
}
