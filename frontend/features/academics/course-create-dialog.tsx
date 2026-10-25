"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/features/academics/field";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import {
  validateCourseCreate,
  type CourseCreateValues,
  type FieldErrors,
} from "@/features/academics/validation";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import { COURSE_LIMITS, type CoursePublic } from "@/lib/types/academic";

const EMPTY: CourseCreateValues = {
  code: "",
  title: "",
  edition: "",
  planned_module_count: "",
  summary: "",
};

export function CourseCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (course: CoursePublic) => void;
}) {
  const [values, setValues] = React.useState<CourseCreateValues>(EMPTY);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { runWithStepUp } = useStepUpRetry();

  // Reset the draft each time the dialog opens (React's documented
  // "adjust state when a prop changes" pattern; no effect needed).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(EMPTY);
      setErrors({});
      setFormError(null);
      setSubmitting(false);
    }
  }

  const set = (key: keyof CourseCreateValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateCourseCreate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const created = await runWithStepUp(
        () =>
          academicApi.createCourse({
            code: values.code.trim(),
            title: values.title.trim(),
            edition: values.edition.trim(),
            planned_module_count: Number(values.planned_module_count),
            summary: values.summary.trim(),
          }),
        "Creating a course draft requires re-verification within the last 5 minutes."
      );
      if (created) {
        onCreated(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) {
          setErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Course creation failed for an unknown reason.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create course draft</DialogTitle>
            <DialogDescription>
              Courses are always created as drafts. Nothing is visible in the
              public catalog until you explicitly publish it.
            </DialogDescription>
          </DialogHeader>

          <FormError message={formError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="course-code"
              label="Course code"
              required
              error={errors.code}
              hint={`Uppercase letters, digits and hyphens (${COURSE_LIMITS.codeMin}–${COURSE_LIMITS.codeMax}). Immutable after creation.`}
            >
              {(props) => (
                <Input
                  {...props}
                  value={values.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="CEH-V12"
                  autoComplete="off"
                  className="font-mono"
                />
              )}
            </Field>

            <Field
              id="course-edition"
              label="Edition"
              required
              error={errors.edition}
              hint="Short edition label, for example v12."
            >
              {(props) => (
                <Input
                  {...props}
                  value={values.edition}
                  onChange={(e) => set("edition", e.target.value)}
                  placeholder="v12"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <Field
            id="course-title"
            label="Title"
            required
            error={errors.title}
            hint={`${COURSE_LIMITS.titleMin}–${COURSE_LIMITS.titleMax} characters.`}
          >
            {(props) => (
              <Input
                {...props}
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Certified Ethical Hacker v12"
                autoComplete="off"
              />
            )}
          </Field>

          <Field
            id="course-planned"
            label="Planned module count"
            required
            error={errors.planned_module_count}
            hint="The full edition plan. Published modules may be fewer while content is authored."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={COURSE_LIMITS.plannedMin}
                max={COURSE_LIMITS.plannedMax}
                value={values.planned_module_count}
                onChange={(e) => set("planned_module_count", e.target.value)}
                placeholder="20"
                className="font-mono"
              />
            )}
          </Field>

          <Field
            id="course-summary"
            label="Summary"
            error={errors.summary}
            hint={`Optional, up to ${COURSE_LIMITS.summaryMax} characters. Describe only what is actually available.`}
          >
            {(props) => (
              <Textarea
                {...props}
                value={values.summary}
                onChange={(e) => set("summary", e.target.value)}
                rows={3}
                placeholder="Mission-based ethical hacking curriculum"
              />
            )}
          </Field>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Create draft</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
