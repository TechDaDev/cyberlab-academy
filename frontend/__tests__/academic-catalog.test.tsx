import * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "@/features/academics/markdown";
import { CourseCatalog } from "@/features/academics/course-catalog";
import { CourseOverview } from "@/features/academics/course-overview";
import { ModuleExplorer } from "@/features/academics/module-explorer";
import { LessonViewer } from "@/features/academics/lesson-viewer";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
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

// Milestone 02B makes the lesson gate role-aware, so the viewer reads the active
// session role. This suite is about the catalog surfaces; the role-specific copy
// is covered by the cohort lesson-access suite.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "user-student",
      email: "student@cyberlab.test",
      full_name: "Synthetic Student",
      display_name: "Synthetic Student",
      roles: ["student"],
      active_role: "student",
      is_active: true,
      email_verified: true,
      mfa_enabled: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    },
    switchRole: vi.fn(),
    requestStepUp: vi.fn(),
    logout: vi.fn(),
  }),
}));

const api = vi.mocked(academicApi);

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

const moduleOne: ModulePublic = {
  id: "module-01",
  course_id: course.id,
  sequence: 1,
  title: "Introduction to Ethical Hacking",
  status: "published",
  summary: "Scope, ethics and rules of engagement.",
  published_at: "2026-09-02T10:00:00Z",
};

const lessonSummary: LessonSummary = {
  id: "lesson-01",
  module_id: moduleOne.id,
  sequence: 1,
  title: "Hacking Ethics and Scope",
  status: "published",
  content_version: 2,
};

const lessonDetail: LessonDetail = {
  ...lessonSummary,
  body_markdown: "# Ethics first\n\nWritten authorization is mandatory.",
  objectives: [
    { sequence: 1, text: "Explain the scope of an engagement." },
    { sequence: 2, text: "Apply rules of engagement." },
  ],
  resources: [
    {
      id: "res-1",
      sequence: 1,
      title: "Engagement template",
      type: "download_reference",
      external_url: null,
      asset_reference: "references/template.md",
    },
    {
      id: "res-2",
      sequence: 2,
      title: "OWASP",
      type: "external_link",
      external_url: "https://owasp.org",
      asset_reference: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Course catalog", () => {
  it("renders real course metadata with planned vs published module counts", async () => {
    api.listCourses.mockResolvedValue({
      items: [course],
      limit: 9,
      offset: 0,
      total: 1,
    });
    api.listCourseModules.mockResolvedValue([moduleOne]);

    render(<CourseCatalog canManage={false} />);

    expect(
      await screen.findByText("Certified Ethical Hacker v12")
    ).toBeInTheDocument();
    expect(screen.getAllByText("CEH-V12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v12").length).toBeGreaterThan(0);

    // The declared edition plan (20) and the actually published count (1) are
    // both visible, and never conflated.
    expect(screen.getByText("1 / 20")).toBeInTheDocument();
    expect(screen.getByText(/19 modules not yet authored or published/)).toBeInTheDocument();

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "20");
    expect(progress).toHaveAttribute(
      "aria-label",
      "1 of 20 planned modules published"
    );

    // Only the genuinely published module is listed; no filler rows exist.
    expect(screen.getAllByText("Introduction to Ethical Hacking")).toHaveLength(2);
    expect(screen.queryByText(/Module 02/)).toBeNull();
  });

  it("links a published module to the module explorer", async () => {
    api.listCourses.mockResolvedValue({
      items: [course],
      limit: 9,
      offset: 0,
      total: 1,
    });
    api.listCourseModules.mockResolvedValue([moduleOne]);

    render(<CourseCatalog canManage={false} />);

    const openLink = await screen.findByRole("link", { name: "Open" });
    expect(openLink).toHaveAttribute("href", "/academics/modules/module-01");
    expect(screen.getByRole("link", { name: /open curriculum/i })).toHaveAttribute(
      "href",
      `/academics/courses/${course.id}`
    );
  });

  it("shows an honest empty catalog instead of fabricated courses", async () => {
    api.listCourses.mockResolvedValue({
      items: [],
      limit: 9,
      offset: 0,
      total: 0,
    });

    render(<CourseCatalog canManage={false} />);

    expect(await screen.findByText("No published courses yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is fabricated to fill the space/i)
    ).toBeInTheDocument();
    expect(api.listCourseModules).not.toHaveBeenCalled();
  });

  it("surfaces a service failure rather than an empty catalog", async () => {
    api.listCourses.mockRejectedValue(
      new ApiError({ status: 503, detail: "Catalog maintenance in progress." })
    );

    render(<CourseCatalog canManage={false} />);

    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    expect(screen.getByText("Catalog maintenance in progress.")).toBeInTheDocument();
    expect(screen.queryByText("No published courses yet")).toBeNull();
  });
});

describe("Course overview", () => {
  it("lists published modules in sequence and states the missing positions", async () => {
    api.getCourse.mockResolvedValue(course);
    api.listCourseModules.mockResolvedValue([moduleOne]);

    render(<CourseOverview courseId={course.id} canManage={false} />);

    expect(await screen.findByText("Curriculum Sequence")).toBeInTheDocument();
    expect(screen.getByText("1 of 20 available")).toBeInTheDocument();
    expect(
      screen.getByText(/19 planned modules not yet available/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Titles and lesson content for those positions are intentionally not fabricated/i)
    ).toBeInTheDocument();

    const explore = screen.getByRole("link", { name: /explore/i });
    expect(explore).toHaveAttribute("href", "/academics/modules/module-01");
  });

  it("does not invent module records when nothing is published", async () => {
    api.getCourse.mockResolvedValue({
      ...course,
      published_module_count: 0,
    });
    api.listCourseModules.mockResolvedValue([]);

    render(<CourseOverview courseId={course.id} canManage={false} />);

    expect(await screen.findByText("No modules published")).toBeInTheDocument();
    expect(
      screen.getByText(/Module titles are never generated to fill the gap/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /explore/i })).toBeNull();
  });
});

