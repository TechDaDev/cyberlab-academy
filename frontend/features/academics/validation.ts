import {
  COURSE_LIMITS,
  LESSON_LIMITS,
  MODULE_LIMITS,
  type ResourceInput,
  type ResourceType,
} from "@/lib/types/academic";

export type FieldErrors = Record<string, string>;

const RESOURCE_TYPES: ResourceType[] = [
  "external_link",
  "reference",
  "download_reference",
];

function bounded(
  value: string,
  label: string,
  min: number,
  max: number
): string | null {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return `${label} must be at least ${min} character${min === 1 ? "" : "s"}.`;
  }
  if (trimmed.length > max) {
    return `${label} must be at most ${max} characters.`;
  }
  return null;
}

function sequenceError(raw: string, max: number, label: string): string | null {
  if (!raw.trim()) return `${label} is required.`;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return `${label} must be a whole number.`;
  if (parsed < 1) return `${label} must be 1 or greater.`;
  if (parsed > max) return `${label} must be ${max} or less.`;
  return null;
}

export interface CourseCreateValues {
  code: string;
  title: string;
  edition: string;
  planned_module_count: string;
  summary: string;
}

export function validateCourseCreate(values: CourseCreateValues): FieldErrors {
  const errors: FieldErrors = {};

  const code = values.code.trim();
  if (!code) {
    errors.code = "Course code is required.";
  } else if (code.length < COURSE_LIMITS.codeMin || code.length > COURSE_LIMITS.codeMax) {
    errors.code = `Course code must be ${COURSE_LIMITS.codeMin}–${COURSE_LIMITS.codeMax} characters.`;
  } else if (!COURSE_LIMITS.codePattern.test(code)) {
    errors.code = "Use uppercase letters, digits and hyphens only (for example CEH-V12).";
  }

  const titleError = bounded(
    values.title,
    "Title",
    COURSE_LIMITS.titleMin,
    COURSE_LIMITS.titleMax
  );
  if (titleError) errors.title = titleError;

  const editionError = bounded(
    values.edition,
    "Edition",
    COURSE_LIMITS.editionMin,
    COURSE_LIMITS.editionMax
  );
  if (editionError) errors.edition = editionError;

  const planned = Number(values.planned_module_count);
  if (!values.planned_module_count.trim()) {
    errors.planned_module_count = "Planned module count is required.";
  } else if (!Number.isInteger(planned)) {
    errors.planned_module_count = "Planned module count must be a whole number.";
  } else if (planned < COURSE_LIMITS.plannedMin || planned > COURSE_LIMITS.plannedMax) {
    errors.planned_module_count = `Planned module count must be between ${COURSE_LIMITS.plannedMin} and ${COURSE_LIMITS.plannedMax}.`;
  }

  if (values.summary.length > COURSE_LIMITS.summaryMax) {
    errors.summary = `Summary must be at most ${COURSE_LIMITS.summaryMax} characters.`;
  }

  return errors;
}

