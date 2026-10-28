"use client";

import * as React from "react";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { FormError } from "@/features/academics/field";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { AssignmentStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { UserPicker } from "@/features/academics/cohorts/user-picker";
import { useToast } from "@/hooks/use-toast";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { CohortInstructorPublic, CohortPublic } from "@/lib/types/cohorts";

/**
 * Instructor assignment for one class.
 *
 * Eligible instructors are found by name through the administrative directory —
 * an operator never has to paste a UUID. The list includes past assignments so
 * reassignment history stays auditable, and the API's own `active` flag — not a
 * locally inferred one — decides which badge is shown.
 *
 * Removing an assignment is a soft delete (`DELETE` → `204`) that revokes the
 * instructor's class and lesson access immediately, so it is confirmed first.
 */
export function CohortInstructorPanel({
  cohort,
  onCohortChanged,
}: {
  cohort: CohortPublic;
  onCohortChanged: () => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();
  const [assignError, setAssignError] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);
  const [removeTarget, setRemoveTarget] =
    React.useState<CohortInstructorPublic | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  const { data, error, loading, reload } = useApiResource<
    CohortInstructorPublic[]
  >(
    () => cohortsApi.listCohortInstructors(cohort.id),
    `cohort-instructors:${cohort.id}`
  );

  const copy = describeCohortError(error, "manager");
  const assignments = data ?? [];
  const active = assignments.filter((entry) => entry.active);
  const past = assignments.filter((entry) => !entry.active);
  const archived = cohort.status === "archived";

  const assign = async (user: { id: string; full_name?: string }) => {
    setAssigning(true);
    setAssignError(null);
    try {
      const created = await runWithStepUp(
        () => cohortsApi.assignCohortInstructor(cohort.id, user.id),
        "Assigning an instructor requires re-verification within the last 5 minutes."
      );
      if (created) {
        toast({
          title: "Instructor assigned",
          description: `${created.instructor_name} can now see this class and its roster.`,
        });
        reload();
        onCohortChanged();
      }
    } catch (err) {
      setAssignError(
        err instanceof ApiError
          ? err.detail
          : "Assigning the instructor failed for an unknown reason."
      );
    } finally {
      setAssigning(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = await runWithStepUp(
        () =>
          cohortsApi.removeCohortInstructor(
            cohort.id,
            removeTarget.instructor_user_id
          ),
        `Removing ${removeTarget.instructor_name} requires re-verification within the last 5 minutes.`
      );
      // `undefined` here means the operator cancelled reauthentication, not that
      // the 204 succeeded: the removal client resolves an explicit marker.
      if (result?.removed) {
        toast({
          title: "Assignment removed",
          description: `${removeTarget.instructor_name} no longer has access to this class.`,
          variant: "warning",
        });
        setRemoveTarget(null);
        reload();
        onCohortChanged();
      }
    } catch (err) {
      setRemoveError(
        err instanceof ApiError
          ? err.detail
          : "Removing the assignment failed for an unknown reason."
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-teal-400" />
          Instructors
        </CardTitle>
        <CardDescription className="text-xs">
          {cohort.active_instructor_count} live assignment
          {cohort.active_instructor_count === 1 ? "" : "s"}. Only a live
          assignment — an active account holding the Instructor role — grants
          class and lesson access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <LoadingState label="Loading assignments..." rows={2} />
        ) : error ? (
          <ErrorState
            title={copy.title}
            description={copy.description}
            onRetry={copy.retryable ? reload : undefined}
          />
        ) : (
          <>
            {active.length === 0 ? (
              <Alert variant="warning">
                <AlertDescription className="text-xs">
                  No live instructor is assigned. Activation requires at least one
                  eligible instructor, and students cannot be enrolled into a class
                  without one.
                </AlertDescription>
              </Alert>
            ) : (
              <ul className="space-y-2" aria-label="Current instructors">
                {active.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-elevated/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {entry.instructor_name}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        assigned {new Date(entry.assigned_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssignmentStatusBadge active={entry.active} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRemoveError(null);
                          setRemoveTarget(entry);
                        }}
                        aria-label={`Remove ${entry.instructor_name}`}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 rounded-lg border border-border/70 bg-surface/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Assign an instructor
              </p>
              {archived ? (
                <p className="text-[11px] text-muted-foreground">
                  This class is archived. Archived classes accept no new
                  instructors.
                </p>
              ) : (
                <>
                  <UserPicker
                    role="instructor"
                    excludeIds={active.map((entry) => entry.instructor_user_id)}
                    onSelect={assign}
                    disabled={assigning}
                    emptyLabel="No active Instructor account matched that search."
                    placeholder="Search instructors by name or email"
                  />
                  {assigning ? (
                    <p className="flex items-center gap-2 text-[11px] text-cyan-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Assigning...
                    </p>
                  ) : null}
                  <FormError message={assignError} />
                </>
              )}
            </div>

            {past.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Assignment history
                </h3>
                <ul className="space-y-1.5" aria-label="Past instructors">
                  {past.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-muted-foreground">
                          {entry.instructor_name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {entry.removed_at
                            ? `removed ${new Date(entry.removed_at).toLocaleDateString()}`
                            : "inactive"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AssignmentStatusBadge active={false} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={archived || assigning}
                          onClick={() => assign({ id: entry.instructor_user_id })}
                          aria-label={`Reassign ${entry.instructor_name}`}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Reassign</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <ConfirmActionDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removing) {
            setRemoveTarget(null);
            setRemoveError(null);
          }
        }}
        title="Remove instructor assignment?"
        description={
          <span>
            {removeTarget?.instructor_name} loses access to this class and its
            roster immediately. The assignment is kept in history and the
            instructor can be reassigned later.
          </span>
        }
        confirmLabel="Remove assignment"
        variant="destructive"
        isSubmitting={removing}
        errorMessage={removeError}
        onConfirm={confirmRemove}
      />
    </Card>
  );
}
