import * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LearningWorkspacePage from "@/app/(authenticated)/academics/learn/page";
import TeachingWorkspacePage from "@/app/(authenticated)/academics/teach/page";
import { Toaster } from "@/components/ui/toaster";
import { LearningOverview } from "@/features/academics/cohorts/learning-overview";
import { StudentEnrollment } from "@/features/academics/cohorts/student-enrollment";
import { TeachingCohort } from "@/features/academics/cohorts/teaching-cohort";
import { TeachingOverview } from "@/features/academics/cohorts/teaching-overview";
import { getNavigationForRole } from "@/features/roles/role-metadata";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { cohortsApi } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api/errors";
import type { Role, UserPublic } from "@/lib/types/api";
import type { CoursePublic, ModulePublic } from "@/lib/types/academic";
import type {
  CohortPublic,
  OwnEnrollmentCourse,
  PageCohorts,
  PageRoster,
  PageStudentEnrollments,
  StudentEnrollmentPublic,
} from "@/lib/types/cohorts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academics/teach",
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
    id: `user-${activeRole}`,
    email: `${activeRole}@cyberlab.test`,
    full_name: `Synthetic ${activeRole}`,
    display_name: `Synthetic ${activeRole}`,
    roles,
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

const activeCohort: CohortPublic = {
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

const otherCohort: CohortPublic = {
  ...activeCohort,
  id: "cohort-2",
  code: "CEH-V12-B",
  name: "Spring Intake — Group B",
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
  {
    id: "module-02",
    course_id: course.id,
    sequence: 2,
    title: "Reconnaissance Foundations",
    status: "draft",
    summary: "Passive and active information gathering.",
    published_at: null,
  },
];

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
    {
      user_id: "user-student-2",
      full_name: "Karim Withdrew",
      email: "karim@cyberlab.test",
      email_verified: true,
      status: "withdrawn",
      enrolled_at: "2026-10-04T09:00:00Z",
    },
  ],
  limit: 20,
  offset: 0,
  total: 2,
};

const activeEnrollment: StudentEnrollmentPublic = {
  id: "enrollment-1",
  cohort_id: activeCohort.id,
  cohort_code: activeCohort.code,
  cohort_name: activeCohort.name,
  cohort_status: "active",
  course_id: course.id,
  course_code: course.code,
  course_title: course.title,
  status: "active",
  enrolled_at: "2026-10-03T09:00:00Z",
  ended_at: null,
};

const withdrawnEnrollment: StudentEnrollmentPublic = {
  ...activeEnrollment,
  id: "enrollment-2",
  cohort_id: otherCohort.id,
  cohort_code: otherCohort.code,
  cohort_name: otherCohort.name,
  status: "withdrawn",
  ended_at: "2026-10-12T09:00:00Z",
};

function cohortsPage(items: CohortPublic[]): PageCohorts {
  return { items, limit: 20, offset: 0, total: items.length };
}

function enrollmentsPage(
  items: StudentEnrollmentPublic[]
): PageStudentEnrollments {
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
  currentUser = makeUser("instructor");
  academic.listCourses.mockResolvedValue({
    items: [course],
    limit: 100,
    offset: 0,
    total: 1,
  });
  academic.listCourseModules.mockResolvedValue(modules);
  api.listTeachingCohorts.mockResolvedValue(cohortsPage([activeCohort]));
  api.getTeachingCohort.mockResolvedValue(activeCohort);
  api.listCohortRoster.mockResolvedValue(roster);
  api.listOwnEnrollments.mockResolvedValue(enrollmentsPage([activeEnrollment]));
});

