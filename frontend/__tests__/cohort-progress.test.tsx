import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { LearningOverview } from "@/features/academics/cohorts/learning-overview";
import { StudentEnrollment } from "@/features/academics/cohorts/student-enrollment";
import { TeachingCohort } from "@/features/academics/cohorts/teaching-cohort";
import { LessonViewer } from "@/features/academics/lesson-viewer";
import { ClassProgressPanel } from "@/features/academics/progress/class-progress-panel";
import { StudentProgressPanel } from "@/features/academics/progress/student-progress-panel";
import { formatDateTime } from "@/lib/utils";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import { progressApi } from "@/lib/api/progress";
import type { CoursePublic, LessonDetail, ModulePublic } from "@/lib/types/academic";
import type { Role, UserPublic } from "@/lib/types/api";
import type {
  CohortPublic,
  OwnEnrollmentCourse,
  PageRoster,
  PageStudentEnrollments,
  StudentEnrollmentPublic,
} from "@/lib/types/cohorts";
import type {
  ClassProgress,
  CompletionResponse,
  EnrollmentProgress,
} from "@/lib/types/progress";

/**
 * Milestone 02C progress surfaces.
 *
 * Everything asserted here is about honesty and authorisation:
 * - the percentage, the counts and the lesson states are the API's, printed as
 *   received (never recomputed, never a 20-module denominator);
 * - completion is only offered with an explicit enrollment, an active enrollment
 *   in an active class, and a lesson that this enrollment's course contains;
 * - `201` and idempotent `200` are both success, `newly_recorded` distinguishes
 *   them, and there is no un-complete;
 * - a failure never looks like a recorded completion;
 * - instructor/manager reporting is read-only;
 * - progress is not cached in the browser and does not survive a session change.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academics/learn",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/academic", () => ({
  academicApi: {
    listCourses: vi.fn(),
    getCourse: vi.fn(),
    listCourseModules: vi.fn(),
    getModule: vi.fn(),
    listModuleLessons: vi.fn(),
    getLesson: vi.fn(),
    listAdminCourses: vi.fn(),
    getAdminCourse: vi.fn(),
    listAdminModules: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
    publishCourse: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
    publishModule: vi.fn(),
    createLesson: vi.fn(),
    updateLesson: vi.fn(),
    publishLesson: vi.fn(),
  },
}));

vi.mock("@/lib/api/cohorts", () => ({
  cohortsApi: {
    listCohorts: vi.fn(),
    createCohort: vi.fn(),
    getCohort: vi.fn(),
    updateCohort: vi.fn(),
    activateCohort: vi.fn(),
    completeCohort: vi.fn(),
    archiveCohort: vi.fn(),
    listCohortInstructors: vi.fn(),
    assignCohortInstructor: vi.fn(),
    removeCohortInstructor: vi.fn(),
    listCohortEnrollments: vi.fn(),
    createEnrollment: vi.fn(),
    updateEnrollment: vi.fn(),
    listEligibleUsers: vi.fn(),
    listTeachingCohorts: vi.fn(),
    getTeachingCohort: vi.fn(),
    listCohortRoster: vi.fn(),
    listOwnEnrollments: vi.fn(),
    getOwnEnrollmentCourse: vi.fn(),
  },
}));

vi.mock("@/lib/api/progress", () => ({
  progressApi: {
    getOwnProgress: vi.fn(),
    completeLesson: vi.fn(),
    getInstructorClassProgress: vi.fn(),
    getAdminClassProgress: vi.fn(),
  },
}));

let currentUser: UserPublic | null = null;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: currentUser,
    switchRole: vi.fn(),
    requestStepUp: vi.fn(),
    logout: vi.fn(),
  }),
}));

const api = vi.mocked(cohortsApi);
const academic = vi.mocked(academicApi);
const progress = vi.mocked(progressApi);

function makeUser(id: string, activeRole: Role): UserPublic {
  return {
    id,
    email: `${id}@cyberlab.test`,
    full_name: `Synthetic ${activeRole}`,
    display_name: `Synthetic ${activeRole}`,
    roles: [activeRole],
    active_role: activeRole,
    is_active: true,
    email_verified: true,
    mfa_enabled: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  } as unknown as UserPublic;
}

const course: CoursePublic = {
  id: "course-ceh-v12",
  code: "CEH-V12",
  title: "Certified Ethical Hacker v12",
  edition: "v12",
  status: "published",
  planned_module_count: 20,
  published_module_count: 2,
  content_version: 3,
  summary: "Mission-based ethical hacking curriculum.",
  published_at: "2026-09-01T10:00:00Z",
};

const cohort: CohortPublic = {
  id: "cohort-1",
  course_id: course.id,
  code: "CEH-V12-A",
  name: "Autumn Intake — Group A",
  status: "active",
  starts_at: "2026-11-01T09:00:00Z",
  ends_at: null,
  active_instructor_count: 1,
  active_enrollment_count: 2,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

const modules: ModulePublic[] = [
  {
    id: "module-01",
    course_id: course.id,
    sequence: 1,
    title: "Introduction to Ethical Hacking",
    status: "published",
    summary: "Scope, ethics and rules of engagement.",
    published_at: "2026-09-02T10:00:00Z",
  },
];

const enrollment: StudentEnrollmentPublic = {
  id: "enrollment-1",
  cohort_id: cohort.id,
  cohort_code: cohort.code,
  cohort_name: cohort.name,
  cohort_status: "active",
  course_id: course.id,
  course_code: course.code,
  course_title: course.title,
  status: "active",
  enrolled_at: "2026-10-03T09:00:00Z",
  ended_at: null,
};

const withdrawnEnrollment: StudentEnrollmentPublic = {
  ...enrollment,
  id: "enrollment-2",
  status: "withdrawn",
  ended_at: "2026-10-12T09:00:00Z",
};

const ownEnrollmentCourse: OwnEnrollmentCourse = {
  enrollment,
  cohort,
  course,
};

/** Two current completions plus one lesson whose content changed. */
const mixedProgress: EnrollmentProgress = {
  enrollment_id: enrollment.id,
  course_id: course.id,
  cohort_id: cohort.id,
  cohort_status: "active",
  enrollment_status: "active",
  total_published_lessons: 3,
  completed_current_lessons: 2,
  needs_review_lessons: 1,
  percent_complete: 66.7,
  is_complete: false,
  modules: [
    {
      module_id: "module-01",
      sequence: 1,
      title: "Introduction to Ethical Hacking",
      published_lesson_count: 3,
      completed_current_lessons: 2,
      needs_review_lessons: 1,
      percent_complete: 66.7,
    },
  ],
  lessons: [
    {
      lesson_id: "lesson-01",
      sequence: 1,
      title: "Hacking Ethics and Scope",
      lesson_version: 1,
      status: "current",
      completed_at: "2026-10-20T10:00:00Z",
      last_completed_version: 1,
    },
    {
      lesson_id: "lesson-02",
      sequence: 2,
      title: "Rules of Engagement",
      lesson_version: 1,
      status: "current",
      completed_at: "2026-10-21T10:00:00Z",
      last_completed_version: 1,
    },
    {
      lesson_id: "lesson-03",
      sequence: 3,
      title: "Legal Frameworks",
      lesson_version: 2,
      status: "needs_review",
      completed_at: null,
      last_completed_version: 1,
    },
  ],
};

