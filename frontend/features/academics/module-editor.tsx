"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FileText,
  Loader2,
  Rocket,
  Save,
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
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import {
  validateLessonCreate,
  type FieldErrors,
} from "@/features/academics/validation";
import { useToast } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import type { LessonSummary, ModulePublic } from "@/lib/types/academic";

interface ModuleEditorPayload {
  module: ModulePublic;
  lessons: LessonSummary[];
}

export function ModuleEditor({ moduleId }: { moduleId: string }) {
  const { data, error, loading, reload } = useApiResource<ModuleEditorPayload>(
    async () => {
      const moduleRecord = await academicApi.getModule(moduleId);
      const lessons = await academicApi.listModuleLessons(moduleId);
      return { module: moduleRecord, lessons };
    },
    `module-editor:${moduleId}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading module editor..." rows={3} />;
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

  return (
    <ModuleEditorBody
      moduleRecord={data.module}
      lessons={data.lessons}
      onReload={reload}
    />
  );
}

function ModuleEditorBody({
  moduleRecord,
  lessons,
  onReload,
}: {
  moduleRecord: ModulePublic;
  lessons: LessonSummary[];
  onReload: () => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();

  const [form, setForm] = React.useState({
    title: moduleRecord.title,
    summary: moduleRecord.summary,
    sequence: String(moduleRecord.sequence),
  });
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const [showLessonForm, setShowLessonForm] = React.useState(false);

  const publishedLessons = lessons.filter((l) => l.status === "published").length;
  const nextLessonSequence =
    lessons.length > 0 ? Math.max(...lessons.map((l) => l.sequence)) + 1 : 1;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (form.title.trim().length < 3) {
      setFieldErrors({ title: "Title must be at least 3 characters." });
      return;
    }
    const sequence = Number(form.sequence);
    if (!Number.isInteger(sequence) || sequence < 1) {
      setFieldErrors({
        sequence: "Sequence must be a whole number of 1 or more.",
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await runWithStepUp(
        () =>
          academicApi.updateModule(moduleRecord.id, {
            title: form.title.trim(),
            summary: form.summary.trim(),
            sequence,
          }),
        "Editing a module requires re-verification within the last 5 minutes."
      );
      if (updated) {
        setForm({
          title: updated.title,
          summary: updated.summary,
          sequence: String(updated.sequence),
        });
        toast({
          title: "Module updated",
          description: `"${updated.title}" saved at sequence ${updated.sequence}.`,
        });
        onReload();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setFieldErrors({
            sequence: `Sequence ${form.sequence} is already used by another module in this course.`,
          });
        } else if (Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Module update failed for an unknown reason.");
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
        () => academicApi.publishModule(moduleRecord.id),
        "Publishing a module requires re-verification within the last 5 minutes."
      );
      if (published) {
        setPublishOpen(false);
        toast({
          title: "Module published",
          description: `"${published.title}" is now visible in the published curriculum.`,
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

  return (
    <div className="space-y-6">
      <BackLink courseId={moduleRecord.course_id} />

      <Card className="cyber-panel">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              Module {String(moduleRecord.sequence).padStart(2, "0")}
            </Badge>
            <ContentStatusBadge status={moduleRecord.status} />
            <Badge variant="outline" className="font-mono text-[10px]">
              {lessons.length} lesson{lessons.length === 1 ? "" : "s"} ·{" "}
              {publishedLessons} published
            </Badge>
            {moduleRecord.status === "published" ? (
              <Badge variant="success" className="ml-auto font-mono text-[10px]">
                <CheckCircle2 className="h-3 w-3" /> PUBLISHED
              </Badge>
            ) : (
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={() => setPublishOpen(true)}
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>Publish module</span>
              </Button>
            )}
          </div>
          <CardTitle className="text-2xl leading-tight">
            {moduleRecord.title}
          </CardTitle>
          <CardDescription>
            Module editor. A module can only be published once its course is
            published and at least one lesson inside it is published.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Module Metadata</CardTitle>
            <CardDescription className="text-xs">
              Re-sequencing is a PATCH; sequence conflicts return 409.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4" noValidate>
              <FormError message={formError} />

              <Field
                id="module-edit-sequence"
                label="Sequence"
                required
                error={fieldErrors.sequence}
                hint="Unique per course and within the course's planned module count."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={form.sequence}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, sequence: e.target.value }))
                    }
                    className="font-mono"
                  />
                )}
              </Field>

              <Field
                id="module-edit-title"
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
                id="module-edit-summary"
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

              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>Save module</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Lessons
              </h2>
              <p className="text-xs text-muted-foreground">
                Ordered by sequence. Publish a lesson before publishing the
                module.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowLessonForm((v) => !v)}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>{showLessonForm ? "Close" : "New lesson"}</span>
            </Button>
          </div>

          {showLessonForm ? (
            <NewLessonForm
              moduleId={moduleRecord.id}
              initialSequence={nextLessonSequence}
              onCreated={(created) => {
                toast({
                  title: "Lesson draft created",
                  description: `"${created.title}" was created. Add its body before publishing.`,
                });
                setShowLessonForm(false);
                onReload();
              }}
            />
          ) : null}

          {lessons.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No lessons in this module"
              description="A module cannot be published until at least one lesson inside it is published. Create a lesson draft, author its body, then publish it."
              actionLabel="Create first lesson"
              onAction={() => setShowLessonForm(true)}
            />
          ) : (
            <ol className="space-y-2.5">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Card className="cyber-panel">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated font-mono text-[11px] text-muted-foreground">
                          {String(lesson.sequence).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-sm font-semibold text-foreground">
                              {lesson.title}
                            </h3>
                            <ContentStatusBadge
                              status={lesson.status}
                              showDot={false}
                            />
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                            >
                              v{lesson.content_version}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                      >
                        <Link href={`/academics/manage/lessons/${lesson.id}`}>
                          <span>Edit lesson</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}

          {moduleRecord.status === "draft" && publishedLessons === 0 ? (
            <Alert variant="info">
              <Rocket />
              <AlertDescription>
                Publishing this module will return <strong>409</strong> until at
                least one lesson has a non-empty body and is published.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>

      <ConfirmActionDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this module?"
        description={`"${moduleRecord.title}" becomes visible inside the published course at sequence ${moduleRecord.sequence}. Publishing requires a published course and at least one published lesson.`}
        confirmLabel="Publish module"
        isSubmitting={publishing}
        errorMessage={publishError}
        onConfirm={handlePublish}
      />
    </div>
  );
}

/** Mounted only while the inline form is open, so its state resets per use. */
function NewLessonForm({
  moduleId,
  initialSequence,
  onCreated,
}: {
  moduleId: string;
  initialSequence: number;
  onCreated: (created: LessonSummary) => void;
}) {
  const [values, setValues] = React.useState({
    sequence: String(initialSequence),
    title: "",
  });
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { runWithStepUp } = useStepUpRetry();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLessonCreate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await runWithStepUp(
        () =>
          academicApi.createLesson(moduleId, {
            sequence: Number(values.sequence),
            title: values.title.trim(),
            body_markdown: "",
            objectives: [],
            resources: [],
          }),
        "Creating a lesson requires re-verification within the last 5 minutes."
      );
      if (created) {
        onCreated(created);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrors({
            sequence: `Sequence ${values.sequence} is already used in this module.`,
          });
        } else if (Object.keys(err.fieldErrors).length > 0) {
          setErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Lesson creation failed for an unknown reason.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <FormError message={formError} />
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <Field
              id="lesson-sequence"
              label="Sequence"
              required
              error={errors.sequence}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  value={values.sequence}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, sequence: e.target.value }))
                  }
                  className="font-mono"
                />
              )}
            </Field>
            <Field
              id="lesson-title"
              label="Title"
              required
              error={errors.title}
            >
              {(props) => (
                <Input
                  {...props}
                  value={values.title}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Use only confirmed source titles"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FilePlus2 className="h-3.5 w-3.5" />
            )}
            <span>Create lesson draft</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function BackLink({ courseId }: { courseId: string | null }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link
        href={
          courseId ? `/academics/manage/courses/${courseId}` : "/academics/manage"
        }
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{courseId ? "Back to course" : "Back to content management"}</span>
      </Link>
    </Button>
  );
}
