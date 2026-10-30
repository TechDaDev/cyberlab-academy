import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPLETION_REQUEST_BODY,
  progressApi,
} from "@/lib/api/progress";
import {
  COMPLETION_STATES,
  COMPLETION_STATE_LABELS,
  PROGRESS_PAGE_LIMITS,
} from "@/lib/types/progress";

/**
 * Milestone 02C frontend contract guard.
 *
 * `shared-contracts/openapi.json` (API 0.5.0) is authoritative. This suite pins the
 * four progress operations, the completion body and the two paginated reads to the
 * committed contract, so a renamed route, an extra request field or a client-side
 * percentage formula fails here instead of corrupting a learner's record.
 *
 * The contract lives outside `frontend/`, so the suite skips when only the frontend
 * directory is mounted.
 */
const contractPath = path.resolve(
  __dirname,
  "../../shared-contracts/openapi.json"
);
const apiSourcePath = path.resolve(__dirname, "../lib/api/progress.ts");
const typesSourcePath = path.resolve(__dirname, "../lib/types/progress.ts");

interface JsonSchema {
  name?: string;
  in?: string;
  type?: string;
  enum?: string[];
  format?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
}

interface JsonOperation {
  tags?: string[];
  parameters?: JsonSchema[];
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<string, unknown>;
}

const contract = existsSync(contractPath)
  ? (JSON.parse(readFileSync(contractPath, "utf8")) as {
      info: { version: string };
      paths: Record<string, Record<string, JsonOperation>>;
      components: { schemas: Record<string, JsonSchema> };
    })
  : null;

const apiSource = readFileSync(apiSourcePath, "utf8");
const typesSource = readFileSync(typesSourcePath, "utf8");

/** Every progress client method mapped to the operation it must call. */
const ENDPOINTS: Record<string, { method: string; path: string }> = {
  getOwnProgress: {
    method: "get",
    path: "/api/v1/me/enrollments/{enrollment_id}/progress",
  },
  completeLesson: {
    method: "put",
    path: "/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion",
  },
  getInstructorClassProgress: {
    method: "get",
    path: "/api/v1/instructor/cohorts/{cohort_id}/progress",
  },
  getAdminClassProgress: {
    method: "get",
    path: "/api/v1/admin/cohorts/{cohort_id}/progress",
  },
};

const SCHEMAS = [
  "CompletionRequest",
  "CompletionResponse",
  "CompletionState",
  "EnrollmentProgress",
  "ModuleProgressEntry",
  "LessonProgressEntry",
  "ClassProgress",
  "ClassStudentProgress",
  "PageClassStudentProgress",
] as const;

function clientMethodBody(name: string): string {
  const start = apiSource.indexOf(`async ${name}(`);
  if (start < 0) return "";
  const end = apiSource.indexOf("\n  },", start);
  return apiSource.slice(start, end < 0 ? undefined : end);
}

/** Collapses `${...}` interpolations and `{param}` placeholders to `{}`. */
function normalizePath(value: string): string {
  return value
    .replace(/\$\{enrollmentPath\([^)]*\)\}/g, "/me/enrollments/{}")
    .replace(/\$\{[\s\S]*?\}/g, "{}")
    .replace(/\{[^}]+\}/g, "{}")
    .replace(/\s+/g, "");
}

