import type { Metadata } from "next";
import { LessonEditor } from "@/features/academics/lesson-editor";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Lesson Editor",
};

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return (
    <RoleRouteGuard
      requiredRoles={CONTENT_MANAGER_ROLES}
      preferredRole="manager"
    >
      <LessonEditor lessonId={lessonId} />
    </RoleRouteGuard>
  );
}
