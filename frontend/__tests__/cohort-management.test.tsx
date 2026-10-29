import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassManagementPage from "@/app/(authenticated)/academics/manage/cohorts/page";
import { Toaster } from "@/components/ui/toaster";
import { CohortDetail } from "@/features/academics/cohorts/cohort-detail";
import { CohortManager } from "@/features/academics/cohorts/cohort-manager";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { Role, UserPublic } from "@/lib/types/api";
import type { CoursePublic, ModulePublic } from "@/lib/types/academic";
import type {
  CohortInstructorPublic,
  CohortPublic,
  PageCohorts,
  PageEnrollments,
} from "@/lib/types/cohorts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academics/manage/cohorts",
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

// Step-up reauthentication has its own suite; here the mutation runs directly so
// the class-management behaviour is what is asserted.
vi.mock("@/features/academics/use-step-up-retry", () => ({
  useStepUpRetry: () => ({
    runWithStepUp: (action: () => Promise<unknown>) => action(),
  }),
}));

let currentUser: UserPublic | null = null;
const switchRoleMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: currentUser,
    switchRole: switchRoleMock,
    requestStepUp: vi.fn(),
    logout: vi.fn(),
  }),
}));

const api = vi.mocked(cohortsApi);
const academic = vi.mocked(academicApi);

function makeUser(activeRole: Role, roles: Role[] = [activeRole]): UserPublic {
  return {
    id: "user-manager",
    email: "manager@cyberlab.test",
    full_name: "Synthetic Manager",
    display_name: "Synthetic Manager",
    roles,
    active_role: activeRole,
    is_active: true,
    email_verified: true,
    mfa_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  } as unknown as UserPublic;
}

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

const draftCourse: CoursePublic = {
  ...publishedCourse,
  id: "course-draft",
  code: "CEH-V13",
  title: "Certified Ethical Hacker v13 (draft)",
  status: "draft",
  published_at: null,
};

function makeCohort(overrides: Partial<CohortPublic> = {}): CohortPublic {
  return {
    id: "cohort-1",
    course_id: publishedCourse.id,
    code: "CEH-V12-A",
    name: "Autumn Intake — Group A",
    status: "draft",
    starts_at: "2026-11-01T09:00:00Z",
    ends_at: null,
    active_instructor_count: 0,
    active_enrollment_count: 0,
    created_at: "2026-10-01T09:00:00Z",
    updated_at: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

const page = (items: CohortPublic[]): PageCohorts => ({
  items,
  limit: 20,
  offset: 0,
  total: items.length,
});

const emptyEnrollments: PageEnrollments = {
  items: [],
  limit: 20,
  offset: 0,
  total: 0,
};

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
  currentUser = makeUser("manager");
  academic.listAdminCourses.mockResolvedValue({
    items: [publishedCourse, draftCourse],
    limit: 100,
    offset: 0,
    total: 2,
  });
  academic.listCourses.mockResolvedValue({
    items: [publishedCourse],
    limit: 100,
    offset: 0,
    total: 1,
  });
  academic.listCourseModules.mockResolvedValue([] as ModulePublic[]);
  api.listCohorts.mockResolvedValue(page([makeCohort()]));
  api.listCohortInstructors.mockResolvedValue([] as CohortInstructorPublic[]);
  api.listCohortEnrollments.mockResolvedValue(emptyEnrollments);
  api.getCohort.mockResolvedValue(makeCohort());
});

