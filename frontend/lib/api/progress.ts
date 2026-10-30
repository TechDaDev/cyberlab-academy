/**
 * Milestone 02C lesson-completion and progress client.
 *
 * Four operations, mapped 1:1 to `shared-contracts/openapi.json` (API 0.5.0) and
 * issued through the same-origin `/api/v1` proxy.
 *
 * There is deliberately **no** preview-demo branch: completion evidence and
 * progress are authoritative academic records. A fabricated percentage next to a
 * real class would misrepresent a learner's record, so an unreachable backend
 * surfaces as `BACKEND_UNREACHABLE` and the screens render an unavailable state.
 */
import { apiRequest } from "@/lib/api/client";
import type {
  ClassProgress,
  CompletionRequest,
  CompletionResponse,
  EnrollmentProgress,
} from "@/lib/types/progress";

const enrollmentPath = (enrollmentId: string) =>
  `/me/enrollments/${encodeURIComponent(enrollmentId)}`;

/**
 * The only accepted completion body.
 *
 * The endpoint rejects `false`, a score, a timestamp or a client-supplied
 * `lesson_version` with `422` (`extra="forbid"`), and the lesson version is
 * always stamped by the server — so the body is a constant, not a parameter.
 */
const COMPLETION_BODY: CompletionRequest = { completed: true };

function pageQuery(
  limit?: number,
  offset?: number
): Record<string, string | undefined> {
  return {
    limit: limit === undefined ? undefined : String(limit),
    offset: offset === undefined ? undefined : String(offset),
  };
}

export const progressApi = {
  // -- student ------------------------------------------------------------

  /** Own progress only; another learner's enrollment id answers `404`. */
  async getOwnProgress(enrollmentId: string): Promise<EnrollmentProgress> {
    return apiRequest<EnrollmentProgress>(`${enrollmentPath(enrollmentId)}/progress`, {
      method: "GET",
    });
  },

  /**
   * Marks the lesson's **current** version complete for this enrollment.
   *
   * Idempotent: `201` means new evidence was recorded, `200` means this version
   * was already completed and the original `completed_at` came back unchanged.
   * Both are success — `apiRequest` resolves the parsed body for any 2xx, and the
   * body's `newly_recorded` flag carries the distinction the UI needs.
   *
   * `enrollmentId` is always an explicit context: completion evidence belongs to
   * one enrollment, and the server re-validates ownership, the class and the
   * course relationship on every call.
   */
  async completeLesson(
    enrollmentId: string,
    lessonId: string
  ): Promise<CompletionResponse> {
    return apiRequest<CompletionResponse>(
      `${enrollmentPath(enrollmentId)}/lessons/${encodeURIComponent(
        lessonId
      )}/completion`,
      { method: "PUT", body: COMPLETION_BODY }
    );
  },

  // -- instructor ---------------------------------------------------------

  /** Assigned classes only; another class answers `404`. */
  async getInstructorClassProgress(
    cohortId: string,
    limit?: number,
    offset?: number
  ): Promise<ClassProgress> {
    return apiRequest<ClassProgress>(
      `/instructor/cohorts/${encodeURIComponent(cohortId)}/progress`,
      { method: "GET", query: pageQuery(limit, offset) }
    );
  },

  // -- manager / administrator -------------------------------------------

  /** Read-only class reporting; no recent reauthentication required. */
  async getAdminClassProgress(
    cohortId: string,
    limit?: number,
    offset?: number
  ): Promise<ClassProgress> {
    return apiRequest<ClassProgress>(
      `/admin/cohorts/${encodeURIComponent(cohortId)}/progress`,
      { method: "GET", query: pageQuery(limit, offset) }
    );
  },
};

/** Exposed for contract tests: the exact body sent by `completeLesson`. */
export const COMPLETION_REQUEST_BODY = COMPLETION_BODY;
