"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LockKeyhole, MonitorSmartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  {
    href: "/settings/profile",
    label: "Profile & Roles",
    icon: User,
  },
  {
    href: "/settings/security",
    label: "Password & Step-Up",
    icon: KeyRound,
  },
  {
    href: "/settings/sessions",
    label: "Active Sessions",
    icon: MonitorSmartphone,
  },
  {
    href: "/settings/mfa",
    label: "Multi-Factor Auth",
    icon: LockKeyhole,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Account & Security Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your CyberLab Academy identity, assigned roles, active browser
          sessions, and TOTP multi-factor authentication.
        </p>
      </div>

      <nav
        aria-label="Account settings sections"
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-surface/80 p-1.5"
      >
        {SETTINGS_NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-medium transition-all",
                active
                  ? "bg-card text-cyan-500 dark:text-cyan-300 border border-cyan-500/35 shadow-sm"
                  : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground border border-transparent"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
