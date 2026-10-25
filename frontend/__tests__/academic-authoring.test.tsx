import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentManagementPage from "@/app/(authenticated)/academics/manage/page";
import { Toaster } from "@/components/ui/toaster";
import { ContentManager } from "@/features/academics/content-manager";
import { CourseEditor } from "@/features/academics/course-editor";
import { LessonEditor } from "@/features/academics/lesson-editor";
import { ModuleEditor } from "@/features/academics/module-editor";
import { getNavigationForRole } from "@/features/roles/role-metadata";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import type { Role, UserPublic } from "@/lib/types/api";
import type {
  CoursePublic,
  LessonDetail,
  LessonSummary,
  ModulePublic,
} from "@/lib/types/academic";

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

// The editors route step-up rejections through the reauthentication modal. That
// flow is covered by the roles/step-up suite; here the mutation is executed
// directly so the academic behaviour is what is under test.
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

const api = vi.mocked(academicApi);

function makeUser(activeRole: Role, roles: Role[] = [activeRole]): UserPublic {
  return {
    id: "user-1",
    email: "operator@cyberlab.test",
    full_name: "Synthetic Operator",
    display_name: "Synthetic Operator",
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

const draftCourse: CoursePublic = {
  id: "course-ceh-v12",
  code: "CEH-V12",
  title: "Certified Ethical Hacker v12",
  edition: "v12",
  status: "draft",
  planned_module_count: 20,
  published_module_count: 0,
  content_version: 1,
  summary: "Mission-based ethical hacking curriculum.",
  published_at: null,
};

const draftModule: ModulePublic = {
  id: "module-01",
  course_id: draftCourse.id,
  sequence: 1,
  title: "Introduction to Ethical Hacking",
  status: "draft",
  summary: "Scope, ethics and rules of engagement.",
  published_at: null,
};

const draftLesson: LessonSummary = {
  id: "lesson-01",
  module_id: draftModule.id,
  sequence: 1,
  title: "Hacking Ethics and Scope",
  status: "draft",
  content_version: 1,
};

const draftLessonDetail: LessonDetail = {
  ...draftLesson,
  body_markdown: "# Ethics first\n\nWritten authorization is mandatory.",
  objectives: [{ sequence: 1, text: "Explain the scope of an engagement." }],
  resources: [
    {
      id: "res-1",
      sequence: 1,
      title: "Engagement template",
      type: "download_reference",
      external_url: null,
      asset_reference: "references/template.md",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = null;
});

describe("Content management listing", () => {
  it("retrieves draft courses that the public catalog hides", async () => {
    api.listAdminCourses.mockResolvedValue({
      items: [draftCourse],
      limit: 9,
      offset: 0,
      total: 1,
    });

    render(<ContentManager />);

    expect(await screen.findByText("Certified Ethical Hacker v12")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Never published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/academics/manage/courses/course-ceh-v12"
    );
  });

  it("shows the seed instruction when no courses exist", async () => {
    api.listAdminCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });

    render(<ContentManager />);

    expect(await screen.findByText("No courses exist yet")).toBeInTheDocument();
    expect(screen.getByText(/python -m app\.seed_catalog/)).toBeInTheDocument();
  });
});

describe("Course creation", () => {
  it("posts the exact contract payload for a new draft", async () => {
    const user = userEvent.setup();
    api.listAdminCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });
    api.createCourse.mockResolvedValue({ ...draftCourse, code: "CEH-V13" });

    render(<ContentManager />);

    await screen.findByText("No courses exist yet");
    await user.click(screen.getByRole("button", { name: /new course draft/i }));

    await user.type(await screen.findByLabelText(/course code/i), "ceh-v13");
    await user.type(screen.getByLabelText(/^edition/i), "v13");
    await user.type(
      screen.getByLabelText(/^title/i),
      "Certified Ethical Hacker v13"
    );
    await user.type(screen.getByLabelText(/planned module count/i), "20");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    await waitFor(() => expect(api.createCourse).toHaveBeenCalledTimes(1));
    expect(api.createCourse).toHaveBeenCalledWith({
      code: "CEH-V13",
      title: "Certified Ethical Hacker v13",
      edition: "v13",
      planned_module_count: 20,
      summary: "",
    });
  });

  it("blocks submission on client validation before calling the API", async () => {
    const user = userEvent.setup();
    api.listAdminCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });

    render(<ContentManager />);

    await screen.findByText("No courses exist yet");
    await user.click(screen.getByRole("button", { name: /new course draft/i }));

    await user.type(await screen.findByLabelText(/course code/i), "C");
    await user.type(screen.getByLabelText(/^edition/i), "v13");
    await user.type(screen.getByLabelText(/^title/i), "Certified Ethical Hacker v13");
    await user.type(screen.getByLabelText(/planned module count/i), "20");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(
      await screen.findByText("Course code must be 2–40 characters.")
    ).toBeInTheDocument();
    expect(api.createCourse).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-code conflict from the backend", async () => {
    const user = userEvent.setup();
    api.listAdminCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });
    api.createCourse.mockRejectedValue(
      new ApiError({
        status: 409,
        detail: "A course with that code already exists",
      })
    );

    render(<ContentManager />);

    await screen.findByText("No courses exist yet");
    await user.click(screen.getByRole("button", { name: /new course draft/i }));

    await user.type(await screen.findByLabelText(/course code/i), "CEH-V12");
    await user.type(screen.getByLabelText(/^edition/i), "v12");
    await user.type(screen.getByLabelText(/^title/i), "Certified Ethical Hacker v12");
    await user.type(screen.getByLabelText(/planned module count/i), "20");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(
      await screen.findByText("A course with that code already exists")
    ).toBeInTheDocument();
  });
});