describe("Instructor teaching workspace", () => {
  it("lists only the classes the instructor is assigned to", async () => {
    renderWithToasts(<TeachingOverview />);

    expect(await screen.findByText("Autumn Intake — Group A")).toBeInTheDocument();
    expect(screen.getByText("CEH-V12-A")).toBeInTheDocument();
    expect(api.listTeachingCohorts).toHaveBeenCalledWith(20, 0);
    // The instructor surface never calls the administrator class directory.
    expect(api.listCohorts).not.toHaveBeenCalled();
    expect(api.listCohortEnrollments).not.toHaveBeenCalled();
  });

  it("explains an empty assignment list instead of inventing classes", async () => {
    api.listTeachingCohorts.mockResolvedValue(cohortsPage([]));

    renderWithToasts(<TeachingOverview />);

    expect(await screen.findByText("No classes assigned")).toBeInTheDocument();
    expect(
      screen.getByText(/must assign you to a class/i)
    ).toBeInTheDocument();
  });

  it("shows the roster of an assigned class and links the curriculum", async () => {
    renderWithToasts(<TeachingCohort cohortId={activeCohort.id} />);

    expect(await screen.findByText("Amina Student")).toBeInTheDocument();
    expect(screen.getByText("amina@cyberlab.test")).toBeInTheDocument();
    expect(screen.getByText("Karim Withdrew")).toBeInTheDocument();

    const curriculum = screen.getByRole("heading", { name: /course curriculum/i });
    expect(curriculum).toBeInTheDocument();
    expect(
      await screen.findByRole("link", {
        name: /introduction to ethical hacking/i,
      })
    ).toHaveAttribute("href", "/academics/modules/module-01");
    // Draft modules are not part of the public curriculum listing.
    expect(
      screen.queryByRole("link", { name: /reconnaissance foundations/i })
    ).not.toBeInTheDocument();
  });

  it("offers no publishing or grading controls to instructors", async () => {
    renderWithToasts(<TeachingCohort cohortId={activeCohort.id} />);
    await screen.findByText("Amina Student");

    for (const forbidden of [
      /^(publish|unpublish)/i,
      /^grade/i,
      /^attendance/i,
      /^record (grade|attendance)/i,
    ]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
        `instructor surface exposes a ${forbidden} control`
      ).not.toBeInTheDocument();
    }
    expect(document.querySelector("form")).toBeNull();
    expect(
      screen.getByText(/do not have global publish rights/i)
    ).toBeInTheDocument();
  });

  it("treats a 404 as 'not assigned', not as an empty class", async () => {
    api.getTeachingCohort.mockRejectedValue(
      new ApiError({ status: 404, detail: "Not found." })
    );

    renderWithToasts(<TeachingCohort cohortId={activeCohort.id} />);

    expect(await screen.findByText("Class not available")).toBeInTheDocument();
    expect(
      screen.getByText(/do not have a live teaching assignment/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Amina Student")).not.toBeInTheDocument();
  });
});

describe("Student learning workspace", () => {
  beforeEach(() => {
    currentUser = makeUser("student");
    api.listOwnEnrollments.mockResolvedValue(
      enrollmentsPage([activeEnrollment, withdrawnEnrollment])
    );
  });

  it("lists only the student's own enrollments with access state", async () => {
    renderWithToasts(<LearningOverview />);

    expect(await screen.findByText("Autumn Intake — Group A")).toBeInTheDocument();
    expect(screen.getByText("Spring Intake — Group B")).toBeInTheDocument();
    expect(
      screen.getByText(/withdrawn: the class remains visible/i)
    ).toBeInTheDocument();
    expect(api.listOwnEnrollments).toHaveBeenCalledWith(20, 0);
    expect(api.listCohorts).not.toHaveBeenCalled();
  });

  it("links each enrollment to its own detail route", async () => {
    renderWithToasts(<LearningOverview />);

    const links = await screen.findAllByRole("link", { name: /open class/i });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/academics/learn/enrollments/enrollment-1",
      "/academics/learn/enrollments/enrollment-2",
    ]);
  });

  it("states that students cannot self-enroll", async () => {
    api.listOwnEnrollments.mockResolvedValue(enrollmentsPage([]));

    renderWithToasts(<LearningOverview />);

    expect(await screen.findByText("No enrollments yet")).toBeInTheDocument();
    expect(screen.getByText(/cannot enroll themselves/i)).toBeInTheDocument();
  });

  it("grants lesson access for an active enrollment in an active class", async () => {
    const payload: OwnEnrollmentCourse = {
      enrollment: activeEnrollment,
      cohort: activeCohort,
      course,
    };
    api.getOwnEnrollmentCourse.mockResolvedValue(payload);

    renderWithToasts(<StudentEnrollment enrollmentId={activeEnrollment.id} />);

    expect(await screen.findByText("Autumn Intake — Group A")).toBeInTheDocument();
    expect(screen.getByText("Granted")).toBeInTheDocument();
    expect(
      screen.getByText(/your enrollment is active and the class is open/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", {
        name: /introduction to ethical hacking/i,
      })
    ).toBeInTheDocument();
  });

  it("shows a withdrawn enrollment as a record without lesson access", async () => {
    currentUser = makeUser("student");
    const payload: OwnEnrollmentCourse = {
      enrollment: withdrawnEnrollment,
      cohort: { ...otherCohort, status: "active" },
      course,
    };
    api.getOwnEnrollmentCourse.mockResolvedValue(payload);

    renderWithToasts(<StudentEnrollment enrollmentId={withdrawnEnrollment.id} />);

    expect(await screen.findByText("Not granted")).toBeInTheDocument();
    expect(
      screen.getByText(/this enrollment is withdrawn/i)
    ).toBeInTheDocument();
    // The record stays visible; only the lesson bodies are gated.
    expect(screen.getByText(/Spring Intake — Group B/)).toBeInTheDocument();
  });

  it("conceals another learner's enrollment behind a 404", async () => {
    api.getOwnEnrollmentCourse.mockRejectedValue(
      new ApiError({ status: 404, detail: "Not found." })
    );

    renderWithToasts(<StudentEnrollment enrollmentId="someone-else" />);

    expect(await screen.findByText("Enrollment not found")).toBeInTheDocument();
    expect(
      screen.getByText(/belongs to another learner/i)
    ).toBeInTheDocument();
  });
});

