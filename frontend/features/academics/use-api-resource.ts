"use client";

import * as React from "react";
import { ApiError } from "@/lib/api/errors";

export interface ApiResource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True only while a refetch is in flight and previous data is still shown. */
  refreshing: boolean;
  reload: () => void;
}

interface Snapshot<T> {
  /** Identity of the request that produced this snapshot. */
  token: string;
  /** Base key (without the reload nonce) so reloads can keep stale data. */
  key: string;
  data: T | null;
  error: ApiError | null;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError({
    status: 500,
    detail: "An unexpected error occurred while loading academic data.",
  });
}

/**
 * Minimal loader for a single API read.
 *
 * `key` is the identity of the request (ids, page, filters). It is used as the
 * effect dependency instead of a spread array so the hook stays lint-clean and
 * re-fetches exactly when the request identity changes. `reload()` bumps a
 * nonce, which re-issues the same request while keeping the previous data on
 * screen (`refreshing`), so mutation flows do not flash an empty state.
 *
 * Deriving `loading` from the settled request identity — instead of flipping a
 * flag inside the effect — keeps this hook compatible with the React Compiler
 * lint rules used by the project.
 */
export function useApiResource<T>(
  loader: () => Promise<T>,
  key: string
): ApiResource<T> {
  const [nonce, setNonce] = React.useState(0);
  const requestToken = `${key}#${nonce}`;
  const [snapshot, setSnapshot] = React.useState<Snapshot<T>>({
    token: "",
    key: "",
    data: null,
    error: null,
  });

  // The loader closes over component state, so keep the latest one without
  // making it an effect dependency (the request identity is `key`).
  const loaderRef = React.useRef(loader);
  React.useEffect(() => {
    loaderRef.current = loader;
  });

  React.useEffect(() => {
    let cancelled = false;
    loaderRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setSnapshot({ token: requestToken, key, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSnapshot({ token: requestToken, key, data: null, error: toApiError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [requestToken, key]);

  const settled = snapshot.token === requestToken;
  const data = snapshot.key === key ? snapshot.data : null;

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    error: settled ? snapshot.error : null,
    loading: !settled,
    refreshing: !settled && data !== null,
    reload,
  };
}
