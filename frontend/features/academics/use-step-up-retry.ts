"use client";

import * as React from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/hooks/use-auth";

const DEFAULT_CONTEXT_DESCRIPTION =
  "Publishing and editing academic content requires re-verification within the last 5 minutes.";

/** Settlement of one step-up-gated mutation. */
type StepUpOutcome<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: unknown }
  | { status: "cancelled" };

interface PendingReplay {
  /** Set synchronously before the replay request starts, so the cancellation
   * safety net never mistakes the modal's completion close for a cancel. */
  replayStarted: boolean;
  settle: (outcome: StepUpOutcome<unknown>) => void;
}

/**
 * Runs a content mutation, transparently routing a step-up rejection through the
 * existing reauthentication modal **without losing the caller's success path**.
 *
 * Every Milestone 02A mutation requires a session authenticated within the last
 * five minutes (Administrators also within five minutes of MFA). When the
 * backend answers `403 Recent authentication required` — or `403 Recent MFA
 * required` — the call is not treated as a validation failure: the modal
 * collects the credential, and the promise returned here stays pending until
 * that flow finishes.
 *
 * The caller keeps writing the natural `try/catch` + `if (result)` shape:
 *
 * ```ts
 * const created = await runWithStepUp(() => academicApi.createCourse(body));
 * if (created) { onCreated(created); close(); }
 * ```
 *
 * - replay succeeded  → resolves with the mutation result, so the caller's
 *   success handler (dialog close, toast, refresh) runs exactly once;
 * - replay failed     → rejects with the real API error, so the caller's `catch`
 *   renders it and the form data is preserved;
 * - reauth cancelled  → resolves with `undefined` and performs no mutation;
 * - non-step-up error → rejects immediately, as before.
 */
export function useStepUpRetry() {
  const { requestStepUp, stepUpState } = useAuth();
  const pendingRef = React.useRef(new Set<PendingReplay>());
  const promptWasOpenRef = React.useRef(false);

  const stepUpPromptOpen = Boolean(stepUpState?.open);

  // Safety net for closures that never reach the modal's cancel handler (session
  // cleared elsewhere, logout, or an unmount-driven close). A pending mutation is
  // cancelled only while its replay has not begun, so a successful verification —
  // which closes the modal immediately before replaying — is never cancelled.
  React.useEffect(() => {
    if (stepUpPromptOpen) {
      promptWasOpenRef.current = true;
      return;
    }
    if (!promptWasOpenRef.current) return;
    promptWasOpenRef.current = false;
    for (const pending of pendingRef.current) {
      if (!pending.replayStarted) pending.settle({ status: "cancelled" });
    }
    pendingRef.current.clear();
  }, [stepUpPromptOpen]);

  const runWithStepUp = React.useCallback(
    async <T,>(
      action: () => Promise<T>,
      contextDescription?: string
    ): Promise<T | undefined> => {
      try {
        return await action();
      } catch (err) {
        const stepUpReason = err instanceof ApiError ? err.stepUpReason : null;
        if (!stepUpReason) throw err;

        const outcome = await new Promise<StepUpOutcome<T>>((resolve) => {
          let settled = false;
          const pending: PendingReplay = {
            replayStarted: false,
            settle: (value) => {
              if (settled) return;
              settled = true;
              pendingRef.current.delete(pending);
              resolve(value as StepUpOutcome<T>);
            },
          };
          pendingRef.current.add(pending);

          requestStepUp({
            reason: stepUpReason,
            contextDescription: contextDescription ?? DEFAULT_CONTEXT_DESCRIPTION,
            onSuccess: async () => {
              // The session has been re-verified. Replay at most once, and never
              // after a cancellation that raced the verification.
              if (settled || pending.replayStarted) return;
              pending.replayStarted = true;
              try {
                const data = await action();
                pending.settle({ status: "success", data });
              } catch (replayError) {
                pending.settle({ status: "error", error: replayError });
              }
            },
            onCancel: () => pending.settle({ status: "cancelled" }),
          });
        });

        if (outcome.status === "success") return outcome.data;
        if (outcome.status === "cancelled") return undefined;
        if (outcome.error instanceof Error) throw outcome.error;
        throw new ApiError({
          status: 500,
          detail: "The verified request failed for an unknown reason.",
        });
      }
    },
    [requestStepUp]
  );

  return { runWithStepUp };
}
