import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURSE_LIMITS,
  LESSON_LIMITS,
  MODULE_LIMITS,
  RESOURCE_TYPE_LABELS,
} from "@/lib/types/academic";

/**
 * Milestone 02A frontend contract guard.
 *
 * `shared-contracts/openapi.json` (API 0.3.0) is the authoritative contract. The
 * typed client and the form limits must track it exactly: an endpoint rename
 * surfaces as a `404`, and a drifted bound surfaces as a `422` from
 * `extra="forbid"` / `maxLength` validation. These assertions fail loudly
 * instead of leaving the drift to a user to discover.
 *
 * The contract lives outside `frontend/`, so the suite skips when it is not
 * present in the checkout (for example when only the frontend directory is
 * mounted).
 */
const contractPath = path.resolve(
  __dirname,
  "../../shared-contracts/openapi.json"
);
const apiSourcePath = path.resolve(__dirname, "../lib/api/academic.ts");

const contract = existsSync(contractPath)
  ? (JSON.parse(readFileSync(contractPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, JsonSchema> };
    })
  : null;

const apiSource = readFileSync(apiSourcePath, "utf8");

interface JsonSchema {
  type?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  pattern?: string;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  $ref?: string;
  additionalProperties?: boolean;
}

/** Every academic client method, mapped to the OpenAPI operation it calls. */
const ENDPOINTS: Record<string, { method: string; path: string }> = {
  listCourses: { method: "get", path: "/api/v1/courses" },
  getCourse: { method: "get", path: "/api/v1/courses/{course_id}" },
  listCourseModules: {
    method: "get",
    path: "/api/v1/courses/{course_id}/modules",
  },
  getModule: { method: "get", path: "/api/v1/modules/{module_id}" },
  listModuleLessons: {
    method: "get",
    path: "/api/v1/modules/{module_id}/lessons",
  },
  getLesson: { method: "get", path: "/api/v1/lessons/{lesson_id}" },
  listAdminCourses: { method: "get", path: "/api/v1/admin/courses" },
  createCourse: { method: "post", path: "/api/v1/admin/courses" },
  getAdminCourse: { method: "get", path: "/api/v1/admin/courses/{course_id}" },
  updateCourse: { method: "patch", path: "/api/v1/admin/courses/{course_id}" },
  publishCourse: {
    method: "post",
    path: "/api/v1/admin/courses/{course_id}/publish",
  },
  listAdminModules: {
    method: "get",
    path: "/api/v1/admin/courses/{course_id}/modules",
  },
  createModule: {
    method: "post",
    path: "/api/v1/admin/courses/{course_id}/modules",
  },
  updateModule: { method: "patch", path: "/api/v1/admin/modules/{module_id}" },
  publishModule: {
    method: "post",
    path: "/api/v1/admin/modules/{module_id}/publish",
  },
  createLesson: {
    method: "post",
    path: "/api/v1/admin/modules/{module_id}/lessons",
  },
  updateLesson: { method: "patch", path: "/api/v1/admin/lessons/{lesson_id}" },
  publishLesson: {
    method: "post",
    path: "/api/v1/admin/lessons/{lesson_id}/publish",
  },
};

/** Extracts one `async <name>(…) { … },` block from the client module. */
function clientMethodBody(name: string): string {
  const start = apiSource.indexOf(`async ${name}(`);
  if (start < 0) return "";
  const end = apiSource.indexOf("\n  },", start);
  return apiSource.slice(start, end < 0 ? undefined : end);
}

/** Collapses both path parameter syntaxes to a comparable shape. */
function normalizePath(value: string): string {
  return value
    .replace(/\$\{encodeURIComponent\([^)]*\)\}/g, "{}")
    .replace(/\{[^}]+\}/g, "{}");
}

function resolve(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() as string;
    return contract?.components.schemas[name];
  }
  return schema;
}

const nullable = (schema: JsonSchema | undefined): JsonSchema | undefined =>
  resolve(schema)?.anyOf?.find((option) => option.type !== "null");

