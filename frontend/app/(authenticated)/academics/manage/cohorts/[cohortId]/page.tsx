import type { Metadata } from "next";
import { CohortDetail } from "@/features/academics/cohorts/cohort-detail";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Class Management",
};

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  return (
    <RoleRouteGuard requiredRoles={CONTENT_MANAGER_ROLES} preferredRole="manager">
      <CohortDetail cohortId={cohortId} />
    </RoleRouteGuard>
  );
}
