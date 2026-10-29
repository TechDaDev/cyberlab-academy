import type { Metadata } from "next";
import { TeachingOverview } from "@/features/academics/cohorts/teaching-overview";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Teaching Workspace",
};

export default function TeachingWorkspacePage() {
  return (
    <RoleRouteGuard requiredRoles={["instructor"]} preferredRole="instructor">
      <TeachingOverview />
    </RoleRouteGuard>
  );
}
