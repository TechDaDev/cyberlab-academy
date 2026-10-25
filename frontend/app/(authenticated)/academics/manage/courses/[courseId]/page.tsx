import type { Metadata } from "next";
import { CourseEditor } from "@/features/academics/course-editor";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Course Editor",
};

export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <RoleRouteGuard
      requiredRoles={CONTENT_MANAGER_ROLES}
      preferredRole="manager"
    >
      <CourseEditor courseId={courseId} />
    </RoleRouteGuard>
  );
}
