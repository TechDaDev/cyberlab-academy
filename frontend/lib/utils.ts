import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}

/**
 * Prevents open-redirect attacks on post-login `next` query parameters.
 * Only permits single-slash internal paths (e.g., `/dashboard/manager`).
 */
export function sanitizeInternalRedirect(
  candidate: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  // Never redirect back into login/register loops
  if (
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/register") ||
    trimmed.startsWith("/reset-password")
  ) {
    return fallback;
  }
  return trimmed;
}

const DISALLOWED_COMMON_PASSWORDS = new Set([
  "passwordpassword",
  "123456789012",
  "qwertyqwerty",
]);

export interface PasswordPolicyEvaluation {
  validLength: boolean;
  notCommon: boolean;
  excludesEmailLocal: boolean;
  excludesFullName: boolean;
  matchesConfirmation: boolean;
  allValid: boolean;
}

/**
 * Mirrors backend `require_strong_password` (`backend/app/security.py`) exactly:
 * - 12 to 128 characters
 * - Not in known disallowed common passwords
 * - Must not contain email local-part (when local-part length >= 4)
 * - Must not contain full name (when trimmed full name length >= 4)
 */
export function evaluatePasswordPolicy(params: {
  password: string;
  confirmation?: string;
  email?: string;
  fullName?: string;
}): PasswordPolicyEvaluation {
  const { password, confirmation, email = "", fullName = "" } = params;
  const lowered = password.toLowerCase();

  const validLength = password.length >= 12 && password.length <= 128;
  const notCommon = password.length > 0 && !DISALLOWED_COMMON_PASSWORDS.has(lowered);

  const normalizedEmail = email.trim().toLowerCase();
  const localPart = normalizedEmail.includes("@")
    ? normalizedEmail.split("@", 1)[0]
    : normalizedEmail;
  const excludesEmailLocal =
    localPart.length < 4 || (password.length > 0 && !lowered.includes(localPart));

  const normalizedName = fullName.trim().toLowerCase();
  const excludesFullName =
    normalizedName.length < 4 || (password.length > 0 && !lowered.includes(normalizedName));

  const matchesConfirmation =
    confirmation === undefined ? true : password.length > 0 && password === confirmation;

  return {
    validLength,
    notCommon,
    excludesEmailLocal,
    excludesFullName,
    matchesConfirmation,
    allValid:
      validLength &&
      notCommon &&
      excludesEmailLocal &&
      excludesFullName &&
      matchesConfirmation,
  };
}

/**
 * Redacts potential tokens, secrets, or query strings if an error message is rendered.
 */
export function redactSensitiveText(input: string): string {
  return input
    .replace(/token=[A-Za-z0-9_\-.~]+/gi, "token=[REDACTED]")
    .replace(/secret=[A-Za-z0-9_\-.~]+/gi, "secret=[REDACTED]");
}
