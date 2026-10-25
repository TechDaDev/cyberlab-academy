"use client";

import * as React from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/hooks/use-auth";

/**
 * Runs a content mutation, transparently routing a step-up rejection through the
 * existing reauthentication modal.
 *
 * Every Milestone 02A mutation requires a session authenticated within the last
 * five minutes (Administrators also within five minutes of MFA). When the
 * backend answers `403 Recent authentication required` — or `403 Recent MFA
 * required` — the caller must not treat that as a validation failure. The modal
 * collects the credential and re-issues the exact same operation.
 *
 * Non-step-up errors are rethrown so callers can render them inline and keep the
 * user's form state intact.
 */
export function useStepUpRetry() {
  const { requestStepUp } = useAuth();

  const runWithStepUp = React.useCallback(
    async <T,>(
      action: () => Promise<T>,
      contextDescription?: string
    ): Promise<T | undefined> => {
      try {
        return await action();
      } catch (err) {
        if (err instanceof ApiError && err.stepUpReason) {
          requestStepUp({
            reason: err.stepUpReason,
            contextDescription:
              contextDescription ??
              "Publishing and editing academic content requires re-verification within the last 5 minutes.",
            onSuccess: async () => {
              await action();
            },
          });
          return undefined;
        }
        throw err;
      }
    },
    [requestStepUp]
  );

  return { runWithStepUp };
}
