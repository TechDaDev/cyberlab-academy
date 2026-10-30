import { ApiError } from "@/lib/api/errors";

export interface ProgressErrorCopy {
  title: string;
  description: string;
  retryable: boolean;
}

type ProgressSurface = "student" | "instructor" | "manager";

const PROGRESS_NOT_FOUND: Record<ProgressSurface, ProgressErrorCopy> = {
  student: {
    title: "Progress unavailable",
    description:
      "This enrollment does not exist, or it belongs to another learner. Progress is only readable for your own enrollments and is never cached locally.",
    retryable: false,
  },
  instructor: {
    title: "Class progress unavailable",
    description:
      "You do not have a live teaching assignment for this class, or the class no longer exists. A removed assignment stops granting access immediately.",
    retryable: false,
  },
  manager: {
    title: "Class not found",
    description:
      "This class does not exist, or it was removed. Class reporting is read live from the backend.",
    retryable: false,
  },
};

/**
 * Error copy for the 02C progress surfaces.
 *
 * A `404` is a capability answer, not an empty class: for a student it means "not
 * your enrollment", for an instructor "not assigned". No progress number is ever
 * invented to fill the space, and an unreachable backend says so instead of
 * showing a plausible-looking zero.
 */
export function describeProgressError(
  error: ApiError | null,
  surface: ProgressSurface
): ProgressErrorCopy {
  if (!error) {
    return {
      title: "Unable to load progress",
      description: "An unknown error occurred.",
      retryable: true,
    };
  }

  if (error.isBackendUnreachable) {
    return {
      title: "Progress service unavailable",
      description:
        "The FastAPI backend cannot be reached through /api/v1. Completion evidence and progress are authoritative records, so nothing is shown from cached or demonstration content. Start the backend (CYBERLAB_BACKEND_URL) and retry.",
      retryable: true,
    };
  }

  switch (error.status) {
    case 401:
      return {
        title: "Session expired",
        description: "Your session is no longer valid. Sign in again to load progress.",
        retryable: false,
      };
    case 403:
      return {
        title: "Not permitted",
        description:
          error.detail ||
          "Your active session role does not permit this progress operation.",
        retryable: false,
      };
    case 404:
      return PROGRESS_NOT_FOUND[surface];
    case 422:
      return {
        title: "Progress cannot be recorded",
        description:
          error.detail ||
          "The backend rejected this request. Completion needs an active student enrollment in an active class with this lesson published in the same course.",
        retryable: false,
      };
    case 429:
      return {
        title: "Too many requests",
        description:
          error.detail || "Slow down for a moment, then try again.",
        retryable: true,
      };
    case 503:
      return { title: "Service unavailable", description: error.detail, retryable: true };
    default:
      return {
        title: `Unable to load progress (HTTP ${error.status})`,
        description: error.detail,
        retryable: error.status >= 500,
      };
  }
}

/**
 * Copy for a failed `PUT .../completion`.
 *
 * Every branch states that nothing was recorded, because a rejected completion
 * must never look like a success. `422` is the common case: withdrawn enrollment,
 * inactive class, unpublished lesson, or a lesson from another course.
 */
export function describeCompletionError(error: ApiError | null): ProgressErrorCopy {
  if (!error) {
    return {
      title: "Completion not recorded",
      description:
        "The completion request did not finish. Your progress was not changed.",
      retryable: true,
    };
  }

  if (error.isBackendUnreachable) {
    return {
      title: "Completion not recorded",
      description:
        "The backend cannot be reached, so nothing was saved. Retry once it is available; progress is only ever read from the server.",
      retryable: true,
    };
  }

  switch (error.status) {
    case 401:
      return {
        title: "Session expired — completion not recorded",
        description: "Sign in again to record lesson completion.",
        retryable: false,
      };
    case 403:
      return {
        title: "Not permitted — completion not recorded",
        description:
          error.detail ||
          "Only a signed-in student with a verified email can record completion for their own enrollment.",
        retryable: false,
      };
    case 404:
      return {
        title: "Completion not recorded",
        description:
          "This enrollment or lesson is not available to you. Nothing was recorded.",
        retryable: false,
      };
    case 422:
      return {
        title: "Completion not recorded",
        description:
          error.detail ||
          "The lesson cannot be completed in this enrollment right now. Completion needs an active enrollment in an active class, with the lesson published and belonging to the same course.",
        retryable: false,
      };
    case 429:
      return {
        title: "Too many attempts",
        description: "Nothing was recorded. Wait a moment, then try again.",
        retryable: true,
      };
    case 503:
      return {
        title: "Completion not recorded",
        description: error.detail || "The service is unavailable. Nothing was saved.",
        retryable: true,
      };
    default:
      return {
        title: `Completion not recorded (HTTP ${error.status})`,
        description: error.detail,
        retryable: error.status >= 500,
      };
  }
}
