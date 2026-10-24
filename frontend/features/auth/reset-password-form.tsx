"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { PasswordStrengthChecklist } from "@/components/shared/password-strength-checklist";
import { scrubOneTimeTokenFromUrl } from "@/lib/scrub-token-url";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/features/auth/schemas";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { clearLocalSession } = useAuth();
  // Capture the reset token once and remove it from the address bar; the form keeps
  // using the captured value for its single submission.
  const [rawToken] = React.useState(() => searchParams?.get("token")?.trim() ?? "");
  React.useEffect(() => {
    if (rawToken) scrubOneTimeTokenFromUrl();
  }, [rawToken]);

  const isTokenPresent = rawToken.length >= 20 && rawToken.length <= 200;

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [completedMessage, setCompletedMessage] = React.useState<string | null>(
    null
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [tokenExpiredError, setTokenExpiredError] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      password_confirmation: "",
    },
  });

  const watchedPassword = useWatch({ control, name: "password" });
  const watchedConfirm = useWatch({ control, name: "password_confirmation" });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!isTokenPresent) return;
    setServerError(null);
    setTokenExpiredError(false);

    try {
      const res = await authApi.resetPassword({
        token: rawToken,
        password: values.password,
        password_confirmation: values.password_confirmation,
      });
      clearLocalSession();
      setCompletedMessage(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setTokenExpiredError(true);
        }
        for (const [field, msg] of Object.entries(err.fieldErrors)) {
          if (field === "password" || field === "password_confirmation") {
            setError(field, { message: msg });
          }
        }
        setServerError(err.detail);
      } else {
        setServerError("Password reset could not be completed.");
      }
    }
  };

  if (completedMessage) {
    return (
      <Card className="border-emerald-500/35 bg-card/95">
        <CardHeader className="space-y-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/12 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl">Password Reset Complete</CardTitle>
          <CardDescription>{completedMessage}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            All previous sessions for your account have been revoked on the
            server. Sign in with your new password to start a fresh session.
          </p>
          <Button asChild>
            <Link href="/login">
              <span>Sign In with New Password</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/90 bg-card/95">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Set a New Password</CardTitle>
        <CardDescription>
          Choose a strong 12–128 character password. Completing this step
          revokes all existing sessions for your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isTokenPresent ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Invalid or Missing Reset Link</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                This page requires a valid single-use reset token from your
                recovery email. Reset links expire after 30 minutes.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/forgot-password">Request a New Reset Link</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reset-password">New Password</Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="12–128 characters"
                  aria-invalid={Boolean(errors.password)}
                  disabled={isSubmitting}
                  className="pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password ? (
                <p role="alert" className="text-xs text-red-400">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="reset-password-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  aria-invalid={Boolean(errors.password_confirmation)}
                  disabled={isSubmitting}
                  className="pr-10"
                  {...register("password_confirmation")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
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
              {errors.password_confirmation ? (
                <p role="alert" className="text-xs text-red-400">
                  {errors.password_confirmation.message}
                </p>
              ) : null}
            </div>

            <PasswordStrengthChecklist
              password={watchedPassword ?? ""}
              confirmation={watchedConfirm ?? ""}
            />

            {serverError ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Reset Failed</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="text-red-300">{serverError}</p>
                  {tokenExpiredError ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/forgot-password">
                        Request a Fresh Reset Link
                      </Link>
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>Reset Password</span>
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t border-border/75 pt-4 text-xs text-muted-foreground">
        <Link href="/login" className="text-cyan-400 hover:underline">
          ← Back to Sign In
        </Link>
        <Link href="/forgot-password" className="hover:text-foreground">
          Request another link
        </Link>
      </CardFooter>
    </Card>
  );
}
