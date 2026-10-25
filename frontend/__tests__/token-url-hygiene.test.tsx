import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/auth-context";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import {
  resetVerificationDeduplicatorForTests,
  VerifyEmailView,
} from "@/features/auth/verify-email-view";
import { ToastStateProvider } from "@/hooks/use-toast";
import { setApiConnectionMode } from "@/lib/api/client";
import { scrubOneTimeTokenFromUrl } from "@/lib/scrub-token-url";

let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/verify-email",
  useSearchParams: () => currentSearchParams,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastStateProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastStateProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  currentSearchParams = new URLSearchParams();
  setApiConnectionMode("live");
  resetVerificationDeduplicatorForTests();
  window.history.replaceState({}, "", "/verify-email");
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
      if (url.endsWith("/api/v1/users/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/auth/verify-email")) {
        return new Response(JSON.stringify({ message: "Email verified" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ detail: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    })
  );
});

describe("one-time token URL hygiene", () => {
  it("removes the token from the address bar while keeping it usable", async () => {
    const token = "t".repeat(43);
    window.history.replaceState({}, "", `/verify-email?token=${token}`);
    currentSearchParams = new URLSearchParams(`token=${token}`);

    renderWithProviders(<VerifyEmailView />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/verify-email");
    // The verification call still used the captured token.
    await waitFor(() => expect(screen.getByText(/Email Address Verified/i)).toBeInTheDocument());
  });

  it("scrubs the reset token before the user submits", async () => {
    const token = "r".repeat(43);
    window.history.replaceState({}, "", `/reset-password?token=${token}`);
    currentSearchParams = new URLSearchParams(`token=${token}`);

    renderWithProviders(<ResetPasswordForm />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
  });

  it("leaves URLs without a token untouched", () => {
    window.history.replaceState({}, "", "/verify-email?next=%2Fdashboard");
    scrubOneTimeTokenFromUrl();
    expect(window.location.search).toBe("?next=%2Fdashboard");
  });
});