/** Same enrollment before the first lesson is marked complete. */
const beforeFirstCompletion: EnrollmentProgress = {
  ...mixedProgress,
  completed_current_lessons: 1,
  needs_review_lessons: 1,
  percent_complete: 33.3,
  modules: [
    {
      ...mixedProgress.modules[0],
      completed_current_lessons: 1,
      percent_complete: 33.3,
    },
  ],
  lessons: [
    {
      lesson_id: "lesson-01",
      sequence: 1,
      title: "Hacking Ethics and Scope",
      lesson_version: 1,
      status: "not_started",
      completed_at: null,
      last_completed_version: null,
    },
    mixedProgress.lessons[1],
    mixedProgress.lessons[2],
  ],
};

/** A course with nothing published: 0/0 and never complete. */
const emptyProgress: EnrollmentProgress = {
  ...mixedProgress,
  total_published_lessons: 0,
  completed_current_lessons: 0,
  needs_review_lessons: 0,
  percent_complete: 0,
  is_complete: false,
  modules: [],
  lessons: [],
};

const withdrawnProgress: EnrollmentProgress = {
  ...mixedProgress,
  enrollment_status: "withdrawn",
};

const lesson: LessonDetail = {
  id: "lesson-01",
  module_id: "module-01",
  sequence: 1,
  title: "Hacking Ethics and Scope",
  status: "published",
  content_version: 1,
  body_markdown:
    "## Scope and Ethics\n\nAlways obtain written authorization before testing.",
  objectives: [
    { sequence: 1, text: "Define rules of engagement for an authorized assessment." },
  ],
  resources: [],
};

