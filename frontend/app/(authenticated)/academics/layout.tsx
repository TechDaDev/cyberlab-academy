"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, GraduationCap, Library, PencilRuler, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface AcademicTab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Section tabs for the academic workspace.
 *
 * Tabs are selected by longest matching path prefix so `/academics/manage/cohorts`
 * is a class-management tab rather than falling back to the content-management tab
 * (whose prefix `/academics/manage` also matches). Visibility here only hides
 * affordances; every route is guarded again by `RoleRouteGuard` and by the API.
 */
export default function AcademicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.active_role;

  const canManage = role === "manager" || role === "administrator";

  const tabs = React.useMemo<AcademicTab[]>(() => {
    const items: AcademicTab[] = [
      { href: "/academics", label: "Course Catalog", icon: Library },
    ];
    if (canManage) {
      items.push({
        href: "/academics/manage",
        label: "Content Management",
        icon: PencilRuler,
      });
      items.push({
        href: "/academics/manage/cohorts",
        label: "Classes",
        icon: GraduationCap,
      });
    }
    if (role === "instructor") {
      items.push({
        href: "/academics/teach",
        label: "Teaching",
        icon: Users,
      });
    }
    if (role === "student") {
      items.push({
        href: "/academics/learn",
        label: "My Classes",
        icon: BookOpenCheck,
      });
    }
    return items;
  }, [canManage, role]);

  const activeHref = React.useMemo(() => {
    let best: string | null = null;
    for (const tab of tabs) {
      const matches =
        pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      if (matches && (best === null || tab.href.length > best.length)) {
        best = tab.href;
      }
    }
    return best;
  }, [pathname, tabs]);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Academic Catalog
        </h1>
        <p className="text-sm text-muted-foreground">
          Published curriculum, class assignments and enrollments from the
          CyberLab academic API. Class and enrollment records are always served by
          the backend — never from demonstration data.
        </p>
      </div>

      <nav
        aria-label="Academic catalog sections"
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-surface/80 p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeHref === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all sm:text-sm",
                active
                  ? "border border-cyan-500/35 bg-card text-cyan-500 shadow-xs dark:text-cyan-300"
                  : "border border-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