export function validateCoursePatch(values: {
  title: string;
  summary: string;
  planned_module_count: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  const titleError = bounded(
    values.title,
    "Title",
    COURSE_LIMITS.titleMin,
    COURSE_LIMITS.titleMax
  );
  if (titleError) errors.title = titleError;

  if (values.summary.length > COURSE_LIMITS.summaryMax) {
    errors.summary = `Summary must be at most ${COURSE_LIMITS.summaryMax} characters.`;
  }

  const planned = Number(values.planned_module_count);
  if (!values.planned_module_count.trim()) {
    errors.planned_module_count = "Planned module count is required.";
  } else if (!Number.isInteger(planned)) {
    errors.planned_module_count = "Planned module count must be a whole number.";
  } else if (planned < COURSE_LIMITS.plannedMin || planned > COURSE_LIMITS.plannedMax) {
    errors.planned_module_count = `Planned module count must be between ${COURSE_LIMITS.plannedMin} and ${COURSE_LIMITS.plannedMax}.`;
  }

  return errors;
}

export interface ModuleCreateValues {
  sequence: string;
  title: string;
  summary: string;
}

export function validateModuleCreate(
  values: ModuleCreateValues,
  plannedModuleCount?: number
): FieldErrors {
  const errors: FieldErrors = {};
  const maxSequence = Math.min(
    MODULE_LIMITS.sequenceMax,
    plannedModuleCount ?? MODULE_LIMITS.sequenceMax
  );

  const sequenceIssue = sequenceError(values.sequence, maxSequence, "Sequence");
  if (sequenceIssue) {
    errors.sequence =
      plannedModuleCount && Number(values.sequence) > plannedModuleCount
        ? `Sequence must not exceed the course's ${plannedModuleCount} planned modules.`
        : sequenceIssue;
  }

  const titleError = bounded(
    values.title,
    "Title",
    MODULE_LIMITS.titleMin,
    MODULE_LIMITS.titleMax
  );
  if (titleError) errors.title = titleError;

  if (values.summary.length > MODULE_LIMITS.summaryMax) {
    errors.summary = `Summary must be at most ${MODULE_LIMITS.summaryMax} characters.`;
  }

  return errors;
}

export interface LessonCreateValues {
  sequence: string;
  title: string;
}

export function validateLessonCreate(values: LessonCreateValues): FieldErrors {
  const errors: FieldErrors = {};

  const sequenceIssue = sequenceError(
    values.sequence,
    LESSON_LIMITS.sequenceMax,
    "Sequence"
  );
  if (sequenceIssue) errors.sequence = sequenceIssue;

  const titleError = bounded(
    values.title,
    "Title",
    LESSON_LIMITS.titleMin,
    LESSON_LIMITS.titleMax
  );
  if (titleError) errors.title = titleError;

  return errors;
}

export interface LessonEditValues {
  sequence: string;
  title: string;
  body_markdown: string;
  objectives: string[];
  resources: ResourceInput[];
}

export function validateLessonEdit(values: LessonEditValues): FieldErrors {
  const errors = validateLessonCreate({
    sequence: values.sequence,
    title: values.title,
  });

  if (values.body_markdown.length > LESSON_LIMITS.bodyMax) {
    errors.body_markdown = `Lesson body must be at most ${LESSON_LIMITS.bodyMax.toLocaleString()} characters.`;
  }

  const objectives = values.objectives.filter((o) => o.trim().length > 0);
  if (objectives.length > LESSON_LIMITS.objectivesMax) {
    errors.objectives = `At most ${LESSON_LIMITS.objectivesMax} objectives are allowed.`;
  }

  const resources = values.resources.filter((r) => r.title.trim().length > 0);
  if (resources.length > LESSON_LIMITS.resourcesMax) {
    errors.resources = `At most ${LESSON_LIMITS.resourcesMax} resources are allowed.`;
  }

  resources.forEach((resource, index) => {
    const label = `Resource ${index + 1}`;
    const titleError = bounded(
      resource.title,
      `${label} title`,
      LESSON_LIMITS.resourceTitleMin,
      LESSON_LIMITS.resourceTitleMax
    );
    if (titleError) errors[`resources.${index}.title`] = titleError;

    if (!RESOURCE_TYPES.includes(resource.type)) {
      errors[`resources.${index}.type`] = `${label} type is not supported.`;
    }

    if (resource.external_url && resource.external_url.length > LESSON_LIMITS.externalUrlMax) {
      errors[`resources.${index}.external_url`] =
        `${label} URL must be at most ${LESSON_LIMITS.externalUrlMax} characters.`;
    }
    if (
      resource.external_url &&
      !/^https?:\/\//i.test(resource.external_url.trim())
    ) {
      errors[`resources.${index}.external_url`] =
        `${label} URL must be an absolute http(s) URL.`;
    }

    if (
      resource.asset_reference &&
      resource.asset_reference.length > LESSON_LIMITS.assetReferenceMax
    ) {
      errors[`resources.${index}.asset_reference`] =
        `${label} asset reference must be at most ${LESSON_LIMITS.assetReferenceMax} characters.`;
    }
    if (
      resource.asset_reference &&
      (/^[/\\]/.test(resource.asset_reference) ||
        resource.asset_reference.includes(".."))
    ) {
      errors[`resources.${index}.asset_reference`] =
        `${label} asset reference must be relative and must not contain "..".`;
    }
  });

  return errors;
}

/** Strip empty rows before sending so the API does not receive blank records. */
export function normalizeObjectives(objectives: string[]): string[] {
  return objectives.map((o) => o.trim()).filter((o) => o.length > 0);
}

export function normalizeResources(resources: ResourceInput[]): ResourceInput[] {
  return resources
    .filter((r) => r.title.trim().length > 0)
    .map((r) => ({
      title: r.title.trim(),
      type: r.type,
      external_url: r.external_url?.trim() ? r.external_url.trim() : null,
      asset_reference: r.asset_reference?.trim() ? r.asset_reference.trim() : null,
    }));
}
