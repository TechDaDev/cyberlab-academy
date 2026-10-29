import type { Metadata } from "next";
import { CohortManager } from "@/features/academics/cohorts/cohort-manager";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Class Management",
};

export default function ClassManagementPage() {
  return (
    <RoleRouteGuard requiredRoles={CONTENT_MANAGER_ROLES} preferredRole="manager">
      <CohortManager />
    </RoleRouteGuard>
  );
}
