import type { FieldErrors } from "@/features/academics/validation";
import { COHORT_LIMITS } from "@/lib/types/cohorts";

export interface CohortCreateValues {
  course_id: string;
  code: string;
  name: string;
  /** `datetime-local` value (`` when unset). */
  starts_at: string;
  ends_at: string;
}

export interface CohortPatchValues {
  name: string;
  starts_at: string;
  ends_at: string;
}

function codeError(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return "Class code is required.";
  if (trimmed.length < COHORT_LIMITS.codeMin || trimmed.length > COHORT_LIMITS.codeMax) {
    return `Class code must be ${COHORT_LIMITS.codeMin}–${COHORT_LIMITS.codeMax} characters.`;
  }
  if (!COHORT_LIMITS.codePattern.test(trimmed)) {
    return "Use uppercase letters, digits and hyphens only (for example CEH-V12-A).";
  }
  return null;
}

function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < COHORT_LIMITS.nameMin) return "Class name is required.";
  if (trimmed.length > COHORT_LIMITS.nameMax) {
    return `Class name must be at most ${COHORT_LIMITS.nameMax} characters.`;
  }
  return null;
}

/** `ends_at` must be strictly after `starts_at` when both are present (422). */
export function windowError(starts: string, ends: string): string | null {
  if (!starts || !ends) return null;
  const start = new Date(starts).getTime();
  const end = new Date(ends).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end <= start) return "The end date must be after the start date.";
  return null;
}

export function validateCohortCreate(values: CohortCreateValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.course_id) {
    errors.course_id = "Select the course this class teaches.";
  }

  const code = codeError(values.code);
  if (code) errors.code = code;

  const name = nameError(values.name);
  if (name) errors.name = name;

  const window = windowError(values.starts_at, values.ends_at);
  if (window) errors.ends_at = window;

  return errors;
}

export function validateCohortPatch(values: CohortPatchValues): FieldErrors {
  const errors: FieldErrors = {};

  const name = nameError(values.name);
  if (name) errors.name = name;

  const window = windowError(values.starts_at, values.ends_at);
  if (window) errors.ends_at = window;

  return errors;
}

/** `datetime-local` → ISO-8601 the contract accepts, or `null` when cleared. */
export function toIsoOrNull(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** ISO-8601 → the `datetime-local` value an `<input type="datetime-local">` needs. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate()
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
