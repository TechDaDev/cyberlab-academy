"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Lock, Shield } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { ALL_ROLES, type Role } from "@/lib/types/api";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
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

export function RoleBadge({
  role,
  active = false,
  className,
}: {
  role: Role;
  active?: boolean;
  className?: string;
}) {
  const meta = ROLE_METADATA[role];
  const Icon = meta.icon;
  return (
    <Badge
      variant={meta.badgeVariant}
      className={cn(
        "gap-1 font-medium",
        active && "ring-1 ring-cyan-400/50",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{meta.label}</span>
    </Badge>
  );
}

export function RoleSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, switchRole } = useAuth();
  const [pendingRole, setPendingRole] = React.useState<Role | null>(null);

  if (!user) return null;

  // Section 12: Only assigned roles may appear in the role switcher.
  const assignedOrdered = ALL_ROLES.filter((role) => user.roles.includes(role));
  const activeMeta = ROLE_METADATA[user.active_role];
  const ActiveIcon = activeMeta.icon;

  const handleSelectRole = async (targetRole: Role) => {
    if (targetRole === user.active_role || pendingRole !== null) return;
    setPendingRole(targetRole);
    try {
      const updated = await switchRole(targetRole);
      if (updated) {
        router.push(ROLE_METADATA[updated.active_role].dashboardPath);
      }
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : "Unable to switch active role right now.";
      toast({
        title: "Role switch blocked",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setPendingRole(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Active role: ${activeMeta.label}. Switch session role`}
          className={cn(
            // Phones show the role icon only; the label appears from `sm` so the
            // collapsed top bar never overflows on a 375px viewport.
            "h-9 gap-2 border-cyan-500/30 bg-surface-elevated/70 px-2 text-xs sm:px-3 sm:text-sm",
            className
          )}
          disabled={pendingRole !== null}
        >
          {pendingRole ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          ) : (
            <ActiveIcon className="h-3.5 w-3.5 text-cyan-400" />
          )}
          <span className="hidden text-muted-foreground md:inline">Role:</span>
          <span className="hidden font-semibold text-foreground sm:inline">
            {activeMeta.label}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Session Role Context</span>
          <span className="font-mono text-[10px] text-cyan-400">
            {assignedOrdered.length} assigned
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {assignedOrdered.map((role) => {
          const meta = ROLE_METADATA[role];
          const Icon = meta.icon;
          const isCurrent = role === user.active_role;

          return (
            <DropdownMenuItem
              key={role}
              onSelect={() => {
                void handleSelectRole(role);
              }}
              className="flex items-start gap-2.5 py-2.5"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">
                    {meta.label}
                  </span>
                  {meta.requiresMfa ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                      <Shield className="h-2.5 w-2.5" /> MFA
                    </span>
                  ) : meta.requiresStepUp ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                      <Lock className="h-2.5 w-2.5" /> 5m Auth
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {meta.tagline}
                </p>
              </div>
              {isCurrent ? (
                <Check
                  aria-label="Currently active"
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {assignedOrdered.length === 1 ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
              Only the <strong className="text-foreground">{activeMeta.label}</strong>{" "}
              role is currently assigned to your account. Additional roles require
              Manager or Administrator authorization.
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
