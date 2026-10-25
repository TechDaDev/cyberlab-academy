"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  AlertTriangle,
  CloudCog,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  ShieldAlert,
} from "lucide-react";
import { isPreviewDemoFeatureAllowed } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { PREVIEW_DEMO_ACCOUNTS_HINT } from "@/lib/api/preview-demo-adapter";
import { loginSchema, type LoginFormValues } from "@/features/auth/schemas";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
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
import { sanitizeInternalRedirect } from "@/lib/utils";

export const REMEMBERED_EMAIL_STORAGE_KEY = "cyberlab.remembered_email";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const {
    login,
    apiMode,
    backendHealth,
    setMode,
    sessionExpiredMessage,
    clearSessionExpiredMessage,
  } = useAuth();

  const [showPassword, setShowPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberEmail: false,
    },
  });

  const rememberEmail = useWatch({ control, name: "rememberEmail" });

  // Load remembered email (NEVER passwords or tokens) from localStorage on mount
  React.useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(
        REMEMBERED_EMAIL_STORAGE_KEY
      );
      if (remembered && remembered.includes("@")) {
        setValue("email", remembered);
        setValue("rememberEmail", true);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [setValue]);

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsRateLimited(false);
    clearSessionExpiredMessage();

    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      try {
        if (values.rememberEmail) {
          window.localStorage.setItem(
            REMEMBERED_EMAIL_STORAGE_KEY,
            normalizedEmail
          );
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors
      }

      const authenticatedUser = await login({
        email: normalizedEmail,
        password: values.password,
      });

      toast({
        title: `Welcome back, ${authenticatedUser.full_name}`,
        description: `Signed in with ${
          ROLE_METADATA[authenticatedUser.active_role].label
        } session active.`,
        variant: "success",
      });

      const nextParam = searchParams?.get("next");
      const target = sanitizeInternalRedirect(
        nextParam,
        ROLE_METADATA[authenticatedUser.active_role].dashboardPath
      );
      router.push(target);
    } catch (err) {
      if (err instanceof ApiError) {
        setIsRateLimited(err.isRateLimited);
        setServerError(err.detail);
      } else {
        setServerError("Unable to complete sign-in. Please try again.");
      }
    }
  };

  return (
    <Card className="border-border/90 bg-card/95">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">Sign In to CyberLab</CardTitle>
          {apiMode === "preview-demo" ? (
            <Badge variant="warning" className="font-mono text-[10px]">
              Preview Demo Mode
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Authenticate with your CyberLab Academy email and password. New
          sessions start in your default Student role context.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {sessionExpiredMessage ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Session Ended</AlertTitle>
            <AlertDescription>{sessionExpiredMessage}</AlertDescription>
          </Alert>
        ) : null}

        {apiMode === "preview-demo" ? (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-500 dark:text-amber-300">
                Cloud Preview Demo Accounts (Click to Autofill)
              </p>
              <span className="font-mono text-[10px] text-muted-foreground">
                In-Memory Only
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PREVIEW_DEMO_ACCOUNTS_HINT.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => {
                    setValue("email", acct.email, { shouldValidate: true });
                    setValue("password", acct.password, {
                      shouldValidate: true,
                    });
                    setServerError(null);
                  }}
                  className="flex flex-col rounded-lg border border-border/80 bg-card/85 px-2.5 py-2 text-left transition-colors hover:border-cyan-500/45"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {acct.label}
                  </span>
                  <span className="font-mono text-[10px] text-cyan-500 dark:text-cyan-300 truncate">
                    {acct.email}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {acct.mfaNote}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : backendHealth === "unreachable" && isPreviewDemoFeatureAllowed() ? (
          <Alert variant="info">
            <CloudCog className="h-4 w-4" />
            <AlertTitle>Local FastAPI Not Detected</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                No FastAPI backend responded on{" "}
                <code className="font-mono text-xs">/api/v1/health</code>. Start
                your local backend on{" "}
                <code className="font-mono text-xs">127.0.0.1:8000</code>, or
                inspect the interface using the labeled Cloud Preview Demo
                Adapter.
              </p>
              <Button
                type="button"
                variant="warning"
                size="sm"
                onClick={() => void setMode("preview-demo")}
              >
                <CloudCog className="h-3.5 w-3.5" />
                <span>Switch to Cloud Preview Demo Mode</span>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email Address</Label>
            <Input
              id="login-email"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-cyan-500 hover:underline dark:text-cyan-400"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={Boolean(errors.password)}
                disabled={isSubmitting}
                className="pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

          <div className="flex items-center gap-2.5">
            <Checkbox
              id="remember-email"
              checked={Boolean(rememberEmail)}
              onCheckedChange={(checked) =>
                setValue("rememberEmail", checked === true)
              }
              disabled={isSubmitting}
            />
            <Label
              htmlFor="remember-email"
              className="text-xs font-normal text-muted-foreground cursor-pointer"
            >
              Remember my email address on this browser (passwords are never
              stored)
            </Label>
          </div>

          {serverError ? (
            <Alert variant={isRateLimited ? "warning" : "destructive"}>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {isRateLimited
                  ? "Rate Limit Active — Please Back Off"
                  : "Sign-In Failed"}
              </AlertTitle>
              <AlertDescription>
                {serverError}
                {isRateLimited
                  ? " Wait a few minutes before attempting another request."
                  : ""}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col items-center justify-between gap-2 border-t border-border/75 pt-4 text-xs text-muted-foreground sm:flex-row">
        <span>New to CyberLab Academy?</span>
        <Link
          href="/register"
          className="font-semibold text-cyan-500 hover:underline dark:text-cyan-400"
        >
          Create a Student account →
        </Link>
      </CardFooter>
    </Card>
  );
}
