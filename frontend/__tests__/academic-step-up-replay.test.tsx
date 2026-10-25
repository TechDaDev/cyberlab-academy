import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { ContentManager } from "@/features/academics/content-manager";
import { CourseEditor } from "@/features/academics/course-editor";
import { AuthProvider } from "@/features/auth/auth-context";
import { ReauthModal } from "@/features/auth/reauth-modal";
import { ToastStateProvider } from "@/hooks/use-toast";
import { academicApi } from "@/lib/api/academic";
import { setApiConnectionMode } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { UserPublic } from "@/lib/types/api";
import type { CoursePublic, PageCourses } from "@/lib/types/academic";

/**
 * Regression suite for the Milestone 02A step-up replay defect.
 *
 * The real `useStepUpRetry` hook, the real `AuthProvider` and the real
 * `ReauthModal` are exercised here — nothing about the authentication flow is
 * mocked. Only the academic API module and the network responses behind the
 * auth endpoints are stubbed.
 *
 * Previously the hook replayed the mutation inside the modal's `onSuccess`
 * callback and returned `undefined` immediately, so the caller's success handler
 * (dialog close, toast, refresh) never ran after a step-up verification.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/academics/manage",
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

const api = vi.mocked(academicApi);

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

const publishedCourse: CoursePublic = {
  ...draftCourse,
  status: "published",
  content_version: 2,
  published_at: "2026-10-26T09:00:00Z",
};

function stepUpRejection() {
  return new ApiError({ status: 403, detail: "Recent authentication required" });
}

function emptyPage(): PageCourses {
  return { items: [], limit: 9, offset: 0, total: 0 };
}

/** Auth endpoints the real reauthentication modal talks to. */
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

async function signInToReauthPrompt(user: ReturnType<typeof userEvent.setup>, password = "Correct-Horse-1") {
  const dialog = await screen.findByRole("dialog", {
    name: /step-up identity verification/i,
  });
  await user.type(within(dialog).getByLabelText(/current password/i), password);
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
});

describe("Step-up replay preserves the caller's success path", () => {
  it("creates a course after reauthentication and refreshes the list exactly once", async () => {
    const user = userEvent.setup();
    const createdCourse: CoursePublic = {
      ...draftCourse,
      id: "course-ceh-v13",
      code: "CEH-V13",
      title: "Certified Ethical Hacker v13",
      edition: "v13",
    };

    api.listAdminCourses
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValue({
        items: [createdCourse],
        limit: 9,
        offset: 0,
        total: 1,
      });
    api.createCourse
      .mockRejectedValueOnce(stepUpRejection())
      .mockResolvedValueOnce(createdCourse);

    renderWithAuth(<ContentManager />);

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

    // The 403 opens the real reauthentication prompt; no mutation has applied yet.
    await signInToReauthPrompt(user);

    // The caller's success handler ran: confirmation message, dialog closed, list refreshed.
    expect(
      await screen.findByText('Draft course "Certified Ethical Hacker v13" created.')
    ).toBeInTheDocument();
    expect(await screen.findByText("Certified Ethical Hacker v13")).toBeInTheDocument();

    // Initial attempt + exactly one replay, and exactly one refresh from the success handler.
    expect(api.createCourse).toHaveBeenCalledTimes(2);
    expect(api.listAdminCourses).toHaveBeenCalledTimes(2);
    expect(
      screen.getAllByText('Draft course "Certified Ethical Hacker v13" created.')
    ).toHaveLength(1);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /create draft/i })).not.toBeInTheDocument();
  });

  it("publishes a course after reauthentication and shows the new status", async () => {
    const user = userEvent.setup();
    let currentCourse = draftCourse;

    api.getAdminCourse.mockImplementation(async () => currentCourse);
    api.listAdminModules.mockResolvedValue([]);
    api.publishCourse
      .mockRejectedValueOnce(stepUpRejection())
      .mockImplementationOnce(async () => {
        currentCourse = publishedCourse;
        return publishedCourse;
      });

    renderWithAuth(<CourseEditor courseId={draftCourse.id} />);

    await screen.findByText("Course Metadata");
    await user.click(screen.getByRole("button", { name: /publish course/i }));

    const confirm = await screen.findByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: /publish course/i })
    );

    await signInToReauthPrompt(user);

    // The confirmation dialog closes only because the caller's success handler ran.
    await waitFor(() => {
      expect(
        screen.queryByText("Publish course catalog metadata?")
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText("PUBLISHED")).toBeInTheDocument();
    expect(api.publishCourse).toHaveBeenCalledTimes(2);
    expect(api.publishCourse).toHaveBeenLastCalledWith(draftCourse.id);
    expect(api.getAdminCourse).toHaveBeenCalledTimes(2);
  });
});

describe("Step-up cancellation and replay failure", () => {
  it("does not execute the mutation when the prompt is cancelled", async () => {
    const user = userEvent.setup();
    api.listAdminCourses.mockResolvedValue(emptyPage());
    api.createCourse.mockRejectedValueOnce(stepUpRejection());

    renderWithAuth(<ContentManager />);

    await screen.findByText("No courses exist yet");
    await user.click(screen.getByRole("button", { name: /new course draft/i }));

    await user.type(await screen.findByLabelText(/course code/i), "CEH-V13");
    await user.type(screen.getByLabelText(/^edition/i), "v13");
    await user.type(
      screen.getByLabelText(/^title/i),
      "Certified Ethical Hacker v13"
    );
    await user.type(screen.getByLabelText(/planned module count/i), "20");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    const stepUp = await screen.findByRole("dialog", {
      name: /step-up identity verification/i,
    });
    await user.click(within(stepUp).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /step-up identity verification/i })
      ).not.toBeInTheDocument();
    });

    // Only the rejected first attempt ran; no replay, no success feedback, form intact.
    expect(api.createCourse).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Draft course .* created\./)).not.toBeInTheDocument();
    expect(api.listAdminCourses).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^title/i)).toHaveValue(
      "Certified Ethical Hacker v13"
    );
  });

  it("surfaces the real API error when the replay fails, keeping the form data", async () => {
    const user = userEvent.setup();
    api.listAdminCourses.mockResolvedValue(emptyPage());
    api.createCourse
      .mockRejectedValueOnce(stepUpRejection())
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          detail: "A course with that code already exists",
        })
      );

    renderWithAuth(<ContentManager />);

    await screen.findByText("No courses exist yet");
    await user.click(screen.getByRole("button", { name: /new course draft/i }));

    await user.type(await screen.findByLabelText(/course code/i), "CEH-V12");
    await user.type(screen.getByLabelText(/^edition/i), "v12");
    await user.type(
      screen.getByLabelText(/^title/i),
      "Certified Ethical Hacker v12"
    );
    await user.type(screen.getByLabelText(/planned module count/i), "20");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    await signInToReauthPrompt(user);

    expect(
      await screen.findByText("A course with that code already exists")
    ).toBeInTheDocument();
    // No success path: no confirmation message, no refresh, and the form survives.
    expect(screen.queryByText(/Draft course .* created\./)).not.toBeInTheDocument();
    expect(api.listAdminCourses).toHaveBeenCalledTimes(1);
    expect(api.createCourse).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/^title/i)).toHaveValue(
      "Certified Ethical Hacker v12"
    );
    expect(screen.getByRole("button", { name: /create draft/i })).toBeEnabled();
  });
});
