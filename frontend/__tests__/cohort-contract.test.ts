import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cohortsApi } from "@/lib/api/cohorts";
import {
  COHORT_PAGE_LIMITS,
  COHORT_STATUSES,
  COHORT_STATUS_LABELS,
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
} from "@/lib/types/cohorts";
import {
  activationPrerequisites,
  availableTransitions,
} from "@/features/academics/cohorts/cohort-lifecycle";

/**
 * Milestone 02B frontend contract guard.
 *
 * `shared-contracts/openapi.json` (API 0.4.0) is authoritative. Endpoints, request
 * field sets, enum values and bounds are asserted against it so a rename or a
 * narrowed body fails here instead of surfacing as a `404`/`422` in front of an
 * operator managing real classes.
 *
 * The contract lives outside `frontend/`, so the suite skips when only the frontend
 * directory is mounted.
 */
const contractPath = path.resolve(
  __dirname,
  "../../shared-contracts/openapi.json"
);
const apiSourcePath = path.resolve(__dirname, "../lib/api/cohorts.ts");
const typesSourcePath = path.resolve(__dirname, "../lib/types/cohorts.ts");

interface JsonSchema {
  type?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
  anyOf?: JsonSchema[];
}

const contract = existsSync(contractPath)
  ? (JSON.parse(readFileSync(contractPath, "utf8")) as {
      info: { version: string };
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, JsonSchema> };
    })
  : null;

const apiSource = readFileSync(apiSourcePath, "utf8");
const typesSource = readFileSync(typesSourcePath, "utf8");

/** Every class client method mapped to the OpenAPI operation it calls. */
const ENDPOINTS: Record<string, { method: string; path: string }> = {
  listCohorts: { method: "get", path: "/api/v1/admin/cohorts" },
  createCohort: { method: "post", path: "/api/v1/admin/cohorts" },
  getCohort: { method: "get", path: "/api/v1/admin/cohorts/{cohort_id}" },
  updateCohort: { method: "patch", path: "/api/v1/admin/cohorts/{cohort_id}" },
  activateCohort: {
    method: "post",
    path: "/api/v1/admin/cohorts/{cohort_id}/activate",
  },
  completeCohort: {
    method: "post",
    path: "/api/v1/admin/cohorts/{cohort_id}/complete",
  },
  archiveCohort: {
    method: "post",
    path: "/api/v1/admin/cohorts/{cohort_id}/archive",
  },
  listCohortInstructors: {
    method: "get",
    path: "/api/v1/admin/cohorts/{cohort_id}/instructors",
  },
  assignCohortInstructor: {
    method: "post",
    path: "/api/v1/admin/cohorts/{cohort_id}/instructors",
  },
  removeCohortInstructor: {
    method: "delete",
    path: "/api/v1/admin/cohorts/{cohort_id}/instructors/{user_id}",
  },
  listCohortEnrollments: {
    method: "get",
    path: "/api/v1/admin/cohorts/{cohort_id}/enrollments",
  },
  createEnrollment: {
    method: "post",
    path: "/api/v1/admin/cohorts/{cohort_id}/enrollments",
  },
  updateEnrollment: {
    method: "patch",
    path: "/api/v1/admin/enrollments/{enrollment_id}",
  },
  listEligibleUsers: { method: "get", path: "/api/v1/admin/users" },
  listTeachingCohorts: { method: "get", path: "/api/v1/instructor/cohorts" },
  getTeachingCohort: {
    method: "get",
    path: "/api/v1/instructor/cohorts/{cohort_id}",
  },
  listCohortRoster: {
    method: "get",
    path: "/api/v1/instructor/cohorts/{cohort_id}/students",
  },
  listOwnEnrollments: { method: "get", path: "/api/v1/me/enrollments" },
  getOwnEnrollmentCourse: {
    method: "get",
    path: "/api/v1/me/enrollments/{enrollment_id}/course",
  },
};

