import type { Metadata } from "next";
import { ManagerDashboard } from "@/features/dashboards/manager/manager-dashboard";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Manager Console",
};

export default function ManagerDashboardPage() {
  return (
    <RoleRouteGuard
      requiredRoles={["manager", "administrator"]}
      preferredRole="manager"
    >
      <ManagerDashboard />
    </RoleRouteGuard>
  );
}
