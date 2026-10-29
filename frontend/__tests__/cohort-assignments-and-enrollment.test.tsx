import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { CohortDetail } from "@/features/academics/cohorts/cohort-detail";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { AdminUserPublic, UserPublic } from "@/lib/types/api";
import type { CoursePublic } from "@/lib/types/academic";
import type {
  CohortInstructorPublic,
  CohortPublic,
  EnrollmentPublic,
  PageEnrollments,
} from "@/lib/types/cohorts";

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

const publishedCourse: CoursePublic = {
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

const activeCohort: CohortPublic = {
  id: "cohort-1",
  course_id: publishedCourse.id,
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

const instructorUser: AdminUserPublic = {
  id: "user-instructor",
  full_name: "Nadia Instructor",
  email: "nadia@cyberlab.test",
  roles: ["instructor"],
  email_verified: true,
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

const secondInstructor: AdminUserPublic = {
  id: "user-instructor-2",
  full_name: "Second Instructor",
  email: "second@cyberlab.test",
  roles: ["instructor"],
  email_verified: true,
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

const unverifiedStudent: AdminUserPublic = {
  id: "user-student-unverified",
  full_name: "Omar Unverified",
  email: "omar@cyberlab.test",
  roles: ["student"],
  email_verified: false,
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

const verifiedStudent: AdminUserPublic = {
  id: "user-student",
  full_name: "Amina Student",
  email: "amina@cyberlab.test",
  roles: ["student"],
  email_verified: true,
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

const activeAssignment: CohortInstructorPublic = {
  id: "assign-1",
  cohort_id: activeCohort.id,
  instructor_user_id: instructorUser.id,
  instructor_name: instructorUser.full_name,
  active: true,
  assigned_at: "2026-10-02T09:00:00Z",
  removed_at: null,
};

const pastAssignment: CohortInstructorPublic = {
  id: "assign-0",
  cohort_id: activeCohort.id,
  instructor_user_id: "user-instructor-old",
  instructor_name: "Previous Instructor",
  active: false,
  assigned_at: "2026-09-01T09:00:00Z",
  removed_at: "2026-09-15T09:00:00Z",
};

const activeEnrollment: EnrollmentPublic = {
  id: "enrollment-1",
  cohort_id: activeCohort.id,
  course_id: publishedCourse.id,
  student_user_id: verifiedStudent.id,
  // Server-derived: the API returns the name on every administrative read.
  student_full_name: verifiedStudent.full_name,
  status: "active",
  enrolled_at: "2026-10-03T09:00:00Z",
  ended_at: null,
};

const withdrawnEnrollment: EnrollmentPublic = {
  ...activeEnrollment,
  id: "enrollment-2",
  student_user_id: "user-student-withdrawn",
  student_full_name: "Karim Withdrawn",
  status: "withdrawn",
  ended_at: "2026-10-10T09:00:00Z",
};

function enrollmentsPage(items: EnrollmentPublic[]): PageEnrollments {
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
  currentUser = {
    id: "user-manager",
    email: "manager@cyberlab.test",
    full_name: "Synthetic Manager",
    display_name: "Synthetic Manager",
    roles: ["manager"],
    active_role: "manager",
    is_active: true,
    email_verified: true,
    mfa_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  } as unknown as UserPublic;

  academic.listAdminCourses.mockResolvedValue({
    items: [publishedCourse],
    limit: 100,
    offset: 0,
    total: 1,
  });
  academic.listCourseModules.mockResolvedValue([]);
  api.getCohort.mockResolvedValue(activeCohort);
  api.listCohortInstructors.mockResolvedValue([activeAssignment, pastAssignment]);
  api.listCohortEnrollments.mockResolvedValue(enrollmentsPage([activeEnrollment]));
  api.listEligibleUsers.mockResolvedValue([]);
});

describe("Instructor assignment", () => {
  it("shows current and past assignments using the API's authoritative flag", async () => {
    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);

    expect(await screen.findByText("Nadia Instructor")).toBeInTheDocument();
    expect(screen.getByText("Previous Instructor")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /assignment history/i })
    ).toBeInTheDocument();
  });

  it("assigns an instructor selected by name, never by pasted id", async () => {
    const user = userEvent.setup();
    api.listEligibleUsers.mockResolvedValue([instructorUser, secondInstructor]);
    api.assignCohortInstructor.mockResolvedValue({
      ...activeAssignment,
      id: "assign-2",
      instructor_user_id: secondInstructor.id,
      instructor_name: secondInstructor.full_name,
    });

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.type(
      screen.getByLabelText("Search instructor accounts"),
      "second"
    );

    await waitFor(() =>
      expect(api.listEligibleUsers).toHaveBeenCalledWith("instructor", "second")
    );

    // The already-assigned instructor is filtered out of the results.
    expect(
      screen.queryByRole("button", { name: "Select Nadia Instructor" })
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Select Second Instructor" })
    );

    await waitFor(() =>
      expect(api.assignCohortInstructor).toHaveBeenCalledWith(
        activeCohort.id,
        secondInstructor.id
      )
    );
    expect(await screen.findByText("Instructor assigned")).toBeInTheDocument();
    // The assignment list is refetched so the new row is authoritative, not local.
    expect(api.listCohortInstructors.mock.calls.length).toBeGreaterThan(1);
  });

  it("confirms removal and explains that access is revoked immediately", async () => {
    const user = userEvent.setup();
    api.removeCohortInstructor.mockResolvedValue({ removed: true });

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.click(
      screen.getByRole("button", { name: "Remove Nadia Instructor" })
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/loses access to this class and its roster\s+immediately/i)
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /remove assignment/i })
    );

    await waitFor(() =>
      expect(api.removeCohortInstructor).toHaveBeenCalledWith(
        activeCohort.id,
        instructorUser.id
      )
    );
    expect(await screen.findByText("Assignment removed")).toBeInTheDocument();
  });

  it("treats a cancelled step-up (no result) as neither success nor failure", async () => {
    const user = userEvent.setup();
    // `runWithStepUp` resolves `undefined` when reauthentication is cancelled.
    api.removeCohortInstructor.mockResolvedValue(undefined as never);

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.click(
      screen.getByRole("button", { name: "Remove Nadia Instructor" })
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /remove assignment/i })
    );

    await waitFor(() => expect(api.removeCohortInstructor).toHaveBeenCalled());
    expect(screen.queryByText("Assignment removed")).not.toBeInTheDocument();
    // The confirmation stays open so the operator can retry deliberately.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Enrollment administration", () => {
  it("enrolls a student chosen from the directory and refreshes the roster", async () => {
    const user = userEvent.setup();
    api.listEligibleUsers.mockResolvedValue([verifiedStudent]);
    api.createEnrollment.mockResolvedValue({
      ...activeEnrollment,
      id: "enrollment-new",
    });

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Enrollment roster");

    await user.type(screen.getByLabelText("Search student accounts"), "amina");
    await waitFor(() =>
      expect(api.listEligibleUsers).toHaveBeenCalledWith("student", "amina")
    );

    await user.click(
      await screen.findByRole("button", { name: "Select Amina Student" })
    );

    await waitFor(() =>
      expect(api.createEnrollment).toHaveBeenCalledWith(
        activeCohort.id,
        verifiedStudent.id
      )
    );
    expect(await screen.findByText("Student enrolled")).toBeInTheDocument();
    expect(api.listCohortEnrollments.mock.calls.length).toBeGreaterThan(1);
  });

  it("explains a duplicate enrollment conflict and refetches the roster", async () => {
    const user = userEvent.setup();
    api.listEligibleUsers.mockResolvedValue([verifiedStudent]);
    api.createEnrollment.mockRejectedValue(
      new ApiError({
        status: 409,
        detail: "Student is already enrolled in this class.",
      })
    );

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Enrollment roster");

    await user.type(screen.getByLabelText("Search student accounts"), "amina");
    await user.click(
      await screen.findByRole("button", { name: "Select Amina Student" })
    );

    expect(
      await screen.findByText(/already enrolled in this class/i)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listCohortEnrollments.mock.calls.length).toBeGreaterThan(1)
    );
  });

  it("blocks an unverified student before the API can reject them", async () => {
    const user = userEvent.setup();
    api.listEligibleUsers.mockResolvedValue([unverifiedStudent]);

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
    await screen.findByText("Enrollment roster");

    await user.type(screen.getByLabelText("Search student accounts"), "omar");

    expect(
      await screen.findByText(/email is not verified/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select Omar Unverified" })
    ).toBeDisabled();
  });

  it("withdraws an enrollment through the transition endpoint after confirmation", async () => {
    const user = userEvent.setup();
    api.updateEnrollment.mockResolvedValue({
      ...activeEnrollment,
      status: "withdrawn",
      ended_at: "2026-10-20T09:00:00Z",
    });

    renderToastsAndDetail();
    await screen.findByRole("button", { name: /withdraw/i });

    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/keeps the enrollment record but loses access/i)
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /^withdraw$/i }));

    await waitFor(() =>
      expect(api.updateEnrollment).toHaveBeenCalledWith(
        activeEnrollment.id,
        "withdrawn"
      )
    );
    expect(api.updateEnrollment.mock.calls[0][1]).not.toBe("active");
  });

  it("cannot reactivate an enrollment while the class is not active", async () => {
    api.getCohort.mockResolvedValue({ ...activeCohort, status: "completed" });
    api.listCohortEnrollments.mockResolvedValue(
      enrollmentsPage([withdrawnEnrollment])
    );

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);

    const reactivate = await screen.findByRole("button", { name: /reactivate/i });
    expect(reactivate).toBeDisabled();
    expect(
      screen.getByText(/new enrollments require an active class/i)
    ).toBeInTheDocument();
  });

  it("lists withdrawn enrollments as records without access", async () => {
    api.listCohortEnrollments.mockResolvedValue(
      enrollmentsPage([activeEnrollment, withdrawnEnrollment])
    );

    renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);

    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
    expect(api.listCohortEnrollments).toHaveBeenCalledWith(activeCohort.id, {
      status: undefined,
      limit: 20,
      offset: 0,
    });
  });
});

function renderToastsAndDetail() {
  return renderWithToasts(<CohortDetail cohortId={activeCohort.id} />);
}
