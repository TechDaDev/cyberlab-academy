"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { BackendModeBar } from "@/components/layout/backend-mode-bar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NotificationCenter } from "@/components/layout/notification-center";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CyberLogo } from "@/components/shared/cyber-logo";
import { ReauthModal } from "@/features/auth/reauth-modal";
import {
  getNavigationForRole,
  ROLE_METADATA,
} from "@/features/roles/role-metadata";
import { RoleBadge, RoleSwitcher } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { user, logout, requestStepUp } = useAuth();

  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpenPath, setMobileOpenPath] = React.useState<string | null>(
    null
  );
  const mobileOpen = mobileOpenPath !== null && mobileOpenPath === pathname;
  const setMobileOpen = (open: boolean) => {
    setMobileOpenPath(open ? pathname ?? "/" : null);
  };

  if (!user) return null;

  const navSections = getNavigationForRole(user.active_role);
  const activeRoleMeta = ROLE_METADATA[user.active_role];
  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Signed out",
      description: "Your current CyberLab Academy session has been closed.",
    });
    router.replace("/login");
  };

  const renderSidebarLinks = (isMobileDrawer = false) => (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-3 py-4">
      <div className="space-y-6">
        {navSections.map((section) => (
          <div key={section.heading} className="space-y-1.5">
            {(!collapsed || isMobileDrawer) && (
              <p className="px-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                {section.heading}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const baseHref = item.href.split("#")[0];
                const isActive =
                  pathname === item.href ||
                  (!item.href.includes("#") && pathname === baseHref);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed && !isMobileDrawer ? item.label : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-cyan-500/15 text-cyan-500 dark:text-cyan-300 border border-cyan-500/30 shadow-sm"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground border border-transparent",
                      collapsed && !isMobileDrawer && "justify-center px-2"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive
                          ? "text-cyan-400"
                          : "text-muted-foreground group-hover:text-cyan-400"
                      )}
                    />
                    {(!collapsed || isMobileDrawer) && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {(!collapsed || isMobileDrawer) && item.badge ? (
                      <Badge
                        variant="warning"
                        className="px-1.5 py-0 font-mono text-[9px] uppercase"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Active Role Context Panel */}
      {(!collapsed || isMobileDrawer) && (
        <div className="mt-6 rounded-xl border border-border/80 bg-surface-elevated/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Active Session Role
            </span>
            <RoleBadge role={user.active_role} active />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {activeRoleMeta.tagline}
          </p>
          {(user.active_role === "manager" ||
            user.active_role === "administrator") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() =>
                requestStepUp({
                  reason:
                    user.active_role === "administrator"
                      ? "recent_mfa"
                      : "recent_auth",
                  contextDescription:
                    "Refresh your 5-minute step-up verification window for administrative operations.",
                })
              }
            >
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
              <span>Refresh 5m Step-Up</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <BackendModeBar />

      <div className="flex flex-1 min-h-0">
        {/* Desktop Collapsible Sidebar */}
        <aside
          aria-label="Primary Sidebar Navigation"
          className={cn(
            "hidden lg:flex lg:flex-col border-r border-border/80 bg-surface/85 backdrop-blur-md transition-all duration-200 shrink-0",
            collapsed ? "lg:w-[72px]" : "lg:w-64"
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center border-b border-border/80 px-4",
              collapsed ? "justify-center" : "justify-between"
            )}
          >
            <Link href="/dashboard" aria-label="CyberLab Academy Home">
              <CyberLogo compact={collapsed} />
            </Link>
            {!collapsed ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {collapsed ? (
            <div className="flex justify-center border-b border-border/50 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {renderSidebarLinks(false)}
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl">
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                  <CyberLogo />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {renderSidebarLinks(true)}
            </aside>
          </div>
        ) : null}

        {/* Main Content Column */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden shrink-0"
                aria-label="Open navigation menu"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Breadcrumbs />
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Active Role Indicator + Secure Role Switcher */}
              <RoleSwitcher />

              <NotificationCenter />

              <ThemeToggle />

              {/* Profile Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open profile menu"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated/80 p-1 pr-2.5 text-left text-xs transition-colors hover:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 font-display text-xs font-bold text-slate-950">
                      {initials || "CL"}
                    </span>
                    <span className="hidden max-w-[130px] truncate font-medium text-foreground sm:inline">
                      {user.full_name}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                      <div className="pt-1 flex flex-wrap items-center gap-1.5">
                        <RoleBadge role={user.active_role} />
                        <Badge
                          variant={user.email_verified ? "success" : "warning"}
                          className="text-[10px]"
                        >
                          {user.email_verified ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings/profile">
                      <User className="h-4 w-4 text-cyan-400" />
                      <span>Profile & Identity</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/security">
                      <KeyRound className="h-4 w-4 text-cyan-400" />
                      <span>Password & Step-Up</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/sessions">
                      <Settings className="h-4 w-4 text-cyan-400" />
                      <span>Active Sessions</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/mfa">
                      <LockKeyhole className="h-4 w-4 text-cyan-400" />
                      <span>MFA Configuration</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleLogout();
                    }}
                    className="text-red-400 focus:text-red-300"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out of Session</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main View Canvas */}
          <main className="flex-1 cyber-radial-spotlight">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Global Step-Up Reauthentication Modal */}
      <ReauthModal />
    </div>
  );
}
