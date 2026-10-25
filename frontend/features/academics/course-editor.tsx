"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  Rocket,
  Save,
  Workflow,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { describeAcademicError } from "@/features/academics/error-message";
import { Field, FormError } from "@/features/academics/field";
import { ModuleCreateDialog } from "@/features/academics/module-create-dialog";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import {
  validateCoursePatch,
  type FieldErrors,
} from "@/features/academics/validation";
import { useToast } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import type { CoursePublic, ModulePublic } from "@/lib/types/academic";
import { formatDateTime } from "@/lib/utils";

interface EditorPayload {
  course: CoursePublic;
  modules: ModulePublic[];
}

export function CourseEditor({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApiResource<EditorPayload>(
    async () => {
      const course = await academicApi.getAdminCourse(courseId);
      const modules = await academicApi.listAdminModules(courseId);
      return { course, modules };
    },
    `admin-course:${courseId}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading course draft..." rows={4} />;
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
      </div>
    );
  }

  if (!data) return null;

  return (
    <CourseEditorBody
      course={data.course}
      modules={data.modules}
      onReload={reload}
    />
  );
}

function CourseEditorBody({
  course,
  modules,
  onReload,
}: {
  course: CoursePublic;
  modules: ModulePublic[];
  onReload: () => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();

  const [form, setForm] = React.useState({
    title: course.title,
    summary: course.summary,
    planned_module_count: String(course.planned_module_count),
  });
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [publishingModuleId, setPublishingModuleId] = React.useState<
    string | null
  >(null);

  const [createModuleOpen, setCreateModuleOpen] = React.useState(false);

  const publishedLessonsReady = modules.some((m) => m.status === "published");
  const nextSequence =
    modules.length > 0 ? Math.max(...modules.map((m) => m.sequence)) + 1 : 1;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateCoursePatch(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      const updated = await runWithStepUp(
        () =>
          academicApi.updateCourse(course.id, {
            title: form.title.trim(),
            summary: form.summary.trim(),
            planned_module_count: Number(form.planned_module_count),
          }),
        "Editing course metadata requires re-verification within the last 5 minutes."
      );
      if (updated) {
        setForm({
          title: updated.title,
          summary: updated.summary,
          planned_module_count: String(updated.planned_module_count),
        });
        toast({
          title: "Course updated",
          description: `Content version is now v${updated.content_version}.`,
        });
        onReload();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Course update failed for an unknown reason.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const published = await runWithStepUp(
        () => academicApi.publishCourse(course.id),
        "Publishing a course requires re-verification within the last 5 minutes."
      );
      if (published) {
        setPublishOpen(false);
        toast({
          title: "Course published",
          description:
            "Catalog metadata is now visible to learners. Modules remain hidden until each is published.",
          variant: "success",
        });
        onReload();
      }
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.detail : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishModule = async (moduleRecord: ModulePublic) => {
    setPublishingModuleId(moduleRecord.id);
    try {
      const published = await runWithStepUp(
        () => academicApi.publishModule(moduleRecord.id),
        "Publishing a module requires re-verification within the last 5 minutes."
      );
      if (published) {
        toast({
          title: `Module ${published.sequence} published`,
          description: `"${published.title}" is now visible in the published curriculum.`,
          variant: "success",
        });
        onReload();
      }
    } catch (err) {
      toast({
        title: "Module not published",
        description: err instanceof ApiError ? err.detail : "Publishing failed.",
        variant: "warning",
      });
    } finally {
      setPublishingModuleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />

      <Card className="cyber-panel">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              {course.code}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {course.edition}
            </Badge>
            <ContentStatusBadge status={course.status} />
            <Badge variant="outline" className="font-mono text-[10px]">
              v{course.content_version}
            </Badge>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {course.published_at
                ? `Published ${formatDateTime(course.published_at)}`
                : "Not published"}
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-2xl leading-tight">
                {course.title}
              </CardTitle>
              <CardDescription className="mt-1">
                Draft course editor. Changes bump the content version and are
                audited.
              </CardDescription>
            </div>
            {course.status === "draft" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setPublishOpen(true)}
                className="shrink-0"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>Publish course</span>
              </Button>
            ) : (
              <Badge variant="success" className="shrink-0 font-mono text-[10px]">
                <CheckCircle2 className="h-3 w-3" /> PUBLISHED
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Metadata */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Course Metadata</CardTitle>
            <CardDescription className="text-xs">
              The course code is immutable. Title, summary and planned count are
              editable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4" noValidate>
              <FormError message={formError} />

              <Field
                id="edit-title"
                label="Title"
                required
                error={fieldErrors.title}
              >
                {(props) => (
                  <Input
                    {...props}
                    value={form.title}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                  />
                )}
              </Field>

              <Field
                id="edit-planned"
                label="Planned module count"
                required
                error={fieldErrors.planned_module_count}
                hint={`Cannot be reduced below an existing module sequence. ${modules.length} module${
                  modules.length === 1 ? "" : "s"
                } currently exist.`}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={Math.max(1, nextSequence - 1)}
                    value={form.planned_module_count}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        planned_module_count: e.target.value,
                      }))
                    }
                    className="font-mono"
                  />
                )}
              </Field>

              <Field
                id="edit-summary"
                label="Summary"
                error={fieldErrors.summary}
              >
                {(props) => (
                  <Textarea
                    {...props}
                    rows={4}
                    value={form.summary}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, summary: e.target.value }))
                    }
                  />
                )}
              </Field>

              <Button type="submit" disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>Save changes</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Modules */}
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Modules
              </h2>
              <p className="text-xs text-muted-foreground">
                {modules.length} created · {course.planned_module_count} planned.
                Draft modules appear here only.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateModuleOpen(true)}
              disabled={nextSequence > course.planned_module_count}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New module</span>
            </Button>
          </div>

          {nextSequence > course.planned_module_count ? (
            <Alert variant="warning">
              <Workflow />
              <AlertDescription>
                All {course.planned_module_count} planned module positions are
                used. Raise the planned module count before creating another
                module.
              </AlertDescription>
            </Alert>
          ) : null}

          {modules.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No modules in this course"
              description={`Create the first draft module. Sequence positions run from 1 to ${course.planned_module_count}.`}
              actionLabel="Create module"
              onAction={() => setCreateModuleOpen(true)}
            />
          ) : (
            <ol className="space-y-2.5">
              {modules.map((moduleRecord) => {
                const publishBlockedByCourse = course.status !== "published";
                return (
                  <li key={moduleRecord.id}>
                    <Card className="cyber-panel">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 font-mono text-[11px] font-semibold text-cyan-500 dark:text-cyan-300">
                            {String(moduleRecord.sequence).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-sm font-semibold text-foreground">
                                {moduleRecord.title}
                              </h3>
                              <ContentStatusBadge
                                status={moduleRecord.status}
                                showDot={false}
                              />
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {moduleRecord.summary || "No summary authored."}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {moduleRecord.status === "draft" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                publishBlockedByCourse ||
                                publishingModuleId === moduleRecord.id
                              }
                              title={
                                publishBlockedByCourse
                                  ? "Publish the course before publishing its modules."
                                  : "Requires at least one published lesson."
                              }
                              onClick={() => handlePublishModule(moduleRecord)}
                            >
                              {publishingModuleId === moduleRecord.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Rocket className="h-3.5 w-3.5" />
                              )}
                              <span>Publish</span>
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/academics/manage/modules/${moduleRecord.id}`}
                            >
                              <span>Edit</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          {modules.length > 0 && !publishedLessonsReady ? (
            <Alert variant="info">
              <Workflow />
              <AlertDescription>
                Module publication requires a published course and at least one
                published lesson inside the module. Author and publish a lesson
                first, then publish the module.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>

      <ConfirmActionDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish course catalog metadata?"
        description={`"${course.title}" will appear in the published catalog for every authenticated user. Its modules and lessons stay hidden until each is published separately.`}
        confirmLabel="Publish course"
        isSubmitting={publishing}
        errorMessage={publishError}
        notice={
          <Alert variant="info">
            <Rocket />
            <AlertDescription>
              Publication is a one-way status transition performed by the API.
              It cannot be undone through the interface.
            </AlertDescription>
          </Alert>
        }
        onConfirm={handlePublish}
      />

      <ModuleCreateDialog
        open={createModuleOpen}
        onOpenChange={setCreateModuleOpen}
        courseId={course.id}
        plannedModuleCount={course.planned_module_count}
        nextSequence={nextSequence}
        onCreated={(created) => {
          toast({
            title: "Module draft created",
            description: `"${created.title}" was added at sequence ${created.sequence}.`,
          });
          onReload();
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/academics/manage">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to content management</span>
      </Link>
    </Button>
  );
}
