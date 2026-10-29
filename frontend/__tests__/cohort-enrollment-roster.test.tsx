import * as React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { CohortDetail } from "@/features/academics/cohorts/cohort-detail";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import type { AdminUserPublic, UserPublic } from "@/lib/types/api";
import type { CoursePublic } from "@/lib/types/academic";
import type {
  CohortInstructorPublic,
  CohortPublic,
  EnrollmentPublic,
  PageEnrollments,
  StudentEnrollmentPublic,
} from "@/lib/types/cohorts";

/**
 * Milestone 02B correction — authoritative roster names.
 *
 * `EnrollmentPublic.student_full_name` is required and server-derived (backend
 * 7789ad5 / API 0.4.0). The administrative roster must take the label from the API
 * on every read instead of remembering what it selected at enrollment time, so
 * names survive a reload and follow later profile changes.
 *
 * These tests deliberately never populate a name through the enrollment form
 * first: a name can only appear if it came from the response payload.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academics/manage/cohorts/cohort-1",
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

vi.mock("@/features/academics/use-step-up-retry", () => ({
  useStepUpRetry: () => ({
    runWithStepUp: (action: () => Promise<unknown>) => action(),
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "user-manager",
      email: "manager@cyberlab.test",
      full_name: "Synthetic Manager",
      roles: ["manager"],
      active_role: "manager",
      is_active: true,
      email_verified: true,
      mfa_enabled: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    } as unknown as UserPublic,
    switchRole: vi.fn(),
    requestStepUp: vi.fn(),
    logout: vi.fn(),
  }),
}));

const api = vi.mocked(cohortsApi);
const academic = vi.mocked(academicApi);

const panelSource = readFileSync(
  path.resolve(__dirname, "../features/academics/cohorts/cohort-enrollment-panel.tsx"),
  "utf8"
);

const course: CoursePublic = {
  id: "course-ceh-v12",
  code: "CEH-V12",
  title: "Certified Ethical Hacker v12",
  edition: "v12",
  status: "published",
  planned_module_count: 20,
  published_module_count: 1,
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
  active_enrollment_count: 1,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

const assignment: CohortInstructorPublic = {
  id: "assign-1",
  cohort_id: cohort.id,
  instructor_user_id: "user-instructor",
  instructor_name: "Nadia Instructor",
  active: true,
  assigned_at: "2026-10-02T09:00:00Z",
  removed_at: null,
};

function makeEnrollment(overrides: Partial<EnrollmentPublic> = {}): EnrollmentPublic {
  return {
    id: "enrollment-1",
    cohort_id: cohort.id,
    course_id: course.id,
    student_user_id: "user-student-amina",
    student_full_name: "Amina Student",
    status: "active",
    enrolled_at: "2026-10-03T09:00:00Z",
    ended_at: null,
    ...overrides,
  };
}

function page(items: EnrollmentPublic[]): PageEnrollments {
  return { items, limit: 20, offset: 0, total: items.length };
}

function renderWithToasts(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      {ui}
      <Toaster />
    </ToastStateProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  academic.listAdminCourses.mockResolvedValue({
    items: [course],
    limit: 100,
    offset: 0,
    total: 1,
  });
  api.getCohort.mockResolvedValue(cohort);
  api.listCohortInstructors.mockResolvedValue([assignment]);
  api.listCohortEnrollments.mockResolvedValue(page([makeEnrollment()]));
  api.listEligibleUsers.mockResolvedValue([]);
});

describe("Administrative roster names come from the API", () => {
  it("labels an existing enrollment with the server-provided student_full_name", async () => {
    renderWithToasts(<CohortDetail cohortId={cohort.id} />);

    expect(await screen.findByText("Amina Student")).toBeInTheDocument();
    // The id stays available as secondary technical detail.
    expect(screen.getByText("user-student-amina")).toBeInTheDocument();
    // No directory lookup was needed to resolve the name.
    expect(api.listEligibleUsers).not.toHaveBeenCalled();
  });

  it("keeps names visible after the roster is reloaded or the page is reopened", async () => {
    const first = renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    expect(await screen.findByText("Amina Student")).toBeInTheDocument();
    first.unmount();

    // A fresh mount shares no component state with the previous one: the name can
    // only be present because the API returned it again.
    renderWithToasts(<CohortDetail cohortId={cohort.id} />);

    expect(await screen.findByText("Amina Student")).toBeInTheDocument();
    expect(api.listCohortEnrollments).toHaveBeenCalledTimes(2);
  });

  it("reflects a profile-name change returned by the backend", async () => {
    const user = userEvent.setup();
    renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    expect(await screen.findByText("Amina Student")).toBeInTheDocument();

    api.listCohortEnrollments.mockResolvedValue(
      page([makeEnrollment({ student_full_name: "Amina Rahman" })])
    );

    await user.click(screen.getByRole("button", { name: /refresh roster/i }));

    expect(await screen.findByText("Amina Rahman")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Amina Student")).not.toBeInTheDocument()
    );
  });

  it("keeps the correct name through withdrawal and reactivation", async () => {
    const user = userEvent.setup();
    const withdrawn = makeEnrollment({
      status: "withdrawn",
      ended_at: "2026-10-20T09:00:00Z",
    });
    api.updateEnrollment.mockResolvedValue(withdrawn);

    renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    expect(await screen.findByText("Amina Student")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^withdraw$/i }));
    const dialog = await screen.findByRole("dialog");
    api.listCohortEnrollments.mockResolvedValue(page([withdrawn]));
    await user.click(within(dialog).getByRole("button", { name: /^withdraw$/i }));

    await waitFor(() =>
      expect(api.updateEnrollment).toHaveBeenCalledWith(withdrawn.id, "withdrawn")
    );
    // The transition body carries the status only — never the server-owned name.
    expect(api.updateEnrollment.mock.calls[0][1]).toBe("withdrawn");
    const withdrawnRow = (await screen.findByText("Amina Student")).closest("tr");
    expect(withdrawnRow).not.toBeNull();
    // The status badge sits inside the same roster row as the server-provided name.
    expect(within(withdrawnRow as HTMLElement).getByText("Withdrawn")).toBeInTheDocument();

    // Reactivation reports the same server-derived name again.
    api.updateEnrollment.mockResolvedValue(
      makeEnrollment({ ended_at: "2026-10-25T09:00:00Z" })
    );
    api.listCohortEnrollments.mockResolvedValue(page([makeEnrollment()]));

    await user.click(screen.getByRole("button", { name: /reactivate/i }));
    const reactivateDialog = await screen.findByRole("dialog");
    await user.click(
      within(reactivateDialog).getByRole("button", { name: /^reactivate$/i })
    );

    await waitFor(() =>
      expect(api.updateEnrollment).toHaveBeenLastCalledWith(
        withdrawn.id,
        "active"
      )
    );
    expect(await screen.findByText("Amina Student")).toBeInTheDocument();
  });

  it("stores no name cache of its own", () => {
    expect(panelSource).not.toContain("knownNames");
    expect(panelSource).not.toContain("setKnownNames");
    expect(panelSource).not.toContain("Record<string, string>");
    expect(panelSource).toContain("enrollment.student_full_name");
    // Names are never resolved by fetching the directory.
    expect(panelSource).not.toMatch(/listEligibleUsers[^\n]*student_full_name/);
  });

  it("sends only the documented request fields when enrolling", async () => {
    const user = userEvent.setup();
    const candidate: AdminUserPublic = {
      id: "user-student-new",
      full_name: "New Learner",
      email: "new@cyberlab.test",
      roles: ["student"],
      email_verified: true,
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
    };
    api.listEligibleUsers.mockResolvedValue([candidate]);
    api.createEnrollment.mockResolvedValue(
      makeEnrollment({
        id: "enrollment-2",
        student_user_id: candidate.id,
        student_full_name: candidate.full_name,
      })
    );

    renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Enrollment roster");

    await user.type(screen.getByLabelText("Search student accounts"), "new");
    await user.click(
      await screen.findByRole("button", { name: "Select New Learner" })
    );

    await waitFor(() =>
      expect(api.createEnrollment).toHaveBeenCalledWith(cohort.id, candidate.id)
    );
    expect(api.createEnrollment).toHaveBeenCalledTimes(1);
  });
});

describe("Student-facing enrollments stay name-free", () => {
  it("has no student_full_name on StudentEnrollmentPublic", async () => {
    const studentEnrollment: StudentEnrollmentPublic = {
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

    // A type-level guarantee: assigning the value would fail to compile if the
    // administrative field had leaked into the student schema.
    expect(Object.keys(studentEnrollment)).not.toContain("student_full_name");

    const typesSource = readFileSync(
      path.resolve(__dirname, "../lib/types/cohorts.ts"),
      "utf8"
    );
    const studentBlock = typesSource.slice(
      typesSource.indexOf("export interface StudentEnrollmentPublic"),
      typesSource.indexOf("/** `PageStudentEnrollments`")
    );
    expect(studentBlock).not.toContain("student_full_name");
    expect(studentBlock).not.toContain("student_user_id");
  });
});