const roster: PageRoster = {
  items: [
    {
      user_id: "user-student",
      full_name: "Amina Student",
      email: "amina@cyberlab.test",
      email_verified: true,
      status: "active",
      enrolled_at: "2026-10-03T09:00:00Z",
    },
  ],
  limit: 20,
  offset: 0,
  total: 1,
};

const classProgress: ClassProgress = {
  cohort_id: cohort.id,
  course_id: course.id,
  cohort_status: "active",
  total_published_lessons: 3,
  total_active_enrollments: 1,
  total_visible_enrollments: 2,
  average_percent_complete: 66.7,
  students: {
    items: [
      {
        enrollment_id: "enrollment-1",
        student_user_id: "user-student",
        student_full_name: "Amina Student",
        enrollment_status: "active",
        completed_current_lessons: 2,
        total_published_lessons: 3,
        needs_review_lessons: 1,
        percent_complete: 66.7,
      },
      {
        enrollment_id: "enrollment-2",
        student_user_id: "user-student-2",
        student_full_name: "Karim Withdrew",
        enrollment_status: "withdrawn",
        completed_current_lessons: 0,
        total_published_lessons: 3,
        needs_review_lessons: 0,
        percent_complete: 0,
      },
    ],
    limit: 30,
    offset: 0,
    total: 2,
  },
};

function renderWithToasts(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      {ui}
      <Toaster />
    </ToastStateProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  currentUser = makeUser("user-student", "student");
  academic.listCourses.mockResolvedValue({ items: [course], limit: 100, offset: 0, total: 1 });
  academic.listCourseModules.mockResolvedValue(modules);
  academic.getLesson.mockResolvedValue(lesson);
  api.listOwnEnrollments.mockResolvedValue({
    items: [enrollment],
    limit: 20,
    offset: 0,
    total: 1,
  });
  api.getOwnEnrollmentCourse.mockResolvedValue(ownEnrollmentCourse);
  api.getTeachingCohort.mockResolvedValue(cohort);
  api.listCohortRoster.mockResolvedValue(roster);
  progress.getOwnProgress.mockResolvedValue(mixedProgress);
  progress.getInstructorClassProgress.mockResolvedValue(classProgress);
  progress.getAdminClassProgress.mockResolvedValue(classProgress);
});