function extractRequestPath(body: string): string {
  const literal = body.match(/[`"]([^`"]*\/[^`"]*)[`"]/)?.[1] ?? "";
  return normalizePath(`/api/v1${literal}`);
}

function operation(pathname: string, method: string): JsonOperation | undefined {
  return contract?.paths[pathname]?.[method];
}

function resolve(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() as string;
    return contract?.components.schemas[name];
  }
  return schema;
}

/** The progress client must be all four methods and nothing else. */
const CLIENT_METHODS = Object.keys(progressApi);

describe.skipIf(!contract)("Progress API contract alignment (OpenAPI 0.5.0)", () => {
  it("targets the additive 0.5.0 contract with exactly four new operations", () => {
    expect(contract?.info.version).toBe("0.5.0");
    expect(Object.keys(contract?.paths ?? {})).toHaveLength(60);

    for (const [name, expected] of Object.entries(ENDPOINTS)) {
      expect(operation(expected.path, expected.method), `${name} target`).toBeDefined();
    }

    // 02B kept all 14 of its class paths; 02C only adds.
    expect(
      Object.keys(contract?.paths ?? {}).filter((route) =>
        /cohort|enrollment/.test(route)
      )
    ).toHaveLength(18);
  });

  it("exposes exactly one client method per documented operation", () => {
    expect(CLIENT_METHODS.sort()).toEqual(Object.keys(ENDPOINTS).sort());
  });

  it("calls the documented HTTP method and path for every operation", () => {
    for (const [name, expected] of Object.entries(ENDPOINTS)) {
      const body = clientMethodBody(name);
      expect(body, `${name} is missing from lib/api/progress.ts`).not.toBe("");
      expect(body, `${name} does not use apiRequest`).toContain("apiRequest<");

      const verb = body.match(/method:\s*"([A-Z]+)"/)?.[1]?.toLowerCase();
      expect(verb, `${name} has no explicit method`).toBe(expected.method);
      expect(extractRequestPath(body), `${name} path`).toBe(
        normalizePath(expected.path)
      );
    }
  });

  it("uses the documented tags and role-scoped paths", () => {
    expect(operation(ENDPOINTS.completeLesson.path, "put")?.tags).toContain(
      "Progress"
    );
    expect(operation(ENDPOINTS.getOwnProgress.path, "get")?.tags).toContain(
      "Progress"
    );
    expect(
      operation(ENDPOINTS.getInstructorClassProgress.path, "get")?.tags
    ).toContain("Teaching");
    expect(operation(ENDPOINTS.getAdminClassProgress.path, "get")?.tags).toContain(
      "Cohort management"
    );
  });

  it("sends exactly { completed: true } and nothing else", () => {
    const schema = resolve(
      operation(ENDPOINTS.completeLesson.path, "put")?.requestBody?.content?.[
        "application/json"
      ]?.schema
    );
    expect(schema?.required).toEqual(["completed"]);
    expect(Object.keys(schema?.properties ?? {})).toEqual(["completed"]);
    expect(schema?.properties?.completed.type).toBe("boolean");
    expect(schema?.additionalProperties).toBe(false);

    expect(COMPLETION_REQUEST_BODY).toEqual({ completed: true });

    const body = clientMethodBody("completeLesson");
    // No version, score, timestamp or owner is ever sent: the server stamps them.
    for (const forbidden of [
      "lesson_version",
      "content_version",
      "score",
      "percent",
      "completed_at",
      "user_id",
      "student_user_id",
    ]) {
      expect(body, `completeLesson sends ${forbidden}`).not.toContain(forbidden);
    }
    // There is no un-complete: only the literal `true` exists.
    expect(apiSource).not.toMatch(/completed:\s*false/);
    expect(apiSource).not.toMatch(/uncomplete|un-complete|revertCompletion/i);
  });

  it("documents both completion outcomes as success", () => {
    const responses = operation(ENDPOINTS.completeLesson.path, "put")?.responses;
    expect(responses?.["200"]).toBeDefined();
    expect(responses?.["201"]).toBeDefined();
    expect(responses?.["201"]).toMatchObject({ description: expect.any(String) });
    expect(responses?.["200"]).toMatchObject({ description: expect.any(String) });
  });

  it("paginates both class reads with the documented bounds", () => {
    for (const route of [
      ENDPOINTS.getInstructorClassProgress.path,
      ENDPOINTS.getAdminClassProgress.path,
    ]) {
      const params = operation(route, "get")?.parameters ?? [];
      const limit = params.find((param) => param.name === "limit");
      const offset = params.find((param) => param.name === "offset");
      expect(limit, `${route} limit`).toBeDefined();
      expect(offset, `${route} offset`).toBeDefined();
    }

    // Bounds are mirrored, not re-invented.
    expect(PROGRESS_PAGE_LIMITS).toEqual({
      limitDefault: 30,
      limitMin: 1,
      limitMax: 100,
    });

    for (const name of ["getInstructorClassProgress", "getAdminClassProgress"]) {
      const body = clientMethodBody(name);
      expect(body, `${name} must send limit`).toContain("limit");
      expect(body, `${name} must send offset`).toContain("offset");
    }
    // The student reads take no query parameters at all.
    for (const name of ["getOwnProgress", "completeLesson"]) {
      expect(clientMethodBody(name), `${name} must not paginate`).not.toContain(
        "query"
      );
    }
  });

  it("mirrors every required field of the nine 0.5.0 schemas", () => {
    for (const name of SCHEMAS) {
      const schema = contract?.components.schemas[name];
      expect(schema, `${name} is missing from the contract`).toBeDefined();
    }

    const objectSchemas: Array<[string, string]> = [
      ["CompletionRequest", "CompletionRequest"],
      ["CompletionResponse", "CompletionResponse"],
      ["EnrollmentProgress", "EnrollmentProgress"],
      ["ModuleProgressEntry", "ModuleProgressEntry"],
      ["LessonProgressEntry", "LessonProgressEntry"],
      ["ClassProgress", "ClassProgress"],
      ["ClassStudentProgress", "ClassStudentProgress"],
      ["PageClassStudentProgress", "PageClassStudentProgress"],
    ];

    for (const [schemaName, interfaceName] of objectSchemas) {
      const schema = contract?.components.schemas[schemaName];
      const block = typesSource.slice(
        typesSource.indexOf(`interface ${interfaceName} {`)
      );
      const fields = block.slice(0, block.indexOf("\n}"));
      for (const required of schema?.required ?? []) {
        expect(fields, `${interfaceName} is missing ${required}`).toContain(
          `${required}:`
        );
      }
      for (const field of Object.keys(schema?.properties ?? {})) {
        expect(fields, `${interfaceName} is missing ${field}`).toContain(
          `${field}:`
        );
      }
    }
  });

  it("mirrors the CompletionState enum with a text label per state", () => {
    const schema = contract?.components.schemas.CompletionState;
    const documented = [...(schema?.enum ?? [])].sort();
    expect(documented).toEqual(["current", "needs_review", "not_started"]);
    expect([...COMPLETION_STATES].sort()).toEqual(documented);
    expect(Object.keys(COMPLETION_STATE_LABELS).sort()).toEqual(documented);

    // Colour is never the only signal: every state has words.
    for (const status of COMPLETION_STATES) {
      expect(COMPLETION_STATE_LABELS[status].trim().length).toBeGreaterThan(3);
    }
    expect(COMPLETION_STATE_LABELS.needs_review).toBe("Needs review");
    expect(COMPLETION_STATE_LABELS.current).toBe("Completed");
    expect(COMPLETION_STATE_LABELS.not_started).toBe("Not started");
  });

  it("keeps percentages and completion state server-owned", () => {
    // Percentages arrive computed. The client formats them and never derives one.
    expect(apiSource).not.toMatch(/[*/]\s*100\b/);
    expect(apiSource).not.toMatch(/percent_complete\s*[=+*/-]/);
    expect(typesSource).not.toMatch(/percent_complete\s*:\s*\(/);

    const own = contract?.components.schemas.EnrollmentProgress?.required ?? [];
    const klass = contract?.components.schemas.ClassProgress?.required ?? [];
    expect(own).toContain("percent_complete");
    expect(klass).toContain("average_percent_complete");
    // Both are reported with one decimal and never rounded in the client.
    expect(typesSource).toContain("function formatPercent");
    expect(typesSource).toContain("toFixed(1)");
  });

  it("has no demonstration-data or browser-storage fallback", () => {
    for (const forbidden of [
      "isPreviewDemoFeatureAllowed",
      "getApiConnectionMode",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(apiSource, `progress client references ${forbidden}`).not.toContain(
        forbidden
      );
    }
    // Live data only: no placeholder records fall out of the client.
    expect(apiSource).not.toMatch(/mockrecord|mockRecord|fixture|sampleData/i);
  });

  it("declares no completion mutation for another user's enrollment", () => {
    // The only mutation is the student's own enrollment route; there is no admin
    // or instructor "mark complete for a student" endpoint in the contract.
    const mutations = Object.entries(contract?.paths ?? {}).flatMap(
      ([route, operations]) =>
        Object.keys(operations)
          .filter((method) => ["post", "put", "patch", "delete"].includes(method))
          .map((method) => `${method.toUpperCase()} ${route}`)
    );
    const completionMutations = mutations.filter((entry) =>
      /completion/.test(entry)
    );
    expect(completionMutations).toEqual([
      "PUT /api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion",
    ]);
  });
});

describe("Progress client surface", () => {
  it("offers no un-complete operation", () => {
    for (const name of CLIENT_METHODS) {
      expect(name).not.toMatch(/uncomplete|undo|revert|reset/i);
    }
  });

  it("keeps the completion body immutable for every call", () => {
    expect(COMPLETION_REQUEST_BODY).toEqual({ completed: true });
    // One definition, reused: the client does not build the body per call.
    expect(apiSource).toContain("body: COMPLETION_BODY");
    expect(apiSource.match(/completed:\s*true/g) ?? []).toHaveLength(1);
  });
});
