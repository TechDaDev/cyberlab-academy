import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST } from "@/app/api/v1/[...path]/route";

type Params = { params: Promise<{ path: string[] }> };

function context(...path: string[]): Params {
  return { params: Promise.resolve({ path }) };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("same-origin FastAPI proxy", () => {
  it("forwards the path, query, method, cookie and Origin, then returns the upstream body", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonResponse({ id: "synthetic" }, 200, {
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        });
      })
    );

    const request = new NextRequest("http://localhost:3000/api/v1/users/me?verbose=1", {
      method: "PATCH",
      headers: {
        cookie: "cyberlab_session=opaque-token",
        origin: "http://localhost:3000",
        "content-type": "application/json",
        authorization: "Bearer must-not-be-forwarded",
        "x-forwarded-host": "attacker.example",
      },
      body: JSON.stringify({ full_name: "Synthetic Learner" }),
    });

    const response = await PATCH(request, context("users", "me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "synthetic" });
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8000/api/v1/users/me?verbose=1");
    expect(calls[0].init.method).toBe("PATCH");
    const forwarded = calls[0].init.headers as Headers;
    expect(forwarded.get("cookie")).toBe("cyberlab_session=opaque-token");
    expect(forwarded.get("origin")).toBe("http://localhost:3000");
    // Only the allow-listed headers cross the trust boundary.
    expect(forwarded.get("authorization")).toBeNull();
    expect(forwarded.get("x-forwarded-host")).toBeNull();
  });

  it("passes every upstream Set-Cookie header through so sessions can rotate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "cyberlab_session=rotated; HttpOnly; Path=/; SameSite=lax");
        headers.append("set-cookie", "other=value; Path=/");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      })
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ email: "student@example.org", password: "synthetic-password" }),
      }),
      context("auth", "login")
    );

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("cyberlab_session=rotated");
    expect(cookies[0]).toContain("HttpOnly");
  });

  it("rejects traversal and empty segments without contacting the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost:3000/api/v1/%2e%2e/health");

    const cases: string[][] = [["..", "health"], [".", "health"], [""], ["auth\\login"], ["http://evil"]];
    for (const path of cases) {
      const response = await GET(request, context(...path));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe("Invalid API path");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 with a code when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/health"),
      context("health")
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BACKEND_UNREACHABLE" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns an empty body for upstream 204 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/v1/users/me/sessions/abc", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      context("users", "me", "sessions", "abc")
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("propagates authentication failures without rewriting them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Authentication required" }, 401))
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/users/me"),
      context("users", "me")
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Authentication required" });
  });
});
