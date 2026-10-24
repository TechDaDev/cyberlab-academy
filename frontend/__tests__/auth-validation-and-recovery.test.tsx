import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/auth-context";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import {
  LoginForm,
  REMEMBERED_EMAIL_STORAGE_KEY,
} from "@/features/auth/login-form";
import { RegisterForm } from "@/features/auth/register-form";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import {
  resetVerificationDeduplicatorForTests,
  VerifyEmailView,
} from "@/features/auth/verify-email-view";
import { ToastStateProvider } from "@/hooks/use-toast";
import { setApiConnectionMode } from "@/lib/api/client";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => currentSearchParams,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastStateProvider>
  );
}

describe("Authentication Validation, Verification & Password Recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
    replaceMock.mockReset();
    currentSearchParams = new URLSearchParams();
    window.localStorage.clear();
    setApiConnectionMode("live");
    resetVerificationDeduplicatorForTests();

    // Default health + unauthenticated /users/me stub
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
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        );
      })
    );
  });

  it("validates login fields and stores ONLY remembered email (never passwords or tokens)", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/auth/login") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        return new Response(
          JSON.stringify({
            id: "u-1",
            full_name: "Layla Al-Mansoor",
            email: "layla@cyberlab.academy",
            roles: ["student"],
            active_role: "student",
            email_verified: true,
            created_at: "2026-10-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/api/v1/users/me")) {
        return new Response(
          JSON.stringify({
            id: "u-1",
            full_name: "Layla Al-Mansoor",
            email: "layla@cyberlab.academy",
            roles: ["student"],
            active_role: "student",
            email_verified: true,
            created_at: "2026-10-01T00:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ detail: "Not found" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderWithProviders(<LoginForm />);

    // Submit empty form -> validation errors
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(
      await screen.findByText(/email address is required/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();

    // Fill valid credentials + Remember Email
    await user.type(
      screen.getByLabelText(/^email address$/i),
      "Layla@CyberLab.Academy"
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "UltraSecure-Pass-2026!"
    );
    await user.click(
      screen.getByRole("checkbox", { name: /remember my email/i })
    );
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/student");
    });

    expect(window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY)).toBe(
      "layla@cyberlab.academy"
    );
    // Verify password and session tokens are NEVER written to localStorage
    const allStorageValues = Object.values(window.localStorage).join(" ");
    expect(allStorageValues).not.toContain("UltraSecure-Pass-2026!");
    expect(allStorageValues).not.toContain("cyberlab_session");
  });

  it("enforces exact backend registration validation rules and handles generic 202 response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/register") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          expect(body.instructor_application).toBe(true);
          return new Response(
            JSON.stringify({
              message: "If eligible, check your email for verification",
            }),
            { status: 202, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/full name/i), "Tariq Haddad");
    await user.type(
      screen.getByLabelText(/email address/i),
      "tariqhaddad@university.edu"
    );

    // Rejects password containing email local-part
    await user.type(
      screen.getByLabelText(/^password$/i),
      "tariqhaddad-12345!"
    );
    await user.type(
      screen.getByLabelText(/confirm password/i),
      "tariqhaddad-12345!"
    );
    await user.click(screen.getByRole("button", { name: /register account/i }));

    expect(
      await screen.findByText(/password must not contain email name/i)
    ).toBeInTheDocument();

    // Fix password, toggle optional instructor application, and submit
    const pwdInput = screen.getByLabelText(/^password$/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.clear(pwdInput);
    await user.clear(confirmInput);
    await user.type(pwdInput, "Quantum-Shield-9081!");
    await user.type(confirmInput, "Quantum-Shield-9081!");
    await user.click(
      screen.getByRole("checkbox", {
        name: /optional instructor role application/i,
      })
    );
    await user.click(screen.getByRole("button", { name: /register account/i }));

    expect(
      await screen.findByText(/check your inbox for verification instructions/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/HTTP 202 ACCEPTED/i)).toBeInTheDocument();
    expect(
      screen.getByText(/returns the same response whether/i)
    ).toBeInTheDocument();
  });

  it("handles expired verification tokens on /verify-email and allows resend", async () => {
    const user = userEvent.setup();
    currentSearchParams = new URLSearchParams(
      "token=expired_verification_token_1234567890"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/verify-email")) {
          return new Response(
            JSON.stringify({ detail: "Invalid or expired token" }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
        if (
          url.endsWith("/api/v1/auth/verification/resend") &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              message: "If eligible, a verification email has been sent",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    renderWithProviders(<VerifyEmailView />);

    expect(
      await screen.findByText(/verification token invalid or expired/i)
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/email address/i),
      "student@university.edu"
    );
    await user.click(
      screen.getByRole("button", { name: /resend verification email/i })
    );

    expect(
      await screen.findByText(
        /if eligible, a verification email has been sent/i
      )
    ).toBeInTheDocument();
  });

  it("handles forgot-password generic response and reset-password completion", async () => {
    const user = userEvent.setup();
    currentSearchParams = new URLSearchParams(
      "token=valid_reset_token_value_1234567890"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/forgot-password")) {
          return new Response(
            JSON.stringify({
              message: "If the account exists, a reset email has been sent",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.endsWith("/api/v1/auth/reset-password")) {
          return new Response(
            JSON.stringify({
              message: "Password reset complete. Sign in again",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const { unmount } = renderWithProviders(<ForgotPasswordForm />);
    await user.type(
      screen.getByLabelText(/account email address/i),
      "unknown@organization.edu"
    );
    await user.click(
      screen.getByRole("button", { name: /send reset instructions/i })
    );
    expect(
      await screen.findByText(
        /if the account exists, a reset email has been sent/i
      )
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<ResetPasswordForm />);
    await user.type(
      screen.getByLabelText(/^new password$/i),
      "New-Fortress-Key-2026!"
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "New-Fortress-Key-2026!"
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(
      await screen.findByRole("heading", { name: /password reset complete/i })
    ).toBeInTheDocument();
  });
});