/** Renders with the toast provider so success feedback is observable. */
function renderWithToasts(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      {ui}
      <Toaster />
    </ToastStateProvider>
  );
}

const publishedCourse: CoursePublic = {
  ...draftCourse,
  status: "published",
  content_version: 2,
  published_at: "2026-10-01T09:00:00Z",
};

const publishedModule: ModulePublic = {
  ...draftModule,
  status: "published",
  published_at: "2026-10-02T09:00:00Z",
};

describe("Module quick publish confirmation", () => {
  it("opens a confirmation dialog that names the module and sequence, without publishing", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(publishedCourse);
    api.listAdminModules.mockResolvedValue([draftModule]);

    renderWithToasts(<CourseEditor courseId={publishedCourse.id} />);

    await screen.findByText("Introduction to Ethical Hacking");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Publish Module 01?")
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/"Introduction to Ethical Hacking" \(sequence 1\)/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/visible to students in the curriculum once its parent course is published/i)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /publish module/i })
    ).toBeInTheDocument();

    // Nothing is published until the operator confirms.
    expect(api.publishModule).not.toHaveBeenCalled();
  });

  it("cancels without calling the publication endpoint", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(publishedCourse);
    api.listAdminModules.mockResolvedValue([draftModule]);

    renderWithToasts(<CourseEditor courseId={publishedCourse.id} />);

    await screen.findByText("Introduction to Ethical Hacking");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(api.publishModule).not.toHaveBeenCalled();
    // No refresh, no success feedback, and the module is still a draft.
    expect(api.listAdminModules).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Module 1 published/)).not.toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("publishes once after confirmation, closes the dialog and refreshes the list", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(publishedCourse);
    api.listAdminModules
      .mockResolvedValueOnce([draftModule])
      .mockResolvedValue([publishedModule]);
    api.publishModule.mockResolvedValue(publishedModule);

    renderWithToasts(<CourseEditor courseId={publishedCourse.id} />);

    await screen.findByText("Introduction to Ethical Hacking");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /publish module/i })
    );

    await waitFor(() =>
      expect(api.publishModule).toHaveBeenCalledWith(draftModule.id)
    );
    expect(api.publishModule).toHaveBeenCalledTimes(1);

    // Success feedback, refreshed data and a closed dialog.
    expect(
      await screen.findByText(/Module 1 published/)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(api.listAdminModules).toHaveBeenCalledTimes(2);
    expect(api.getAdminCourse).toHaveBeenCalledTimes(2);

    // The refreshed module row shows the new status and no longer offers Publish.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const moduleRow = screen
      .getByText("Introduction to Ethical Hacking")
      .closest("li");
    expect(moduleRow).not.toBeNull();
    expect(within(moduleRow as HTMLElement).getByText("Published")).toBeInTheDocument();
    expect(
      within(moduleRow as HTMLElement).queryByRole("button", { name: /^publish$/i })
    ).toBeNull();
  });

  it("prevents duplicate submissions while the publication is in flight", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(publishedCourse);
    api.listAdminModules.mockResolvedValue([draftModule]);

    let resolvePublish: (value: ModulePublic) => void = () => {};
    api.publishModule.mockImplementation(
      () => new Promise<ModulePublic>((resolve) => {
        resolvePublish = resolve;
      })
    );

    renderWithToasts(<CourseEditor courseId={publishedCourse.id} />);

    await screen.findByText("Introduction to Ethical Hacking");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: /publish module/i,
    });
    await user.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    await user.click(confirm);
    await user.click(confirm);
    expect(api.publishModule).toHaveBeenCalledTimes(1);

    resolvePublish(publishedModule);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("reports a publication failure in the dialog and keeps it open", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(publishedCourse);
    api.listAdminModules.mockResolvedValue([draftModule]);
    api.publishModule.mockRejectedValue(
      new ApiError({
        status: 409,
        detail: "A module needs at least one published lesson",
      })
    );

    renderWithToasts(<CourseEditor courseId={publishedCourse.id} />);

    await screen.findByText("Introduction to Ethical Hacking");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /publish module/i })
    );

    expect(
      await screen.findByText("A module needs at least one published lesson")
    ).toBeInTheDocument();
    // The dialog survives for a retry, and nothing is reported as published.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Module 1 published/)).not.toBeInTheDocument();
    expect(api.publishModule).toHaveBeenCalledTimes(1);
    expect(api.listAdminModules).toHaveBeenCalledTimes(1);
  });
});

