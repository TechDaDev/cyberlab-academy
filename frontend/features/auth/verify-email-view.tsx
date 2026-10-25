"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  MailPlus,
  ShieldAlert,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import type { Message } from "@/lib/types/api";
import {
  emailOnlySchema,
  type EmailOnlyFormValues,
} from "@/features/auth/schemas";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

// Ephemeral in-memory promise deduplicator so React StrictMode double-effects
// never submit a single-use verification token twice. Never logged or persisted.
const activeVerificationCalls = new Map<string, Promise<Message>>();

export function resetVerificationDeduplicatorForTests(): void {
  activeVerificationCalls.clear();
}

function submitSingleUseVerification(token: string): Promise<Message> {
  const existing = activeVerificationCalls.get(token);
  if (existing) return existing;
  if (activeVerificationCalls.size > 8) {
    activeVerificationCalls.clear();
  }
  const req = authApi.verifyEmail({ token });
  activeVerificationCalls.set(token, req);
  return req;
}

type VerificationViewStatus =
  | "verifying"
  | "verified"
  | "missing_or_malformed"
  | "invalid_or_expired"
  | "conflict"
  | "rate_limited"
  | "network_error";

export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const { user, isAuthenticated, refreshUser } = useAuth();

  const rawToken = searchParams?.get("token")?.trim() ?? "";
  const isTokenStructurallyValid =
    rawToken.length >= 20 && rawToken.length <= 200;

  const [asyncStatus, setAsyncStatus] = React.useState<{
    token: string;
    state: Exclude<VerificationViewStatus, "missing_or_malformed" | "verifying">;
    detail: string;
  } | null>(null);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);
  const [resendError, setResendError] = React.useState<string | null>(null);

  const status: VerificationViewStatus = !isTokenStructurallyValid
    ? "missing_or_malformed"
    : asyncStatus?.token === rawToken
    ? asyncStatus.state
    : "verifying";

  const statusDetail = !isTokenStructurallyValid
    ? "The verification link is missing a valid token parameter. Use the full link from your most recent verification email or request a fresh link below."
    : asyncStatus?.token === rawToken
    ? asyncStatus.detail
    : "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: isResending },
  } = useForm<EmailOnlyFormValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: {
      email: user?.email ?? "",
    },
  });

  React.useEffect(() => {
    let active = true;
    if (!isTokenStructurallyValid) {
      return;
    }

    submitSingleUseVerification(rawToken)
      .then(async (res) => {
        if (!active) return;
        setAsyncStatus({
          token: rawToken,
          state: "verified",
          detail: res.message,
        });
        await refreshUser();
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setAsyncStatus({
              token: rawToken,
              state: "conflict",
              detail: err.detail,
            });
          } else if (err.isRateLimited) {
            setAsyncStatus({
              token: rawToken,
              state: "rate_limited",
              detail: err.detail,
            });
          } else if (err.isBackendUnreachable) {
            setAsyncStatus({
              token: rawToken,
              state: "network_error",
              detail: err.detail,
            });
          } else {
            setAsyncStatus({
              token: rawToken,
              state: "invalid_or_expired",
              detail: err.detail,
            });
          }
        } else {
          setAsyncStatus({
            token: rawToken,
            state: "network_error",
            detail: "Unable to reach the verification service.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [isTokenStructurallyValid, rawToken, refreshUser]);

  const onResendSubmit = async (values: EmailOnlyFormValues) => {
    setResendMessage(null);
    setResendError(null);
    try {
      const res = await authApi.resendVerification({
        email: values.email.trim().toLowerCase(),
      });
      setResendMessage(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        setResendError(err.detail);
      } else {
        setResendError("Unable to request a new verification email.");
      }
    }
  };

  return (
    <Card className="border-border/90 bg-card/95">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">Email Verification</CardTitle>
          <Badge
            variant={
              status === "verified"
                ? "success"
                : status === "verifying"
                ? "default"
                : status === "invalid_or_expired" ||
                  status === "missing_or_malformed"
                ? "warning"
                : "destructive"
            }
            className="font-mono text-[10px] uppercase"
          >
            {status === "verifying"
              ? "Verifying"
              : status === "verified"
              ? "Verified"
              : status === "invalid_or_expired"
              ? "Expired / Invalid"
              : status === "missing_or_malformed"
              ? "Invalid Link"
              : status === "conflict"
              ? "Conflict"
              : "Action Needed"}
          </Badge>
        </div>
        <CardDescription>
          One-time verification links confirm ownership of your email address
          for CyberLab Academy.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {status === "verifying" ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-5"
          >
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                Validating your one-time verification token...
              </p>
              <p className="text-xs text-muted-foreground">
                Confirming cryptographic digest with the CyberLab identity service.
              </p>
            </div>
          </div>
        ) : null}

        {status === "verified" ? (
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Email Address Verified</AlertTitle>
              <AlertDescription>
                {statusDetail || "Your email address has been verified."} Your
                account is now eligible for verified platform workflows and
                Instructor review (if requested). If this verified an email
                change, sign in again with your updated email address.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated && user ? (
                <Button asChild>
                  <Link href={ROLE_METADATA[user.active_role].dashboardPath}>
                    <span>Continue to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/login">
                    <span>Sign In to Your Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {status === "invalid_or_expired" ||
        status === "missing_or_malformed" ? (
          <Alert variant="warning">
            <Clock className="h-4 w-4" />
            <AlertTitle>
              {status === "missing_or_malformed"
                ? "Invalid or Incomplete Verification Link"
                : "Verification Token Invalid or Expired"}
            </AlertTitle>
            <AlertDescription className="space-y-1.5">
              <p>
                {statusDetail ||
                  "This verification link cannot be redeemed."}
              </p>
              <p className="text-xs">
                Verification tokens expire after{" "}
                <strong className="text-foreground">60 minutes</strong>, can be
                used <strong className="text-foreground">only once</strong>, and
                are automatically invalidated whenever a newer verification
                email is requested.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "conflict" ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Email Address Unavailable</AlertTitle>
            <AlertDescription>
              {statusDetail ||
                "That email address is no longer available for verification."}
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "rate_limited" || status === "network_error" ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {status === "rate_limited"
                ? "Too Many Verification Attempts"
                : "Verification Service Unreachable"}
            </AlertTitle>
            <AlertDescription>{statusDetail}</AlertDescription>
          </Alert>
        ) : null}

        {/* Resend Verification Workflow (shown whenever not verified/verifying) */}
        {status !== "verifying" && status !== "verified" ? (
          <div className="rounded-xl border border-border/80 bg-surface-elevated/50 p-4 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-foreground">
                Request a Fresh Verification Link
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your registered email address to send a new 60-minute
                verification link. Any previous unused link will be replaced.
              </p>
            </div>

            <form
              onSubmit={handleSubmit(onResendSubmit)}
              noValidate
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="resend-verify-email">Email Address</Label>
                <Input
                  id="resend-verify-email"
                  type="email"
                  autoComplete="email"
                  placeholder="student@university.edu"
                  disabled={isResending}
                  {...register("email")}
                />
                {errors.email ? (
                  <p role="alert" className="text-xs text-red-400">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              {resendMessage ? (
                <Alert variant="info">
                  <AlertDescription>{resendMessage}</AlertDescription>
                </Alert>
              ) : null}

              {resendError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-red-300">
                    {resendError}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" variant="secondary" disabled={isResending}>
                {isResending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <MailPlus className="h-4 w-4 text-cyan-400" />
                    <span>Resend Verification Email</span>
                  </>
                )}
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t border-border/75 pt-4 text-xs text-muted-foreground">
        <Link href="/login" className="text-cyan-400 hover:underline">
          ← Back to Sign In
        </Link>
        <Link href="/register" className="hover:text-foreground">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
