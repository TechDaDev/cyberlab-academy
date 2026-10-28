import { ApiError } from "@/lib/api/errors";

export interface CohortErrorCopy {
  title: string;
  description: string;
  retryable: boolean;
}

type Surface = "manager" | "instructor" | "student";

const NOT_FOUND: Record<Surface, CohortErrorCopy> = {
  manager: {
    title: "Class not found",
    description:
      "This class does not exist, or it was removed. Class records are never cached locally.",
    retryable: false,
  },
  instructor: {
    title: "Class not available",
    description:
      "You do not have a live teaching assignment for this class, or it no longer exists. An assignment that was removed stops granting access immediately.",
    retryable: false,
  },
  student: {
    title: "Enrollment not found",
    description:
      "This enrollment does not exist, or it belongs to another learner. Enrollment records are only readable by their owner.",
    retryable: false,
  },
};

/**
 * Error copy for the class/enrollment surfaces.
 *
 * The differences that matter are the `404` meanings: for an instructor it means
 * "not assigned", for a student "not your enrollment". Neither is ever rendered
 * as an empty class or an empty curriculum, and no demo record is substituted.
 */
export function describeCohortError(
  error: ApiError | null,
  surface: Surface
): CohortErrorCopy {
  if (!error) {
    return {
      title: "Unable to load class data",
      description: "An unknown error occurred.",
      retryable: true,
    };
  }

  if (error.isBackendUnreachable) {
    return {
      title: "Class service unavailable",
      description:
        "The FastAPI backend cannot be reached through /api/v1. Class, assignment and enrollment data are authoritative records, so nothing is shown from cached or demonstration content. Start the backend (CYBERLAB_BACKEND_URL) and retry.",
      retryable: true,
    };
  }

  switch (error.status) {
    case 401:
      return {
        title: "Session expired",
        description:
          "Your session is no longer valid. Sign in again to load class data.",
        retryable: false,
      };
    case 403:
      return {
        title: "Not permitted",
        description:
          error.detail ||
          "Your active session role does not permit this class operation.",
        retryable: false,
      };
    case 404:
      return NOT_FOUND[surface];
    case 409:
      return {
        title: "Conflicting class state",
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
        title: `Unable to load class data (HTTP ${error.status})`,
        description: error.detail,
        retryable: error.status >= 500,
      };
  }
}
