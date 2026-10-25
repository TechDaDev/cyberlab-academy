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
  vi.unstubAllEnvs();
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

describe("proxy hardening", () => {
  function postProbe(body: BodyInit, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/v1/auth/register", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
      body,
    });
  }

  it("rejects oversized bodies declared by content-length before contacting the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const oversized = "x".repeat(300 * 1024);

    const response = await POST(postProbe(oversized), context("auth", "register"));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "BODY_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honours a configured body limit", async () => {
    vi.stubEnv("CYBERLAB_MAX_PROXY_BODY_BYTES", "32");
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 202));
    vi.stubGlobal("fetch", fetchMock);

    const rejected = await POST(postProbe(JSON.stringify({ note: "x".repeat(64) })), context("auth", "register"));
    expect(rejected.status).toBe(413);

    const accepted = await POST(postProbe(JSON.stringify({ n: 1 })), context("auth", "register"));
    expect(accepted.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps client-controlled X-Forwarded-For out of the trust boundary by default", async () => {
    const calls: Array<{ init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ init });
        return jsonResponse({ ok: true });
      })
    );

    await POST(postProbe(JSON.stringify({ a: 1 }), { "x-forwarded-for": "203.0.113.9" }), context("auth", "login"));
    const forwarded = calls[0].init.headers as Headers;
    expect(forwarded.get("x-forwarded-for")).toBeNull();
  });
});

describe("trusted ingress identity boundary", () => {
  const SECRET = "local-ingress-secret-value-01";
  const calls: Array<{ init: RequestInit }> = [];

  function stubFetch() {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ init });
        return jsonResponse({ ok: true });
      })
    );
  }

  function postProbe(body: BodyInit, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
      body,
    });
  }

  function forwardedHeaders(): Headers {
    return calls[0].init.headers as Headers;
  }

  beforeEach(() => {
    vi.stubEnv("CYBERLAB_TRUSTED_INGRESS_SECRET", SECRET);
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the ingress-asserted client address when the shared secret matches", async () => {
    await POST(
      postProbe(JSON.stringify({ a: 1 }), {
        "x-forwarded-for": "203.0.113.9",
        "x-cyberlab-ingress-auth": SECRET,
      }),
      context("auth", "login")
    );
    expect(forwardedHeaders().get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("forwards IPv6 client addresses", async () => {
    await POST(
      postProbe(JSON.stringify({ a: 1 }), {
        "x-forwarded-for": "2001:db8::7",
        "x-cyberlab-ingress-auth": SECRET,
      }),
      context("auth", "login")
    );
    expect(forwardedHeaders().get("x-forwarded-for")).toBe("2001:db8::7");
  });

  it("drops the claimed identity when a direct client omits the ingress secret", async () => {
    for (const address of ["203.0.113.9", "203.0.113.10", "198.51.100.4"]) {
      await POST(postProbe(JSON.stringify({ a: 1 }), { "x-forwarded-for": address }), context("auth", "login"));
    }
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect((call.init.headers as Headers).get("x-forwarded-for")).toBeNull();
    }
  });

  it("drops the claimed identity when the ingress secret is wrong", async () => {
    await POST(
      postProbe(JSON.stringify({ a: 1 }), {
        "x-forwarded-for": "203.0.113.9",
        "x-cyberlab-ingress-auth": "not-the-secret-value",
      }),
      context("auth", "login")
    );
    expect(forwardedHeaders().get("x-forwarded-for")).toBeNull();
  });

  it("fails closed when no ingress secret is configured", async () => {
    vi.stubEnv("CYBERLAB_TRUSTED_INGRESS_SECRET", "");
    await POST(
      postProbe(JSON.stringify({ a: 1 }), {
        "x-forwarded-for": "203.0.113.9",
        "x-cyberlab-ingress-auth": "",
      }),
      context("auth", "login")
    );
    expect(forwardedHeaders().get("x-forwarded-for")).toBeNull();
  });

  it("rejects ambiguous or malformed forwarding values even from the ingress", async () => {
    for (const value of ["203.0.113.9, 198.51.100.4", "203.0.113.9,203.0.113.10", "unknown", "203.0.113.9:443", ""]) {
      await POST(
        postProbe(JSON.stringify({ a: 1 }), {
          "x-forwarded-for": value,
          "x-cyberlab-ingress-auth": SECRET,
        }),
        context("auth", "login")
      );
    }
    for (const call of calls) {
      expect((call.init.headers as Headers).get("x-forwarded-for")).toBeNull();
    }
  });

  it("never forwards the ingress secret upstream", async () => {
    await POST(
      postProbe(JSON.stringify({ a: 1 }), {
        "x-forwarded-for": "203.0.113.9",
        "x-cyberlab-ingress-auth": SECRET,
      }),
      context("auth", "login")
    );
    const forwarded = forwardedHeaders();
    expect(forwarded.get("x-cyberlab-ingress-auth")).toBeNull();
    expect([...forwarded.keys()].join(",")).not.toContain("ingress");
  });
});
