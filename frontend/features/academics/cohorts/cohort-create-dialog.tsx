"use client";

import * as React from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FormError } from "@/features/academics/field";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import type { FieldErrors } from "@/features/academics/validation";
import {
  toIsoOrNull,
  validateCohortCreate,
  type CohortCreateValues,
} from "@/features/academics/cohorts/cohort-validation";
import { useToast } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { CoursePublic } from "@/lib/types/academic";
import type { PageCourses } from "@/lib/types/academic";
import { COHORT_LIMITS, type CohortPublic } from "@/lib/types/cohorts";

const EMPTY: CohortCreateValues = {
  course_id: "",
  code: "",
  name: "",
  starts_at: "",
  ends_at: "",
};

/**
 * Creates a draft class for an existing course.
 *
 * `course_id` is chosen here and immutable afterwards, so the dialog states that
 * explicitly. The class always starts as a draft: activation is a separate,
 * gated action on the class page.
 */
export function CohortCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cohort: CohortPublic) => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();
  const [values, setValues] = React.useState<CohortCreateValues>(EMPTY);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const { data: courses, error: coursesError, loading: coursesLoading } =
    useApiResource<PageCourses>(
      () => academicApi.listAdminCourses(100, 0),
      `cohort-course-options:${open}`
    );

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

  const set = (key: keyof CohortCreateValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateCohortCreate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await runWithStepUp(
        () =>
          cohortsApi.createCohort({
            course_id: values.course_id,
            code: values.code.trim().toUpperCase(),
            name: values.name.trim(),
            starts_at: toIsoOrNull(values.starts_at),
            ends_at: toIsoOrNull(values.ends_at),
          }),
        "Creating a class requires re-verification within the last 5 minutes."
      );
      if (created) {
        toast({
          title: "Draft class created",
          description: `"${created.name}" (${created.code}) is a draft. Assign an instructor and activate it when ready.`,
        });
        onCreated(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
        setFormError(err.detail);
      } else {
        setFormError("Class creation failed for an unknown reason.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const courseOptions: CoursePublic[] = courses?.items ?? [];

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
            <DialogTitle>Create draft class</DialogTitle>
            <DialogDescription>
              A class links one course to an instructor and a student roster. It
              is created as a draft and only becomes visible to learners once it
              is activated.
            </DialogDescription>
          </DialogHeader>

          <FormError message={formError} />

          <Field
            id="cohort-course"
            label="Course"
            required
            error={errors.course_id}
            hint="The course association cannot be changed after creation."
          >
            {(props) => (
              <select
                {...props}
                value={values.course_id}
                onChange={(event) => set("course_id", event.target.value)}
                disabled={submitting || coursesLoading}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="">
                  {coursesLoading ? "Loading courses..." : "Select a course"}
                </option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.title} ({course.status})
                  </option>
                ))}
              </select>
            )}
          </Field>

          {coursesError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Courses could not be loaded. {coursesError.detail}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field
              id="cohort-code"
              label="Class code"
              required
              error={errors.code}
              hint={`Uppercase letters, digits and hyphens (${COHORT_LIMITS.codeMin}–${COHORT_LIMITS.codeMax}).`}
            >
              {(props) => (
                <Input
                  {...props}
                  value={values.code}
                  onChange={(event) => set("code", event.target.value.toUpperCase())}
                  placeholder="CEH-V12-A"
                  autoComplete="off"
                  disabled={submitting}
                  className="font-mono"
                />
              )}
            </Field>

            <Field
              id="cohort-name"
              label="Class name"
              required
              error={errors.name}
            >
              {(props) => (
                <Input
                  {...props}
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Autumn intake — Group A"
                  autoComplete="off"
                  disabled={submitting}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cohort-starts" label="Starts" error={errors.starts_at}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.starts_at}
                  onChange={(event) => set("starts_at", event.target.value)}
                  disabled={submitting}
                />
              )}
            </Field>
            <Field
              id="cohort-ends"
              label="Ends"
              error={errors.ends_at}
              hint="Optional. Must be after the start."
            >
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.ends_at}
                  onChange={(event) => set("ends_at", event.target.value)}
                  disabled={submitting}
                />
              )}
            </Field>
          </div>

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
                <FolderPlus className="h-4 w-4" />
              )}
              <span>Create draft class</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
