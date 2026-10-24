import type { StepUpReason, ValidationErrorItem } from "@/lib/types/api";
import { redactSensitiveText } from "@/lib/utils";

export class ApiError extends Error {
  public readonly status: number;
  public readonly detail: string;
  public readonly fieldErrors: Record<string, string>;
  public readonly code?: string;

  constructor(params: {
    status: number;
    detail: string;
    fieldErrors?: Record<string, string>;
    code?: string;
  }) {
    const safeDetail = redactSensitiveText(params.detail);
    super(safeDetail);
    this.name = "ApiError";
    this.status = params.status;
    this.detail = safeDetail;
    this.fieldErrors = params.fieldErrors ?? {};
    this.code = params.code;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isBackendUnreachable(): boolean {
    return this.code === "BACKEND_UNREACHABLE";
  }

  get isMfaServiceUnavailable(): boolean {
    return (
      this.status === 503 &&
      this.detail.toLowerCase().includes("mfa encryption key")
    );
  }

  get isLastAdminConflict(): boolean {
    return (
      this.status === 409 &&
      this.detail.toLowerCase().includes("last active administrator")
    );
  }

  get stepUpReason(): StepUpReason | null {
    if (this.status !== 403) return null;
    const lowered = this.detail.toLowerCase();
    if (lowered.includes("administrator mfa required")) return "admin_mfa";
    if (lowered.includes("manager mfa required")) return "manager_mfa";
    if (lowered.includes("recent mfa required")) return "recent_mfa";
    if (lowered.includes("recent authentication required")) return "recent_auth";
    return null;
  }
}

export function parseFastApiErrorPayload(
  status: number,
  payload: unknown
): ApiError {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : undefined;

    if (typeof record.detail === "string") {
      return new ApiError({
        status,
        detail: record.detail,
        code,
      });
    }

    if (Array.isArray(record.detail)) {
      const fieldErrors: Record<string, string> = {};
      const messages: string[] = [];

      for (const item of record.detail as ValidationErrorItem[]) {
        if (item && typeof item === "object" && typeof item.msg === "string") {
          const cleanMsg = item.msg.replace(/^Value error,\s*/i, "");
          const locParts = Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== "body" && part !== "query")
            : [];
          const fieldKey = locParts.length > 0 ? String(locParts[locParts.length - 1]) : "";
          if (fieldKey && !fieldErrors[fieldKey]) {
            fieldErrors[fieldKey] = cleanMsg;
          }
          messages.push(fieldKey ? `${fieldKey.replace(/_/g, " ")}: ${cleanMsg}` : cleanMsg);
        }
      }

      return new ApiError({
        status,
        detail:
          messages.length > 0
            ? messages.join("; ")
            : "Request validation failed. Check highlighted fields.",
        fieldErrors,
        code,
      });
    }
  }

  const fallbackByStatus: Record<number, string> = {
    400: "Invalid or expired request parameters.",
    401: "Authentication required or credentials invalid.",
    403: "You do not have permission to perform this operation.",
    404: "The requested record was not found.",
    409: "Operation conflicts with current account state.",
    422: "Submitted fields did not pass validation.",
    429: "Too many requests. Please wait before trying again.",
    503: "Service temporarily unavailable.",
  };

  return new ApiError({
    status,
    detail: fallbackByStatus[status] ?? `Unexpected error (HTTP ${status}).`,
  });
}