describe("Module explorer", () => {
  it("lists published lessons in sequence with a link to the lesson view", async () => {
    api.getModule.mockResolvedValue(moduleOne);
    api.listModuleLessons.mockResolvedValue([lessonSummary]);

    render(<ModuleExplorer moduleId={moduleOne.id} canManage={false} />);

    expect(await screen.findByText("Hacking Ethics and Scope")).toBeInTheDocument();
    expect(screen.getByText("Module 01")).toBeInTheDocument();
    expect(screen.getByText("1 lesson")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /lesson details/i });
    expect(link).toHaveAttribute("href", "/academics/lessons/lesson-01");

    // Missions and assessments are not part of the contract and must not be implied.
    expect(
      screen.getByText(/Mission briefings, lab sandboxes and assessments are not part of/i)
    ).toBeInTheDocument();
  });

  it("explains an empty module rather than inventing lessons", async () => {
    api.getModule.mockResolvedValue(moduleOne);
    api.listModuleLessons.mockResolvedValue([]);

    render(<ModuleExplorer moduleId={moduleOne.id} canManage={false} />);

    expect(await screen.findByText("No lessons published")).toBeInTheDocument();
  });
});

describe("Lesson access gate", () => {
  it("explains the 403 enrollment gate without bypassing or inventing content", async () => {
    api.getLesson.mockRejectedValue(
      new ApiError({
        status: 403,
        detail: "Lesson bodies require enrollment or cohort assignment",
      })
    );

    render(<LessonViewer lessonId="lesson-01" />);

    expect(
      await screen.findByText("Lesson body not available")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/requires an active enrollment in an active class/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/shows no lesson text and offers no bypass/i)
    ).toBeInTheDocument();
    // The body is never rendered on a 403.
    expect(screen.queryByText(/Written authorization is mandatory/)).toBeNull();
  });

  it("renders the authored body, objectives and resources for a permitted read", async () => {
    api.getLesson.mockResolvedValue(lessonDetail);

    render(<LessonViewer lessonId="lesson-01" />);

    expect(await screen.findByText("Ethics first")).toBeInTheDocument();
    expect(
      screen.getByText("Written authorization is mandatory.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Explain the scope of an engagement.")
    ).toBeInTheDocument();
    expect(screen.getByText("Engagement template")).toBeInTheDocument();

    const external = screen.getByRole("link", { name: /open/i });
    expect(external).toHaveAttribute("href", "https://owasp.org");
    expect(external).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });
});

describe("Safe Markdown rendering", () => {
  it("never executes embedded HTML or script tags", () => {
    const { container } = render(
      <Markdown
        source={
          "# Title\n\n<script>window.__pwned = true;</script>\n\n<div onclick=\"alert(1)\">raw html</div>"
        }
      />
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("div[onclick]")).toBeNull();
    expect(container.textContent).toContain("window.__pwned = true;");
    expect(container.textContent).toContain("raw html");
  });

  it("keeps non-http link targets inert", () => {
    const { container } = render(
      <Markdown source={"[run](javascript:alert(1)) [ok](https://example.org/docs)"} />
    );

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute("href", "https://example.org/docs");
    expect(anchors[0]).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(container.textContent).toContain("run");
  });

  it("shows an explicit empty label for an unauthored body", () => {
    render(<Markdown source="" emptyLabel="No body authored." />);
    expect(screen.getByText("No body authored.")).toBeInTheDocument();
  });
});
