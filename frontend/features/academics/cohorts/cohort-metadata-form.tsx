"use client";

import * as React from "react";
import { Lock, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/features/academics/field";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import type { FieldErrors } from "@/features/academics/validation";
import {
  toIsoOrNull,
  toLocalInputValue,
  validateCohortPatch,
  type CohortPatchValues,
} from "@/features/academics/cohorts/cohort-validation";
import { useToast } from "@/hooks/use-toast";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import { COHORT_LIMITS, type CohortPublic } from "@/lib/types/cohorts";

function fromCohort(cohort: CohortPublic): CohortPatchValues {
  return {
    name: cohort.name,
    starts_at: toLocalInputValue(cohort.starts_at),
    ends_at: toLocalInputValue(cohort.ends_at),
  };
}

/**
 * Metadata editing for one class.
 *
 * Only the three fields `CohortPatch` defines are editable: `name`, `starts_at`
 * and `ends_at`. The course association is fixed at creation and status is owned
 * by the lifecycle endpoints, so neither appears as a control — sending either
 * one would fail the request with `422` because request bodies forbid unknown
 * fields.
 */
export function CohortMetadataForm({
  cohort,
  courseLabel,
  onSaved,
  disabled,
}: {
  cohort: CohortPublic;
  /** Course code/title, when the catalog has already resolved the association. */
  courseLabel?: string;
  onSaved: (cohort: CohortPublic) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();
  const [values, setValues] = React.useState<CohortPatchValues>(() =>
    fromCohort(cohort)
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Re-seed the inputs when the record itself changes (for example after a
  // lifecycle transition or an external refresh) without an effect.
  const [syncedTo, setSyncedTo] = React.useState(cohort.updated_at);
  if (cohort.updated_at !== syncedTo) {
    setSyncedTo(cohort.updated_at);
    setValues(fromCohort(cohort));
    setErrors({});
    setFormError(null);
  }

  const set = (key: keyof CohortPatchValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateCohortPatch(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await runWithStepUp(
        () =>
          cohortsApi.updateCohort(cohort.id, {
            name: values.name.trim(),
            starts_at: toIsoOrNull(values.starts_at),
            ends_at: toIsoOrNull(values.ends_at),
          }),
        "Editing class details requires re-verification within the last 5 minutes."
      );
      if (updated) {
        toast({
          title: "Class updated",
          description: `"${updated.name}" saved. Status is unchanged — lifecycle moves use their own actions.`,
        });
        setValues(fromCohort(updated));
        setSyncedTo(updated.updated_at);
        onSaved(updated);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
        setFormError(err.detail);
      } else {
        setFormError("The update failed for an unknown reason.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const archiveLocked = cohort.status === "archived";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Class details</CardTitle>
        <CardDescription className="text-xs">
          Name and teaching window only. The course association is fixed, and
          status is changed through the lifecycle actions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormError message={formError} />

          <Field
            id="cohort-edit-name"
            label="Class name"
            required
            error={errors.name}
            hint={`Up to ${COHORT_LIMITS.nameMax} characters.`}
          >
            {(props) => (
              <Input
                {...props}
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                disabled={submitting || disabled || archiveLocked}
                autoComplete="off"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cohort-edit-starts" label="Starts" error={errors.starts_at}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.starts_at}
                  onChange={(event) => set("starts_at", event.target.value)}
                  disabled={submitting || disabled || archiveLocked}
                />
              )}
            </Field>
            <Field
              id="cohort-edit-ends"
              label="Ends"
              error={errors.ends_at}
              hint="Must be after the start."
            >
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.ends_at}
                  onChange={(event) => set("ends_at", event.target.value)}
                  disabled={submitting || disabled || archiveLocked}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/70 bg-surface-elevated/30 p-3 text-[11px] text-muted-foreground sm:grid-cols-3">
            <div>
              <p className="font-mono uppercase tracking-wider">Class code</p>
              <p className="font-mono text-foreground">{cohort.code}</p>
            </div>
            <div>
              <p className="font-mono uppercase tracking-wider">Course</p>
              <p className="truncate font-mono text-foreground">
                {courseLabel ?? cohort.course_id}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 font-mono uppercase tracking-wider">
                <Lock className="h-3 w-3" /> Immutable
              </p>
              <p className="text-foreground">Course link &amp; status</p>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={submitting || disabled || archiveLocked}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Save details</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