describe.skipIf(!contract)("Academic API contract alignment (OpenAPI 0.3.0)", () => {
  it("calls exactly the documented endpoint and HTTP method for every operation", () => {
    for (const [name, expected] of Object.entries(ENDPOINTS)) {
      const body = clientMethodBody(name);

      expect(body, `${name} is missing from lib/api/academic.ts`).not.toBe("");
      expect(body, `${name} does not use apiRequest`).toContain("apiRequest<");

      const method = body.match(/method:\s*"([A-Z]+)"/)?.[1]?.toLowerCase();
      expect(method, `${name} has no explicit method`).toBe(expected.method);

      const requestPath = body.match(/["`]([^"`]*\/[^"`]*)["`]/)?.[1] ?? "";
      expect(
        normalizePath(`/api/v1${requestPath}`),
        `${name} requests an undocumented path: ${requestPath}`
      ).toBe(normalizePath(expected.path));

      const operation = contract?.paths[expected.path]?.[expected.method];
      expect(
        operation,
        `${expected.method.toUpperCase()} ${expected.path} is not in the contract`
      ).toBeDefined();
    }
  });

  it("never sends a publish body, because the endpoints forbid extra fields", () => {
    for (const name of ["publishCourse", "publishModule", "publishLesson"]) {
      const body = clientMethodBody(name);
      expect(body, `${name} must not send a body`).not.toContain("body:");
    }
    for (const operationPath of [
      "/api/v1/admin/courses/{course_id}/publish",
      "/api/v1/admin/modules/{module_id}/publish",
      "/api/v1/admin/lessons/{lesson_id}/publish",
    ]) {
      const operation = contract?.paths[operationPath]?.post as
        | { requestBody?: unknown }
        | undefined;
      expect(operation?.requestBody, `${operationPath} grew a request body`).toBeUndefined();
    }
  });

  it("keeps publication status out of PATCH payloads", () => {
    // Status transitions exist only on the dedicated publish endpoints.
    for (const forbidden of ["status:", "published_at:", "content_version:"]) {
      expect(apiSource).not.toContain(forbidden);
    }
  });

  it("never fabricates curriculum from the preview-demo adapter", () => {
    expect(apiSource).not.toContain("preview-demo");
    expect(apiSource).not.toContain("getApiConnectionMode");
    expect(apiSource).not.toContain("setApiConnectionMode");
  });

  it("mirrors the CourseCreate bounds", () => {
    const properties = contract!.components.schemas.CourseCreate.properties!;
    expect(properties.code.minLength).toBe(COURSE_LIMITS.codeMin);
    expect(properties.code.maxLength).toBe(COURSE_LIMITS.codeMax);
    expect(properties.code.pattern).toBe(COURSE_LIMITS.codePattern.source);
    expect(properties.title.minLength).toBe(COURSE_LIMITS.titleMin);
    expect(properties.title.maxLength).toBe(COURSE_LIMITS.titleMax);
    expect(properties.edition.minLength).toBe(COURSE_LIMITS.editionMin);
    expect(properties.edition.maxLength).toBe(COURSE_LIMITS.editionMax);
    expect(properties.summary.maxLength).toBe(COURSE_LIMITS.summaryMax);
    expect(properties.planned_module_count.minimum).toBe(COURSE_LIMITS.plannedMin);
    expect(properties.planned_module_count.maximum).toBe(COURSE_LIMITS.plannedMax);
    expect(contract!.components.schemas.CourseCreate.additionalProperties).toBe(false);
  });

  it("mirrors the ModuleCreate bounds", () => {
    const properties = contract!.components.schemas.ModuleCreate.properties!;
    expect(properties.title.minLength).toBe(MODULE_LIMITS.titleMin);
    expect(properties.title.maxLength).toBe(MODULE_LIMITS.titleMax);
    expect(properties.summary.maxLength).toBe(MODULE_LIMITS.summaryMax);
    expect(properties.sequence.minimum).toBe(MODULE_LIMITS.sequenceMin);
    expect(properties.sequence.maximum).toBe(MODULE_LIMITS.sequenceMax);
  });

  it("mirrors the LessonCreate and ResourceInput bounds", () => {
    const lesson = contract!.components.schemas.LessonCreate.properties!;
    expect(lesson.title.minLength).toBe(LESSON_LIMITS.titleMin);
    expect(lesson.title.maxLength).toBe(LESSON_LIMITS.titleMax);
    expect(lesson.sequence.minimum).toBe(LESSON_LIMITS.sequenceMin);
    expect(lesson.sequence.maximum).toBe(LESSON_LIMITS.sequenceMax);
    expect(lesson.body_markdown.maxLength).toBe(LESSON_LIMITS.bodyMax);
    expect(lesson.objectives.maxItems).toBe(LESSON_LIMITS.objectivesMax);
    expect(lesson.resources.maxItems).toBe(LESSON_LIMITS.resourcesMax);

    const resource = contract!.components.schemas.ResourceInput.properties!;
    expect(resource.title.minLength).toBe(LESSON_LIMITS.resourceTitleMin);
    expect(resource.title.maxLength).toBe(LESSON_LIMITS.resourceTitleMax);
    expect(nullable(resource.external_url)?.maxLength).toBe(
      LESSON_LIMITS.externalUrlMax
    );
    expect(nullable(resource.asset_reference)?.maxLength).toBe(
      LESSON_LIMITS.assetReferenceMax
    );
  });

  it("mirrors the documented resource type enum", () => {
    const schema = contract!.components.schemas.ResourceType;
    expect(schema.enum?.slice().sort()).toEqual(
      Object.keys(RESOURCE_TYPE_LABELS).sort()
    );
  });

  it("keeps lesson bodies out of the lesson list response", () => {
    // `GET /modules/{id}/lessons` returns metadata only. Bodies live on
    // `LessonDetail`, reachable solely through the (gated) lesson endpoint, so
    // the explorer can never present an authored body the API did not release.
    const listOperation = contract!.paths["/api/v1/modules/{module_id}/lessons"]
      .get as {
      responses: Record<string, { content: Record<string, { schema: JsonSchema }> }>;
    };
    const listSchema = listOperation.responses["200"].content["application/json"].schema;
    expect(listSchema.type).toBe("array");
    expect(listSchema.items?.$ref).toBe("#/components/schemas/LessonSummary");

    const summary = contract!.components.schemas.LessonSummary.properties ?? {};
    expect(Object.keys(summary)).not.toContain("body_markdown");
    const detail = contract!.components.schemas.LessonDetail.properties ?? {};
    expect(Object.keys(detail)).toContain("body_markdown");
  });
});
