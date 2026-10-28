import type { Metadata } from "next";
import { TeachingCohort } from "@/features/academics/cohorts/teaching-cohort";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Teaching Workspace",
};

export default async function TeachingCohortPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  return (
    <RoleRouteGuard requiredRoles={["instructor"]} preferredRole="instructor">
      <TeachingCohort cohortId={cohortId} />
    </RoleRouteGuard>
  );
}
