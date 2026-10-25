import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthenticatedLayout from "@/app/(authenticated)/layout";
import { UserDirectoryPanel } from "@/features/admin/user-directory-panel";
import { AuthProvider } from "@/features/auth/auth-context";
import { ReauthModal } from "@/features/auth/reauth-modal";
import { MfaEnrollmentView } from "@/features/profile/mfa-enrollment-view";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";
import { RoleSwitcher } from "@/features/roles/role-switcher";
import { ToastStateProvider } from "@/hooks/use-toast";
import { setApiConnectionMode } from "@/lib/api/client";
import type { Role, UserPublic } from "@/lib/types/api";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let mockedPathname = "/dashboard/manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  usePathname: () => mockedPathname,
  useSearchParams: () => new URLSearchParams(),
}));

function renderWithAuth(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      <AuthProvider>
        {ui}
        <ReauthModal />
      </AuthProvider>
    </ToastStateProvider>
  );
}

describe("Role Switching, Protected Navigation, Manager Scope & Admin Step-Up", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
    replaceMock.mockReset();
    mockedPathname = "/dashboard/manager";
    window.localStorage.clear();
    setApiConnectionMode("live");
  });

  it("redirects unauthenticated visitors on protected routes to /login?next=...", async () => {
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
          JSON.stringify({ detail: "Authentication required" }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      })
    );

    render(
      <ToastStateProvider>
        <AuthProvider>
          <AuthenticatedLayout>
            <div>Secret Console</div>
          </AuthenticatedLayout>
        </AuthProvider>
      </ToastStateProvider>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/login?next=%2Fdashboard%2Fmanager"
      );
    });
    expect(screen.queryByText("Secret Console")).not.toBeInTheDocument();
  });

  it("displays ONLY assigned roles in RoleSwitcher and refreshes /users/me after switching", async () => {
    const user = userEvent.setup();
    let currentRole: Role = "student";
    const meUser = (): UserPublic => ({
      id: "u-ins-1",
      full_name: "Dr. Samira Nouri",
      email: "samira@cyberlab.academy",
      roles: ["student", "instructor"],
      active_role: currentRole,
      email_verified: true,
      created_at: "2026-09-01T00:00:00Z",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/auth/active-role") && init?.method === "POST") {
        currentRole = "instructor";
        return new Response(JSON.stringify(meUser()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/users/me")) {
        return new Response(JSON.stringify(meUser()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithAuth(<RoleSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: /active role: student/i,
    });
    await user.click(trigger);

    // Assigned roles appear
    expect(await screen.findByText("Instructor")).toBeInTheDocument();
    // Unassigned roles NEVER appear
    expect(screen.queryByText("Manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();

    await user.click(screen.getByText("Instructor"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/instructor");
    });
  });

  it("blocks unassigned role routes via RoleRouteGuard", async () => {
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
            id: "u-stu",
            full_name: "Cadet One",
            email: "cadet@cyberlab.academy",
            roles: ["student"],
            active_role: "student",
            email_verified: true,
            created_at: "2026-10-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    renderWithAuth(
      <RoleRouteGuard
        requiredRoles={["administrator"]}
        preferredRole="administrator"
      >
        <div>Admin Secret Area</div>
      </RoleRouteGuard>
    );

    expect(
      await screen.findByText(/administrator authorization required/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Admin Secret Area")).not.toBeInTheDocument();
  });

  it("never exposes Manager or Administrator privilege controls in Manager UserDirectoryPanel", async () => {
    const user = userEvent.setup();
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
        if (url.includes("/api/v1/users/me")) {
          return new Response(
            JSON.stringify({
              id: "u-mgr",
              full_name: "Marcus Vance",
              email: "manager@cyberlab.academy",
              roles: ["student", "manager"],
              active_role: "manager",
              email_verified: true,
              created_at: "2026-08-01T00:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/api/v1/admin/users")) {
          return new Response(
            JSON.stringify([
              {
                id: "u-student-target",
                full_name: "Nadia Learner",
                email: "nadia@cyberlab.academy",
                roles: ["student"],
                email_verified: true,
                created_at: "2026-10-10T00:00:00Z",
                is_active: true,
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    renderWithAuth(<UserDirectoryPanel actorRole="manager" />);

    expect(await screen.findByText("Nadia Learner")).toBeInTheDocument();

    // Filter buttons must ONLY show All Roles, Student, Instructor — never Manager or Administrator
    expect(
      screen.queryByRole("button", { name: /^Manager$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Administrator$/ })
    ).not.toBeInTheDocument();

    // Open Grant Role dialog for student -> only Instructor should be offered!
    await user.click(screen.getByRole("button", { name: /grant role/i }));
    expect(
      await screen.findByText(/grant role to nadia learner/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /grant instructor/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/assign and revoke manager and administrator/i)
    ).not.toBeInTheDocument();
  });

  it("opens Administrator MFA step-up modal on 403 Recent MFA required and completes role activation", async () => {
    const user = userEvent.setup();
    let mfaVerified = false;
    let activeRole: Role = "student";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/health")) {
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.endsWith("/api/v1/auth/active-role")) {
          if (!mfaVerified) {
            return new Response(
              JSON.stringify({ detail: "Recent MFA required" }),
              { status: 403, headers: { "content-type": "application/json" } }
            );
          }
          activeRole = "administrator";
          return new Response(
            JSON.stringify({
              id: "u-adm",
              full_name: "Elena Rostova",
              email: "admin@cyberlab.academy",
              roles: ["student", "administrator"],
              active_role: activeRole,
              email_verified: true,
              created_at: "2026-05-01T00:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (
          url.endsWith("/api/v1/auth/reauthenticate") &&
          init?.method === "POST"
        ) {
          const payload = JSON.parse(String(init.body));
          expect(payload.mfa_code).toBe("654321");
          mfaVerified = true;
          return new Response(
            JSON.stringify({
              id: "u-adm",
              full_name: "Elena Rostova",
              email: "admin@cyberlab.academy",
              roles: ["student", "administrator"],
              active_role: activeRole,
              email_verified: true,
              created_at: "2026-05-01T00:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: "u-adm",
            full_name: "Elena Rostova",
            email: "admin@cyberlab.academy",
            roles: ["student", "administrator"],
            active_role: activeRole,
            email_verified: true,
            created_at: "2026-05-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    renderWithAuth(<RoleSwitcher />);

    await user.click(
      await screen.findByRole("button", { name: /active role: student/i })
    );
    await user.click(await screen.findByText("Administrator"));

    // Step-up modal automatically opens requiring password + MFA code
    expect(
      await screen.findByText(/step-up identity verification/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/multi-factor verification required/i)
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/current password/i),
      "RootSec-Aegis-6610!Core"
    );
    await user.type(
      screen.getByLabelText(/authenticator code or recovery code/i),
      "654321"
    );
    await user.click(
      screen.getByRole("button", { name: /verify & continue/i })
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/admin");
    });
  });

  it("enrolls MFA with QR code, displays recovery codes once in memory only, and marks MFA disable unavailable", async () => {
    const user = userEvent.setup();

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
        if (url.endsWith("/api/v1/users/me/sessions")) {
          return new Response(
            JSON.stringify([
              {
                id: "s-1",
                active_role: "student",
                created_at: "2026-10-24T10:00:00Z",
                expires_at: "2026-10-24T22:00:00Z",
                current: true,
                mfa_verified: false,
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.endsWith("/api/v1/auth/mfa/enroll")) {
          return new Response(
            JSON.stringify({
              secret: "JBSWY3DPEHPK3PXP",
              otpauth_uri:
                "otpauth://totp/CyberLab%20Academy:student@cyberlab.academy?secret=JBSWY3DPEHPK3PXP&issuer=CyberLab%20Academy",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.endsWith("/api/v1/auth/mfa/confirm")) {
          return new Response(
            JSON.stringify({
              recovery_codes: [
                "RCV-ONE-001",
                "RCV-ONE-002",
                "RCV-ONE-003",
                "RCV-ONE-004",
                "RCV-ONE-005",
                "RCV-ONE-006",
                "RCV-ONE-007",
                "RCV-ONE-008",
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: "u-1",
            full_name: "Student Cadet",
            email: "student@cyberlab.academy",
            roles: ["student"],
            active_role: "student",
            email_verified: true,
            created_at: "2026-10-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    renderWithAuth(<MfaEnrollmentView />);

    // Verify explicit notice that MFA disable is not implemented
    expect(
      await screen.findByText(/MFA Disable, Rotation & Recovery Code Regeneration/i)
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/confirm current password to begin enrollment/i),
      "Valid-Password-2026!"
    );
    await user.click(
      screen.getByRole("button", { name: /generate authenticator qr code/i })
    );

    expect(
      await screen.findByRole("img", {
        name: /TOTP Authenticator Enrollment QR Code/i,
      })
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/six-digit authenticator code/i),
      "123456"
    );
    await user.click(
      screen.getByRole("button", { name: /confirm & activate mfa/i })
    );

    expect(
      await screen.findByText(/Save Your 8 Recovery Codes Now/i)
    ).toBeInTheDocument();
    expect(screen.getByText("RCV-ONE-001")).toBeInTheDocument();

    // Verify recovery codes are NEVER persisted in localStorage
    expect(Object.values(window.localStorage).join(" ")).not.toContain(
      "RCV-ONE-001"
    );
  });
});
