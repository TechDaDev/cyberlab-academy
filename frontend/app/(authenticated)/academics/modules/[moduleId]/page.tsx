import type { Metadata } from "next";
import { ModuleExplorerView } from "@/features/academics/catalog-views";

export const metadata: Metadata = {
  title: "Module Explorer",
};

/**
 * Passes the optional enrollment context through to the client explorer so lesson
 * links keep the class the student came from. Nothing is resolved here — an absent
 * value stays `null`.
 */
export default async function ModuleExplorerPage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ enrollmentId?: string | string[] }>;
}) {
  const { moduleId } = await params;
  const query = await searchParams;
  const enrollmentId =
    typeof query.enrollmentId === "string" && query.enrollmentId.length > 0
      ? query.enrollmentId
      : null;
  return (
    <ModuleExplorerView moduleId={moduleId} enrollmentId={enrollmentId} />
  );
}
