import type { Metadata } from "next";
import { ContentManager } from "@/features/academics/content-manager";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Content Management",
};

export default function ContentManagementPage() {
  return (
    <RoleRouteGuard
      requiredRoles={CONTENT_MANAGER_ROLES}
      preferredRole="manager"
    >
      <ContentManager />
    </RoleRouteGuard>
  );
}
