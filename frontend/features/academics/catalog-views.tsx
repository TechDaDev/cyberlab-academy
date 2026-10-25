"use client";

import * as React from "react";
import { CourseCatalog } from "@/features/academics/course-catalog";
import { CourseOverview } from "@/features/academics/course-overview";
import { ModuleExplorer } from "@/features/academics/module-explorer";
import { isContentManager } from "@/features/academics/role-access";
import { useAuth } from "@/hooks/use-auth";

/**
 * Client bridges between server-rendered route files (which must stay server
 * components to export `metadata`) and the academic screens, which need the
 * active role from the auth context.
 */
function useCanManage(): boolean {
  const { user } = useAuth();
  return isContentManager(user?.active_role);
}

export function CourseCatalogView() {
  const canManage = useCanManage();
  return <CourseCatalog canManage={canManage} />;
}

export function CourseOverviewView({ courseId }: { courseId: string }) {
  const canManage = useCanManage();
  return <CourseOverview courseId={courseId} canManage={canManage} />;
}

export function ModuleExplorerView({ moduleId }: { moduleId: string }) {
  const canManage = useCanManage();
  return <ModuleExplorer moduleId={moduleId} canManage={canManage} />;
}