function clientMethodBody(name: string): string {
  const start = apiSource.indexOf(`async ${name}(`);
  if (start < 0) return "";
  const end = apiSource.indexOf("\n  },", start);
  return apiSource.slice(start, end < 0 ? undefined : end);
}

/**
 * Collapses `${...}` interpolations and `{param}` placeholders to `{}`.
 *
 * The client builds class routes through a `cohortPath()` helper, so its
 * interpolation is expanded before normalisation — otherwise every helper call
 * would look like an undocumented `/api/v1{}` request.
 */
function normalizePath(value: string): string {
  return value
    .replace(/\$\{cohortPath\([^)]*\)\}/g, "/admin/cohorts/{}")
    .replace(/\$\{[^}]*\}/g, "{}")
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

describe.skipIf(!contract)("Class API contract alignment (OpenAPI 0.4.0)", () => {
  it("targets the documented version and the 02B operation count", () => {
    expect(contract?.info.version).toBe("0.4.0");
    expect(Object.keys(ENDPOINTS)).toHaveLength(19);
    const documentedPaths = Object.keys(contract?.paths ?? {}).filter((route) =>
      /cohort|enrollment/.test(route)
    );
    const documentedOperations = documentedPaths.reduce(
      (total, route) => total + Object.keys(contract!.paths[route]).length,
      0
    );
    // 14 new paths carrying 18 class/enrollment operations.
    expect(documentedPaths).toHaveLength(14);
    expect(documentedOperations).toBe(18);
  });

  it("calls exactly the documented endpoint and HTTP method for every operation", () => {
    for (const [name, expected] of Object.entries(ENDPOINTS)) {
      const body = clientMethodBody(name);

      expect(body, `${name} is missing from lib/api/cohorts.ts`).not.toBe("");
      expect(body, `${name} does not use apiRequest`).toContain("apiRequest<");

      const verb = body.match(/method:\s*"([A-Z]+)"/)?.[1]?.toLowerCase();
      expect(verb, `${name} has no explicit method`).toBe(expected.method);

      // Some methods pass `cohortPath(id)` directly, with no template literal.
      const literalPath = body.match(/[\"`]([^\"`]*\/[^\"`]*)[\"`]/)?.[1] ?? "";
      const requestPath =
        literalPath || (body.includes("cohortPath(") ? "/admin/cohorts/{}" : "");
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

  it("sends no body for lifecycle transitions, deletion and lookups", () => {
    for (const name of [
      "activateCohort",
      "completeCohort",
      "archiveCohort",
      "getCohort",
      "getTeachingCohort",
      "listCohortRoster",
      "listOwnEnrollments",
      "getOwnEnrollmentCourse",
      "listEligibleUsers",
    ]) {
      expect(clientMethodBody(name), `${name} must not send a body`).not.toContain(
        "body:"
      );
    }

    // The removal endpoint answers 204 and takes no payload: the path parameter is
    // the whole request.
    expect(clientMethodBody("removeCohortInstructor")).not.toContain("body:");
    const removal = contract?.paths[
      "/api/v1/admin/cohorts/{cohort_id}/instructors/{user_id}"
    ]?.delete as { requestBody?: unknown; responses?: Record<string, unknown> };
    expect(removal.requestBody).toBeUndefined();
    expect(removal.responses?.["204"]).toBeDefined();
  });

  it("keeps status out of the PATCH payload — transitions have their own endpoints", () => {
    const patch = contract?.components.schemas.CohortPatch;
    expect(Object.keys(patch?.properties ?? {}).sort()).toEqual([
      "ends_at",
      "name",
      "starts_at",
    ]);
    expect(patch?.additionalProperties).toBe(false);

    const updateBody = clientMethodBody("updateCohort");
    expect(updateBody).not.toContain("course_id");
    expect(updateBody).not.toContain("status");
  });

  it("matches the CohortCreate request field set and bounds", () => {
    const schema = contract?.components.schemas.CohortCreate;
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
      "code",
      "course_id",
      "ends_at",
      "name",
      "starts_at",
    ]);
    expect(schema?.required?.sort()).toEqual(["code", "course_id", "name"]);
    expect(schema?.additionalProperties).toBe(false);

    const code = schema?.properties?.code;
    expect(code?.minLength).toBe(2);
    expect(code?.maxLength).toBe(40);
    expect(code?.pattern).toBe("^[A-Z0-9-]+$");

    const name = schema?.properties?.name;
    expect(name?.minLength).toBe(1);
    expect(name?.maxLength).toBe(160);

    // The mirrors used by the form must quote the same numbers.
    expect(typesSource).toContain("codeMin: 2");
    expect(typesSource).toContain("codeMax: 40");
    expect(typesSource).toContain("nameMax: 160");
    expect(typesSource).toContain("/^[A-Z0-9-]+$/");
  });

  it("matches the assignment and enrollment request bodies", () => {
    const assign = contract?.components.schemas.CohortInstructorAssign;
    expect(Object.keys(assign?.properties ?? {})).toEqual(["instructor_user_id"]);
    expect(assign?.additionalProperties).toBe(false);

    const enroll = contract?.components.schemas.EnrollmentCreate;
    expect(Object.keys(enroll?.properties ?? {})).toEqual(["student_user_id"]);

    const transition = contract?.components.schemas.EnrollmentTransition;
    expect(Object.keys(transition?.properties ?? {})).toEqual(["status"]);
    expect(resolve(transition?.properties?.status)?.enum).toEqual([
      "active",
      "withdrawn",
    ]);
    expect(transition?.additionalProperties).toBe(false);
  });

  it("mirrors the status vocabularies", () => {
    const cohortStatus = contract?.components.schemas.CohortStatus;
    expect([...(cohortStatus?.enum ?? [])].sort()).toEqual(
      [...COHORT_STATUSES].sort()
    );
    expect(Object.keys(COHORT_STATUS_LABELS).sort()).toEqual(
      [...COHORT_STATUSES].sort()
    );

    const enrollmentStatus = contract?.components.schemas.EnrollmentStatus;
    expect([...(enrollmentStatus?.enum ?? [])].sort()).toEqual(
      [...ENROLLMENT_STATUSES].sort()
    );
    expect(Object.keys(ENROLLMENT_STATUS_LABELS).sort()).toEqual(
      [...ENROLLMENT_STATUSES].sort()
    );
  });

  it("keeps the page defaults the client relies on", () => {
    const listOp = contract?.paths["/api/v1/admin/cohorts"]?.get as {
      parameters?: { name: string; schema?: JsonSchema }[];
    };
    const params = new Map(
      (listOp.parameters ?? []).map((parameter) => [parameter.name, parameter.schema])
    );
    expect(params.get("limit")?.default).toBe(COHORT_PAGE_LIMITS.limitDefault);
    expect(params.get("offset")?.default).toBe(0);

    for (const filter of ["course_id", "status"]) {
      const schema = params.get(filter);
      const type = schema?.anyOf ?? [schema];
      expect(type.some((entry) => entry?.type === "null")).toBe(true);
    }
  });

  it("exposes only the fields the 02B screens render", () => {
    const schemas = contract?.components.schemas ?? {};
    expect(Object.keys(schemas.CohortPublic.properties ?? {}).sort()).toEqual([
      "active_enrollment_count",
      "active_instructor_count",
      "code",
      "course_id",
      "created_at",
      "ends_at",
      "id",
      "name",
      "starts_at",
      "status",
      "updated_at",
    ]);
    expect(
      Object.keys(schemas.CohortInstructorPublic.properties ?? {}).sort()
    ).toEqual([
      "active",
      "assigned_at",
      "cohort_id",
      "id",
      "instructor_name",
      "instructor_user_id",
      "removed_at",
    ]);
    expect(Object.keys(schemas.RosterEntry.properties ?? {}).sort()).toEqual([
      "email",
      "email_verified",
      "enrolled_at",
      "full_name",
      "status",
      "user_id",
    ]);
    expect(Object.keys(schemas.OwnEnrollmentCourse.properties ?? {}).sort()).toEqual(
      ["cohort", "course", "enrollment"]
    );
  });

  it("mirrors the server-derived student name on the administrative enrollment view", () => {
    const enrollment = contract?.components.schemas.EnrollmentPublic;

    expect(Object.keys(enrollment?.properties ?? {}).sort()).toEqual([
      "cohort_id",
      "course_id",
      "ended_at",
      "enrolled_at",
      "id",
      "status",
      "student_full_name",
      "student_user_id",
    ]);
    // Required and server-derived: the roster relies on it being present.
    expect(enrollment?.required).toContain("student_full_name");
    expect(typesSource).toContain("student_full_name: string;");

    // It is read-only: not an accepted request field, so a POST carrying it is a 422.
    expect(
      Object.keys(contract!.components.schemas.EnrollmentCreate.properties ?? {})
    ).toEqual(["student_user_id"]);
    expect(clientMethodBody("createEnrollment")).not.toContain("student_full_name");
    expect(clientMethodBody("updateEnrollment")).not.toContain("student_full_name");

    // Scope stays administrative — the student-facing schema never carries it.
    expect(
      Object.keys(contract!.components.schemas.StudentEnrollmentPublic.properties ?? {})
    ).not.toContain("student_full_name");
  });

  it("never fabricates class membership from the preview-demo adapter", () => {
    expect(apiSource).not.toContain('"preview-demo"');
    expect(apiSource).not.toContain("isPreviewDemoFeatureAllowed");
    expect(apiSource).not.toContain("getApiConnectionMode");
    expect(apiSource).not.toContain("setApiConnectionMode");
    expect(apiSource).not.toContain("adminApi.listUsers(");
  });

  it("uses the directory endpoint with role and activity filters", () => {
    const body = clientMethodBody("listEligibleUsers");
    expect(body).toContain('"/admin/users"');
    expect(body).toContain("role");
    expect(body).toContain('active: "true"');
    expect(body).toContain("search");
  });
});

describe.skipIf(!contract)("Lifecycle rules", () => {
  it("allows only the documented forward path", () => {
    expect(availableTransitions("draft")).toEqual(["activate", "archive"]);
    expect(availableTransitions("active")).toEqual(["complete"]);
    expect(availableTransitions("completed")).toEqual(["archive"]);
    expect(availableTransitions("archived")).toEqual([]);
  });

  it("requires a published course and a live instructor for activation", () => {
    const blocked = activationPrerequisites({ active_instructor_count: 0 }, false);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers).toHaveLength(2);

    const missingInstructor = activationPrerequisites(
      { active_instructor_count: 0 },
      true
    );
    expect(missingInstructor.allowed).toBe(false);
    expect(missingInstructor.blockers[0]).toMatch(/eligible instructor/i);

    const missingCourse = activationPrerequisites(
      { active_instructor_count: 2 },
      false
    );
    expect(missingCourse.allowed).toBe(false);
    expect(missingCourse.blockers[0]).toMatch(/must be published/i);

    expect(
      activationPrerequisites({ active_instructor_count: 1 }, true).allowed
    ).toBe(true);
  });
});

describe("204 removal is distinguishable from a cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves an explicit marker after a 204 response", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      cohortsApi.removeCohortInstructor("cohort-1", "user-1")
    ).resolves.toEqual({ removed: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "/api/v1/admin/cohorts/cohort-1/instructors/user-1"
    );
    expect(init.method).toBe("DELETE");
  });

  it("rejects instead of resolving when the removal is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Assignment not found." }), {
            status: 404,
            headers: { "content-type": "application/json" },
          })
      )
    );

    await expect(
      cohortsApi.removeCohortInstructor("cohort-1", "user-1")
    ).rejects.toThrow(/Assignment not found/);
  });
});
