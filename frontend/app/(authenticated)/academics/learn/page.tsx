import type { Metadata } from "next";
import { LearningOverview } from "@/features/academics/cohorts/learning-overview";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "My Classes",
};

export default function LearningWorkspacePage() {
  return (
    <RoleRouteGuard requiredRoles={["student"]} preferredRole="student">
      <LearningOverview />
    </RoleRouteGuard>
  );
}
