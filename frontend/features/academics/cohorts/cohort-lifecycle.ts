import type { CohortPublic, CohortStatus } from "@/lib/types/cohorts";

/**
 * Class lifecycle rules for Milestone 02B.
 *
 * The server is the authority — every rule here mirrors a documented `409` and
 * exists only so the UI can explain *why* an action is unavailable instead of
 * offering a button that fails. Nothing in this module is an authorization
 * check: the API re-validates each transition.
 *
 * Allowed: `draft → active → completed → archived` plus `draft → archived`.
 * There are no backward transitions and no delete.
 */

export type CohortTransitionAction = "activate" | "complete" | "archive";

export const COHORT_TRANSITION_PATH: Record<CohortTransitionAction, string> = {
  activate: "activate",
  complete: "complete",
  archive: "archive",
};

const ALLOWED_FROM: Record<CohortTransitionAction, CohortStatus[]> = {
  activate: ["draft"],
  complete: ["active"],
  archive: ["draft", "completed"],
};

export const COHORT_TRANSITION_COPY: Record<
  CohortTransitionAction,
  { label: string; title: string; description: string; confirmLabel: string }
> = {
  activate: {
    label: "Activate",
    title: "Activate this class?",
    description:
      "Activation opens the class for enrollment. Students enrolled in an active class can read published lessons of the course.",
    confirmLabel: "Activate class",
  },
  complete: {
    label: "Complete",
    title: "Complete this class?",
    description:
      "Completing ends the teaching relationship. Students keep their enrollment record but lose lesson access, and reactivation of enrollments stops.",
    confirmLabel: "Complete class",
  },
  archive: {
    label: "Archive",
    title: "Archive this class?",
    description:
      "Archiving retires the class permanently. It cannot be reactivated, and no new instructors or students can be added.",
    confirmLabel: "Archive class",
  },
};

/** Statuses reachable from the current one, in the order the UI offers them. */
export function availableTransitions(status: CohortStatus): CohortTransitionAction[] {
  return (Object.keys(ALLOWED_FROM) as CohortTransitionAction[]).filter((action) =>
    ALLOWED_FROM[action].includes(status)
  );
}

export function isTransitionAllowed(
  status: CohortStatus,
  action: CohortTransitionAction
): boolean {
  return ALLOWED_FROM[action].includes(status);
}

export interface ActivationPrerequisites {
  allowed: boolean;
  coursePublished: boolean;
  instructorAssigned: boolean;
  /** Human-readable reasons the activate action is unavailable. */
  blockers: string[];
}

/**
 * The two documented activation gates.
 *
 * `active_instructor_count` is computed server-side with the same eligibility
 * filter the activation endpoint applies (live assignment, active account,
 * Instructor role), so it is safe to use as the prerequisite signal here.
 */
export function activationPrerequisites(
  cohort: Pick<CohortPublic, "active_instructor_count">,
  coursePublished: boolean
): ActivationPrerequisites {
  const blockers: string[] = [];
  if (!coursePublished) {
    blockers.push(
      "The course must be published before this class can be activated."
    );
  }
  if (cohort.active_instructor_count < 1) {
    blockers.push("Assign at least one eligible instructor before activating.");
  }
  return {
    allowed: blockers.length === 0,
    coursePublished,
    instructorAssigned: cohort.active_instructor_count > 0,
    blockers,
  };
}

/** Short onboarding hint shown on a draft class with unfinished prerequisites. */
export function lifecycleHint(
  status: CohortStatus,
  prerequisites: ActivationPrerequisites
): string {
  if (status === "draft") {
    return prerequisites.allowed
      ? "All activation requirements are met. Activate the class to open enrollment."
      : prerequisites.blockers.join(" ");
  }
  if (status === "active") {
    return "The class is live: enrolled students and assigned instructors can read published lessons of this course.";
  }
  if (status === "completed") {
    return "Teaching has ended. Records are retained, and enrollment reactivation is no longer possible.";
  }
  return "This class is archived and read-only.";
}
