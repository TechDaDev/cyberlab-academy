"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  MailWarning,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import { usersApi } from "@/lib/api/users";
import { ALL_ROLES, type Role } from "@/lib/types/api";
import {
  changeEmailSchema,
  profileUpdateSchema,
  type ChangeEmailFormValues,
  type ProfileUpdateFormValues,
} from "@/features/auth/schemas";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

export function ProfileSettingsView() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, apiMode, refreshUser, switchRole } = useAuth();

  const [fetchedRoles, setFetchedRoles] = React.useState<Role[] | null>(null);
  const [switchingRole, setSwitchingRole] = React.useState<Role | null>(null);
  const [resendingVerify, setResendingVerify] = React.useState(false);

  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [emailChangeMessage, setEmailChangeMessage] = React.useState<
    string | null
  >(null);
  const [emailChangeError, setEmailChangeError] = React.useState<string | null>(
    null
  );
  const [showEmailPassword, setShowEmailPassword] = React.useState(false);

  const profileForm = useForm<ProfileUpdateFormValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      full_name: user?.full_name ?? "",
    },
  });

  const emailForm = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      new_email: "",
      password: "",
    },
  });

  React.useEffect(() => {
    if (user) {
      profileForm.reset({ full_name: user.full_name });
    }
  }, [user, profileForm]);

  // Also query authoritative GET /users/me/roles endpoint
  React.useEffect(() => {
    let active = true;
    usersApi
      .getAssignedRoles()
      .then((roles) => {
        if (active) setFetchedRoles(roles);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.roles]);

  if (!user) return null;

  const onUpdateName = async (values: ProfileUpdateFormValues) => {
    setProfileError(null);
    try {
      await usersApi.updateProfile({ full_name: values.full_name.trim() });
      await refreshUser();
      toast({
        title: "Profile updated",
        description: "Your full name has been saved.",
        variant: "success",
      });
    } catch (err) {
      setProfileError(
        err instanceof ApiError ? err.detail : "Failed to update full name."
      );
    }
  };

  const onChangeEmail = async (values: ChangeEmailFormValues) => {
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      const res = await usersApi.changeEmail({
        new_email: values.new_email.trim().toLowerCase(),
        password: values.password,
      });
      setEmailChangeMessage(res.message);
      emailForm.reset({ new_email: "", password: "" });
      toast({
        title: "Email change requested",
        description: res.message,
      });
    } catch (err) {
      setEmailChangeError(
        err instanceof ApiError ? err.detail : "Unable to request email change."
      );
    }
  };

  const handleResendVerification = async () => {
    setResendingVerify(true);
    try {
      const res = await authApi.resendVerification({ email: user.email });
      toast({
        title: "Verification link requested",
        description: res.message,
      });
    } catch (err) {
      toast({
        title: "Resend failed",
        description:
          err instanceof ApiError
            ? err.detail
            : "Could not resend verification email.",
        variant: "destructive",
      });
    } finally {
      setResendingVerify(false);
    }
  };

  const handleActivateRole = async (role: Role) => {
    if (role === user.active_role || switchingRole) return;
    setSwitchingRole(role);
    try {
      const updated = await switchRole(role);
      if (updated) {
        router.push(ROLE_METADATA[updated.active_role].dashboardPath);
      }
    } catch (err) {
      toast({
        title: "Could not switch role",
        description:
          err instanceof ApiError
            ? err.detail
            : "Role switch request rejected.",
        variant: "destructive",
      });
    } finally {
      setSwitchingRole(null);
    }
  };

  const assignedRoles = fetchedRoles ?? user.roles;
  const orderedAssignedRoles = ALL_ROLES.filter((r) =>
    assignedRoles.includes(r)
  );
  const demoChangeToken =
    apiMode === "preview-demo" && emailChangeMessage
      ? previewDemoStore.getLastIssuedPreviewToken()
      : null;

  return (
    <div className="space-y-6">
      {/* Personal Identity Overview */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Personal Identity Summary</CardTitle>
              <CardDescription>
                Authoritative account metadata returned by{" "}
                <code className="font-mono text-xs">GET /api/v1/users/me</code>
              </CardDescription>
            </div>
            <Badge
              variant={user.email_verified ? "success" : "warning"}
              className="font-mono text-[10px]"
            >
              {user.email_verified ? "EMAIL VERIFIED" : "UNVERIFIED EMAIL"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-lg border border-border/75 bg-surface-elevated/45 p-3">
              <p className="text-muted-foreground">Account ID</p>
              <p className="mt-1 font-mono font-semibold text-foreground break-all">
                {user.id}
              </p>
            </div>
            <div className="rounded-lg border border-border/75 bg-surface-elevated/45 p-3">
              <p className="text-muted-foreground">Primary Email</p>
              <p className="mt-1 font-mono font-semibold text-foreground break-all">
                {user.email}
              </p>
            </div>
            <div className="rounded-lg border border-border/75 bg-surface-elevated/45 p-3">
              <p className="text-muted-foreground">Active Session Role</p>
              <div className="mt-1">
                <RoleBadge role={user.active_role} active />
              </div>
            </div>
            <div className="rounded-lg border border-border/75 bg-surface-elevated/45 p-3">
              <p className="text-muted-foreground">Member Since</p>
              <p className="mt-1 font-medium text-foreground">
                {formatDateTime(user.created_at)}
              </p>
            </div>
          </div>

          {!user.email_verified ? (
            <Alert variant="warning">
              <MailWarning className="h-4 w-4" />
              <AlertTitle>Email Address Not Yet Verified</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Open the verification link sent to{" "}
                  <strong className="text-foreground">{user.email}</strong> or
                  request a replacement 60-minute link.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="warning"
                  disabled={resendingVerify}
                  onClick={() => void handleResendVerification()}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      resendingVerify ? "animate-spin" : ""
                    }`}
                  />
                  <span>Resend Verification</span>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit Full Name + Change Email */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit Full Name</CardTitle>
            <CardDescription>
              Updates your display name across CyberLab Academy (2–160
              characters).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={profileForm.handleSubmit(onUpdateName)}
              noValidate
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="profile-full-name">Full Name</Label>
                <Input
                  id="profile-full-name"
                  maxLength={160}
                  disabled={profileForm.formState.isSubmitting}
                  {...profileForm.register("full_name")}
                />
                {profileForm.formState.errors.full_name ? (
                  <p role="alert" className="text-xs text-red-400">
                    {profileForm.formState.errors.full_name.message}
                  </p>
                ) : null}
              </div>

              {profileError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-red-300">
                    {profileError}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                disabled={profileForm.formState.isSubmitting}
              >
                {profileForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Full Name</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Email Address</CardTitle>
            <CardDescription>
              Sends a 60-minute verification link to the new address. Your email
              changes only after that link is verified, which also revokes
              existing sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={emailForm.handleSubmit(onChangeEmail)}
              noValidate
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="change-new-email">New Email Address</Label>
                <Input
                  id="change-new-email"
                  type="email"
                  autoComplete="email"
                  placeholder="new.address@organization.edu"
                  disabled={emailForm.formState.isSubmitting}
                  {...emailForm.register("new_email")}
                />
                {emailForm.formState.errors.new_email ? (
                  <p role="alert" className="text-xs text-red-400">
                    {emailForm.formState.errors.new_email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="change-email-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="change-email-password"
                    type={showEmailPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Confirm current password"
                    disabled={emailForm.formState.isSubmitting}
                    className="pr-10"
                    {...emailForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailPassword((prev) => !prev)}
                    aria-label={
                      showEmailPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showEmailPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {emailForm.formState.errors.password ? (
                  <p role="alert" className="text-xs text-red-400">
                    {emailForm.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              {emailChangeMessage ? (
                <Alert variant="info">
                  <MailCheck className="h-4 w-4" />
                  <AlertTitle>Verification Dispatched (If Eligible)</AlertTitle>
                  <AlertDescription className="space-y-2 text-xs">
                    <p>{emailChangeMessage}</p>
                    {demoChangeToken ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="warning"
                        onClick={() =>
                          router.push(
                            `/verify-email?token=${encodeURIComponent(
                              demoChangeToken
                            )}`
                          )
                        }
                      >
                        Open Simulated Email-Change Verification Link
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {emailChangeError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-red-300">
                    {emailChangeError}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                variant="secondary"
                disabled={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  "Send Verification to New Email"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Roles & Session Role Switcher */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Assigned Roles & Session Context</CardTitle>
              <CardDescription>
                Loaded from{" "}
                <code className="font-mono text-xs">
                  GET /api/v1/users/me/roles
                </code>
                . Switching active role updates only this browser session and
                rotates your session cookie.
              </CardDescription>
            </div>
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {orderedAssignedRoles.map((role) => {
            const meta = ROLE_METADATA[role];
            const isActive = user.active_role === role;
            return (
              <div
                key={role}
                className={`flex flex-col justify-between rounded-xl border p-4 space-y-3 ${
                  isActive
                    ? "border-cyan-500/50 bg-cyan-500/[0.08]"
                    : "border-border/80 bg-surface-elevated/45"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <RoleBadge role={role} active={isActive} />
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        ACTIVE IN THIS SESSION
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {meta.tagline}
                  </p>
                  <ul className="space-y-1 text-xs text-foreground/85 pt-1">
                    {meta.capabilities.map((cap) => (
                      <li key={cap} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-cyan-400 shrink-0" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  {isActive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(meta.dashboardPath)}
                    >
                      Open {meta.label} Workspace
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={switchingRole !== null}
                      onClick={() => void handleActivateRole(role)}
                    >
                      {switchingRole === role ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Activating...</span>
                        </>
                      ) : (
                        `Activate ${meta.label} Role`
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
