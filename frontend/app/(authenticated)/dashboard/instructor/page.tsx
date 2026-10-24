import type { Metadata } from "next";
import { InstructorDashboard } from "@/features/dashboards/instructor/instructor-dashboard";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Instructor Dashboard",
};

export default function InstructorDashboardPage() {
  return (
    <RoleRouteGuard
      requiredRoles={["instructor", "manager", "administrator"]}
      preferredRole="instructor"
    >
      <InstructorDashboard />
    </RoleRouteGuard>
  );
}
