import { ApiError, parseFastApiErrorPayload } from "@/lib/api/errors";
import type { ApiConnectionMode } from "@/lib/types/api";

export const API_BASE_PATH = "/api/v1";

type UnauthorizedListener = () => void;

let currentApiMode: ApiConnectionMode = "live";
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function isPreviewDemoFeatureAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PREVIEW_DEMO !== "false";
}

export function getApiConnectionMode(): ApiConnectionMode {
  return currentApiMode;
}

export function setApiConnectionMode(mode: ApiConnectionMode): void {
  if (mode === "preview-demo" && !isPreviewDemoFeatureAllowed()) {
    currentApiMode = "live";
    return;
  }
  currentApiMode = mode;
}

export function onUnauthorizedSession(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function notifyUnauthorizedSession(): void {
  unauthorizedListeners.forEach((listener) => listener());
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | boolean | null | undefined>;
  /**
   * Set false on login/reauth/password-check calls where 401 means "wrong password"
   * rather than an expired session cookie.
   */
  emitSessionExpiredOn401?: boolean;
}

function buildUrl(
  path: string,
  query?: Record<string, string | boolean | null | undefined>
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${API_BASE_PATH}${normalizedPath}`;
  if (!query) return fullPath;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `${fullPath}?${qs}` : fullPath;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    emitSessionExpiredOn401 = true,
  } = options;

  const url = buildUrl(path, query);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError({
      status: 503,
      detail:
        "Network error while contacting /api/v1. Verify that the application server and FastAPI backend are running.",
      code: "BACKEND_UNREACHABLE",
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let parsedPayload: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      parsedPayload = await response.json();
    } catch {
      parsedPayload = null;
    }
  }

  if (!response.ok) {
    const apiErr = parseFastApiErrorPayload(response.status, parsedPayload);
    if (apiErr.status === 401 && emitSessionExpiredOn401) {
      notifyUnauthorizedSession();
    }
    throw apiErr;
  }

  return parsedPayload as T;
}
