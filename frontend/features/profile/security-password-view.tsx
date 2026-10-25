"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Eye, EyeOff, KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import { PasswordStrengthChecklist } from "@/components/shared/password-strength-checklist";
import {
  createChangePasswordSchema,
  type ChangePasswordFormValues,
} from "@/features/auth/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export function SecurityPasswordView() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, clearLocalSession, requestStepUp } = useAuth();

  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const schema = React.useMemo(
    () =>
      createChangePasswordSchema({
        email: user?.email,
        fullName: user?.full_name,
      }),
    [user?.email, user?.full_name]
  );

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_password: "",
      new_password: "",
      new_password_confirmation: "",
    },
  });

  const watchedNew = useWatch({ control, name: "new_password" });
  const watchedConfirm = useWatch({
    control,
    name: "new_password_confirmation",
  });

  if (!user) return null;

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setServerError(null);
    try {
      await usersApi.changePassword(values);
      // Backend revokes ALL sessions and clears cookie on 204
      clearLocalSession();
      toast({
        title: "Password updated",
        description:
          "All sessions were revoked for security. Sign in with your new password.",
        variant: "success",
      });
      router.replace("/login");
    } catch (err) {
      if (err instanceof ApiError) {
        for (const [field, msg] of Object.entries(err.fieldErrors)) {
          if (
            field === "current_password" ||
            field === "new_password" ||
            field === "new_password_confirmation"
          ) {
            setError(field, { message: msg });
          }
        }
        setServerError(err.detail);
      } else {
        setServerError("Unable to change password right now.");
      }
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-7">
        <CardHeader>
          <CardTitle>Change Account Password</CardTitle>
          <CardDescription>
            Submits to{" "}
            <code className="font-mono text-xs">
              POST /api/v1/users/me/password
            </code>
            . Updating your password immediately revokes every active session on
            your account and requires signing in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="sec-current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="sec-current-password"
                  type={showCurrent ? "text" : "password"}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="pr-10"
                  {...register("current_password")}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((p) => !p)}
                  aria-label={
                    showCurrent
                      ? "Hide current password"
                      : "Show current password"
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.current_password ? (
                <p role="alert" className="text-xs text-red-400">
                  {errors.current_password.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sec-new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="sec-new-password"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="12–128 characters"
                    disabled={isSubmitting}
                    className="pr-10"
                    {...register("new_password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((p) => !p)}
                    aria-label={
                      showNew ? "Hide new password" : "Show new password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.new_password ? (
                  <p role="alert" className="text-xs text-red-400">
                    {errors.new_password.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sec-confirm-password">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    id="sec-confirm-password"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="pr-10"
                    {...register("new_password_confirmation")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((p) => !p)}
                    aria-label={
                      showConfirm
                        ? "Hide password confirmation"
                        : "Show password confirmation"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.new_password_confirmation ? (
                  <p role="alert" className="text-xs text-red-400">
                    {errors.new_password_confirmation.message}
                  </p>
                ) : null}
              </div>
            </div>

            <PasswordStrengthChecklist
              password={watchedNew ?? ""}
              confirmation={watchedConfirm ?? ""}
              email={user.email}
              fullName={user.full_name}
            />

            {serverError ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Password Change Rejected</AlertTitle>
                <AlertDescription className="text-red-300">
                  {serverError}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>Update Password & Sign Out Sessions</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-5 h-fit">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <CardTitle className="text-base">
              Step-Up Reauthentication Window
            </CardTitle>
          </div>
          <CardDescription>
            Sensitive actions (MFA enrollment, Manager/Administrator role
            activation, and account governance mutations) require authentication
            within the last 5 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-surface-elevated/50 p-3.5 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <p>
              Use{" "}
              <code className="font-mono text-foreground">
                POST /api/v1/auth/reauthenticate
              </code>{" "}
              anytime to refresh your 5-minute step-up window and rotate your
              session cookie without losing your workspace context.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() =>
              requestStepUp({
                reason:
                  user.active_role === "administrator"
                    ? "recent_mfa"
                    : "recent_auth",
                contextDescription:
                  "Verify your password (and MFA code if enrolled) to refresh your 5-minute step-up authentication window.",
              })
            }
          >
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>Open Step-Up Reauthentication</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
