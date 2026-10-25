import type { Metadata } from "next";
import { ModuleExplorerView } from "@/features/academics/catalog-views";

export const metadata: Metadata = {
  title: "Module Explorer",
};

export default async function ModuleExplorerPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  return <ModuleExplorerView moduleId={moduleId} />;
}
