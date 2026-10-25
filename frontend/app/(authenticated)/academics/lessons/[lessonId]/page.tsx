import type { Metadata } from "next";
import { LessonViewer } from "@/features/academics/lesson-viewer";

export const metadata: Metadata = {
  title: "Lesson",
};

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonViewer lessonId={lessonId} />;
}
