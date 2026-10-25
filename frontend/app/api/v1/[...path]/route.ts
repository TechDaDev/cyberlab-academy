import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function resolveBackendBaseUrl(): string {
  const configured = process.env.CYBERLAB_BACKEND_URL?.trim();
  const raw = configured && configured.length > 0 ? configured : DEFAULT_BACKEND_URL;
  return raw.replace(/\/+$/, "");
}

function validatePathSegments(segments: string[]): boolean {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  return segments.every(
    (seg) =>
      typeof seg === "string" &&
      seg.length > 0 &&
      seg !== "." &&
      seg !== ".." &&
      !seg.includes("\\") &&
      !seg.includes("://")
  );
}

async function proxyToFastApi(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  if (!validatePathSegments(path)) {
    return Response.json(
      { detail: "Invalid API path" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }

  const backendBase = resolveBackendBaseUrl();
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const targetUrl = `${backendBase}/api/v1/${encodedPath}${request.nextUrl.search}`;

  const upstreamHeaders = new Headers();
  const forwardHeaderNames = [
    "accept",
    "content-type",
    "cookie",
    "origin",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "user-agent",
  ];

  for (const name of forwardHeaderNames) {
    const val = request.headers.get(name);
    if (val) {
      upstreamHeaders.set(name, val);
    }
  }

  const method = request.method.toUpperCase();
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const rawText = await request.text();
    if (rawText.length > 0) {
      body = rawText;
    }
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body,
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    responseHeaders.set(
      "cache-control",
      upstreamResponse.headers.get("cache-control") ?? "no-store"
    );
    responseHeaders.set(
      "referrer-policy",
      upstreamResponse.headers.get("referrer-policy") ?? "no-referrer"
    );

    const setCookies =
      typeof upstreamResponse.headers.getSetCookie === "function"
        ? upstreamResponse.headers.getSetCookie()
        : [];
    for (const cookieHeader of setCookies) {
      responseHeaders.append("set-cookie", cookieHeader);
    }

    if (upstreamResponse.status === 204 || upstreamResponse.status === 205) {
      return new Response(null, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    const payloadBuffer = await upstreamResponse.arrayBuffer();
    return new Response(payloadBuffer, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        detail:
          "FastAPI backend is unreachable through the local /api/v1 proxy. Ensure FastAPI is running on CYBERLAB_BACKEND_URL (default http://127.0.0.1:8000).",
        code: "BACKEND_UNREACHABLE",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyToFastApi(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyToFastApi(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyToFastApi(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyToFastApi(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyToFastApi(request, context);
}
