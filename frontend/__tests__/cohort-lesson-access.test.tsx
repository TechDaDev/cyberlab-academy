import * as React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LessonViewer } from "@/features/academics/lesson-viewer";
import { academicApi } from "@/lib/api/academic";
import { ApiError } from "@/lib/api/errors";
import type { LessonDetail } from "@/lib/types/academic";
import type { Role, UserPublic } from "@/lib/types/api";

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

let currentUser: UserPublic | null = null;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: currentUser,
    switchRole: vi.fn(),
    requestStepUp: vi.fn(),
    logout: vi.fn(),
  }),
}));

const api = vi.mocked(academicApi);

function makeUser(activeRole: Role): UserPublic {
  return {
    id: `user-${activeRole}`,
    email: `${activeRole}@cyberlab.test`,
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

const lesson: LessonDetail = {
  id: "lesson-01",
  module_id: "module-01",
  sequence: 1,
  title: "Hacking Ethics and Scope",
  status: "published",
  content_version: 2,
  body_markdown:
    "## Scope and Ethics\n\nAlways obtain written authorization before testing.\n\n<script>alert('xss')</script>",
  objectives: [
    { sequence: 1, text: "Define rules of engagement for an authorized assessment." },
  ],
  resources: [
    {
      id: "resource-01",
      sequence: 1,
      title: "Rules of engagement template",
      type: "reference",
      external_url: null,
      asset_reference: "roE-template.md",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = makeUser("student");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Lesson body access", () => {
  it("renders the authorized body, objectives and references", async () => {
    api.getLesson.mockResolvedValue(lesson);

    render(<LessonViewer lessonId={lesson.id} />);

    expect(
      await screen.findByText(/always obtain written authorization/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/define rules of engagement/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Rules of engagement template")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /scope and ethics/i })).toBeInTheDocument();
  });

  it("renders embedded HTML as inert text, never as markup", async () => {
    api.getLesson.mockResolvedValue(lesson);

    const { container } = render(<LessonViewer lessonId={lesson.id} />);

    await screen.findByText(/always obtain written authorization/i);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\('xss'\)<\/script>/)).toBeInTheDocument();
  });

  it("explains the enrollment gate to a student and points at their classes", async () => {
    api.getLesson.mockRejectedValue(
      new ApiError({ status: 403, detail: "Enrollment required." })
    );

    render(<LessonViewer lessonId={lesson.id} />);

    expect(await screen.findByText("Lesson body not available")).toBeInTheDocument();
    expect(
      screen.getByText(/requires an active enrollment in an active class/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my classes/i })).toHaveAttribute(
      "href",
      "/academics/learn"
    );
    expect(
      screen.queryByText(/always obtain written authorization/i)
    ).not.toBeInTheDocument();
  });

  it("explains the assignment gate to an instructor", async () => {
    currentUser = makeUser("instructor");
    api.getLesson.mockRejectedValue(
      new ApiError({ status: 403, detail: "Assignment required." })
    );

    render(<LessonViewer lessonId={lesson.id} />);

    expect(
      await screen.findByText(/requires a live teaching assignment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /assigned classes/i })
    ).toHaveAttribute("href", "/academics/teach");
  });

  it("sends a manager to the authoring workspace instead of implying a bypass", async () => {
    currentUser = makeUser("manager");
    api.getLesson.mockRejectedValue(
      new ApiError({ status: 403, detail: "Unpublished content." })
    );

    render(<LessonViewer lessonId={lesson.id} />);

    expect(
      await screen.findByText(/active session role cannot read this lesson body/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /academic workspace/i })
    ).toHaveAttribute("href", "/academics/manage");
    expect(
      screen.queryByRole("button", { name: /bypass/i })
    ).not.toBeInTheDocument();
  });

  it("drops content on the next visit once access is revoked", async () => {
    api.getLesson.mockResolvedValue(lesson);
    const first = render(<LessonViewer lessonId={lesson.id} />);
    expect(
      await screen.findByText(/always obtain written authorization/i)
    ).toBeInTheDocument();
    first.unmount();

    // The enrollment was withdrawn (or the assignment removed) before the reload.
    api.getLesson.mockRejectedValue(
      new ApiError({ status: 403, detail: "Enrollment required." })
    );

    render(<LessonViewer lessonId={lesson.id} />);

    expect(await screen.findByText("Lesson body not available")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/always obtain written authorization/i)
      ).not.toBeInTheDocument()
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("carries no stale Phase 02B wording", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../features/academics/lesson-viewer.tsx"),
      "utf8"
    );
    expect(source).not.toContain("02B");
    expect(source).not.toContain("enrollments and cohort assignments arrive");
    expect(source).not.toContain("isEnrollmentGateError");
  });
});
