import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { ToastStateProvider } from "@/hooks/use-toast";
import { apiRequest, setApiConnectionMode } from "@/lib/api/client";
import { ApiError, parseFastApiErrorPayload } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/settings/sessions",
  useSearchParams: () => new URLSearchParams(),
}));

function SessionExpiryProbe() {
  const { user, sessionExpiredMessage } = useAuth();
  const [triggered, setTriggered] = React.useState(false);

  return (
    <div>
      <p>User: {user ? user.email : "signed-out"}</p>
      {sessionExpiredMessage ? <p>{sessionExpiredMessage}</p> : null}
      <button
        type="button"
        onClick={async () => {
          setTriggered(true);
          try {
            await usersApi.listSessions();
          } catch {
            // Expected 401
          }
        }}
      >
        Trigger Protected Call
      </button>
      {triggered ? <span>Triggered</span> : null}
    </div>
  );
}

describe("Session Expiration, API Error Handling & Loading/Empty/Error States", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    setApiConnectionMode("live");
  });

  it("clears frontend session state and displays notice when a protected API returns 401", async () => {
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
        if (url.endsWith("/api/v1/users/me")) {
          return new Response(
            JSON.stringify({
              id: "u-exp",
              full_name: "Active User",
              email: "active@cyberlab.academy",
              roles: ["student"],
              active_role: "student",
              email_verified: true,
              created_at: "2026-10-01T00:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.endsWith("/api/v1/users/me/sessions")) {
          return new Response(
            JSON.stringify({ detail: "Invalid or expired session" }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(
      <ToastStateProvider>
        <AuthProvider>
          <SessionExpiryProbe />
        </AuthProvider>
      </ToastStateProvider>
    );

    expect(
      await screen.findByText("User: active@cyberlab.academy")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /trigger protected call/i })
    );

    await waitFor(() => {
      expect(screen.getByText("User: signed-out")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/your session expired or was revoked/i)
    ).toBeInTheDocument();
  });

  it("parses FastAPI validation, rate-limit, last-admin 409, and redacts raw tokens in errors", async () => {
    const validationErr = parseFastApiErrorPayload(422, {
      detail: [
        {
          loc: ["body", "password"],
          msg: "Value error, Passwords do not match",
          type: "value_error",
        },
      ],
    });
    expect(validationErr.fieldErrors.password).toBe("Passwords do not match");

    const lastAdminErr = parseFastApiErrorPayload(409, {
      detail: "Cannot remove last active administrator",
    });
    expect(lastAdminErr.isConflict).toBe(true);
    expect(lastAdminErr.isLastAdminConflict).toBe(true);

    const rateLimitErr = parseFastApiErrorPayload(429, {
      detail: "Too many requests",
    });
    expect(rateLimitErr.isRateLimited).toBe(true);

    const redactedErr = new ApiError({
      status: 400,
      detail: "Failed for ?token=super_secret_raw_token_value",
    });
    expect(redactedErr.detail).toContain("token=[REDACTED]");
    expect(redactedErr.detail).not.toContain("super_secret_raw_token_value");

    // Verify apiRequest sends credentials: "include"
    const spy = vi.fn(async () => {
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", spy);
    await apiRequest<void>("/auth/logout", { method: "POST" });
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({ credentials: "include", method: "POST" })
    );
  });

  it("renders accessible LoadingState, EmptyState, and ErrorState components", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onRetry = vi.fn();

    render(
      <div>
        <LoadingState label="Fetching audit state..." rows={2} />
        <EmptyState
          title="No active sessions"
          description="All sessions have been signed out."
          actionLabel="Refresh View"
          onAction={onClear}
        />
        <ErrorState
          title="Backend Error"
          description="Too many requests"
          onRetry={onRetry}
        />
      </div>
    );

    expect(screen.getByText("Fetching audit state...")).toBeInTheDocument();
    expect(screen.getByText("No active sessions")).toBeInTheDocument();
    expect(screen.getByText("Backend Error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh view/i }));
    expect(onClear).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
