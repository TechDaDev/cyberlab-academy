import type { Role } from "@/lib/types/api";

/**
 * Roles that may read/administer draft curriculum.
 *
 * This mirrors the backend's `CONTENT_MANAGERS` set. It is used only to decide
 * which affordances to render — every one of those requests is authorised
 * server-side as well, so hiding a control is never the security boundary.
 */
export const CONTENT_MANAGER_ROLES: Role[] = ["manager", "administrator"];

export function isContentManager(role: Role | null | undefined): boolean {
  return role != null && CONTENT_MANAGER_ROLES.includes(role);
}