describe("Course editor", () => {
  it("reopens a draft course with its draft modules and publishes explicitly", async () => {
    const user = userEvent.setup();
    api.getAdminCourse.mockResolvedValue(draftCourse);
    api.listAdminModules.mockResolvedValue([draftModule]);
    api.publishCourse.mockResolvedValue({ ...draftCourse, status: "published" });

    render(<CourseEditor courseId={draftCourse.id} />);

    expect(await screen.findByText("Course Metadata")).toBeInTheDocument();
    // Both the course and its module are still drafts.
    expect(screen.getAllByText("Draft").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Introduction to Ethical Hacking")).toBeInTheDocument();
    expect(screen.getByText(/1 created · 20 planned/)).toBeInTheDocument();

    // Module publication is blocked while the parent course is a draft.
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /publish course/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /publish course/i }));

    await waitFor(() => expect(api.publishCourse).toHaveBeenCalledWith("course-ceh-v12"));
  });
});

describe("Module editor", () => {
  it("reopens a draft module with its lessons in sequence", async () => {
    api.getModule.mockResolvedValue(draftModule);
    api.listModuleLessons.mockResolvedValue([draftLesson]);

    render(<ModuleEditor moduleId={draftModule.id} />);

    expect(await screen.findByText("Module Metadata")).toBeInTheDocument();
    expect(screen.getByText("Hacking Ethics and Scope")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit lesson/i })).toHaveAttribute(
      "href",
      "/academics/manage/lessons/lesson-01"
    );
    expect(screen.getByText(/1 lesson · 0 published/)).toBeInTheDocument();
  });

  it("reports a duplicate sequence from the API as a field error", async () => {
    const user = userEvent.setup();
    api.getModule.mockResolvedValue(draftModule);
    api.listModuleLessons.mockResolvedValue([]);
    api.updateModule.mockRejectedValue(
      new ApiError({
        status: 409,
        detail: "A module already exists at that sequence",
      })
    );

    render(<ModuleEditor moduleId={draftModule.id} />);

    const sequence = await screen.findByLabelText(/^sequence/i);
    await user.clear(sequence);
    await user.type(sequence, "2");
    await user.click(screen.getByRole("button", { name: /save module/i }));

    expect(
      await screen.findByText(
        "Sequence 2 is already used by another module in this course."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("A module already exists at that sequence")).toBeInTheDocument();
  });

  it("publishes a module only after confirmation", async () => {
    const user = userEvent.setup();
    api.getModule.mockResolvedValue(draftModule);
    api.listModuleLessons.mockResolvedValue([draftLesson]);
    api.publishModule.mockResolvedValue({ ...draftModule, status: "published" });

    render(<ModuleEditor moduleId={draftModule.id} />);

    await screen.findByText("Module Metadata");
    await user.click(screen.getByRole("button", { name: /publish module/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/requires a published course and at least one published lesson/i)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /publish module/i }));

    await waitFor(() => expect(api.publishModule).toHaveBeenCalledWith("module-01"));
  });
});

