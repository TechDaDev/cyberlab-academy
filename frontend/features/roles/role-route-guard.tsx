"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Lock, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/types/api";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface RoleRouteGuardProps {
  requiredRoles: Role[];
  preferredRole: Role;
  children: React.ReactNode;
}

export function RoleRouteGuard({
  requiredRoles,
  preferredRole,
  children,
}: RoleRouteGuardProps) {
  const { user, switchRole } = useAuth();
  const { toast } = useToast();
  const [switching, setSwitching] = React.useState(false);

  if (!user) return null;

  if (requiredRoles.includes(user.active_role)) {
    return <>{children}</>;
  }

  const hasPreferredAssigned = user.roles.includes(preferredRole);
  const preferredMeta = ROLE_METADATA[preferredRole];
  const currentMeta = ROLE_METADATA[user.active_role];

  const handleActivateRole = async () => {
    setSwitching(true);
    try {
      await switchRole(preferredRole);
    } catch (err) {
      toast({
        title: "Role activation blocked",
        description:
          err instanceof ApiError
            ? err.detail
            : "Could not switch active role.",
        variant: "destructive",
      });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="border-amber-500/40 bg-card/95">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/12 text-amber-400">
              {hasPreferredAssigned ? (
                <Lock className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <Badge variant="warning" className="font-mono text-[10px] uppercase">
              Active Role: {currentMeta.label}
            </Badge>
          </div>
          <CardTitle className="text-xl">
            {hasPreferredAssigned
              ? `Switch Session Role to ${preferredMeta.label}`
              : `${preferredMeta.label} Authorization Required`}
          </CardTitle>
          <CardDescription>
            {hasPreferredAssigned
              ? `Your account holds the ${preferredMeta.label} role, but this browser session is currently operating as ${currentMeta.label}. Activate ${preferredMeta.label} to continue.`
              : `This workspace requires an active ${preferredMeta.label} session. The FastAPI backend authoritatively enforces role boundaries on every request.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap items-center gap-3">
          {hasPreferredAssigned ? (
            <Button
              type="button"
              disabled={switching}
              onClick={() => void handleActivateRole()}
            >
              {switching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Switching Role...</span>
                </>
              ) : (
                <>
                  <span>Activate {preferredMeta.label} Role</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : null}

          <Button asChild variant="outline">
            <Link href={currentMeta.dashboardPath}>
              Return to {currentMeta.label} Workspace
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
