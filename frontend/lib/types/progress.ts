/**
 * TypeScript mirrors of the Milestone 02C progress schemas in
 * `shared-contracts/openapi.json` (API 0.5.0).
 *
 * Every type here corresponds to a committed OpenAPI component. The completion
 * request uses `extra="forbid"` server-side, so a stray field is a `422`, not a
 * no-op: never add properties the contract does not define.
 *
 * **Percentages are server facts.** `percent_complete` and
 * `average_percent_complete` are derived by the backend on every request; the
 * client formats them and never recomputes or overrides them.
 */
import type { CohortStatus, EnrollmentStatus } from "@/lib/types/cohorts";

/** `CompletionState` — the state of one lesson within one enrollment. */
export type CompletionState = "not_started" | "current" | "needs_review";

/** `CompletionRequest` — the only accepted body. `false` is rejected (422). */
export interface CompletionRequest {
  completed: true;
}

/** `CompletionResponse` */
export interface CompletionResponse {
  enrollment_id: string;
  lesson_id: string;
  /** Server copy of the lesson's `content_version` at completion time. */
  lesson_version: number;
  /** Server-generated once, never rewritten by a repeat request. */
  completed_at: string;
  /** `true` for a `201` (new evidence); `false` for an idempotent `200`. */
  newly_recorded: boolean;
}

/** `LessonProgressEntry` */
export interface LessonProgressEntry {
  lesson_id: string;
  /** Sequence within its module, as authored. */
  sequence: number;
  title: string;
  /** The lesson's current `content_version`; never sent by the client. */
  lesson_version: number;
  status: CompletionState;
  /** Present only when `status` is `current`. */
  completed_at: string | null;
  /** Newest version with evidence — kept when `status` is `needs_review`. */
  last_completed_version: number | null;
}

/** `ModuleProgressEntry` */
export interface ModuleProgressEntry {
  module_id: string;
  sequence: number;
  title: string;
  published_lesson_count: number;
  completed_current_lessons: number;
  needs_review_lessons: number;
  percent_complete: number;
}

/** `EnrollmentProgress` — one enrollment is one progress scope. */
export interface EnrollmentProgress {
  enrollment_id: string;
  course_id: string;
  cohort_id: string;
  cohort_status: CohortStatus;
  enrollment_status: EnrollmentStatus;
  total_published_lessons: number;
  completed_current_lessons: number;
  needs_review_lessons: number;
  percent_complete: number;
  is_complete: boolean;
  modules: ModuleProgressEntry[];
  lessons: LessonProgressEntry[];
}

/** `ClassStudentProgress` — one roster row in a class progress report. */
export interface ClassStudentProgress {
  enrollment_id: string;
  student_user_id: string;
  student_full_name: string;
  enrollment_status: EnrollmentStatus;
  completed_current_lessons: number;
  total_published_lessons: number;
  needs_review_lessons: number;
  percent_complete: number;
}

/** `PageClassStudentProgress` */
export interface PageClassStudentProgress {
  items: ClassStudentProgress[];
  limit: number;
  offset: number;
  total: number;
}

/** `ClassProgress` — class aggregate plus one page of student rows. */
export interface ClassProgress {
  cohort_id: string;
  course_id: string;
  cohort_status: CohortStatus;
  total_published_lessons: number;
  /** Enrollments that are `active`; withdrawn rows are excluded from the mean. */
  total_active_enrollments: number;
  /** Every row the report can page through, withdrawn included. */
  total_visible_enrollments: number;
  /** Whole-class mean over active enrollments — never an average of one page. */
  average_percent_complete: number;
  students: PageClassStudentProgress;
}

/** Contract bounds for the two paginated class progress reads. */
export const PROGRESS_PAGE_LIMITS = {
  limitDefault: 30,
  limitMin: 1,
  limitMax: 100,
} as const;

export const COMPLETION_STATE_LABELS: Record<CompletionState, string> = {
  not_started: "Not started",
  current: "Completed",
  needs_review: "Needs review",
};

export const COMPLETION_STATES: CompletionState[] = [
  "not_started",
  "current",
  "needs_review",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Shapes the progress screens can render.
 *
 * These guards exist because a progress surface must never print a number it did
 * not receive: if a payload is missing the fields the contract requires, the
 * screen says progress is unavailable instead of falling back to `0%`.
 */
export function isEnrollmentProgress(value: unknown): value is EnrollmentProgress {
  if (!isRecord(value)) return false;
  return (
    typeof value.enrollment_id === "string" &&
    typeof value.percent_complete === "number" &&
    typeof value.total_published_lessons === "number" &&
    typeof value.completed_current_lessons === "number" &&
    Array.isArray(value.modules) &&
    Array.isArray(value.lessons)
  );
}

/** See `isEnrollmentProgress`; same rule for the class report. */
export function isClassProgress(value: unknown): value is ClassProgress {
  if (!isRecord(value)) return false;
  const page = value.students;
  return (
    typeof value.cohort_id === "string" &&
    typeof value.average_percent_complete === "number" &&
    typeof value.total_published_lessons === "number" &&
    isRecord(page) &&
    Array.isArray(page.items)
  );
}

/**
 * Format a server percentage with one decimal place, exactly as the API reports
 * it. This never derives a percentage — it only renders the number the backend
 * calculated.
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** `x / y` numerator and denominator, both server-supplied. */
export function formatLessonCounts(completed: number, total: number): string {
  return `${completed} / ${total}`;
}
