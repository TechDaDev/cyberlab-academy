"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";

/**
 * Identity of the session that may read progress: the account and the **active**
 * role, which is what the API authorises against.
 *
 * Progress resources use this inside their `useApiResource` key. When the active
 * role or the signed-in account changes, the key changes, so `useApiResource`
 * immediately drops the previous record (`data` becomes `null`) and the effect
 * cleanup marks the in-flight request cancelled — a response from the earlier
 * session can never be rendered for the new one.
 */
export function useProgressSessionKey(): string {
  const { user } = useAuth();
  return `${user?.id ?? "anonymous"}|${user?.active_role ?? "none"}`;
}

/**
 * Guard for mutations that outlive a role switch or sign-out.
 *
 * `isStale()` returns true when the session changed while a request was in
 * flight, so the caller can discard the result instead of showing a toast or
 * writing state that belongs to the previous session.
 */
export function useSessionGuard(): {
  sessionKey: string;
  isStale: (captured: string) => boolean;
} {
  const sessionKey = useProgressSessionKey();
  const latest = React.useRef(sessionKey);

  React.useEffect(() => {
    latest.current = sessionKey;
  }, [sessionKey]);

  return {
    sessionKey,
    isStale: (captured: string) => latest.current !== captured,
  };
}
