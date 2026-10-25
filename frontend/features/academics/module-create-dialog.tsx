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
  validateModuleCreate,
  type FieldErrors,
  type ModuleCreateValues,
} from "@/features/academics/validation";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import { MODULE_LIMITS, type ModulePublic } from "@/lib/types/academic";

export function ModuleCreateDialog({
  open,
  onOpenChange,
  courseId,
  plannedModuleCount,
  nextSequence,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  plannedModuleCount: number;
  nextSequence: number;
  onCreated: (module: ModulePublic) => void;
}) {
  const [values, setValues] = React.useState<ModuleCreateValues>({
    sequence: String(nextSequence),
    title: "",
    summary: "",
  });
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
      setValues({ sequence: String(nextSequence), title: "", summary: "" });
      setErrors({});
      setFormError(null);
      setSubmitting(false);
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateModuleCreate(values, plannedModuleCount);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const created = await runWithStepUp(
        () =>
          academicApi.createModule(courseId, {
            sequence: Number(values.sequence),
            title: values.title.trim(),
            summary: values.summary.trim(),
          }),
        "Creating a module draft requires re-verification within the last 5 minutes."
      );
      if (created) {
        onCreated(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Unique (course_id, sequence): the position is already occupied.
          setErrors({
            sequence: `Sequence ${values.sequence} is already used by another module in this course.`,
          });
        } else if (Object.keys(err.fieldErrors).length > 0) {
          setErrors(err.fieldErrors);
        }
        setFormError(err.detail);
      } else {
        setFormError("Module creation failed for an unknown reason.");
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
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create module draft</DialogTitle>
            <DialogDescription>
              Modules are created as drafts. Sequence must be unique within the
              course and within its {plannedModuleCount} planned positions.
            </DialogDescription>
          </DialogHeader>

          <FormError message={formError} />

          <Field
            id="module-sequence"
            label="Sequence"
            required
            error={errors.sequence}
            hint={`1–${plannedModuleCount} for this course. Positions are immutable identifiers of curriculum order.`}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={MODULE_LIMITS.sequenceMin}
                value={values.sequence}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, sequence: e.target.value }))
                }
                className="font-mono"
              />
            )}
          </Field>

          <Field
            id="module-title"
            label="Title"
            required
            error={errors.title}
            hint={`${MODULE_LIMITS.titleMin}–${MODULE_LIMITS.titleMax} characters. Use the confirmed source title only.`}
          >
            {(props) => (
              <Input
                {...props}
                value={values.title}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Introduction to Ethical Hacking"
                autoComplete="off"
              />
            )}
          </Field>

          <Field
            id="module-summary"
            label="Summary"
            error={errors.summary}
            hint="Optional. Do not write content for modules whose source material is unavailable."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={values.summary}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, summary: e.target.value }))
                }
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
              <span>Create module</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
