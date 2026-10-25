import { ApiError } from "@/lib/api/errors";

export interface AcademicErrorCopy {
  title: string;
  description: string;
  /** True when retrying cannot help until the backend is reachable again. */
  retryable: boolean;
}

/**
 * Translate a catalog failure into honest operator-facing copy.
 *
 * The important distinction is between "the catalogue is empty" (a real,
 * successful response with zero records) and "we could not reach the catalog".
 * Only the former is ever presented as an empty curriculum.
 */
export function describeAcademicError(error: ApiError | null): AcademicErrorCopy {
  if (!error) {
    return {
      title: "Unable to load academic data",
      description: "An unknown error occurred.",
      retryable: true,
    };
  }

  if (error.isBackendUnreachable) {
    return {
      title: "Academic catalog unavailable",
      description:
        "The academic catalog service cannot be reached right now. Curriculum data is served by the FastAPI backend; nothing is shown from cached or demonstration content. Start the backend (CYBERLAB_BACKEND_URL) and retry.",
      retryable: true,
    };
  }

  switch (error.status) {
    case 401:
      return {
        title: "Session expired",
        description:
          "Your session is no longer valid. Sign in again to load the academic catalog.",
        retryable: false,
      };
    case 403:
      return {
        title: "Not permitted",
        description:
          error.detail ||
          "Your active session role does not permit this academic operation.",
        retryable: false,
      };
    case 404:
      return {
        title: "Not found",
        description:
          "This record does not exist, or it is not published yet. Draft curriculum is only visible to content managers.",
        retryable: false,
      };
    case 409:
      return {
        title: "Conflicting state",
        description: error.detail,
        retryable: false,
      };
    case 422:
      return {
        title: "Validation failed",
        description: error.detail,
        retryable: false,
      };
    case 503:
      return {
        title: "Service unavailable",
        description: error.detail,
        retryable: true,
      };
    default:
      return {
        title: `Unable to load academic data (HTTP ${error.status})`,
        description: error.detail,
        retryable: error.status >= 500,
      };
  }
}

/**
 * Lesson bodies require a cohort enrollment (student) or cohort assignment
 * (instructor) that Phase 02B has not introduced yet. A `403` here is an
 * expected capability boundary, not a failure.
 */
export function isEnrollmentGateError(error: ApiError | null): boolean {
  return !!error && error.status === 403;
}