describe("Role boundaries and navigation", () => {
  it("blocks a student from the teaching workspace", async () => {
    currentUser = makeUser("student");
    renderWithToasts(<TeachingWorkspacePage />);

    expect(
      await screen.findByText("Instructor Authorization Required")
    ).toBeInTheDocument();
    expect(api.listTeachingCohorts).not.toHaveBeenCalled();
  });

  it("blocks an instructor from the student learning workspace", async () => {
    currentUser = makeUser("instructor");
    renderWithToasts(<LearningWorkspacePage />);

    expect(
      await screen.findByText("Student Authorization Required")
    ).toBeInTheDocument();
    expect(api.listOwnEnrollments).not.toHaveBeenCalled();
  });

  it("offers the instructor a switch when the account holds both roles", async () => {
    currentUser = makeUser("student", ["student", "instructor"]);
    renderWithToasts(<TeachingWorkspacePage />);

    expect(
      await screen.findByText("Switch Session Role to Instructor")
    ).toBeInTheDocument();
  });

  it("adds the 02B entries to each role's navigation without leaking management", () => {
    const academicHrefs = (role: Role) =>
      getNavigationForRole(role)
        .flatMap((section) => section.items)
        .filter((item) => item.href.startsWith("/academics"))
        .map((item) => item.href);

    expect(academicHrefs("student")).toContain("/academics/learn");
    expect(academicHrefs("student")).not.toContain("/academics/manage/cohorts");
    expect(academicHrefs("instructor")).toContain("/academics/teach");
    expect(academicHrefs("instructor")).not.toContain("/academics/manage");
    expect(academicHrefs("manager")).toContain("/academics/manage/cohorts");
    expect(academicHrefs("administrator")).toContain("/academics/manage/cohorts");
  });

  it("keeps demonstration entries labelled as demonstrations", () => {
    for (const role of ["student", "instructor"] as Role[]) {
      const demoItems = getNavigationForRole(role)
        .flatMap((section) => section.items)
        .filter(
          (item) =>
            item.href.startsWith("/dashboard") && item.href.includes("#")
        );
      for (const item of demoItems) {
        expect(item.badge, `${item.label} lost its Demo badge`).toBe("Demo");
      }
    }
  });
});
