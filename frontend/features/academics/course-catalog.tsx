"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Library,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ContentStatusBadge } from "@/features/academics/content-status-badge";
import { describeAcademicError } from "@/features/academics/error-message";
import { useApiResource } from "@/features/academics/use-api-resource";
import { academicApi } from "@/lib/api/academic";
import {
  COURSE_PAGE_LIMITS,
  type CoursePublic,
  type ModulePublic,
} from "@/lib/types/academic";
import { formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 9;

interface CatalogPayload {
  courses: CoursePublic[];
  total: number;
  offset: number;
  modulesByCourse: Record<string, ModulePublic[]>;
}

async function loadCatalog(offset: number): Promise<CatalogPayload> {
  const page = await academicApi.listCourses(PAGE_SIZE, offset);
  const moduleLists = await Promise.all(
    page.items.map((course) =>
      // Public endpoint: returns only published modules of a published course.
      academicApi.listCourseModules(course.id)
    )
  );
  const modulesByCourse: Record<string, ModulePublic[]> = {};
  page.items.forEach((course, index) => {
    modulesByCourse[course.id] = moduleLists[index] ?? [];
  });
  return {
    courses: page.items,
    total: page.total,
    offset: page.offset,
    modulesByCourse,
  };
}

function ModuleAvailability({
  planned,
  published,
}: {
  planned: number;
  published: number;
}) {
  const percent =
    planned > 0 ? Math.min(100, Math.round((published / planned) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Published modules</span>
        <span className="font-mono font-semibold text-foreground">
          {published} / {planned}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={planned}
        aria-valuenow={published}
        aria-label={`${published} of ${planned} planned modules published`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border/70"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      {published < planned ? (
        <p className="text-[11px] text-muted-foreground">
          {planned - published} module{planned - published === 1 ? "" : "s"} not
          yet authored or published.
        </p>
      ) : null}
    </div>
  );
}

function CourseCard({
  course,
  modules,
}: {
  course: CoursePublic;
  modules: ModulePublic[];
}) {
  return (
    <Card className="cyber-panel-interactive flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="font-mono text-[10px]">
            {course.code}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            {course.edition}
          </Badge>
          <ContentStatusBadge status={course.status} className="ml-auto" />
        </div>
        <CardTitle className="pt-1 text-lg leading-tight">{course.title}</CardTitle>
        <CardDescription className="line-clamp-3">
          {course.summary || "No summary has been provided for this course."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <ModuleAvailability
          planned={course.planned_module_count}
          published={course.published_module_count}
        />

        <div className="space-y-2">
          {modules.length > 0 ? (
            <ul className="space-y-1">
              {modules.slice(0, 3).map((module) => (
                <li key={module.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-cyan-500 dark:text-cyan-400">
                    M{String(module.sequence).padStart(2, "0")}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {module.title}
                  </span>
                </li>
              ))}
              {modules.length > 3 ? (
                <li className="font-mono text-[10px] text-muted-foreground">
                  +{modules.length - 3} more published module
                  {modules.length - 3 === 1 ? "" : "s"}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No modules are published for this course yet.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="font-mono text-[10px] text-muted-foreground">
            Updated {formatShortDate(course.published_at)}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/academics/courses/${course.id}`}>
              <span>Open curriculum</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CourseCatalog({ canManage }: { canManage: boolean }) {
  const [offset, setOffset] = React.useState(0);
  const { data, error, loading, reload } = useApiResource<CatalogPayload>(
    () => loadCatalog(offset),
    `catalog:${offset}`
  );

  const copy = describeAcademicError(error);

  if (loading && !data) {
    return <LoadingState label="Loading published academic catalog..." rows={4} />;
  }

  if (error) {
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={copy.retryable ? reload : undefined}
      />
    );
  }

  if (!data) return null;

  const { courses, total, modulesByCourse } = data;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = offset + courses.length;
  const allModules = courses.flatMap((course) =>
    (modulesByCourse[course.id] ?? []).map((module) => ({ course, module }))
  );
  const plannedTotal = courses.reduce(
    (sum, course) => sum + course.planned_module_count,
    0
  );
  const publishedTotal = courses.reduce(
    (sum, course) => sum + course.published_module_count,
    0
  );

  if (total === 0) {
    return (
      <EmptyState
        icon={Library}
        title="No published courses yet"
        description={
          canManage
            ? "Nothing has been published to the catalog. Create a draft course in Content Management, then publish it to make its metadata visible here."
            : "The academic catalog is empty. Courses appear here once an instructor or administrator publishes them. Nothing is fabricated to fill the space."
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Catalog summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Published Courses
              </span>
              <Library className="h-4 w-4 text-cyan-400" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">
              {total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Planned Modules
              </span>
              <Layers className="h-4 w-4 text-violet-400" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">
              {plannedTotal}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Declared by each course edition, not authored content.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Available Modules
              </span>
              <BookOpen className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">
              {publishedTotal}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Modules actually published and browsable today.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Course grid */}
      <section aria-labelledby="catalog-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="catalog-heading"
              className="font-display text-lg font-semibold text-foreground"
            >
              Courses
            </h2>
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}–{pageEnd} of {total} published course
              {total === 1 ? "" : "s"}.
            </p>
          </div>
          {total > COURSE_PAGE_LIMITS.limitDefault || total > PAGE_SIZE ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageEnd >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              modules={modulesByCourse[course.id] ?? []}
            />
          ))}
        </div>
      </section>

      {/* Published module roll-up */}
      <section id="available-modules" aria-labelledby="available-heading" className="space-y-4">
        <div>
          <h2
            id="available-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Available Modules
          </h2>
          <p className="text-xs text-muted-foreground">
            Every module published on this page of the catalog, in course and
            sequence order. Unpublished module positions are not listed.
          </p>
        </div>

        {allModules.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No modules published yet"
            description="These courses have no published modules. A course can be published before its curriculum is authored, so an empty list here is a real state, not a loading error."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/60">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-border/80 bg-surface-elevated/50">
                  <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-4 py-2.5">Module</th>
                    <th scope="col" className="px-4 py-2.5">Title</th>
                    <th scope="col" className="px-4 py-2.5">Course</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {allModules.map(({ course, module }) => (
                    <tr
                      key={module.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-cyan-500 dark:text-cyan-400">
                        {String(module.sequence).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {module.title}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {course.code}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/academics/modules/${module.id}`}>
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
