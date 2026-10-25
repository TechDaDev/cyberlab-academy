"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { previewDemoStore } from "@/lib/api/preview-demo-adapter";
import { PasswordStrengthChecklist } from "@/components/shared/password-strength-checklist";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/features/auth/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const { toast } = useToast();
  const { apiMode } = useAuth();

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = React.useState(false);
  const [acceptedSubmission, setAcceptedSubmission] = React.useState<{
    email: string;
    serverMessage: string;
    requestedInstructor: boolean;
  } | null>(null);
  const [resending, setResending] = React.useState(false);
  const [resendFeedback, setResendFeedback] = React.useState<string | null>(
    null
  );

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      password_confirmation: "",
      instructor_application: false,
    },
  });

  const watchedFullName = useWatch({ control, name: "full_name" });
  const watchedEmail = useWatch({ control, name: "email" });
  const watchedPassword = useWatch({ control, name: "password" });
  const watchedConfirm = useWatch({ control, name: "password_confirmation" });
  const watchedInstructor = useWatch({
    control,
    name: "instructor_application",
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    setIsRateLimited(false);

    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const response = await authApi.register({
        full_name: values.full_name.trim(),
        email: normalizedEmail,
        password: values.password,
        password_confirmation: values.password_confirmation,
        instructor_application: values.instructor_application,
      });

      // Section 5: HTTP 202 response is intentionally generic to prevent account enumeration.
      // Never assume a new account was definitely created based only on 202.
      setAcceptedSubmission({
        email: normalizedEmail,
        serverMessage: response.message,
        requestedInstructor: values.instructor_application,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setIsRateLimited(err.isRateLimited);
        for (const [field, msg] of Object.entries(err.fieldErrors)) {
          if (
            field === "full_name" ||
            field === "email" ||
            field === "password" ||
            field === "password_confirmation"
          ) {
            setError(field, { message: msg });
          }
        }
        setServerError(err.detail);
      } else {
        setServerError("Registration request failed. Please try again.");
      }
    }
  };

  const handleResend = async () => {
    if (!acceptedSubmission || resending) return;
    setResending(true);
    setResendFeedback(null);
    try {
      const res = await authApi.resendVerification({
        email: acceptedSubmission.email,
      });
      setResendFeedback(res.message);
      toast({
        title: "Verification request processed",
        description: res.message,
      });
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : "Unable to resend verification right now.";
      setResendFeedback(detail);
    } finally {
      setResending(false);
    }
  };

  if (acceptedSubmission) {
    const demoToken =
      apiMode === "preview-demo"
        ? previewDemoStore.getLastIssuedPreviewToken()
        : null;

    return (
      <Card className="border-cyan-500/35 bg-card/95">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/35 bg-cyan-500/12 text-cyan-400">
              <MailCheck className="h-5 w-5" />
            </div>
            <Badge variant="default" className="font-mono text-[10px]">
              HTTP 202 ACCEPTED
            </Badge>
          </div>
          <CardTitle className="text-2xl">
            Check Your Inbox for Verification Instructions
          </CardTitle>
          <CardDescription>
            {acceptedSubmission.serverMessage}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          <div className="rounded-xl border border-border/80 bg-surface-elevated/60 p-4 space-y-2.5 text-xs text-muted-foreground leading-relaxed">
            <p>
              To protect account privacy, CyberLab Academy returns the same
              response whether{" "}
              <strong className="text-foreground">
                {acceptedSubmission.email}
              </strong>{" "}
              is newly registered or already associated with an existing
              account:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-foreground">If eligible:</strong> open
                the one-time verification link sent to your inbox within{" "}
                <strong className="text-foreground">60 minutes</strong>.
              </li>
              <li>
                <strong className="text-foreground">
                  If you already have an account:
                </strong>{" "}
                sign in directly or use{" "}
                <Link
                  href="/forgot-password"
                  className="text-cyan-400 underline underline-offset-4"
                >
                  password recovery
                </Link>
                .
              </li>
              {acceptedSubmission.requestedInstructor ? (
                <li>
                  <strong className="text-foreground">
                    Instructor Application:
                  </strong>{" "}
                  new accounts begin with the{" "}
                  <strong className="text-foreground">Student</strong> role
                  only. After you verify your email address, a Manager or
                  Administrator can review your pending Instructor request.
                </li>
              ) : null}
            </ul>
          </div>

          {apiMode === "preview-demo" && demoToken ? (
            <Alert variant="warning">
              <AlertTitle>Cloud Preview Demo Shortcut</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Because Cloud Preview Demo Mode has no SMTP server, you can
                  open the simulated verification link directly:
                </p>
                <Button asChild size="sm" variant="warning">
                  <Link
                    href={`/verify-email?token=${encodeURIComponent(demoToken)}`}
                  >
                    <span>Open Simulated Verification Link</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {resendFeedback ? (
            <Alert variant="info">
              <AlertDescription>{resendFeedback}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild>
              <Link href="/login">
                <span>Proceed to Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={resending}
              onClick={() => void handleResend()}
            >
              <RefreshCw
                className={`h-4 w-4 ${resending ? "animate-spin" : ""}`}
              />
              <span>Resend Verification Email</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/90 bg-card/95">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">Student Registration</CardTitle>
          {apiMode === "preview-demo" ? (
            <Badge variant="warning" className="font-mono text-[10px]">
              Preview Demo Mode
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Create your CyberLab Academy Student identity. Verified email is
          required before official assessments or Instructor role review.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="register-full-name">Full Name</Label>
              <Input
                id="register-full-name"
                type="text"
                autoComplete="name"
                placeholder="Layla Al-Mansoor"
                maxLength={160}
                aria-invalid={Boolean(errors.full_name)}
                disabled={isSubmitting}
                {...register("full_name")}
              />
              {errors.full_name ? (
                <p role="alert" className="text-xs text-red-400">
                  {errors.full_name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-email">Email Address</Label>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="student@university.edu"
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <div className="relative">
                <Input
                  id="register-password"
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
              <Label htmlFor="register-password-confirm">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="register-password-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
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
          </div>

          <PasswordStrengthChecklist
            password={watchedPassword ?? ""}
            confirmation={watchedConfirm ?? ""}
            email={watchedEmail ?? ""}
            fullName={watchedFullName ?? ""}
          />

          <div className="rounded-xl border border-border/80 bg-surface-elevated/45 p-3.5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="instructor-application"
                checked={Boolean(watchedInstructor)}
                onCheckedChange={(checked) =>
                  setValue("instructor_application", checked === true)
                }
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="instructor-application"
                  className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                >
                  <BookOpenCheck className="h-4 w-4 text-teal-400" />
                  <span>Submit an optional Instructor role application</span>
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your account still starts with Student permissions only. After
                  email verification, a Manager or Administrator can review and
                  approve or reject Instructor access.
                </p>
              </div>
            </div>
          </div>

          {serverError ? (
            <Alert variant={isRateLimited ? "warning" : "destructive"}>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {isRateLimited
                  ? "Rate Limit Reached"
                  : "Registration Could Not Complete"}
              </AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting Registration...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                <span>Register Account</span>
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col items-center justify-between gap-2 border-t border-border/75 pt-4 text-xs text-muted-foreground sm:flex-row">
        <span>Already registered on CyberLab Academy?</span>
        <Link
          href="/login"
          className="font-semibold text-cyan-500 hover:underline dark:text-cyan-400"
        >
          Sign in to your account →
        </Link>
      </CardFooter>
    </Card>
  );
}
