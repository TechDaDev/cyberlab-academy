"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { describeAcademicError } from "@/features/academics/error-message";
import { Field, FormError } from "@/features/academics/field";
import { Markdown } from "@/features/academics/markdown";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import {
  normalizeObjectives,
  normalizeResources,
  validateLessonEdit,
  type FieldErrors,
} from "@/features/academics/validation";
import { useToast } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import {
  LESSON_LIMITS,
  RESOURCE_TYPE_LABELS,
  type LessonDetail,
  type ResourceType,
} from "@/lib/types/academic";

const RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[];

export function LessonEditor({ lessonId }: { lessonId: string }) {
  const { data, error, loading, reload } = useApiResource<LessonDetail>(
    () => academicApi.getLesson(lessonId),
    `lesson-editor:${lessonId}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading lesson editor..." rows={4} />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academics/manage">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to content management</span>
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

  return <LessonEditorBody lesson={data} onReload={reload} />;
}

function LessonEditorBody({
  lesson,
  onReload,
}: {
  lesson: LessonDetail;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();

  const [form, setForm] = React.useState({
    sequence: String(lesson.sequence),
    title: lesson.title,
    body_markdown: lesson.body_markdown,
    objectives:
      lesson.objectives.length > 0
        ? lesson.objectives
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((o) => o.text)
        : [],
    resources:
      lesson.resources.length > 0
        ? lesson.resources
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((r) => ({
              title: r.title,
              type: r.type,
              external_url: r.external_url ?? "",
              asset_reference: r.asset_reference ?? "",
            }))
        : [],
  });
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLessonEdit(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError("Resolve the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await runWithStepUp(
        () =>
          academicApi.updateLesson(lesson.id, {
            sequence: Number(form.sequence),
            title: form.title.trim(),
            body_markdown: form.body_markdown,
            objectives: normalizeObjectives(form.objectives),
            resources: normalizeResources(form.resources),
          }),
        "Editing a lesson requires re-verification within the last 5 minutes."
      );
      if (updated) {
        setForm({
          sequence: String(updated.sequence),
          title: updated.title,
          body_markdown: updated.body_markdown,
          objectives: updated.objectives.map((o) => o.text),
          resources: updated.resources.map((r) => ({
            title: r.title,
            type: r.type,
            external_url: r.external_url ?? "",
            asset_reference: r.asset_reference ?? "",
          })),
        });
        toast({
          title: "Lesson saved",
          description: `Content version is now v${updated.content_version}.`,
        });
        onReload();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setFieldErrors({
            sequence: `Sequence ${form.sequence} is already used in this module.`,
          });
        } else if (Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Lesson update failed for an unknown reason.");
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
        () => academicApi.publishLesson(lesson.id),
        "Publishing a lesson requires re-verification within the last 5 minutes."
      );
      if (published) {
        setPublishOpen(false);
        toast({
          title: "Lesson published",
          description: `"${published.title}" is now published inside its module.`,
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

  const bodyEmpty = form.body_markdown.trim().length === 0;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/academics/manage/modules/${lesson.module_id}`}>
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to module</span>
        </Link>
      </Button>

      <Card className="cyber-panel">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="font-mono text-[10px]">
              Lesson {String(lesson.sequence).padStart(2, "0")}
            </Badge>
            <ContentStatusBadge status={lesson.status} />
            <Badge variant="outline" className="font-mono text-[10px]">
              v{lesson.content_version}
            </Badge>
            {lesson.status === "published" ? (
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
                <span>Publish lesson</span>
              </Button>
            )}
          </div>
          <CardTitle className="text-2xl leading-tight">{lesson.title}</CardTitle>
          <CardDescription>
            Author the lesson body in Markdown, then publish. Publishing requires
            a non-empty body.
          </CardDescription>
        </CardHeader>
      </Card>

      <form onSubmit={handleSave} className="space-y-6" noValidate>
        <FormError message={formError} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lesson Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field
              id="lesson-edit-sequence"
              label="Sequence"
              required
              error={fieldErrors.sequence}
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
              id="lesson-edit-title"
              label="Title"
              required
              error={fieldErrors.title}
              hint={`${LESSON_LIMITS.titleMin}–${LESSON_LIMITS.titleMax} characters.`}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lesson Body</CardTitle>
            <CardDescription className="text-xs">
              {form.body_markdown.length.toLocaleString()} /{" "}
              {LESSON_LIMITS.bodyMax.toLocaleString()} characters. Markdown
              subset: headings, lists, quotes, fenced code, bold, italic, inline
              code and http(s) links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Write</span>
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="mt-3">
                <Field
                  id="lesson-body"
                  label="Body (Markdown)"
                  error={fieldErrors.body_markdown}
                >
                  {(props) => (
                    <Textarea
                      {...props}
                      rows={16}
                      value={form.body_markdown}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          body_markdown: e.target.value,
                        }))
                      }
                      placeholder={
                        "# Heading\n\nWrite original, reviewed content here."
                      }
                      className="min-h-[22rem] font-mono text-xs"
                    />
                  )}
                </Field>
              </TabsContent>
              <TabsContent value="preview" className="mt-3">
                <div className="min-h-[22rem] rounded-lg border border-border/80 bg-surface/50 p-4">
                  <Markdown
                    source={form.body_markdown}
                    emptyLabel="Nothing to preview yet — the body is empty."
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Preview uses the same renderer as the published lesson. Raw HTML
                  is displayed as text, never executed.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Objectives */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Learning Objectives</CardTitle>
              <CardDescription className="text-xs">
                Up to {LESSON_LIMITS.objectivesMax}. Sent as an ordered list;
                blank rows are dropped.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {fieldErrors.objectives ? (
                <p role="alert" className="text-[11px] text-red-400">
                  {fieldErrors.objectives}
                </p>
              ) : null}
              {form.objectives.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No objectives added yet.
                </p>
              ) : null}
              {form.objectives.map((objective, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Input
                    value={objective}
                    onChange={(e) =>
                      setForm((prev) => {
                        const next = [...prev.objectives];
                        next[index] = e.target.value;
                        return { ...prev, objectives: next };
                      })
                    }
                    placeholder="Describe a measurable outcome"
                    aria-label={`Objective ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove objective ${index + 1}`}
                    className="shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        objectives: prev.objectives.filter(
                          (_, i) => i !== index
                        ),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.objectives.length >= LESSON_LIMITS.objectivesMax}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    objectives: [...prev.objectives, ""],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add objective</span>
              </Button>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Learning Resources</CardTitle>
              <CardDescription className="text-xs">
                Up to {LESSON_LIMITS.resourcesMax}. URLs must be absolute http(s);
                asset references must be relative.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fieldErrors.resources ? (
                <p role="alert" className="text-[11px] text-red-400">
                  {fieldErrors.resources}
                </p>
              ) : null}
              {form.resources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No resources attached.
                </p>
              ) : null}
              {form.resources.map((resource, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-border/70 bg-surface-elevated/30 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Resource {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove resource ${index + 1}`}
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          resources: prev.resources.filter(
                            (_, i) => i !== index
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={resource.title}
                    aria-label={`Resource ${index + 1} title`}
                    onChange={(e) =>
                      setForm((prev) => {
                        const next = [...prev.resources];
                        next[index] = { ...next[index], title: e.target.value };
                        return { ...prev, resources: next };
                      })
                    }
                    placeholder="Resource title"
                  />
                  {fieldErrors[`resources.${index}.title`] ? (
                    <p className="text-[11px] text-red-400">
                      {fieldErrors[`resources.${index}.title`]}
                    </p>
                  ) : null}
                  <select
                    value={resource.type}
                    aria-label={`Resource ${index + 1} type`}
                    onChange={(e) =>
                      setForm((prev) => {
                        const next = [...prev.resources];
                        next[index] = {
                          ...next[index],
                          type: e.target.value as ResourceType,
                        };
                        return { ...prev, resources: next };
                      })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                  >
                    {RESOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {RESOURCE_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={resource.external_url ?? ""}
                    aria-label={`Resource ${index + 1} external URL`}
                    onChange={(e) =>
                      setForm((prev) => {
                        const next = [...prev.resources];
                        next[index] = {
                          ...next[index],
                          external_url: e.target.value,
                        };
                        return { ...prev, resources: next };
                      })
                    }
                    placeholder="https://example.org/reference"
                    className="font-mono text-xs"
                  />
                  {fieldErrors[`resources.${index}.external_url`] ? (
                    <p className="text-[11px] text-red-400">
                      {fieldErrors[`resources.${index}.external_url`]}
                    </p>
                  ) : null}
                  <Input
                    value={resource.asset_reference ?? ""}
                    aria-label={`Resource ${index + 1} asset reference`}
                    onChange={(e) =>
                      setForm((prev) => {
                        const next = [...prev.resources];
                        next[index] = {
                          ...next[index],
                          asset_reference: e.target.value,
                        };
                        return { ...prev, resources: next };
                      })
                    }
                    placeholder="references/notes.md"
                    className="font-mono text-xs"
                  />
                  {fieldErrors[`resources.${index}.asset_reference`] ? (
                    <p className="text-[11px] text-red-400">
                      {fieldErrors[`resources.${index}.asset_reference`]}
                    </p>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.resources.length >= LESSON_LIMITS.resourcesMax}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    resources: [
                      ...prev.resources,
                      {
                        title: "",
                        type: "external_link",
                        external_url: "",
                        asset_reference: "",
                      },
                    ],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add resource</span>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save lesson</span>
          </Button>
          {bodyEmpty ? (
            <p className="text-xs text-muted-foreground">
              A lesson with an empty body cannot be published.
            </p>
          ) : null}
        </div>
      </form>

      <ConfirmActionDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this lesson?"
        description={`"${form.title || lesson.title}" becomes visible inside its module. Learners still cannot read the body until enrollment exists in Phase 02B.`}
        confirmLabel="Publish lesson"
        isSubmitting={publishing}
        errorMessage={publishError}
        notice={
          bodyEmpty ? (
            <Alert variant="warning">
              <Rocket />
              <AlertDescription>
                The body is currently empty. The API rejects publishing an empty
                lesson with <strong>409</strong>. Save a non-empty body first.
              </AlertDescription>
            </Alert>
          ) : null
        }
        onConfirm={handlePublish}
      />
    </div>
  );
}
