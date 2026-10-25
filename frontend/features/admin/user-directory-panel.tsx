"use client";

import * as React from "react";
import {
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import {
  ALL_ROLES,
  MANAGER_GOVERNABLE_ROLES,
  type AdminUserPublic,
  type Role,
} from "@/lib/types/api";
import { ConfirmReasonDialog } from "@/components/shared/confirm-reason-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { RoleBadge } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDate } from "@/lib/utils";

interface UserDirectoryPanelProps {
  actorRole: "manager" | "administrator";
  presetRoleFilter?: Role | "";
  onUsersLoaded?: (users: AdminUserPublic[]) => void;
  refreshTrigger?: number;
}

type PendingMutation =
  | { kind: "suspend"; target: AdminUserPublic }
  | { kind: "reactivate"; target: AdminUserPublic }
  | { kind: "revoke_role"; target: AdminUserPublic; role: Role };

export function UserDirectoryPanel({
  actorRole,
  presetRoleFilter = "",
  onUsersLoaded,
  refreshTrigger = 0,
}: UserDirectoryPanelProps) {
  const { user: currentUser, requestStepUp } = useAuth();
  const { toast } = useToast();

  // STRICT AUTHORIZATION VISIBILITY RULE (Section 9):
  // Managers may ONLY filter, grant, or revoke Student and Instructor roles.
  const governableRoles: readonly Role[] =
    actorRole === "administrator" ? ALL_ROLES : MANAGER_GOVERNABLE_ROLES;

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<Role | "">(presetRoleFilter);
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "active" | "suspended"
  >("all");

  const [users, setUsers] = React.useState<AdminUserPublic[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [localReloadTick, setLocalReloadTick] = React.useState(0);

  const [pendingMutation, setPendingMutation] =
    React.useState<PendingMutation | null>(null);
  const [mutationSubmitting, setMutationSubmitting] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string | null>(null);

  // Grant Role Dialog state
  const [grantTarget, setGrantTarget] = React.useState<AdminUserPublic | null>(
    null
  );
  const [grantRoleChoice, setGrantRoleChoice] = React.useState<Role>("instructor");
  const [grantReason, setGrantReason] = React.useState("");
  const [grantError, setGrantError] = React.useState<string | null>(null);
  const [grantSubmitting, setGrantSubmitting] = React.useState(false);

  const triggerReload = React.useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setLocalReloadTick((n) => n + 1);
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
    }, 220);
    return () => clearTimeout(handle);
  }, [search]);

  React.useEffect(() => {
    let active = true;
    const safeRoleFilter =
      roleFilter && governableRoles.includes(roleFilter) ? roleFilter : "";

    adminApi
      .listUsers({
        search: debouncedSearch,
        role: safeRoleFilter,
        active: activeFilter === "all" ? null : activeFilter === "active",
      })
      .then((list) => {
        if (!active) return;
        setUsers(list);
        setLoadError(null);
        setIsLoading(false);
        onUsersLoaded?.(list);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.stepUpReason) {
          requestStepUp({
            reason: err.stepUpReason,
            contextDescription:
              "Step-up verification is required to inspect administrative user records.",
            onSuccess: () => triggerReload(),
          });
        }
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Unable to load user directory from /api/v1/admin/users."
        );
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activeFilter,
    debouncedSearch,
    governableRoles,
    localReloadTick,
    onUsersLoaded,
    refreshTrigger,
    requestStepUp,
    roleFilter,
    triggerReload,
  ]);

  const activeAdminCount = React.useMemo(
    () =>
      users.filter(
        (u) => u.is_active && u.roles.includes("administrator")
      ).length,
    [users]
  );

  const canActorMutateTarget = (target: AdminUserPublic): boolean => {
    if (actorRole === "administrator") return true;
    // Managers must NEVER be offered controls to suspend/reactivate/modify Manager or Administrator accounts
    return (
      !target.roles.includes("manager") &&
      !target.roles.includes("administrator")
    );
  };

  const openGrantDialog = (target: AdminUserPublic) => {
    const assignable = governableRoles.filter(
      (r) => !target.roles.includes(r)
    );
    if (assignable.length === 0) return;
    setGrantTarget(target);
    setGrantRoleChoice(assignable[0]);
    setGrantReason("");
    setGrantError(null);
  };

  const executePendingMutation = async (reason: string) => {
    if (!pendingMutation) return;
    setMutationSubmitting(true);
    setMutationError(null);

    const runAction = async () => {
      if (pendingMutation.kind === "suspend") {
        await adminApi.suspendUser(pendingMutation.target.id, { reason });
        toast({
          title: "Account suspended",
          description: `${pendingMutation.target.full_name} suspended and active sessions revoked.`,
          variant: "warning",
        });
      } else if (pendingMutation.kind === "reactivate") {
        await adminApi.reactivateUser(pendingMutation.target.id, { reason });
        toast({
          title: "Account reactivated",
          description: `${pendingMutation.target.full_name} can sign in again.`,
          variant: "success",
        });
      } else if (pendingMutation.kind === "revoke_role") {
        await adminApi.revokeRole(
          pendingMutation.target.id,
          pendingMutation.role,
          { reason }
        );
        toast({
          title: `${ROLE_METADATA[pendingMutation.role].label} role revoked`,
          description: `Updated roles for ${pendingMutation.target.full_name}.`,
          variant: "warning",
        });
      }
      setPendingMutation(null);
      triggerReload();
    };

    try {
      await runAction();
    } catch (err) {
      if (err instanceof ApiError && err.stepUpReason) {
        setPendingMutation(null);
        requestStepUp({
          reason: err.stepUpReason,
          contextDescription:
            "Administrative mutations require password authentication within the last 5 minutes (and recent MFA for Administrators).",
          onSuccess: async () => {
            await runAction();
          },
        });
      } else {
        setMutationError(
          err instanceof ApiError
            ? err.detail
            : "Administrative operation failed."
        );
      }
    } finally {
      setMutationSubmitting(false);
    }
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantTarget) return;
    const trimmedReason = grantReason.trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 500) {
      setGrantError("Audit reason must be between 3 and 500 characters.");
      return;
    }
    if (!governableRoles.includes(grantRoleChoice)) {
      setGrantError("You are not authorized to assign that role.");
      return;
    }

    setGrantSubmitting(true);
    setGrantError(null);

    const runGrant = async () => {
      await adminApi.grantRole(grantTarget.id, {
        role: grantRoleChoice,
        reason: trimmedReason,
      });
      toast({
        title: `${ROLE_METADATA[grantRoleChoice].label} role granted`,
        description: `Assigned ${ROLE_METADATA[grantRoleChoice].label} to ${grantTarget.full_name}.`,
        variant: "success",
      });
      setGrantTarget(null);
      triggerReload();
    };

    try {
      await runGrant();
    } catch (err) {
      if (err instanceof ApiError && err.stepUpReason) {
        setGrantTarget(null);
        requestStepUp({
          reason: err.stepUpReason,
          contextDescription:
            "Role assignment requires recent 5-minute step-up verification.",
          onSuccess: async () => {
            await runGrant();
          },
        });
      } else {
        setGrantError(
          err instanceof ApiError ? err.detail : "Failed to grant role."
        );
      }
    } finally {
      setGrantSubmitting(false);
    }
  };

  return (
    <>
      <Card id="users">
        <CardHeader className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>
                  {actorRole === "administrator"
                    ? "Platform User & Role Administration"
                    : "Student & Instructor Account Directory"}
                </CardTitle>
                <Badge variant="default" className="font-mono text-[10px]">
                  LIVE /admin/users
                </Badge>
              </div>
              <CardDescription>
                {actorRole === "administrator"
                  ? "Search accounts, manage Student/Instructor/Manager/Administrator roles, and enforce account status controls."
                  : "Manage Student and Instructor accounts. Privileged Manager and Administrator accounts are restricted to Administrators."}
              </CardDescription>
            </div>
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
          </div>

          {/* Search & Filters */}
          <div className="grid gap-3 md:grid-cols-12">
            <div className="relative md:col-span-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by full name or email..."
                aria-label="Search accounts"
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 md:col-span-4">
              <Button
                type="button"
                size="sm"
                variant={roleFilter === "" ? "default" : "outline"}
                className="h-9 text-xs"
                onClick={() => setRoleFilter("")}
              >
                All Roles
              </Button>
              {governableRoles.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={roleFilter === r ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => setRoleFilter(r)}
                >
                  {ROLE_METADATA[r].label}
                </Button>
              ))}
            </div>

            <div className="flex items-center justify-start md:justify-end gap-1.5 md:col-span-3">
              {(["all", "active", "suspended"] as const).map((statusOpt) => (
                <Button
                  key={statusOpt}
                  type="button"
                  size="sm"
                  variant={activeFilter === statusOpt ? "secondary" : "ghost"}
                  className="h-9 px-2.5 text-xs capitalize"
                  onClick={() => setActiveFilter(statusOpt)}
                >
                  {statusOpt}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <LoadingState label="Querying /api/v1/admin/users..." rows={4} />
          ) : loadError ? (
            <ErrorState
              title="Directory Query Failed"
              description={loadError}
              onRetry={triggerReload}
            />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No matching accounts found"
              description="Adjust your search term, role filter, or account status filter."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearch("");
                setRoleFilter("");
                setActiveFilter("all");
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Account</th>
                    <th className="py-3 px-4 font-medium">Verification & Status</th>
                    <th className="py-3 px-4 font-medium">Assigned Roles</th>
                    <th className="py-3 pl-4 font-medium text-right">
                      Governance Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 align-top">
                  {users.map((acct) => {
                    const isSelf = currentUser?.id === acct.id;
                    const mutable = canActorMutateTarget(acct);
                    const assignableForRow = mutable
                      ? governableRoles.filter((r) => !acct.roles.includes(r))
                      : [];
                    const isSoleActiveAdmin =
                      acct.is_active &&
                      acct.roles.includes("administrator") &&
                      activeAdminCount <= 1;

                    return (
                      <tr
                        key={acct.id}
                        className="hover:bg-surface-elevated/35 transition-colors"
                      >
                        <td className="py-3.5 pr-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {acct.full_name}
                              </span>
                              {isSelf ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0"
                                >
                                  You
                                </Badge>
                              ) : null}
                            </div>
                            <p className="font-mono text-xs text-muted-foreground">
                              {acct.email}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground/75">
                              Created {formatShortDate(acct.created_at)}
                            </p>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant={acct.is_active ? "success" : "destructive"}
                            >
                              {acct.is_active ? "Active" : "Suspended"}
                            </Badge>
                            <Badge
                              variant={
                                acct.email_verified ? "teal" : "warning"
                              }
                            >
                              {acct.email_verified ? "Verified" : "Unverified"}
                            </Badge>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {acct.roles.map((r) => {
                              const canRevokeThisRole =
                                mutable &&
                                governableRoles.includes(r) &&
                                acct.roles.length > 1;
                              return (
                                <span
                                  key={r}
                                  className="inline-flex items-center gap-1"
                                >
                                  <RoleBadge role={r} />
                                  {canRevokeThisRole ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMutationError(null);
                                        setPendingMutation({
                                          kind: "revoke_role",
                                          target: acct,
                                          role: r,
                                        });
                                      }}
                                      aria-label={`Revoke ${ROLE_METADATA[r].label} role from ${acct.full_name}`}
                                      title={`Revoke ${ROLE_METADATA[r].label}`}
                                      className="rounded-full border border-border bg-surface-elevated p-0.5 text-muted-foreground hover:border-red-500/50 hover:text-red-400"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                          {isSoleActiveAdmin ? (
                            <p className="mt-1.5 font-mono text-[10px] text-amber-400">
                              Protected: Last active Administrator
                            </p>
                          ) : null}
                        </td>

                        <td className="py-3.5 pl-4 text-right">
                          {mutable ? (
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              {assignableForRow.length > 0 ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => openGrantDialog(acct)}
                                >
                                  <Plus className="h-3.5 w-3.5 text-cyan-400" />
                                  <span>Grant Role</span>
                                </Button>
                              ) : null}

                              {acct.is_active ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-red-400 hover:text-red-300"
                                  onClick={() => {
                                    setMutationError(null);
                                    setPendingMutation({
                                      kind: "suspend",
                                      target: acct,
                                    });
                                  }}
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                  <span>Suspend</span>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => {
                                    setMutationError(null);
                                    setPendingMutation({
                                      kind: "reactivate",
                                      target: acct,
                                    });
                                  }}
                                >
                                  <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Reactivate</span>
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              Admin-governed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspend / Reactivate / Revoke Role Confirmation Dialog */}
      <ConfirmReasonDialog
        open={pendingMutation !== null}
        onOpenChange={(open) => !open && setPendingMutation(null)}
        title={
          pendingMutation?.kind === "suspend"
            ? `Suspend ${pendingMutation.target.full_name}`
            : pendingMutation?.kind === "reactivate"
            ? `Reactivate ${pendingMutation.target.full_name}`
            : pendingMutation?.kind === "revoke_role"
            ? `Revoke ${ROLE_METADATA[pendingMutation.role].label} Role`
            : "Confirm Action"
        }
        description={
          pendingMutation?.kind === "suspend"
            ? `Suspending ${pendingMutation.target.email} immediately revokes all active sessions and prevents sign-in until reactivated.`
            : pendingMutation?.kind === "reactivate"
            ? `Reactivating ${pendingMutation.target.email} restores sign-in eligibility with their existing assigned roles.`
            : pendingMutation?.kind === "revoke_role"
            ? `Revoking the ${ROLE_METADATA[pendingMutation.role].label} role from ${pendingMutation.target.email} immediately revokes their active sessions.`
            : ""
        }
        confirmLabel={
          pendingMutation?.kind === "suspend"
            ? "Confirm Suspension"
            : pendingMutation?.kind === "reactivate"
            ? "Confirm Reactivation"
            : "Confirm Role Revocation"
        }
        variant={
          pendingMutation?.kind === "reactivate" ? "default" : "destructive"
        }
        isSubmitting={mutationSubmitting}
        errorMessage={mutationError}
        onConfirm={executePendingMutation}
      />

      {/* Grant Role Modal */}
      <Dialog
        open={grantTarget !== null}
        onOpenChange={(open) => !open && setGrantTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Grant Role to {grantTarget?.full_name ?? "Account"}
            </DialogTitle>
            <DialogDescription>
              Assigning a role immediately rotates/revokes existing sessions on
              the target account and logs an immutable audit event.
            </DialogDescription>
          </DialogHeader>

          {grantTarget ? (
            <form onSubmit={handleGrantSubmit} className="space-y-4">
              {!grantTarget.email_verified ? (
                <Alert variant="warning">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This account has not verified its email address yet. FastAPI
                    rejects privileged role grants (Instructor, Manager,
                    Administrator) until email is verified.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label>Select Role to Assign</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {governableRoles
                    .filter((r) => !grantTarget.roles.includes(r))
                    .map((r) => {
                      const meta = ROLE_METADATA[r];
                      const selected = grantRoleChoice === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setGrantRoleChoice(r)}
                          className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                            selected
                              ? "border-cyan-500 bg-cyan-500/12"
                              : "border-border bg-surface-elevated/50 hover:border-cyan-500/40"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="font-display text-sm font-semibold">
                              {meta.label}
                            </span>
                            {selected ? (
                              <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                            ) : null}
                          </div>
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {meta.tagline}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="grant-role-reason">
                    Administrative Audit Reason
                  </Label>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {grantReason.trim().length}/500
                  </span>
                </div>
                <Textarea
                  id="grant-role-reason"
                  value={grantReason}
                  onChange={(e) => {
                    setGrantReason(e.target.value);
                    if (grantError) setGrantError(null);
                  }}
                  placeholder="Document authorization basis (3–500 characters)..."
                  maxLength={500}
                  disabled={grantSubmitting}
                  required
                />
              </div>

              {grantError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-red-300">
                    {grantError}
                  </AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={grantSubmitting}
                  onClick={() => setGrantTarget(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={grantSubmitting}>
                  {grantSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Granting...</span>
                    </>
                  ) : (
                    `Grant ${ROLE_METADATA[grantRoleChoice].label}`
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