describe("Student progress panel", () => {
  it("renders the API's percentage, counts and lesson states verbatim", async () => {
    renderWithToasts(
      <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons />
    );

    await screen.findByText("Course progress");

    // 66.7 is printed, not recomputed from 2/3 (which would be 66.666…).
    expect(screen.getAllByText("66.7%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/2 \/ 3/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("1 needs review").length).toBeGreaterThanOrEqual(1);

    const bars = screen.getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "66.7");
    expect(bars[0]).toHaveAttribute("aria-valuemax", "100");
    expect(bars[0]).toHaveAttribute(
      "aria-valuetext",
      "66.7% — 2 of 3 published lessons completed"
    );

    // Lesson states carry words, not just colour.
    expect(screen.getAllByText("Completed").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Needs review").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        "Content updated — review this lesson again. You completed version 1."
      )
    ).toBeInTheDocument();

    // Own-enrollment read only; no class-wide endpoint is touched.
    expect(progress.getOwnProgress).toHaveBeenCalledWith(enrollment.id);
    expect(progress.getInstructorClassProgress).not.toHaveBeenCalled();
    expect(progress.getAdminClassProgress).not.toHaveBeenCalled();
  });

  it("never turns an empty curriculum into completion", async () => {
    progress.getOwnProgress.mockResolvedValue(emptyProgress);

    renderWithToasts(
      <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons />
    );

    await screen.findByText("Course progress");

    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(
      screen.getByText("0 / 0 published lessons completed")
    ).toBeInTheDocument();
    expect(screen.getByText("No published lessons")).toBeInTheDocument();
    expect(screen.queryByText("Course complete")).not.toBeInTheDocument();
    expect(
      screen.getByText(/this course has no published lessons yet, so progress is 0 of 0/i)
    ).toBeInTheDocument();
    // The planned 20-module CEH outline is never a denominator.
    expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/20 modules/i)).not.toBeInTheDocument();
  });

  it("keeps a withdrawn enrollment's history but withholds eligibility", async () => {
    progress.getOwnProgress.mockResolvedValue(withdrawnProgress);

    renderWithToasts(
      <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons={false} />
    );

    await screen.findByText("Course progress");

    expect(screen.getByText(/this enrollment is withdrawn/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot mark new lessons complete/i)).toBeInTheDocument();
    expect(screen.getAllByText("No lesson access").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("link", { name: /open lesson/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark lesson complete/i })
    ).not.toBeInTheDocument();
  });

  it("drops the previous session's progress when the active account changes", async () => {
    const { rerender } = renderWithToasts(
      <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons />
    );

    expect((await screen.findAllByText("66.7%")).length).toBeGreaterThanOrEqual(1);

    const pending = deferred<EnrollmentProgress>();
    progress.getOwnProgress.mockReturnValue(pending.promise);
    currentUser = makeUser("user-student-other", "student");
    rerender(
      <ToastStateProvider>
        <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons />
        <Toaster />
      </ToastStateProvider>
    );

    // The old record is gone immediately; nothing from the previous session stays
    // on screen while the new read is in flight.
    await waitFor(() =>
      expect(screen.queryAllByText("66.7%")).toHaveLength(0)
    );
    expect(screen.getByText("Loading your progress...")).toBeInTheDocument();

    pending.resolve({
      ...mixedProgress,
      percent_complete: 33.3,
      completed_current_lessons: 1,
    });
    expect((await screen.findAllByText("33.3%")).length).toBeGreaterThanOrEqual(1);
  });

  it("writes no progress to browser storage", async () => {
    renderWithToasts(
      <StudentProgressPanel enrollmentId={enrollment.id} canReadLessons />
    );
    await screen.findByText("Course progress");

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe("Lesson completion control", () => {
  it("records a completion, confirms it, refetches and shows the timestamp", async () => {
    progress.getOwnProgress
      .mockResolvedValueOnce(beforeFirstCompletion)
      .mockResolvedValue(mixedProgress);
    const response: CompletionResponse = {
      enrollment_id: enrollment.id,
      lesson_id: lesson.id,
      lesson_version: 1,
      completed_at: "2026-10-29T17:04:11.918Z",
      newly_recorded: true,
    };
    progress.completeLesson.mockResolvedValue(response);

    renderWithToasts(
      <LessonViewer lessonId={lesson.id} enrollmentId={enrollment.id} />
    );

    const button = await screen.findByRole("button", {
      name: /mark lesson complete/i,
    });
    fireEvent.click(button);

    expect(progress.completeLesson).toHaveBeenCalledTimes(1);
    expect(progress.completeLesson).toHaveBeenCalledWith(
      enrollment.id,
      lesson.id
    );

    expect(await screen.findByText(/completion recorded/i)).toBeInTheDocument();
    // Authoritative progress is re-read after the mutation.
    await waitFor(() => expect(progress.getOwnProgress).toHaveBeenCalledTimes(2));

    // The confirmation carries the response's own timestamp …
    const recordedAt = formatDateTime(response.completed_at).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    expect(
      screen.getByText(new RegExp(`version 1 · ${recordedAt}`))
    ).toBeInTheDocument();

    // … while the lesson indicator shows the state the API reports after the
    // refetch (the re-read record, not a locally invented completion).
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    const lessonCompletedAt = formatDateTime(
      mixedProgress.lessons[0].completed_at
    );
    expect(
      screen.getByText(new RegExp(`Completed ${lessonCompletedAt}`))
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark lesson complete/i })
    ).not.toBeInTheDocument();
  });

  it("treats an idempotent repeat as success and keeps the original timestamp", async () => {
    progress.getOwnProgress.mockResolvedValue({
      ...beforeFirstCompletion,
      lessons: [
        { ...beforeFirstCompletion.lessons[0] },
        beforeFirstCompletion.lessons[1],
        beforeFirstCompletion.lessons[2],
      ],
    });
    progress.completeLesson.mockResolvedValue({
      enrollment_id: enrollment.id,
      lesson_id: lesson.id,
      lesson_version: 1,
      completed_at: "2026-10-20T10:00:00Z",
      newly_recorded: false,
    });

    renderWithToasts(
      <LessonViewer lessonId={lesson.id} enrollmentId={enrollment.id} />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /mark lesson complete/i })
    );

    expect(
      await screen.findByText(/already completed — the original timestamp is kept/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/completion not recorded/i)).not.toBeInTheDocument();
    expect(screen.getByText(/version 1 · Oct 20, 2026/)).toBeInTheDocument();
  });

  it("offers no un-complete control once a lesson is complete", async () => {
    renderWithToasts(
      <LessonViewer lessonId={lesson.id} enrollmentId={enrollment.id} />
    );

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(
      screen.getByText(/completion cannot be undone here/i)
    ).toBeInTheDocument();
    for (const forbidden of [/undo/i, /uncomplete/i, /un-complete/i, /not complete/i]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
        `completion offers a ${forbidden} action`
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("submits once while a completion request is in flight", async () => {
    progress.getOwnProgress.mockResolvedValue(beforeFirstCompletion);
    const pending = deferred<CompletionResponse>();
    progress.completeLesson.mockReturnValue(pending.promise);

    renderWithToasts(
      <LessonViewer lessonId={lesson.id} enrollmentId={enrollment.id} />
    );

    const button = await screen.findByRole("button", {
      name: /mark lesson complete/i,
    });
    fireEvent.click(button);
    // The button is disabled and relabelled while pending; a second click is a
    // no-op rather than a second request.
    fireEvent.click(
      screen.getByRole("button", { name: /recording completion/i })
    );
    expect(progress.completeLesson).toHaveBeenCalledTimes(1);

    pending.resolve({
      enrollment_id: enrollment.id,
      lesson_id: lesson.id,
      lesson_version: 1,
      completed_at: "2026-10-29T17:04:11.918Z",
      newly_recorded: true,
    });
    await waitFor(() =>
      expect(screen.queryByText(/recording completion/i)).not.toBeInTheDocument()
    );
  });

  it("offers no mutation without an explicit enrollment context", async () => {
    renderWithToasts(<LessonViewer lessonId={lesson.id} />);

    expect(await screen.findByText("Hacking Ethics and Scope")).toBeInTheDocument();
    expect(screen.getByText("Completion needs a class")).toBeInTheDocument();
    expect(
      screen.getByText(/never recorded against a guessed or first-found enrollment/i)
    ).toBeInTheDocument();

    expect(progress.getOwnProgress).not.toHaveBeenCalled();
    expect(progress.completeLesson).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /mark lesson complete/i })
    ).not.toBeInTheDocument();
  });

  it("refuses a lesson that is not part of the enrollment's course", async () => {
    academic.getLesson.mockResolvedValue({ ...lesson, id: "lesson-99", title: "Another course" });
    progress.getOwnProgress.mockResolvedValue(mixedProgress);

    renderWithToasts(
      <LessonViewer lessonId="lesson-99" enrollmentId={enrollment.id} />
    );

    expect(await screen.findByText("Another course")).toBeInTheDocument();
    expect(
      await screen.findByText(/not part of the course for the selected enrollment/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark lesson complete/i })
    ).not.toBeInTheDocument();
    expect(progress.completeLesson).not.toHaveBeenCalled();
  });

  it("does not look like success when the API rejects the completion", async () => {
    progress.getOwnProgress.mockResolvedValue(beforeFirstCompletion);
    progress.completeLesson.mockRejectedValue(
      new ApiError({
        status: 422,
        detail: "Lesson is not published.",
      })
    );

    renderWithToasts(
      <LessonViewer lessonId={lesson.id} enrollmentId={enrollment.id} />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /mark lesson complete/i })
    );

    expect(await screen.findByText(/completion not recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Lesson is not published.")).toBeInTheDocument();
    // State is unchanged: still not started, and no completion was re-read.
    expect(screen.getAllByText("Not started").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/completion recorded/i)).not.toBeInTheDocument();
    expect(progress.getOwnProgress).toHaveBeenCalledTimes(1);
  });
});

