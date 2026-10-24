import type { Metadata } from "next";
import { AdminDashboard } from "@/features/dashboards/admin/admin-dashboard";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Administrator Control Center",
};

export default function AdminDashboardPage() {
  return (
    <RoleRouteGuard
      requiredRoles={["administrator"]}
      preferredRole="administrator"
    >
      <AdminDashboard />
    </RoleRouteGuard>
  );
}
