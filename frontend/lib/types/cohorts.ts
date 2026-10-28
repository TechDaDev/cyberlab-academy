/**
 * TypeScript mirrors of the Milestone 02B class/enrollment schemas in
 * `shared-contracts/openapi.json` (API 0.4.0).
 *
 * Every type here corresponds to a committed OpenAPI component. Requests use
 * `extra="forbid"` server-side, so a stray field is a `422`, not a no-op: do not
 * add properties the contract does not define.
 */
import type { CoursePublic } from "@/lib/types/academic";

export type CohortStatus = "draft" | "active" | "completed" | "archived";

export type EnrollmentStatus = "active" | "withdrawn";

/** `CohortPublic` — counts are server-computed and never sent by clients. */
export interface CohortPublic {
  id: string;
  course_id: string;
  code: string;
  name: string;
  status: CohortStatus;
  starts_at: string | null;
  ends_at: string | null;
  active_instructor_count: number;
  active_enrollment_count: number;
  created_at: string;
  updated_at: string;
}

/** `PageCohorts` */
export interface PageCohorts {
  items: CohortPublic[];
  limit: number;
  offset: number;
  total: number;
}

/** `CohortInstructorPublic` — `active` reflects the backend's `removed_at` state. */
export interface CohortInstructorPublic {
  id: string;
  cohort_id: string;
  instructor_user_id: string;
  instructor_name: string;
  active: boolean;
  assigned_at: string;
  removed_at: string | null;
}

/** `EnrollmentPublic` */
export interface EnrollmentPublic {
  id: string;
  cohort_id: string;
  course_id: string;
  student_user_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  ended_at: string | null;
}

/** `PageEnrollments` */
export interface PageEnrollments {
  items: EnrollmentPublic[];
  limit: number;
  offset: number;
  total: number;
}

/** `RosterEntry` — visible only to a live-assigned instructor of that class. */
export interface RosterEntry {
  user_id: string;
  full_name: string;
  email: string;
  email_verified: boolean;
  status: EnrollmentStatus;
  enrolled_at: string;
}

/** `PageRoster` */
export interface PageRoster {
  items: RosterEntry[];
  limit: number;
  offset: number;
  total: number;
}

/** `StudentEnrollmentPublic` — a student's own record; no other learner's data. */
export interface StudentEnrollmentPublic {
  id: string;
  cohort_id: string;
  cohort_code: string;
  cohort_name: string;
  cohort_status: CohortStatus;
  course_id: string;
  course_code: string;
  course_title: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  ended_at: string | null;
}

/** `PageStudentEnrollments` */
export interface PageStudentEnrollments {
  items: StudentEnrollmentPublic[];
  limit: number;
  offset: number;
  total: number;
}

/** `OwnEnrollmentCourse` */
export interface OwnEnrollmentCourse {
  enrollment: StudentEnrollmentPublic;
  cohort: CohortPublic;
  course: CoursePublic;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** `CohortCreate` — `course_id` is immutable once the class exists. */
export interface CohortCreateRequest {
  course_id: string;
  code: string;
  name: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** `CohortPatch` — status is deliberately absent; transitions use their own endpoints. */
export interface CohortPatchRequest {
  name?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** `CohortInstructorAssign` */
export interface CohortInstructorAssignRequest {
  instructor_user_id: string;
}

/** `EnrollmentCreate` */
export interface EnrollmentCreateRequest {
  student_user_id: string;
}

/** `EnrollmentTransition` */
export interface EnrollmentTransitionRequest {
  status: EnrollmentStatus;
}

// ---------------------------------------------------------------------------
// Contract bounds and presentation helpers
// ---------------------------------------------------------------------------

export const COHORT_LIMITS = {
  codeMin: 2,
  codeMax: 40,
  codePattern: /^[A-Z0-9-]+$/,
  nameMin: 1,
  nameMax: 160,
} as const;

export const COHORT_PAGE_LIMITS = {
  limitDefault: 30,
  limitMin: 1,
  limitMax: 100,
} as const;

export const COHORT_STATUS_LABELS: Record<CohortStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: "Enrolled",
  withdrawn: "Withdrawn",
};

export const COHORT_STATUSES: CohortStatus[] = [
  "draft",
  "active",
  "completed",
  "archived",
];

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["active", "withdrawn"];
