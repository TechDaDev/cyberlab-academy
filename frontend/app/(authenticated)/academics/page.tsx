import type { Metadata } from "next";
import { CourseCatalogView } from "@/features/academics/catalog-views";

export const metadata: Metadata = {
  title: "Course Catalog",
};

export default function AcademicsCatalogPage() {
  return <CourseCatalogView />;
}
