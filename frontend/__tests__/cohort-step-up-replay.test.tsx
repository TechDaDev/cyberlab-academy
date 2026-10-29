import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { CohortDetail } from "@/features/academics/cohorts/cohort-detail";
import { AuthProvider } from "@/features/auth/auth-context";
import { ReauthModal } from "@/features/auth/reauth-modal";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { setApiConnectionMode } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { AdminUserPublic, UserPublic } from "@/lib/types/api";
import type { CoursePublic } from "@/lib/types/academic";
import type {
  CohortInstructorPublic,
  CohortPublic,
  PageEnrollments,
} from "@/lib/types/cohorts";

/**
 * Milestone 02B step-up replay.
 *
 * The real `useStepUpRetry`, `AuthProvider` and `ReauthModal` are exercised; only
 * the class API module and the auth endpoints' network responses are stubbed.
 *
 * The case that matters most for 02B is the `204 No Content` removal: the removal
 * client resolves an explicit `{ removed: true }` marker so a successful replay can
 * never be mistaken for the `undefined` that a cancelled reauthentication returns.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
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

const api = vi.mocked(cohortsApi);
const academic = vi.mocked(academicApi);

const managerUser: UserPublic = {
  id: "u-mgr-1",
  full_name: "Mira Manager",
  email: "mira@cyberlab.academy",
  roles: ["manager", "student"],
  active_role: "manager",
  email_verified: true,
  created_at: "2026-09-01T00:00:00Z",
  is_active: true,
  mfa_enabled: false,
} as unknown as UserPublic;

const course: CoursePublic = {
  id: "course-ceh-v12",
  code: "CEH-V12",
  title: "Certified Ethical Hacker v12",
  edition: "v12",
  status: "published",
  planned_module_count: 20,
  published_module_count: 1,
  content_version: 2,
  summary: "Mission-based ethical hacking curriculum.",
  published_at: "2026-10-26T09:00:00Z",
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
  active_enrollment_count: 0,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

const assignment: CohortInstructorPublic = {
  id: "assign-1",
  cohort_id: cohort.id,
  instructor_user_id: "u-ins-1",
  instructor_name: "Nadia Instructor",
  active: true,
  assigned_at: "2026-10-02T09:00:00Z",
  removed_at: null,
};

const candidate: AdminUserPublic = {
  id: "u-ins-2",
  full_name: "Second Instructor",
  email: "second@cyberlab.test",
  roles: ["instructor"],
  email_verified: true,
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

const emptyEnrollments: PageEnrollments = {
  items: [],
  limit: 20,
  offset: 0,
  total: 0,
};

function stepUpRejection() {
  return new ApiError({ status: 403, detail: "Recent authentication required" });
}

function stubAuthNetwork() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.endsWith("/api/v1/health")) return json({ status: "ok" });
    if (url.includes("/api/v1/users/me")) return json(managerUser);
    if (url.endsWith("/api/v1/auth/reauthenticate") && init?.method === "POST") {
      return json(managerUser);
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWithAuth(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      <AuthProvider>
        {ui}
        <ReauthModal />
        <Toaster />
      </AuthProvider>
    </ToastStateProvider>
  );
}

async function signInToReauthPrompt(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog", {
    name: /step-up identity verification/i,
  });
  await user.type(within(dialog).getByLabelText(/current password/i), "Correct-Horse-1");
  await user.click(
    within(dialog).getByRole("button", { name: /verify & continue/i })
  );
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setApiConnectionMode("live");
  stubAuthNetwork();

  academic.listAdminCourses.mockResolvedValue({
    items: [course],
    limit: 100,
    offset: 0,
    total: 1,
  });
  academic.listCourseModules.mockResolvedValue([]);
  api.getCohort.mockResolvedValue(cohort);
  api.listCohortInstructors.mockResolvedValue([assignment]);
  api.listCohortEnrollments.mockResolvedValue(emptyEnrollments);
  api.listEligibleUsers.mockResolvedValue([candidate]);
});

describe("Step-up replay on class mutations", () => {
  it("replays an instructor assignment after reauthentication and refreshes once", async () => {
    const user = userEvent.setup();
    const assigned: CohortInstructorPublic = {
      ...assignment,
      id: "assign-2",
      instructor_user_id: candidate.id,
      instructor_name: candidate.full_name,
    };

    api.assignCohortInstructor
      .mockRejectedValueOnce(stepUpRejection())
      .mockResolvedValueOnce(assigned);
    api.listCohortInstructors
      .mockResolvedValueOnce([assignment])
      .mockResolvedValue([assignment, assigned]);

    renderWithAuth(<CohortDetail cohortId={cohort.id} />);

    await screen.findByText("Nadia Instructor");
    await user.type(
      screen.getByLabelText("Search instructor accounts"),
      "second"
    );
    await user.click(
      await screen.findByRole("button", { name: "Select Second Instructor" })
    );

    await signInToReauthPrompt(user);

    expect(await screen.findByText("Instructor assigned")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Second Instructor")).toBeInTheDocument()
    );
    expect(api.assignCohortInstructor).toHaveBeenCalledTimes(2);
    expect(api.listCohortInstructors).toHaveBeenCalledTimes(2);
  });

  it("treats a replayed 204 removal as success, not as a cancellation", async () => {
    const user = userEvent.setup();
    api.removeCohortInstructor
      .mockRejectedValueOnce(stepUpRejection())
      .mockResolvedValueOnce({ removed: true });
    api.listCohortInstructors
      .mockResolvedValueOnce([assignment])
      .mockResolvedValue([]);

    renderWithAuth(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.click(
      screen.getByRole("button", { name: "Remove Nadia Instructor" })
    );
    const confirm = await screen.findByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: /remove assignment/i })
    );

    await signInToReauthPrompt(user);

    // Success feedback only happens when `{ removed: true }` came back from the replay.
    expect(await screen.findByText("Assignment removed")).toBeInTheDocument();
    expect(api.removeCohortInstructor).toHaveBeenCalledTimes(2);
    expect(api.listCohortInstructors).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText("Nadia Instructor")).not.toBeInTheDocument()
    );
  });

  it("does not replay a removal when reauthentication is cancelled", async () => {
    const user = userEvent.setup();
    api.removeCohortInstructor.mockRejectedValueOnce(stepUpRejection());

    renderWithAuth(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.click(
      screen.getByRole("button", { name: "Remove Nadia Instructor" })
    );
    const confirm = await screen.findByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: /remove assignment/i })
    );

    const stepUp = await screen.findByRole("dialog", {
      name: /step-up identity verification/i,
    });
    await user.click(within(stepUp).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /step-up identity verification/i })
      ).not.toBeInTheDocument()
    );

    expect(api.removeCohortInstructor).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Assignment removed")).not.toBeInTheDocument();
    // Cancellation leaves the class exactly as it was.
    expect(api.listCohortInstructors).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Nadia Instructor")).toBeInTheDocument();
  });

  it("surfaces the real API error when the replay fails", async () => {
    const user = userEvent.setup();
    api.removeCohortInstructor
      .mockRejectedValueOnce(stepUpRejection())
      .mockRejectedValueOnce(
        new ApiError({ status: 409, detail: "Assignment already removed." })
      );

    renderWithAuth(<CohortDetail cohortId={cohort.id} />);
    await screen.findByText("Nadia Instructor");

    await user.click(
      screen.getByRole("button", { name: "Remove Nadia Instructor" })
    );
    const confirm = await screen.findByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: /remove assignment/i })
    );

    await signInToReauthPrompt(user);

    expect(
      await screen.findByText(/assignment already removed/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Assignment removed")).not.toBeInTheDocument();
    expect(api.listCohortInstructors).toHaveBeenCalledTimes(1);
  });
});
