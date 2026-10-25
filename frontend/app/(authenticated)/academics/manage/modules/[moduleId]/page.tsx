import type { Metadata } from "next";
import { ModuleEditor } from "@/features/academics/module-editor";
import { CONTENT_MANAGER_ROLES } from "@/features/academics/role-access";
import { RoleRouteGuard } from "@/features/roles/role-route-guard";

export const metadata: Metadata = {
  title: "Module Editor",
};

export default async function ModuleEditorPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  return (
    <RoleRouteGuard
      requiredRoles={CONTENT_MANAGER_ROLES}
      preferredRole="manager"
    >
      <ModuleEditor moduleId={moduleId} />
    </RoleRouteGuard>
  );
}
