import type { Metadata } from "next";
import { CourseOverviewView } from "@/features/academics/catalog-views";

export const metadata: Metadata = {
  title: "Course Overview",
};

export default async function CourseOverviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CourseOverviewView courseId={courseId} />;
}
