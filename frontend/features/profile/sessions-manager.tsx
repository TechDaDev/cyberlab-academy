"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Loader2,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import type { SessionPublic } from "@/lib/types/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { RoleBadge } from "@/features/roles/role-switcher";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";

export function SessionsManager() {
  const router = useRouter();
  const { toast } = useToast();
  const { logoutAll, clearLocalSession } = useAuth();

  const [sessions, setSessions] = React.useState<SessionPublic[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [confirmLogoutAllOpen, setConfirmLogoutAllOpen] = React.useState(false);
  const [loggingOutAll, setLoggingOutAll] = React.useState(false);

  const triggerReload = React.useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setReloadTick((n) => n + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    usersApi
      .listSessions()
      .then((list) => {
        if (!active) return;
        setSessions(list);
        setLoadError(null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Unable to load active sessions."
        );
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadTick]);

  const handleRevokeSession = async (target: SessionPublic) => {
    setRevokingId(target.id);
    try {
      await usersApi.revokeSession(target.id);
      if (target.current) {
        clearLocalSession();
        toast({
          title: "Current session revoked",
          description: "You have been signed out of this browser.",
        });
        router.replace("/login");
        return;
      }
      toast({
        title: "Session revoked",
        description: "The selected session can no longer access your account.",
        variant: "success",
      });
      triggerReload();
    } catch (err) {
      toast({
        title: "Could not revoke session",
        description:
          err instanceof ApiError ? err.detail : "Session revocation failed.",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const handleConfirmLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await logoutAll();
      toast({
        title: "Signed out of all sessions",
        description:
          "Every active session cookie for your account has been revoked.",
        variant: "success",
      });
      setConfirmLogoutAllOpen(false);
      router.replace("/login");
    } catch (err) {
      toast({
        title: "Logout-all failed",
        description:
          err instanceof ApiError
            ? err.detail
            : "Could not revoke all sessions.",
        variant: "destructive",
      });
      setLoggingOutAll(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Active Browser & Device Sessions</CardTitle>
                <Badge variant="default" className="font-mono text-[10px]">
                  LIVE /users/me/sessions
                </Badge>
              </div>
              <CardDescription>
                Each session maintains its own independent{" "}
                <code className="font-mono text-xs">active_role</code> and
                12-hour expiration window. Revoke unfamiliar sessions
                immediately.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={triggerReload}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmLogoutAllOpen(true)}
                disabled={sessions.length === 0}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out All Sessions</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <LoadingState label="Querying active sessions..." rows={3} />
          ) : loadError ? (
            <ErrorState
              title="Could Not Load Sessions"
              description={loadError}
              onRetry={triggerReload}
            />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="No active sessions found"
              description="Sign in again to create a new session."
            />
          ) : (
            <div className="space-y-3">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                    sess.current
                      ? "border-cyan-500/45 bg-cyan-500/[0.07]"
                      : "border-border/80 bg-surface-elevated/45"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <MonitorSmartphone className="h-4 w-4 text-cyan-400" />
                      <span className="font-mono text-xs font-semibold text-foreground">
                        Session {sess.id.slice(0, 14)}…
                      </span>
                      {sess.current ? (
                        <Badge variant="success">Current Session</Badge>
                      ) : null}
                      <RoleBadge role={sess.active_role} />
                      {sess.mfa_verified ? (
                        <Badge variant="teal">
                          <ShieldCheck className="h-3 w-3" />
                          <span>MFA Verified</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline">Password Only</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Started {formatDateTime(sess.created_at)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Expires {formatRelativeTime(sess.expires_at)} (
                        {formatDateTime(sess.expires_at)})
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revokingId === sess.id}
                    onClick={() => void handleRevokeSession(sess)}
                    className="shrink-0 text-red-400 hover:text-red-300"
                  >
                    {revokingId === sess.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Revoking...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>
                          {sess.current ? "Revoke & Sign Out" : "Revoke Session"}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmLogoutAllOpen}
        onOpenChange={(open) => !open && setConfirmLogoutAllOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out From All Active Sessions?</DialogTitle>
            <DialogDescription>
              Calls{" "}
              <code className="font-mono text-xs">
                POST /api/v1/auth/logout-all
              </code>{" "}
              to immediately revoke every session cookie associated with your
              account, including this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loggingOutAll}
              onClick={() => setConfirmLogoutAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loggingOutAll}
              onClick={() => void handleConfirmLogoutAll()}
            >
              {loggingOutAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Revoking All...</span>
                </>
              ) : (
                "Revoke All Sessions"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
