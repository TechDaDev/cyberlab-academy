"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
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
import { useStepUpRetry } from "@/features/academics/use-step-up-retry";
import {
  activationPrerequisites,
  availableTransitions,
  COHORT_TRANSITION_COPY,
  lifecycleHint,
  type CohortTransitionAction,
} from "@/features/academics/cohorts/cohort-lifecycle";
import { useToast } from "@/hooks/use-toast";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { CohortPublic } from "@/lib/types/cohorts";

const ACTION_ICON: Record<CohortTransitionAction, React.ComponentType<{ className?: string }>> = {
  activate: PlayCircle,
  complete: CheckCircle2,
  archive: Archive,
};

const ACTION_RUNNER: Record<
  CohortTransitionAction,
  (cohortId: string) => Promise<CohortPublic>
> = {
  activate: cohortsApi.activateCohort,
  complete: cohortsApi.completeCohort,
  archive: cohortsApi.archiveCohort,
};

/**
 * Class lifecycle control.
 *
 * The four statuses form a one-way path (`draft → active → completed →
 * archived`, plus `draft → archived`). Each step is its own endpoint with an
 * empty body, so the UI can never smuggle a status change into a metadata `PATCH`
 * — `CohortPatch` does not accept `status` at all.
 *
 * When the two activation gates (published course, at least one eligible
 * instructor) are known to be unmet, the action is disabled and the reason is
 * printed instead of letting the operator discover it as a `409`.
 */
export function CohortLifecyclePanel({
  cohort,
  coursePublished,
  courseKnown,
  onChanged,
}: {
  cohort: CohortPublic;
  coursePublished: boolean;
  /** False when the course list could not be read, so the gate is unverified. */
  courseKnown: boolean;
  onChanged: (cohort: CohortPublic) => void;
}) {
  const { toast } = useToast();
  const { runWithStepUp } = useStepUpRetry();
  const [pending, setPending] = React.useState<CohortTransitionAction | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const prerequisites = activationPrerequisites(cohort, coursePublished);
  const transitions = availableTransitions(cohort.status);
  const hint = lifecycleHint(cohort.status, prerequisites);
  const activationBlocked = courseKnown && !prerequisites.allowed;

  const confirm = async () => {
    if (!pending) return;
    const action = pending;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await runWithStepUp(
        () => ACTION_RUNNER[action](cohort.id),
        `Changing the lifecycle of "${cohort.name}" requires re-verification within the last 5 minutes.`
      );
      if (updated) {
        toast({
          title: `Class ${updated.status}`,
          description: `"${updated.name}" is now ${updated.status}.`,
        });
        onChanged(updated);
        setPending(null);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError
          ? err.detail
          : "The lifecycle change failed for an unknown reason."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="cyber-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          Lifecycle
        </CardTitle>
        <CardDescription className="text-xs">{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cohort.status === "draft" && activationBlocked ? (
          <Alert variant="warning">
            <CircleAlert />
            <AlertTitle className="text-xs font-semibold uppercase tracking-wider">
              Activation requirements
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {prerequisites.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {cohort.status === "draft" && !courseKnown ? (
          <Alert variant="info">
            <CircleAlert />
            <AlertDescription className="text-xs">
              The course publication state could not be verified from this
              session. Activation is still offered, and the API rejects it with an
              explanation if a prerequisite is missing.
            </AlertDescription>
          </Alert>
        ) : null}

        {transitions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No further lifecycle transitions are available from{" "}
            <span className="font-mono">{cohort.status}</span>. Archived classes
            are read-only.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {transitions.map((action) => {
              const Icon = ACTION_ICON[action];
              const disabled =
                submitting || (action === "activate" && activationBlocked);
              return (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant={action === "archive" ? "outline" : "default"}
                  disabled={disabled}
                  onClick={() => {
                    setErrorMessage(null);
                    setPending(action);
                  }}
                  aria-describedby={
                    action === "activate" && activationBlocked
                      ? "activation-requirements"
                      : undefined
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{COHORT_TRANSITION_COPY[action].label}</span>
                </Button>
              );
            })}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-[11px]">
          <div>
            <dt className="font-mono uppercase tracking-wider text-muted-foreground">
              Created
            </dt>
            <dd className="text-foreground">
              {new Date(cohort.created_at).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-mono uppercase tracking-wider text-muted-foreground">
              Last update
            </dt>
            <dd className="text-foreground">
              {new Date(cohort.updated_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </CardContent>

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setPending(null);
            setErrorMessage(null);
          }
        }}
        title={pending ? COHORT_TRANSITION_COPY[pending].title : ""}
        description={
          pending ? (
            <span>
              {COHORT_TRANSITION_COPY[pending].description}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {cohort.code}
              </span>
            </span>
          ) : null
        }
        confirmLabel={pending ? COHORT_TRANSITION_COPY[pending].confirmLabel : ""}
        variant={pending === "archive" ? "destructive" : "default"}
        isSubmitting={submitting}
        errorMessage={errorMessage}
        notice={
          pending === "activate" && activationBlocked ? (
            <ul
              id="activation-requirements"
              className="list-disc space-y-1 pl-4 text-xs text-amber-300"
            >
              {prerequisites.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null
        }
        onConfirm={confirm}
      />
    </Card>
  );
}