describe("Class directory (Manager/Administrator)", () => {
  it("renders the class list for an active manager", async () => {
    renderWithToasts(<ClassManagementPage />);

    expect(await screen.findByText("Autumn Intake — Group A")).toBeInTheDocument();
    expect(screen.getByText("CEH-V12-A")).toBeInTheDocument();
    expect(screen.getByText("CEH-V12")).toBeInTheDocument();
    expect(api.listCohorts).toHaveBeenCalledWith({
      courseId: undefined,
      status: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("applies course and status filters through the API, not in the browser", async () => {
    const user = userEvent.setup();
    renderWithToasts(<CohortManager />);
    await screen.findByText("Autumn Intake — Group A");

    await user.selectOptions(screen.getByLabelText("Status"), "active");

    await waitFor(() =>
      expect(api.listCohorts).toHaveBeenLastCalledWith({
        courseId: undefined,
        status: "active",
        limit: 20,
        offset: 0,
      })
    );

    await user.selectOptions(screen.getByLabelText("Course"), publishedCourse.id);

    await waitFor(() =>
      expect(api.listCohorts).toHaveBeenLastCalledWith({
        courseId: publishedCourse.id,
        status: "active",
        limit: 20,
        offset: 0,
      })
    );
  });

  it("creates a draft class bound to a course and never sends a status", async () => {
    const user = userEvent.setup();
    api.createCohort.mockResolvedValue(makeCohort({ status: "draft" }));

    renderWithToasts(<CohortManager />);
    await screen.findByText("Autumn Intake — Group A");

    await user.click(screen.getByRole("button", { name: /new class/i }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText(/course/i),
      publishedCourse.id
    );
    await user.type(within(dialog).getByLabelText(/class code/i), "ceh-v12-b");
    await user.type(within(dialog).getByLabelText(/class name/i), "Spring Intake");
    await user.click(within(dialog).getByRole("button", { name: /create draft class/i }));

    await waitFor(() => expect(api.createCohort).toHaveBeenCalledTimes(1));
    const payload = api.createCohort.mock.calls[0][0];
    expect(payload).toEqual({
      course_id: publishedCourse.id,
      code: "CEH-V12-B",
      name: "Spring Intake",
      starts_at: null,
      ends_at: null,
    });
    expect(payload).not.toHaveProperty("status");
    expect(await screen.findByText("Draft class created")).toBeInTheDocument();
  });

  it("blocks a class code that violates the documented pattern", async () => {
    const user = userEvent.setup();
    renderWithToasts(<CohortManager />);
    await screen.findByText("Autumn Intake — Group A");

    await user.click(screen.getByRole("button", { name: /new class/i }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText(/course/i),
      publishedCourse.id
    );
    await user.type(within(dialog).getByLabelText(/class code/i), "A");
    await user.type(within(dialog).getByLabelText(/class name/i), "Spring Intake");
    await user.click(within(dialog).getByRole("button", { name: /create draft class/i }));

    expect(
      await within(dialog).findByText(/must be 2/)
    ).toBeInTheDocument();
    expect(api.createCohort).not.toHaveBeenCalled();
  });

  it("refuses an end date that precedes the start date", async () => {
    const user = userEvent.setup();
    renderWithToasts(<CohortManager />);
    await screen.findByText("Autumn Intake — Group A");

    await user.click(screen.getByRole("button", { name: /new class/i }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText(/course/i),
      publishedCourse.id
    );
    await user.type(within(dialog).getByLabelText(/class code/i), "CEH-V12-C");
    await user.type(within(dialog).getByLabelText(/class name/i), "Window Test");
    fireEvent.change(within(dialog).getByLabelText(/^starts/i), {
      target: { value: "2026-12-01T09:00" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^ends/i), {
      target: { value: "2026-11-01T09:00" },
    });
    await user.click(within(dialog).getByRole("button", { name: /create draft class/i }));

    expect(
      await within(dialog).findByText(/end date must be after the start date/i)
    ).toBeInTheDocument();
    expect(api.createCohort).not.toHaveBeenCalled();
  });

  it("shows an explicit unavailable state instead of demo classes", async () => {
    api.listCohorts.mockRejectedValue(
      new ApiError({
        status: 503,
        detail: "Backend unreachable.",
        code: "BACKEND_UNREACHABLE",
      })
    );

    renderWithToasts(<CohortManager />);

    expect(await screen.findByText("Class service unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Autumn Intake — Group A")).not.toBeInTheDocument();
  });
});

describe("Class lifecycle", () => {
  it("activates a draft class through the dedicated endpoint after confirmation", async () => {
    const user = userEvent.setup();
    const draft = makeCohort({ active_instructor_count: 1 });
    api.getCohort.mockResolvedValue(draft);
    api.activateCohort.mockResolvedValue({ ...draft, status: "active" });

    renderWithToasts(<CohortDetail cohortId={draft.id} />);
    await screen.findByText("Autumn Intake — Group A");

    await user.click(screen.getByRole("button", { name: "Activate" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/activation opens the class for enrollment/i)
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /activate class/i })
    );

    await waitFor(() => expect(api.activateCohort).toHaveBeenCalledWith(draft.id));
    // Status never travels through PATCH.
    expect(api.updateCohort).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument()
    );
  });

  it("explains missing activation prerequisites instead of offering a doomed action", async () => {
    const draft = makeCohort({ active_instructor_count: 0 });
    api.getCohort.mockResolvedValue(draft);

    renderWithToasts(<CohortDetail cohortId={draft.id} />);
    await screen.findByText("Autumn Intake — Group A");

    expect(
      (await screen.findAllByText(/assign at least one eligible instructor/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  it("requires a published course before activation", async () => {
    const draft = makeCohort({
      course_id: draftCourse.id,
      active_instructor_count: 1,
    });
    api.getCohort.mockResolvedValue(draft);

    renderWithToasts(<CohortDetail cohortId={draft.id} />);
    await screen.findByText("Autumn Intake — Group A");

    expect(
      (
        await screen.findAllByText(/course must be published before this class/i)
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  it("offers no backward transitions and none at all once archived", async () => {
    const completed = makeCohort({ status: "completed", active_instructor_count: 1 });
    api.getCohort.mockResolvedValue(completed);

    const { unmount } = renderWithToasts(
      <CohortDetail cohortId={completed.id} />
    );
    await screen.findByText("Autumn Intake — Group A");

    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    unmount();

    api.getCohort.mockResolvedValue(
      makeCohort({ status: "archived", active_instructor_count: 1 })
    );
    renderWithToasts(<CohortDetail cohortId="cohort-1" />);
    await screen.findByText("Autumn Intake — Group A");

    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByText(/archived classes\s+are read-only/i)).toBeInTheDocument();
  });

  it("surfaces the API's 409 explanation inside the confirmation dialog", async () => {
    const user = userEvent.setup();
    const draft = makeCohort({ active_instructor_count: 1 });
    api.getCohort.mockResolvedValue(draft);
    api.activateCohort.mockRejectedValue(
      new ApiError({
        status: 409,
        detail: "Course must be published before activation.",
      })
    );

    renderWithToasts(<CohortDetail cohortId={draft.id} />);
    await screen.findByText("Autumn Intake — Group A");

    await user.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /activate class/i })
    );

    expect(
      await within(dialog).findByText(/course must be published before activation/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Class metadata", () => {
  it("edits name and window only — course and status are never in the payload", async () => {
    const user = userEvent.setup();
    const cohort = makeCohort({ active_instructor_count: 1 });
    api.getCohort.mockResolvedValue(cohort);
    api.updateCohort.mockResolvedValue({
      ...cohort,
      name: "Renamed Intake",
      updated_at: "2026-10-02T09:00:00Z",
    });

    renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Autumn Intake — Group A");

    const nameInput = screen.getByLabelText(/class name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Intake");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(api.updateCohort).toHaveBeenCalledTimes(1));
    const [cohortId, payload] = api.updateCohort.mock.calls[0];
    expect(cohortId).toBe(cohort.id);
    expect(Object.keys(payload).sort()).toEqual(["ends_at", "name", "starts_at"]);
    expect(payload.name).toBe("Renamed Intake");
    expect(payload).not.toHaveProperty("course_id");
    expect(payload).not.toHaveProperty("status");
  });

  it("locks metadata editing on an archived class", async () => {
    const cohort = makeCohort({ status: "archived", active_instructor_count: 1 });
    api.getCohort.mockResolvedValue(cohort);

    renderWithToasts(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Autumn Intake — Group A");

    expect(screen.getByLabelText(/class name/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /save details/i })).toBeDisabled();
  });
});
