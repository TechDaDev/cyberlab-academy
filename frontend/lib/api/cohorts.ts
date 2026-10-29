/**
 * Milestone 02B class, assignment and enrollment client.
 *
 * Every method maps 1:1 to an operation in `shared-contracts/openapi.json`
 * (API 0.4.0) and goes through the same-origin `/api/v1` proxy client.
 *
 * There is deliberately **no** preview-demo branch: class membership, rosters
 * and enrollment state are authoritative academic records. Substituting fixtures
 * would show a learner an enrollment they do not have, so an unreachable backend
 * surfaces as `BACKEND_UNREACHABLE` and the screens render an unavailable state.
 */
import { apiRequest } from "@/lib/api/client";
import type { AdminUserPublic, Role } from "@/lib/types/api";
import type {
  CohortCreateRequest,
  CohortInstructorPublic,
  CohortPatchRequest,
  CohortPublic,
  EnrollmentPublic,
  OwnEnrollmentCourse,
  PageCohorts,
  PageEnrollments,
  PageRoster,
  PageStudentEnrollments,
} from "@/lib/types/cohorts";

function pageQuery(
  limit?: number,
  offset?: number,
  extra: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    ...extra,
    limit: limit === undefined ? undefined : String(limit),
    offset: offset === undefined ? undefined : String(offset),
  };
}

const cohortPath = (cohortId: string) =>
  `/admin/cohorts/${encodeURIComponent(cohortId)}`;

export interface ListCohortsFilters {
  courseId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListEnrollmentsFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

export const cohortsApi = {
  // -- administration: classes -------------------------------------------

  async listCohorts(filters: ListCohortsFilters = {}): Promise<PageCohorts> {
    return apiRequest<PageCohorts>("/admin/cohorts", {
      method: "GET",
      query: pageQuery(filters.limit, filters.offset, {
        course_id: filters.courseId?.trim() || undefined,
        status: filters.status?.trim() || undefined,
      }),
    });
  },

  /** Always creates a `draft`; the server owns status and the course link. */
  async createCohort(payload: CohortCreateRequest): Promise<CohortPublic> {
    return apiRequest<CohortPublic>("/admin/cohorts", {
      method: "POST",
      body: payload,
    });
  },

  async getCohort(cohortId: string): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(cohortPath(cohortId), { method: "GET" });
  },

  /** Metadata only. Sending `course_id` or `status` is a `422`. */
  async updateCohort(
    cohortId: string,
    payload: CohortPatchRequest
  ): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(cohortPath(cohortId), {
      method: "PATCH",
      body: payload,
    });
  },

  async activateCohort(cohortId: string): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(`${cohortPath(cohortId)}/activate`, {
      method: "POST",
    });
  },

  async completeCohort(cohortId: string): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(`${cohortPath(cohortId)}/complete`, {
      method: "POST",
    });
  },

  async archiveCohort(cohortId: string): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(`${cohortPath(cohortId)}/archive`, {
      method: "POST",
    });
  },

  // -- administration: instructor assignments ----------------------------

  /** Active **and** past assignments, ordered by `assigned_at`. */
  async listCohortInstructors(
    cohortId: string
  ): Promise<CohortInstructorPublic[]> {
    return apiRequest<CohortInstructorPublic[]>(
      `${cohortPath(cohortId)}/instructors`,
      { method: "GET" }
    );
  },

  async assignCohortInstructor(
    cohortId: string,
    instructorUserId: string
  ): Promise<CohortInstructorPublic> {
    return apiRequest<CohortInstructorPublic>(
      `${cohortPath(cohortId)}/instructors`,
      { method: "POST", body: { instructor_user_id: instructorUserId } }
    );
  },

  /**
   * Soft-removes an assignment. The endpoint answers `204 No Content`.
   *
   * `runWithStepUp` resolves `undefined` when the operator cancels
   * reauthentication, which would be indistinguishable from a successful 204.
   * Returning an explicit completion marker keeps "removed" and "cancelled"
   * distinguishable at every call site.
   */
  async removeCohortInstructor(
    cohortId: string,
    instructorUserId: string
  ): Promise<{ removed: true }> {
    await apiRequest<void>(
      `${cohortPath(cohortId)}/instructors/${encodeURIComponent(
        instructorUserId
      )}`,
      { method: "DELETE" }
    );
    return { removed: true };
  },

  // -- administration: enrollments ---------------------------------------

  async listCohortEnrollments(
    cohortId: string,
    filters: ListEnrollmentsFilters = {}
  ): Promise<PageEnrollments> {
    return apiRequest<PageEnrollments>(`${cohortPath(cohortId)}/enrollments`, {
      method: "GET",
      query: pageQuery(filters.limit, filters.offset, {
        status: filters.status?.trim() || undefined,
      }),
    });
  },

  async createEnrollment(
    cohortId: string,
    studentUserId: string
  ): Promise<EnrollmentPublic> {
    return apiRequest<EnrollmentPublic>(`${cohortPath(cohortId)}/enrollments`, {
      method: "POST",
      body: { student_user_id: studentUserId },
    });
  },

  /** `active ↔ withdrawn`. Sending the current status is a `409`. */
  async updateEnrollment(
    enrollmentId: string,
    status: "active" | "withdrawn"
  ): Promise<EnrollmentPublic> {
    return apiRequest<EnrollmentPublic>(
      `/admin/enrollments/${encodeURIComponent(enrollmentId)}`,
      { method: "PATCH", body: { status } }
    );
  },

  // -- eligibility search (existing administrative directory) --------------

  /**
   * Looks up accounts eligible for assignment/enrollment through the existing
   * `GET /admin/users` directory, filtered server-side by role and activity.
   *
   * Called directly rather than through `adminApi.listUsers` so the result can
   * never be satisfied by preview-demo fixtures: an operator must never be able
   * to enroll a fabricated account into a real class.
   */
  async listEligibleUsers(role: Role, search?: string): Promise<AdminUserPublic[]> {
    return apiRequest<AdminUserPublic[]>("/admin/users", {
      method: "GET",
      query: {
        role,
        active: "true",
        search: search?.trim() || undefined,
      },
    });
  },

  // -- instructor surface -------------------------------------------------

  async listTeachingCohorts(limit?: number, offset?: number): Promise<PageCohorts> {
    return apiRequest<PageCohorts>("/instructor/cohorts", {
      method: "GET",
      query: pageQuery(limit, offset),
    });
  },

  async getTeachingCohort(cohortId: string): Promise<CohortPublic> {
    return apiRequest<CohortPublic>(
      `/instructor/cohorts/${encodeURIComponent(cohortId)}`,
      { method: "GET" }
    );
  },

  async listCohortRoster(
    cohortId: string,
    limit?: number,
    offset?: number
  ): Promise<PageRoster> {
    return apiRequest<PageRoster>(
      `/instructor/cohorts/${encodeURIComponent(cohortId)}/students`,
      { method: "GET", query: pageQuery(limit, offset) }
    );
  },

  // -- student surface ----------------------------------------------------

  async listOwnEnrollments(
    limit?: number,
    offset?: number
  ): Promise<PageStudentEnrollments> {
    return apiRequest<PageStudentEnrollments>("/me/enrollments", {
      method: "GET",
      query: pageQuery(limit, offset),
    });
  },

  /** Another learner's enrollment id answers `404` — existence is concealed. */
  async getOwnEnrollmentCourse(enrollmentId: string): Promise<OwnEnrollmentCourse> {
    return apiRequest<OwnEnrollmentCourse>(
      `/me/enrollments/${encodeURIComponent(enrollmentId)}/course`,
      { method: "GET" }
    );
  },
};