describe("Lesson editor", () => {
  it("saves the authored body, objectives and normalised resources", async () => {
    const user = userEvent.setup();
    api.getLesson.mockResolvedValue(draftLessonDetail);
    api.updateLesson.mockResolvedValue(draftLessonDetail);

    render(<LessonEditor lessonId="lesson-01" />);

    expect(await screen.findByDisplayValue(/Ethics first/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save lesson/i }));

    await waitFor(() => expect(api.updateLesson).toHaveBeenCalledTimes(1));
    expect(api.updateLesson).toHaveBeenCalledWith(
      "lesson-01",
      expect.objectContaining({
        sequence: 1,
        title: "Hacking Ethics and Scope",
        body_markdown: "# Ethics first\n\nWritten authorization is mandatory.",
        objectives: ["Explain the scope of an engagement."],
        resources: [
          {
            title: "Engagement template",
            type: "download_reference",
            external_url: null,
            asset_reference: "references/template.md",
          },
        ],
      })
    );
  });

  it("renders the Markdown preview exactly as the lesson view will", async () => {
    const user = userEvent.setup();
    api.getLesson.mockResolvedValue(draftLessonDetail);

    render(<LessonEditor lessonId="lesson-01" />);

    await screen.findByDisplayValue(/Ethics first/);
    await user.click(screen.getByRole("tab", { name: /preview/i }));

    expect(
      await screen.findByRole("heading", { name: "Ethics first" })
    ).toBeInTheDocument();
  });

  it("publishes the lesson through the publish endpoint after confirmation", async () => {
    const user = userEvent.setup();
    api.getLesson.mockResolvedValue(draftLessonDetail);
    api.publishLesson.mockResolvedValue({
      ...draftLessonDetail,
      status: "published",
      content_version: 2,
    });

    render(<LessonEditor lessonId="lesson-01" />);

    await screen.findByDisplayValue(/Ethics first/);
    await user.click(screen.getByRole("button", { name: /publish lesson/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /publish lesson/i }));

    await waitFor(() => expect(api.publishLesson).toHaveBeenCalledWith("lesson-01"));
    // Status only ever changes through the publish endpoint.
    expect(api.updateLesson).not.toHaveBeenCalled();
  });
});

describe("Role-restricted content management", () => {
  it("blocks a student from the authoring workspace without calling the admin API", async () => {
    currentUser = makeUser("student");
    api.listAdminCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });

    render(<ContentManagementPage />);

    expect(await screen.findByText("Manager Authorization Required")).toBeInTheDocument();
    expect(api.listAdminCourses).not.toHaveBeenCalled();
  });

  it("renders the authoring workspace for an active manager", async () => {
    currentUser = makeUser("manager", ["manager", "student"]);
    api.listAdminCourses.mockResolvedValue({
      items: [draftCourse],
      limit: 9,
      offset: 0,
      total: 1,
    });

    render(<ContentManagementPage />);

    expect(await screen.findByText("Course Drafts & Publication")).toBeInTheDocument();
    expect(api.listAdminCourses).toHaveBeenCalledTimes(1);
  });
});

describe("Role navigation", () => {
  const academicItems = (role: Role) =>
    getNavigationForRole(role)
      .flatMap((section) => section.items)
      .filter((item) => item.href.startsWith("/academics"));

  it("gives every role a course catalog entry", () => {
    for (const role of ["student", "instructor", "manager", "administrator"] as Role[]) {
      const catalog = academicItems(role).find((item) => item.href === "/academics");
      expect(catalog, `${role} lacks a catalog entry`).toBeDefined();
    }
  });

  it("exposes content management only to manager and administrator", () => {
    expect(
      academicItems("student").some((item) => item.href.startsWith("/academics/manage"))
    ).toBe(false);
    expect(
      academicItems("instructor").some((item) => item.href.startsWith("/academics/manage"))
    ).toBe(false);
    expect(
      academicItems("manager").some((item) => item.href === "/academics/manage")
    ).toBe(true);
    expect(
      academicItems("administrator").some((item) => item.href === "/academics/manage")
    ).toBe(true);
  });

  it("keeps the existing demonstration entries labelled as demonstrations", () => {
    for (const role of ["student", "instructor"] as Role[]) {
      const demoItems = getNavigationForRole(role)
        .flatMap((section) => section.items)
        .filter((item) => item.href.startsWith("/dashboard") && item.href.includes("#"));
      expect(demoItems.length).toBeGreaterThan(0);
      for (const item of demoItems) {
        expect(item.badge, `${item.label} lost its Demo badge`).toBe("Demo");
      }
    }
  });
});
