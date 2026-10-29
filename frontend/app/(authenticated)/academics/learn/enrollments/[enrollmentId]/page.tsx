import type { Metadata } from "next";
import { StudentEnrollment } from "@/features/academics/cohorts/student-enrollment";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "My Class",
};

export default async function StudentEnrollmentPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  return (
    <RoleRouteGuard requiredRoles={["student"]} preferredRole="student">
      <StudentEnrollment enrollmentId={enrollmentId} />
    </RoleRouteGuard>
  );
}
