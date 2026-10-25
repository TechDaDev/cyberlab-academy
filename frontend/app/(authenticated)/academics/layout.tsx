"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, PencilRuler } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export default function AcademicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();

  const canManage =
    user?.active_role === "manager" || user?.active_role === "administrator";

  const tabs = React.useMemo(() => {
    const items = [
      {
        href: "/academics",
        label: "Course Catalog",
        icon: Library,
        exact: true,
      },
    ];
    if (canManage) {
      items.push({
        href: "/academics/manage",
        label: "Content Management",
        icon: PencilRuler,
        exact: false,
      });
    }
    return items;
  }, [canManage]);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Academic Catalog
        </h1>
        <p className="text-sm text-muted-foreground">
          Published curriculum, module sequencing and lesson availability from
          the Milestone 02A academic catalog.
        </p>
      </div>

      <nav
        aria-label="Academic catalog sections"
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-surface/80 p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.exact
            ? pathname === tab.href ||
              (pathname.startsWith(tab.href + "/") &&
                !pathname.startsWith("/academics/manage"))
            : pathname === tab.href || pathname.startsWith(tab.href + "/");

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