describe("Student class list", () => {
  it("shows each enrollment's own progress and links to its detail", async () => {
    api.listOwnEnrollments.mockResolvedValue({
      items: [enrollment, withdrawnEnrollment],
      limit: 20,
      offset: 0,
      total: 2,
    } satisfies PageStudentEnrollments);
    progress.getOwnProgress.mockImplementation(async (enrollmentId: string) =>
      enrollmentId === withdrawnEnrollment.id ? withdrawnProgress : mixedProgress
    );

    renderWithToasts(<LearningOverview />);

    expect((await screen.findAllByText(cohort.name)).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("66.7%")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/history only — a withdrawn enrollment/i)).toBeInTheDocument();
    expect(screen.getByText(/self-reported learning progress, not a grade/i)).toBeInTheDocument();

    const detailLinks = screen.getAllByRole("link", {
      name: /view lesson-by-lesson progress/i,
    });
    expect(detailLinks.map((link) => link.getAttribute("href"))).toEqual([
      `/academics/learn/enrollments/${enrollment.id}`,
      `/academics/learn/enrollments/${withdrawnEnrollment.id}`,
    ]);
  });

  it("does not invent progress when the backend cannot be reached", async () => {
    progress.getOwnProgress.mockRejectedValue(
      new ApiError({ status: 0, detail: "Backend unreachable.", code: "BACKEND_UNREACHABLE" })
    );

    renderWithToasts(<LearningOverview />);

    expect(
      await screen.findByText(/Progress service unavailable/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });
});

describe("Enrollment detail progress section", () => {
  it("shows progress for the enrollment and keeps the class context on lesson links", async () => {
    renderWithToasts(<StudentEnrollment enrollmentId={enrollment.id} />);

    expect(await screen.findByText("Course progress")).toBeInTheDocument();
    expect(screen.getAllByText("66.7%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/self-reported learning progress/i)).toBeInTheDocument();

    const lessonLinks = screen.getAllByRole("link", { name: /open lesson/i });
    expect(lessonLinks[0]).toHaveAttribute(
      "href",
      `/academics/lessons/lesson-01?enrollmentId=${enrollment.id}`
    );

    // Module links keep the class context too, so the lesson view knows the class.
    expect(
      await screen.findByRole("link", { name: /introduction to ethical hacking/i })
    ).toHaveAttribute(
      "href",
      `/academics/modules/module-01?enrollmentId=${enrollment.id}`
    );
  });
});

describe("Instructor class progress", () => {
  beforeEach(() => {
    currentUser = makeUser("user-instructor", "instructor");
    api.listTeachingCohorts.mockResolvedValue({
      items: [cohort],
      limit: 20,
      offset: 0,
      total: 1,
    });
  });

  it("reports the whole-class average and each student's self-reported progress", async () => {
    renderWithToasts(<TeachingCohort cohortId={cohort.id} />);

    await screen.findByText(cohort.name);
    expect(await screen.findByText(/^learning progress$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/these are not grades, and they are not a competency score/i)
    ).toBeInTheDocument();

    expect(progress.getInstructorClassProgress).toHaveBeenCalledWith(cohort.id, 30, 0);
    // The class average is the API's whole-class figure.
    expect(screen.getByText("Class average")).toBeInTheDocument();
    expect(screen.getAllByText("66.7%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Whole-class mean of active enrollments, computed by the API."))
      .toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    // The roster table also names the student; pick the progress row itself.
    const aminaRow = rows.find(
      (row) => within(row).queryByText("Amina Student") && within(row).queryByText(/2 \/ 3/)
    );
    expect(aminaRow).toBeDefined();
    expect(within(aminaRow as HTMLElement).getByText("2 / 3")).toBeInTheDocument();
    // "Enrolled" is the label for an active enrollment; the state is in words.
    expect(within(aminaRow as HTMLElement).getByText("Enrolled")).toBeInTheDocument();

    const karimRow = rows.find(
      (row) => within(row).queryByText("Karim Withdrew") && within(row).queryByText(/Excluded from class average/)
    );
    expect(karimRow).toBeDefined();
    expect(within(karimRow as HTMLElement).getByText("Withdrawn")).toBeInTheDocument();
    expect(
      within(karimRow as HTMLElement).getByText("Excluded from class average")
    ).toBeInTheDocument();

    // Read-only: no instructor completion or grading control exists.
    for (const forbidden of [/^mark/i, /^grade/i, /^override/i, /^reset/i, /completion/i]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
        `instructor progress exposes a ${forbidden} control`
      ).not.toBeInTheDocument();
    }
  });

  it("pages students without shifting the whole-class header", async () => {
    progress.getInstructorClassProgress
      .mockResolvedValueOnce({
        ...classProgress,
        students: { ...classProgress.students, total: 32 },
      })
      .mockResolvedValueOnce({
        ...classProgress,
        students: { ...classProgress.students, offset: 30, total: 32 },
      });

    renderWithToasts(<TeachingCohort cohortId={cohort.id} />);
    const pager = (await screen.findByText("Showing 1–2 of 32 students"))
      .parentElement as HTMLElement;

    fireEvent.click(within(pager).getByRole("button", { name: /^next/i }));

    await waitFor(() =>
      expect(progress.getInstructorClassProgress).toHaveBeenLastCalledWith(
        cohort.id,
        30,
        30
      )
    );
    expect(screen.getAllByText("66.7%").length).toBeGreaterThanOrEqual(2);
  });

  it("explains a missing assignment instead of showing an empty class", async () => {
    progress.getInstructorClassProgress.mockRejectedValue(
      new ApiError({ status: 404, detail: "Not found." })
    );

    renderWithToasts(<TeachingCohort cohortId={cohort.id} />);

    expect(
      await screen.findByText("Class progress unavailable")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/do not have a live teaching assignment/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Class average")).not.toBeInTheDocument();
  });
});

describe("Manager class progress", () => {
  it("reuses the report against the admin endpoint, read-only", async () => {
    currentUser = makeUser("user-manager", "manager");

    renderWithToasts(<ClassProgressPanel cohortId={cohort.id} surface="manager" />);

    expect(await screen.findByText(/^learning progress$/i)).toBeInTheDocument();
    expect(progress.getAdminClassProgress).toHaveBeenCalledWith(cohort.id, 30, 0);
    expect(progress.getInstructorClassProgress).not.toHaveBeenCalled();
    expect(await screen.findByText("Amina Student")).toBeInTheDocument();

    // No manager override of a student's completion, and no step-up challenge.
    for (const forbidden of [/^mark/i, /^override/i, /^reset/i, /^edit/i, /completion/i]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
        `manager progress exposes a ${forbidden} control`
      ).not.toBeInTheDocument();
    }
    expect(screen.getByText(/cannot record, edit or reset a student/i)).toBeInTheDocument();
  });
});
