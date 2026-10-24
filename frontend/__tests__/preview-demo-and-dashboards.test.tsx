import * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/auth-context";
import { InstructorDashboard } from "@/features/dashboards/instructor/instructor-dashboard";
import { StudentDashboard } from "@/features/dashboards/student/student-dashboard";
import { ToastStateProvider } from "@/hooks/use-toast";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { setApiConnectionMode } from "@/lib/api/client";
import {
  PREVIEW_DEMO_TOTP_CODE,
  previewDemoStore,
} from "@/lib/api/preview-demo-adapter";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/dashboard/student",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Student/Instructor Demonstration Labeling & Preview Demo Adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    previewDemoStore.reset();
    setApiConnectionMode("live");
  });

  it("explicitly labels Student and Instructor curriculum views as Demonstration Data while binding real user identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/health")) {
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            id: "u-stu-99",
            full_name: "Zainab Al-Rawi",
            email: "zainab@cyberlab.academy",
            roles: ["student", "instructor"],
            active_role: "student",
            email_verified: true,
            created_at: "2026-10-12T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const { unmount } = render(
      <ToastStateProvider>
        <AuthProvider>
          <StudentDashboard />
        </AuthProvider>
      </ToastStateProvider>
    );

    expect(
      await screen.findByText(/Welcome back, Zainab/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: /demonstration data notice/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Demo Telemetry/i).length).toBeGreaterThan(0);
    unmount();

    render(
      <ToastStateProvider>
        <AuthProvider>
          <InstructorDashboard />
        </AuthProvider>
      </ToastStateProvider>
    );

    expect(await screen.findByText("Zainab Al-Rawi")).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: /demonstration data notice/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Demo Telemetry/i).length).toBeGreaterThan(0);
  });

  it("enforces Administrator MFA step-up and last-Administrator 409 protection in preview-demo mode", async () => {
    setApiConnectionMode("preview-demo");

    const loginRes = await authApi.login({
      email: "admin.demo@cyberlab.academy",
      password: "RootSec-Aegis-6610!Core",
    });
    expect(loginRes).toMatchObject({
      email: "admin.demo@cyberlab.academy",
      active_role: "student",
    });

    // Switching to administrator before MFA step-up throws 403 Recent MFA required
    await expect(
      authApi.switchActiveRole({ role: "administrator" })
    ).rejects.toMatchObject({
      status: 403,
      detail: "Recent MFA required",
    });

    // Reauthenticating with password + demo TOTP code unlocks Administrator role
    await authApi.reauthenticate({
      password: "RootSec-Aegis-6610!Core",
      mfa_code: PREVIEW_DEMO_TOTP_CODE,
    });

    const switched = await authApi.switchActiveRole({ role: "administrator" });
    expect(switched).toMatchObject({ active_role: "administrator" });

    // Attempting to revoke the last active administrator throws 409 conflict
    await expect(
      adminApi.revokeRole("usr-demo-admin-07", "administrator", {
        reason: "Testing last-admin safeguard",
      })
    ).rejects.toMatchObject({
      status: 409,
      isLastAdminConflict: true,
    });
  });
});
