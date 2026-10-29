"use client";

import * as React from "react";
import { GraduationCap, Loader2, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { FormError } from "@/features/academics/field";
import { useApiResource } from "@/features/academics/use-api-resource";
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import { describeCohortError } from "@/features/academics/cohorts/cohort-errors";
import { EnrollmentStatusBadge } from "@/features/academics/cohorts/cohort-status-badge";
import { PaginationBar, ToolbarSelect } from "@/features/academics/cohorts/cohort-controls";
import { UserPicker } from "@/features/academics/cohorts/user-picker";
import { useToast } from "@/hooks/use-toast";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { AdminUserPublic } from "@/lib/types/api";
import type {
  CohortPublic,
  EnrollmentPublic,
  EnrollmentStatus,
  PageEnrollments,
} from "@/lib/types/cohorts";

const PAGE_SIZE = 20;

const ELIGIBILITY_RULES = [
  "The class must be active.",
  "The account must be active.",
  "The account must hold the Student role.",
  "The email address must be verified.",
];

/**
 * Enrollment administration for one class.
 *
 * The roster is read from the API with server-side status filtering and paging.
 * A student is added by selecting a real account from the directory — there is no
 * self-enrollment path, and the client never invents an enrollment. A `409` is
 * expected when a student is already on the roster: the reason is shown and the
 * roster is refetched so the page cannot disagree with the server.
 *
 * Each row is labelled with `student_full_name`, which the API derives from the
 * student's account on every read. The client keeps no name cache of its own: names
 * therefore survive reloads and follow profile changes, and nothing has to be
 * fetched from the user directory to resolve them.
 */
export function CohortEnrollmentPanel({
  cohort,
  onCohortChanged,
}: {
  cohort: CohortPublic;
  onCohortChanged: () => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();
  const [statusFilter, setStatusFilter] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [transitionTarget, setTransitionTarget] = React.useState<{
    enrollment: EnrollmentPublic;
    next: EnrollmentStatus;
  } | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);
  const [transitionError, setTransitionError] = React.useState<string | null>(null);

  const { data, error, loading, reload } = useApiResource<PageEnrollments>(
    () =>
      cohortsApi.listCohortEnrollments(cohort.id, {
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    `cohort-enrollments:${cohort.id}:${statusFilter}:${offset}`
  );

  const copy = describeCohortError(error, "manager");
  const items = data?.items ?? [];
  const classActive = cohort.status === "active";

  const refresh = () => {
    reload();
    onCohortChanged();
  };

  const addStudent = async (user: AdminUserPublic) => {
    setAdding(true);
    setAddError(null);
    try {
      const created = await runWithStepUp(
        () => cohortsApi.createEnrollment(cohort.id, user.id),
        "Enrolling a student requires re-verification within the last 5 minutes."
      );
      if (created) {
        toast({
          title: "Student enrolled",
          description: `${user.full_name} was added to "${cohort.name}".`,
        });
        refresh();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setAddError(err.detail);
        // A duplicate (or any conflicting state) means this page is stale:
        // refetch so the operator sees the enrollment that already exists.
        if (err.status === 409) refresh();
      } else {
        setAddError("Enrolling the student failed for an unknown reason.");
      }
    } finally {
      setAdding(false);
    }
  };

  const confirmTransition = async () => {
    if (!transitionTarget) return;
    const { enrollment, next } = transitionTarget;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await runWithStepUp(
        () => cohortsApi.updateEnrollment(enrollment.id, next),
        next === "withdrawn"
          ? "Withdrawing a student requires re-verification within the last 5 minutes."
          : "Reactivating an enrollment requires re-verification within the last 5 minutes."
      );
      if (updated) {
        toast({
          title: next === "withdrawn" ? "Student withdrawn" : "Enrollment reactivated",
          description:
            next === "withdrawn"
              ? "The learner keeps the enrollment record but loses lesson access."
              : "The learner regains access while the class stays active.",
          variant: next === "withdrawn" ? "warning" : "success",
        });
        setTransitionTarget(null);
        refresh();
      }
    } catch (err) {
      setTransitionError(
        err instanceof ApiError
          ? err.detail
          : "The enrollment change failed for an unknown reason."
      );
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-4 w-4 text-cyan-400" />
          Enrollment roster
        </CardTitle>
        <CardDescription className="text-xs">
          {cohort.active_enrollment_count} active enrollment
          {cohort.active_enrollment_count === 1 ? "" : "s"}. A withdrawn
          enrollment is a retained record, not access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          <AlertTitle className="text-xs font-semibold uppercase tracking-wider">
            Eligibility rules enforced by the API
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {ELIGIBILITY_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Students cannot enroll themselves, and this roster is only readable
              by class managers and the class&rsquo;s assigned instructors.
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-2 rounded-lg border border-border/70 bg-surface/40 p-3">
          <p className="text-xs font-medium text-foreground">
            Add an enrolled student
          </p>
          {classActive ? (
            <>
              <UserPicker
                role="student"
                excludeIds={[]}
                onSelect={addStudent}
                disabled={adding}
                placeholder="Search students by name or email"
                emptyLabel="No active Student account matched that search."
                hintFor={(user) =>
                  user.email_verified
                    ? null
                    : "Email is not verified — enrollment will be rejected."
                }
              />
              {adding ? (
                <p className="flex items-center gap-2 text-[11px] text-cyan-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Enrolling...
                </p>
              ) : null}
              <FormError message={addError} />
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              New enrollments require an active class. This class is{" "}
              <span className="font-mono">{cohort.status}</span>.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <ToolbarSelect
            label="Enrollment status"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setOffset(0);
            }}
            allLabel="All enrollments"
            options={[
              { value: "active", label: "Enrolled" },
              { value: "withdrawn", label: "Withdrawn" },
            ]}
          />
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Refresh roster</span>
          </Button>
        </div>

        {loading && !data ? (
          <LoadingState label="Loading enrollments..." rows={3} />
        ) : error ? (
          <ErrorState
            title={copy.title}
            description={copy.description}
            onRetry={copy.retryable ? reload : undefined}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={
              statusFilter ? "No enrollments with that status" : "No students enrolled yet"
            }
            description={
              statusFilter
                ? "Change the status filter to see the rest of the roster."
                : "Search for an existing Student account above to enroll them. Students cannot enroll themselves."
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Enrollments for this class with status and dates
                </caption>
                <thead>
                  <tr className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Student
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Enrolled
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Ended
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((enrollment) => (
                    <tr
                      key={enrollment.id}
                      className="border-b border-border/40 align-middle last:border-0"
                    >
                      <td className="py-2.5 pr-3">
                        {/* Server-derived on every read, so the name survives a
                            reload and follows later profile changes. */}
                        <p className="text-sm font-medium text-foreground">
                          {enrollment.student_full_name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {enrollment.student_user_id}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <EnrollmentStatusBadge status={enrollment.status} />
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-muted-foreground">
                        {new Date(enrollment.enrolled_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-muted-foreground">
                        {enrollment.ended_at
                          ? new Date(enrollment.ended_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        {enrollment.status === "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTransitionError(null);
                              setTransitionTarget({
                                enrollment,
                                next: "withdrawn",
                              });
                            }}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            <span>Withdraw</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!classActive}
                            onClick={() => {
                              setTransitionError(null);
                              setTransitionTarget({ enrollment, next: "active" });
                            }}
                            title={
                              classActive
                                ? undefined
                                : "Reactivation requires an active class."
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reactivate</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              limit={data?.limit ?? PAGE_SIZE}
              offset={data?.offset ?? offset}
              total={data?.total ?? items.length}
              shown={items.length}
              onChange={setOffset}
              itemLabel="enrollments"
            />
          </div>
        )}
      </CardContent>

      <ConfirmActionDialog
        open={transitionTarget !== null}
        onOpenChange={(open) => {
          if (!open && !transitioning) {
            setTransitionTarget(null);
            setTransitionError(null);
          }
        }}
        title={
          transitionTarget?.next === "withdrawn"
            ? "Withdraw this student?"
            : "Reactivate this enrollment?"
        }
        description={
          transitionTarget?.next === "withdrawn" ? (
            <span>
              The student keeps the enrollment record but loses access to this
              class and to every published lesson of its course while withdrawn.
            </span>
          ) : (
            <span>
              The student regains access to this class. Reactivation requires the
              class to stay active.
            </span>
          )
        }
        confirmLabel={
          transitionTarget?.next === "withdrawn" ? "Withdraw" : "Reactivate"
        }
        variant={transitionTarget?.next === "withdrawn" ? "destructive" : "default"}
        isSubmitting={transitioning}
        errorMessage={transitionError}
        onConfirm={confirmTransition}
      />
    </Card>
  );
}
