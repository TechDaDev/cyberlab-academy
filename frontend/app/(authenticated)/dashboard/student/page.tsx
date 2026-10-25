import type { Metadata } from "next";
import { StudentDashboard } from "@/features/dashboards/student/student-dashboard";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Student Dashboard",
};

export default function StudentDashboardPage() {
  return (
    <RoleRouteGuard
      requiredRoles={["student", "instructor", "manager", "administrator"]}
      preferredRole="student"
    >
      <StudentDashboard />
    </RoleRouteGuard>
  );
}
