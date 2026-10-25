/**
 * TypeScript mirrors of the Milestone 02A academic catalog schemas in
 * `shared-contracts/openapi.json` (API 0.3.0).
 *
 * Every type here corresponds 1:1 to a committed OpenAPI component. Do not add
 * fields the contract does not define: the backend rejects unknown fields with
 * `422` (`extra="forbid"`), so a stray property in a request body is an error,
 * not a no-op.
 */

export type ContentStatus = "draft" | "published" | "archived";

export type ResourceType = "external_link" | "reference" | "download_reference";

/** `CoursePublic` — `summary` defaults to "" and `published_at` is nullable. */
export interface CoursePublic {
  id: string;
  code: string;
  title: string;
  edition: string;
  status: ContentStatus;
  planned_module_count: number;
  published_module_count: number;
  content_version: number;
  summary: string;
  published_at: string | null;
}

/** `ModulePublic` */
export interface ModulePublic {
  id: string;
  course_id: string;
  sequence: number;
  title: string;
  status: ContentStatus;
  summary: string;
  published_at: string | null;
}

/** `LessonSummary` — metadata only; the body is never present in list responses. */
export interface LessonSummary {
  id: string;
  module_id: string;
  sequence: number;
  title: string;
  status: ContentStatus;
  content_version: number;
}

/** `ObjectivePublic` */
export interface ObjectivePublic {
  sequence: number;
  text: string;
}

/** `ResourcePublic` */
export interface ResourcePublic {
  id: string;
  sequence: number;
  title: string;
  type: ResourceType;
  external_url: string | null;
  asset_reference: string | null;
}

/** `LessonDetail` — body is only reachable for content managers in 02A. */
export interface LessonDetail {
  id: string;
  module_id: string;
  sequence: number;
  title: string;
  status: ContentStatus;
  content_version: number;
  body_markdown: string;
  objectives: ObjectivePublic[];
  resources: ResourcePublic[];
}

/** `PageCourses` */
export interface PageCourses {
  items: CoursePublic[];
  limit: number;
  offset: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** `ResourceInput` */
export interface ResourceInput {
  title: string;
  type: ResourceType;
  external_url?: string | null;
  asset_reference?: string | null;
}

/**
 * `CourseCreate` — `code` is immutable after creation and must match
 * `^[A-Z0-9-]+$`, 2–40 characters.
 */
export interface CourseCreateRequest {
  code: string;
  title: string;
  edition: string;
  planned_module_count: number;
  summary?: string;
}

/** `CoursePatch` — only the fields being changed. */
export interface CoursePatchRequest {
  title?: string;
  summary?: string;
  planned_module_count?: number;
}

/** `ModuleCreate` */
export interface ModuleCreateRequest {
  sequence: number;
  title: string;
  summary?: string;
}

/** `ModulePatch` */
export interface ModulePatchRequest {
  sequence?: number;
  title?: string;
  summary?: string;
}

/** `LessonCreate` */
export interface LessonCreateRequest {
  sequence: number;
  title: string;
  body_markdown?: string;
  objectives?: string[];
  resources?: ResourceInput[];
}

/** `LessonPatch` */
export interface LessonPatchRequest {
  sequence?: number;
  title?: string;
  body_markdown?: string;
  objectives?: string[];
  resources?: ResourceInput[];
}

// ---------------------------------------------------------------------------
// Contract bounds (kept beside the types so form validation cannot drift)
// ---------------------------------------------------------------------------

export const COURSE_LIMITS = {
  codeMin: 2,
  codeMax: 40,
  codePattern: /^[A-Z0-9-]+$/,
  titleMin: 3,
  titleMax: 160,
  editionMin: 1,
  editionMax: 40,
  summaryMax: 2000,
  plannedMin: 1,
  plannedMax: 1000,
} as const;

export const MODULE_LIMITS = {
  titleMin: 3,
  titleMax: 160,
  summaryMax: 2000,
  sequenceMin: 1,
  sequenceMax: 1000,
} as const;

export const LESSON_LIMITS = {
  titleMin: 3,
  titleMax: 160,
  sequenceMin: 1,
  sequenceMax: 1000,
  bodyMax: 100_000,
  objectivesMax: 40,
  resourcesMax: 60,
  resourceTitleMin: 2,
  resourceTitleMax: 180,
  externalUrlMax: 2048,
  assetReferenceMax: 250,
} as const;

export const COURSE_PAGE_LIMITS = {
  limitDefault: 30,
  limitMin: 1,
  limitMax: 100,
} as const;

/** Resource types the contract accepts, with UI labels. */
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  external_link: "External link",
  reference: "Reference",
  download_reference: "Download reference",
};

/** Human labels for the shared publication lifecycle. */
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};
