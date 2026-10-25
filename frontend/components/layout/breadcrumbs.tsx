"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Command",
  student: "Student Dashboard",
  instructor: "Instructor Dashboard",
  manager: "Manager Console",
  admin: "Administrator Control Center",
  settings: "Account Settings",
  profile: "Profile & Identity",
  security: "Password & Step-Up",
  sessions: "Active Sessions",
  mfa: "Multi-Factor Authentication",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = React.useMemo(
    () => (pathname ? pathname.split("/").filter(Boolean) : []),
    [pathname]
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden text-xs"
    >
      <Link
        href="/dashboard"
        className="inline-flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5 text-cyan-400" />
        <span className="hidden sm:inline">Workspace</span>
      </Link>
      {segments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        const label =
          SEGMENT_LABELS[segment] ??
          segment.charAt(0).toUpperCase() + segment.slice(1);

        return (
          <React.Fragment key={href}>
            {/*
             * On phones only the current page is shown. Rendering the full trail
             * there truncated the *active* crumb and left the ancestor visible,
             * which is the opposite of what a narrow breadcrumb should do.
             */}
            <ChevronRight
              className={
                isLast
                  ? "h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                  : "hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/60 sm:block"
              }
            />
            {isLast ? (
              <span
                aria-current="page"
                className="min-w-0 truncate font-medium text-foreground"
              >
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
