"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  MailWarning,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationNotice {
  id: string;
  title: string;
  body: string;
  href: string;
  kind: "warning" | "info" | "demo";
}

export function NotificationCenter() {
  const { user, apiMode } = useAuth();
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());

  const items = React.useMemo<NotificationNotice[]>(() => {
    if (!user) return [];
    const list: NotificationNotice[] = [];

    if (!user.email_verified) {
      list.push({
        id: "unverified-email",
        title: "Email Verification Pending",
        body: "Verify your email address before Instructor role approval or future formally assessed missions.",
        href: "/settings/profile",
        kind: "warning",
      });
    }

    if (
      user.roles.includes("administrator") &&
      user.active_role !== "administrator"
    ) {
      list.push({
        id: "admin-available",
        title: "Administrator Role Assigned",
        body: "Switch active role to Administrator with TOTP step-up when platform governance is needed.",
        href: "/settings/mfa",
        kind: "info",
      });
    }

    list.push({
      id: `session-role-${user.active_role}`,
      title: `Session Scoped to ${ROLE_METADATA[user.active_role].label}`,
      body:
        apiMode === "preview-demo"
          ? "Running in Cloud Preview Demo Mode (in-memory adapter)."
          : "Active role applies strictly to this browser session cookie.",
      href: "/settings/sessions",
      kind: "info",
    });

    list.push({
      id: "module01-preview",
      title: "Module 01 Simulation Preview Available",
      body: "Explore synthetic SOC curriculum cards while Milestone 02 simulation APIs are in development.",
      href: "/dashboard/student",
      kind: "demo",
    });

    return list;
  }, [user, apiMode]);

  const unreadCount = items.filter((item) => !readIds.has(item.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(items.map((i) => i.id)));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold">
              Security & System Notices
            </span>
            {unreadCount > 0 ? (
              <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                {unreadCount}
              </Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark read</span>
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const isUnread = !readIds.has(item.id);
            const Icon =
              item.kind === "warning"
                ? MailWarning
                : item.kind === "demo"
                ? Terminal
                : item.id === "admin-available"
                ? ShieldAlert
                : ShieldCheck;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() =>
                  setReadIds((prev) => new Set(prev).add(item.id))
                }
                className="flex items-start gap-2.5 rounded-lg p-2.5 transition-colors hover:bg-surface-elevated"
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    item.kind === "warning"
                      ? "text-amber-400"
                      : item.kind === "demo"
                      ? "text-teal-400"
                      : "text-cyan-400"
                  }`}
                />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {item.title}
                    </p>
                    {isUnread ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
