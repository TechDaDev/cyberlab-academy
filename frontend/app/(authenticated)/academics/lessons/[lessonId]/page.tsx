import type { Metadata } from "next";
import { LessonViewer } from "@/features/academics/lesson-viewer";

export const metadata: Metadata = {
  title: "Lesson",
};

/**
 * The only thing this server file does is read the route and the query, then hand
 * both to the client viewer. Completion context is never derived here: an absent
 * or repeated `enrollmentId` becomes `null`, so the viewer renders the lesson and
 * withholds the completion control instead of picking an enrollment.
 */
function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ enrollmentId?: string | string[] }>;
}) {
  const { lessonId } = await params;
  const query = await searchParams;
  return (
    <LessonViewer lessonId={lessonId} enrollmentId={firstValue(query.enrollmentId)} />
  );
}
