"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  MailCheck,
  ShieldAlert,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import {
  emailOnlySchema,
  type EmailOnlyFormValues,
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

export function ForgotPasswordForm() {
  const { apiMode } = useAuth();
  const [submittedState, setSubmittedState] = React.useState<{
    email: string;
    message: string;
  } | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOnlyFormValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: EmailOnlyFormValues) => {
    setServerError(null);
    setIsRateLimited(false);
    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const res = await authApi.forgotPassword({ email: normalizedEmail });
      setSubmittedState({
        email: normalizedEmail,
        message: res.message,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setIsRateLimited(err.isRateLimited);
        setServerError(err.detail);
      } else {
        setServerError("Unable to submit password reset request.");
      }
    }
  };

  if (submittedState) {
    const demoResetToken =
      apiMode === "preview-demo"
        ? previewDemoStore.getLastIssuedPreviewToken()
        : null;

    return (
      <Card className="border-cyan-500/35 bg-card/95">
        <CardHeader className="space-y-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/35 bg-cyan-500/12 text-cyan-400">
            <MailCheck className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl">Recovery Request Processed</CardTitle>
          <CardDescription>{submittedState.message}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-surface-elevated/60 p-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              For security, CyberLab Academy never discloses whether{" "}
              <strong className="text-foreground">{submittedState.email}</strong>{" "}
              is registered on the platform.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                If an active account exists, a single-use password reset link
                has been sent and expires in{" "}
                <strong className="text-foreground">30 minutes</strong>.
              </li>
              <li>
                Completing a password reset automatically revokes all active
                sessions for that account.
              </li>
            </ul>
          </div>

          {apiMode === "preview-demo" && demoResetToken ? (
            <Alert variant="warning">
              <AlertTitle>Cloud Preview Demo Shortcut</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Open the simulated password reset link generated in memory:
                </p>
                <Button asChild size="sm" variant="warning">
                  <Link
                    href={`/reset-password?token=${encodeURIComponent(
                      demoResetToken
                    )}`}
                  >
                    <span>Open Simulated Reset Link</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/login">Return to Sign In</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubmittedState(null)}
            >
              Use Different Email
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/90 bg-card/95">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Password Recovery</CardTitle>
        <CardDescription>
          Enter your email address to request a one-time 30-minute password
          reset link.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Account Email Address</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="analyst@organization.edu"
              aria-invalid={Boolean(errors.email)}
              disabled={isSubmitting}
              {...register("email")}
            />
            {errors.email ? (
              <p role="alert" className="text-xs text-red-400">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          {serverError ? (
            <Alert variant={isRateLimited ? "warning" : "destructive"}>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {isRateLimited
                  ? "Rate Limit Reached — Please Wait"
                  : "Request Could Not Be Sent"}
              </AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Send Reset Instructions</span>
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t border-border/75 pt-4 text-xs text-muted-foreground">
        <Link href="/login" className="text-cyan-400 hover:underline">
          ← Back to Sign In
        </Link>
        <Link href="/register" className="hover:text-foreground">
          Need an account?
        </Link>
      </CardFooter>
    </Card>
  );
}
