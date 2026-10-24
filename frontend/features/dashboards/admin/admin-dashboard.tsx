"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText,
  KeyRound,
  Lock,
  MailPlus,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import type { AdminUserPublic, Role, SessionPublic } from "@/lib/types/api";
import { ConfirmReasonDialog } from "@/components/shared/confirm-reason-dialog";
import { PlannedFeatureCard } from "@/components/shared/planned-feature-card";
import { InstructorApplicationsPanel } from "@/features/admin/instructor-applications-panel";
import { UserDirectoryPanel } from "@/features/admin/user-directory-panel";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { RoleBadge } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminDashboard() {
  const { user, requestStepUp } = useAuth();
  const { toast } = useToast();

  const [allUsers, setAllUsers] = React.useState<AdminUserPublic[]>([]);
  const [sessions, setSessions] = React.useState<SessionPublic[]>([]);
  const [pendingAppsCount, setPendingAppsCount] = React.useState<number>(0);
  const [refreshSeq, setRefreshSeq] = React.useState<number>(0);

  // Dedicated Privileged Role Governance confirmation dialog
  const [privAction, setPrivAction] = React.useState<{
    mode: "grant" | "revoke";
    role: "manager" | "administrator";
    target: AdminUserPublic;
  } | null>(null);
  const [privSubmitting, setPrivSubmitting] = React.useState(false);
  const [privError, setPrivError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      usersApi.listSessions(),
      adminApi.listInstructorApplications("pending"),
    ])
      .then(([sessionList, pendingApps]) => {
        if (!active) return;
        setSessions(sessionList);
        setPendingAppsCount(pendingApps.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshSeq]);

  if (!user) return null;

  const currentSession = sessions.find((s) => s.current) ?? null;

  const activeUsersCount = allUsers.filter((u) => u.is_active).length;
  const verifiedUsersCount = allUsers.filter((u) => u.email_verified).length;
  const managers = allUsers.filter((u) => u.roles.includes("manager"));
  const administrators = allUsers.filter((u) =>
    u.roles.includes("administrator")
  );
  const activeAdmins = administrators.filter((u) => u.is_active);
  const verifiedNonPrivilegedCandidates = allUsers.filter(
    (u) =>
      u.is_active &&
      u.email_verified &&
      (!u.roles.includes("manager") || !u.roles.includes("administrator"))
  );

  const roleChartData: { role: string; count: number }[] = (
    ["student", "instructor", "manager", "administrator"] as Role[]
  ).map((r) => ({
    role: ROLE_METADATA[r].label,
    count: allUsers.filter((u) => u.roles.includes(r)).length,
  }));

  const handleConfirmPrivilegedChange = async (reason: string) => {
    if (!privAction) return;
    setPrivSubmitting(true);
    setPrivError(null);

    const execute = async () => {
      if (privAction.mode === "grant") {
        await adminApi.grantRole(privAction.target.id, {
          role: privAction.role,
          reason,
        });
        toast({
          title: `${ROLE_METADATA[privAction.role].label} privilege granted`,
          description: `${privAction.target.full_name} now holds the ${ROLE_METADATA[privAction.role].label} role.`,
          variant: "success",
        });
      } else {
        await adminApi.revokeRole(
          privAction.target.id,
          privAction.role,
          { reason }
        );
        toast({
          title: `${ROLE_METADATA[privAction.role].label} privilege revoked`,
          description: `Removed ${ROLE_METADATA[privAction.role].label} from ${privAction.target.full_name}.`,
          variant: "warning",
        });
      }
      setPrivAction(null);
      setRefreshSeq((n) => n + 1);
    };

    try {
      await execute();
    } catch (err) {
      if (err instanceof ApiError && err.stepUpReason) {
        setPrivAction(null);
        requestStepUp({
          reason: err.stepUpReason,
          contextDescription:
            "Administrator privilege mutations require password + TOTP MFA verification within the last 5 minutes.",
          onSuccess: async () => {
            await execute();
          },
        });
      } else {
        setPrivError(
          err instanceof ApiError
            ? err.detail
            : "Privileged role mutation failed."
        );
      }
    } finally {
      setPrivSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Distinct Administrative Control Center Banner */}
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-surface via-amber-500/10 to-amber-500/20 dark:via-slate-900/95 dark:to-amber-950/30 p-6 shadow-cyber-glow">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role="administrator" active />
              <Badge
                variant={currentSession?.mfa_verified ? "success" : "warning"}
                className="font-mono text-[10px]"
              >
                {currentSession?.mfa_verified
                  ? "MFA SESSION VERIFIED"
                  : "MFA STEP-UP REQUIRED FOR MUTATIONS"}
              </Badge>
              <Badge variant="default" className="font-mono text-[10px]">
                ACTIVE ADMINS: {activeAdmins.length}
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Administrator Security Control Center
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
              Authoritative platform governance across all accounts, Manager and
              Administrator role assignments, MFA-enforced step-up boundaries,
              and last-Administrator continuity safeguards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="warning"
              size="sm"
              onClick={() =>
                requestStepUp({
                  reason: "recent_mfa",
                  contextDescription:
                    "Verify your password and TOTP authenticator code to refresh the 5-minute Administrator step-up window.",
                  onSuccess: () => setRefreshSeq((n) => n + 1),
                })
              }
            >
              <KeyRound className="h-4 w-4" />
              <span>Re-Verify MFA Step-Up</span>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/mfa">MFA Settings</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Last-Administrator Continuity Warning when only 1 Active Admin exists */}
      {activeAdmins.length === 1 ? (
        <Alert variant="warning">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            Single Active Administrator Continuity Guard Armed
          </AlertTitle>
          <AlertDescription className="text-xs">
            Only <strong className="text-foreground">1 active Administrator</strong>{" "}
            currently exists on the platform. FastAPI enforces serialized
            PostgreSQL advisory locks (<code className="font-mono">HTTP 409</code>)
            preventing suspension or Administrator role removal of the final
            active Administrator.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Live User Statistics KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Loaded Accounts",
            value: String(allUsers.length),
            sub: `${activeUsersCount} active • ${
              allUsers.length - activeUsersCount
            } suspended`,
            icon: Users,
          },
          {
            label: "Verified Identities",
            value: String(verifiedUsersCount),
            sub: `${
              allUsers.length - verifiedUsersCount
            } awaiting email verification`,
            icon: ShieldCheck,
          },
          {
            label: "Privileged Operators",
            value: `${managers.length} MGR / ${administrators.length} ADM`,
            sub: `${activeAdmins.length} active Administrator(s)`,
            icon: Shield,
          },
          {
            label: "Pending Instructor Reviews",
            value: String(pendingAppsCount),
            sub: "Awaiting Manager or Admin decision",
            icon: UserCog,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {kpi.label}
                  </span>
                  <Badge variant="default" className="font-mono text-[10px]">
                    LIVE
                  </Badge>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <p className="font-display text-2xl font-bold text-foreground">
                    {kpi.value}
                  </p>
                  <Icon className="h-5 w-5 text-cyan-400" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Role Distribution Chart + Security Posture Overview */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Assigned Role Distribution</CardTitle>
              <Badge variant="default" className="font-mono text-[10px]">
                LIVE /admin/users
              </Badge>
            </div>
            <CardDescription>
              Live count of accounts holding each RBAC role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148, 163, 184, 0.14)"
                  />
                  <XAxis
                    dataKey="role"
                    tick={{ fill: "#CBD5E1", fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1324",
                      borderColor: "rgba(245, 158, 11, 0.4)",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Assigned Accounts"
                    fill="#38BDF8"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Security & Session Posture</CardTitle>
              <Badge variant="success" className="font-mono text-[10px]">
                ENFORCED
              </Badge>
            </div>
            <CardDescription>
              Live session status and active backend security invariants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-elevated/55 px-3.5 py-2.5">
              <span className="text-muted-foreground">
                Current Session MFA Status
              </span>
              <Badge
                variant={currentSession?.mfa_verified ? "success" : "warning"}
              >
                {currentSession?.mfa_verified
                  ? "TOTP Verified"
                  : "Step-Up Needed"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-elevated/55 px-3.5 py-2.5">
              <span className="text-muted-foreground">
                Active Sessions on Your Account
              </span>
              <Link
                href="/settings/sessions"
                className="font-mono font-semibold text-cyan-400 hover:underline"
              >
                {sessions.length} session(s) →
              </Link>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-elevated/55 px-3.5 py-2.5">
              <span className="text-muted-foreground">
                Last-Administrator Protection
              </span>
              <Badge variant="teal">
                {activeAdmins.length <= 1
                  ? "Sole Admin Locked (409 Guard)"
                  : `${activeAdmins.length} Active Admins`}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-elevated/55 px-3.5 py-2.5">
              <span className="text-muted-foreground">
                Session Transport Policy
              </span>
              <span className="font-mono text-foreground">
                HttpOnly • SameSite=Lax • Origin Guard
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dedicated Manager & Administrator Role Governance Section */}
      <div id="privileged" className="grid gap-6 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Manager Role Management ({managers.length})
              </CardTitle>
              <Badge variant="violet" className="font-mono text-[10px]">
                ADMIN ONLY
              </Badge>
            </div>
            <CardDescription>
              Grant or revoke Manager privileges for Student/Instructor
              governance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {managers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No accounts currently hold the Manager role.
              </p>
            ) : (
              managers.map((mgr) => (
                <div
                  key={mgr.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface-elevated/45 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="min-w-0 text-sm font-medium text-foreground truncate">
                      {mgr.full_name}
                    </p>
                    <p className="min-w-0 font-mono text-xs text-muted-foreground truncate">
                      {mgr.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mgr.roles.length <= 1}
                    className="h-8 text-xs text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => {
                      setPrivError(null);
                      setPrivAction({
                        mode: "revoke",
                        role: "manager",
                        target: mgr,
                      });
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Revoke Manager</span>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Administrator Role Management ({administrators.length})
              </CardTitle>
              <Badge variant="warning" className="font-mono text-[10px]">
                MFA + LAST-ADMIN GUARD
              </Badge>
            </div>
            <CardDescription>
              Manage platform Administrators. Target accounts must enroll TOTP
              MFA to activate Administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {administrators.map((adm) => {
              const isSoleActive = adm.is_active && activeAdmins.length <= 1;
              return (
                <div
                  key={adm.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface-elevated/45 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 text-sm font-medium text-foreground truncate">
                        {adm.full_name}
                      </p>
                      {isSoleActive ? (
                        <Badge variant="warning" className="shrink-0 text-[10px]">
                          Last Active Admin
                        </Badge>
                      ) : null}
                    </div>
                    <p className="min-w-0 font-mono text-xs text-muted-foreground truncate">
                      {adm.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => {
                      setPrivError(null);
                      setPrivAction({
                        mode: "revoke",
                        role: "administrator",
                        target: adm,
                      });
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Revoke Admin</span>
                  </Button>
                </div>
              );
            })}

            {verifiedNonPrivilegedCandidates.length > 0 ? (
              <div className="border-t border-border/70 pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Quick Privileged Promotion (Verified Active Accounts)
                </p>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {verifiedNonPrivilegedCandidates.slice(0, 5).map((cand) => (
                    <div
                      key={cand.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {cand.full_name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {!cand.roles.includes("manager") ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setPrivError(null);
                              setPrivAction({
                                mode: "grant",
                                role: "manager",
                                target: cand,
                              });
                            }}
                          >
                            <Plus className="h-3 w-3 text-violet-400" />
                            <span>+ Manager</span>
                          </Button>
                        ) : null}
                        {!cand.roles.includes("administrator") ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setPrivError(null);
                              setPrivAction({
                                mode: "grant",
                                role: "administrator",
                                target: cand,
                              });
                            }}
                          >
                            <Plus className="h-3 w-3 text-amber-400" />
                            <span>+ Admin</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Full User Administration Directory */}
      <UserDirectoryPanel
        actorRole="administrator"
        onUsersLoaded={setAllUsers}
        refreshTrigger={refreshSeq}
      />

      {/* Instructor Applications Oversight */}
      <InstructorApplicationsPanel
        knownUsers={allUsers}
        onDecisionCompleted={() => setRefreshSeq((n) => n + 1)}
      />

      {/* Platform Settings & Planned Capabilities Preview (Section 10: Visibly Marked Unavailable/Planned, Never Simulated) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Platform Settings & Planned Administrative Modules
            </h2>
            <p className="text-xs text-muted-foreground">
              Capabilities below are documented in the architecture roadmap and
              intentionally marked unavailable until backend endpoints are
              published.
            </p>
          </div>
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <PlannedFeatureCard
            icon={FileText}
            title="Security Audit Event Explorer"
            description="Backend mutations write immutable rows to audit_events, but no GET /api/v1/admin/audit-events endpoint is exposed in OpenAPI v0.2.0 yet."
            contractNote="Status: Backend write-only in Milestone 01B; read endpoint planned."
          />
          <PlannedFeatureCard
            icon={Sliders}
            title="Runtime Platform & Policy Controls"
            description="Controls such as MANAGER_MFA_REQUIRED, COOKIE_SECURE, ALLOWED_ORIGINS, and SMTP delivery settings are managed via server environment configuration."
            contractNote="Status: Environment-configured only; no runtime mutation endpoint."
          />
          <PlannedFeatureCard
            icon={MailPlus}
            title="Privileged Role Invitations"
            description="Out-of-band email invitations for new Managers and Administrators are deferred. Grant roles directly to verified accounts above."
            contractNote="Status: Planned in docs/MILESTONE_01B_REPORT.md §2."
          />
        </div>
      </div>

      <ConfirmReasonDialog
        open={privAction !== null}
        onOpenChange={(open) => !open && setPrivAction(null)}
        title={
          privAction
            ? `${privAction.mode === "grant" ? "Grant" : "Revoke"} ${
                ROLE_METADATA[privAction.role].label
              } Privilege`
            : "Confirm Privileged Change"
        }
        description={
          privAction
            ? `${
                privAction.mode === "grant" ? "Assigning" : "Removing"
              } ${ROLE_METADATA[privAction.role].label} ${
                privAction.mode === "grant" ? "to" : "from"
              } ${privAction.target.full_name} (${
                privAction.target.email
              }) revokes their active sessions and records an audited privilege event.`
            : ""
        }
        confirmLabel={
          privAction
            ? `${privAction.mode === "grant" ? "Grant" : "Revoke"} ${
                ROLE_METADATA[privAction.role].label
              }`
            : "Confirm"
        }
        variant={privAction?.mode === "revoke" ? "destructive" : "default"}
        isSubmitting={privSubmitting}
        errorMessage={privError}
        onConfirm={handleConfirmPrivilegedChange}
      />
    </div>
  );
}
