"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookMarked,
  ExternalLink,
  GraduationCap,
  Link2,
  ListChecks,
  Lock,
  Target,
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
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { describeAcademicError } from "@/features/academics/error-message";
import { Markdown } from "@/features/academics/markdown";
import { useApiResource } from "@/features/academics/use-api-resource";
import { academicApi } from "@/lib/api/academic";
import {
  RESOURCE_TYPE_LABELS,
  type LessonDetail,
  type ResourcePublic,
} from "@/lib/types/academic";

/** Only absolute http(s) URLs become clickable; everything else is inert text. */
function isSafeExternalUrl(url: string | null): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function ResourceRow({ resource }: { resource: ResourcePublic }) {
  const external = isSafeExternalUrl(resource.external_url);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border/70 bg-surface-elevated/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        {resource.type === "external_link" ? (
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
        ) : (
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {resource.title}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {RESOURCE_TYPE_LABELS[resource.type] ?? resource.type}
            {!external && resource.asset_reference
              ? ` · ${resource.asset_reference}`
              : ""}
          </p>
        </div>
      </div>
      {external ? (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a
            href={resource.external_url as string}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <span>Open</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : (
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          Reference only
        </Badge>
      )}
    </li>
  );
}

/**
 * Explains why a lesson body is unreachable.
 *
 * `GET /api/v1/lessons/{id}` returns `403` for students and instructors in
 * Milestone 02A. That is an intentional capability boundary — lesson bodies need
 * a cohort enrollment (student) or cohort assignment (instructor), which Phase
 * 02B introduces. The UI must not work around it or invent content.
 */
function LessonLocked({ courseId }: { courseId: string | null }) {
  return (
    <div className="space-y-4">
      <Card className="cyber-panel border-amber-500/30">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10">
              <Lock className="h-4 w-4 text-amber-400" />
            </span>
            <div>
              <CardTitle className="text-lg">Lesson body locked</CardTitle>
              <CardDescription>
                Curriculum metadata is available; the full lesson text is not.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Reading a full lesson requires an active enrollment in a cohort
            (students) or an assigned cohort (instructors). Milestone 02A ships
            the academic catalog only — enrollments and cohort assignments arrive
            in Phase 02B.
          </p>
          <p>
            Until then the API returns <code className="font-mono text-xs">403</code>{" "}
            for this route and this screen shows no lesson text. Nothing is
            simulated or substituted.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link href="/academics">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to catalog</span>
              </Link>
            </Button>
            {courseId ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/academics/courses/${courseId}`}>
                  <BookMarked className="h-3.5 w-3.5" />
                  <span>View curriculum</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Alert variant="info">
        <GraduationCap />
        <AlertDescription>
          Lesson titles, sequence and content versions remain visible on the
          module page. Only the authored body, objectives and resource list are
          gated.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function LessonViewer({ lessonId }: { lessonId: string }) {
  const { data, error, loading, reload } = useApiResource<LessonDetail>(
    () => academicApi.getLesson(lessonId),
    `lesson:${lessonId}`
  );

  if (loading && !data) {
    return <LoadingState label="Checking lesson access..." rows={3} />;
  }

  // An enrollment gate is an expected boundary, not a failure.
  if (error?.status === 403) {
    return <LessonLocked courseId={null} />;
  }

  if (error) {
    const copy = describeAcademicError(error);
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to catalog</span>
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

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/academics/modules/${data.module_id}`}>
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to module</span>
        </Link>
      </Button>

      <Card className="cyber-panel">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              Lesson {String(data.sequence).padStart(2, "0")}
            </Badge>
            <ContentStatusBadge status={data.status} />
            <Badge variant="outline" className="font-mono text-[10px]">
              v{data.content_version}
            </Badge>
          </div>
          <div>
            <CardTitle className="text-2xl leading-tight">{data.title}</CardTitle>
            <CardDescription className="mt-1 font-mono text-[11px]">
              Lesson ID {data.id}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookMarked className="h-4 w-4 text-cyan-400" />
                Lesson Body
              </CardTitle>
              <CardDescription className="text-xs">
                Rendered from authored Markdown. Embedded HTML and scripts are
                never executed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Markdown source={data.body_markdown} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-teal-400" />
                Learning Objectives
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.objectives.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No objectives have been authored for this lesson.
                </p>
              ) : (
                <ol className="space-y-2">
                  {data.objectives
                    .slice()
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((objective) => (
                      <li
                        key={objective.sequence}
                        className="flex items-start gap-2 text-sm text-foreground/90"
                      >
                        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                        <span>{objective.text}</span>
                      </li>
                    ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-violet-400" />
                Learning Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.resources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No learning resources have been attached.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.resources
                    .slice()
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((resource) => (
                      <ResourceRow key={resource.id} resource={resource} />
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
