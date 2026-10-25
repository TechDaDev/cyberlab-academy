"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { PREVIEW_DEMO_TOTP_CODE } from "@/lib/api/preview-demo-adapter";
import { usersApi } from "@/lib/api/users";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

export function ReauthModal() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, apiMode, stepUpState, closeStepUp, refreshUser } = useAuth();

  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [mfaCode, setMfaCode] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isOpen = Boolean(stepUpState?.open);

  const requiresMfaInput = Boolean(
    stepUpState?.reason === "recent_mfa" ||
      stepUpState?.reason === "admin_mfa" ||
      stepUpState?.reason === "manager_mfa" ||
      stepUpState?.targetRole === "administrator" ||
      user?.active_role === "administrator"
  );

  /**
   * Closes the prompt and resets its form.
   *
   * `cancelled` distinguishes "the operator dismissed the prompt" from "the
   * credential was verified and the caller's follow-up action is about to run".
   * Only the former notifies `onCancelCallback`, so a successful verification is
   * never reported to the initiating flow as a cancellation.
   */
  const resetAndClose = (options?: { cancelled?: boolean }) => {
    setPassword("");
    setMfaCode("");
    setShowPassword(false);
    setErrorMessage(null);
    setIsSubmitting(false);
    const onCancel = options?.cancelled
      ? stepUpState?.onCancelCallback
      : undefined;
    closeStepUp();
    onCancel?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage("Enter your current password to verify identity.");
      return;
    }
    if (requiresMfaInput && mfaCode.trim().length < 6) {
      setErrorMessage(
        "Enter a 6-digit authenticator code or one-time recovery code."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await authApi.reauthenticate({
        password,
        mfa_code: mfaCode.trim() ? mfaCode.trim() : undefined,
      });

      const targetRole = stepUpState?.targetRole;
      if (targetRole) {
        await authApi.switchActiveRole({ role: targetRole });
      }

      const refreshed = await refreshUser();
      const callback = stepUpState?.onSuccessCallback;
      resetAndClose();

      if (targetRole && refreshed) {
        toast({
          title: `${ROLE_METADATA[targetRole].label} session verified`,
          description:
            "Step-up verification succeeded and session cookie rotated.",
          variant: "success",
        });
        router.push(ROLE_METADATA[targetRole].dashboardPath);
      } else {
        toast({
          title: "Step-up verification complete",
          description:
            "Elevated 5-minute verification window refreshed for this session.",
          variant: "success",
        });
      }

      if (callback) {
        await callback();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.detail.toLowerCase().includes("mfa") &&
          err.status === 401 &&
          requiresMfaInput
        ) {
          setErrorMessage(
            `${err.detail}. If you have not yet enrolled an authenticator app on this account, configure MFA in Account Settings first.`
          );
        } else {
          setErrorMessage(err.detail);
        }
      } else {
        setErrorMessage("Step-up verification failed. Please try again.");
      }
      // Refresh user in case active role fell back
      await usersApi
        .getMe({ emitSessionExpiredOn401: false })
        .catch(() => undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => !next && resetAndClose({ cancelled: true })}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <span>Step-Up Identity Verification</span>
          </DialogTitle>
          <DialogDescription>
            {stepUpState?.contextDescription ??
              "Sensitive administrative actions and privileged role activations require recent authentication within a 5-minute window."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {requiresMfaInput ? (
            <Alert variant="warning">
              <KeyRound className="h-4 w-4" />
              <AlertTitle>Multi-Factor Verification Required</AlertTitle>
              <AlertDescription className="space-y-1.5">
                <p>
                  Administrator access and MFA-protected operations require both
                  your current password and a live TOTP or single-use recovery code.
                </p>
                {apiMode === "preview-demo" ? (
                  <p className="font-mono text-xs text-amber-300">
                    Cloud Preview Demo TOTP code: {PREVIEW_DEMO_TOTP_CODE}
                  </p>
                ) : null}
                <p className="text-xs">
                  Need to enroll TOTP first?{" "}
                  <Link
                    href="/settings/mfa"
                    onClick={() => resetAndClose({ cancelled: true })}
                    className="font-medium text-cyan-400 underline underline-offset-4"
                  >
                    Open MFA Enrollment
                  </Link>
                </p>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="stepup-password">Current Password</Label>
            <div className="relative">
              <Input
                id="stepup-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm your account password"
                disabled={isSubmitting}
                className="pr-10"
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="stepup-mfa-code">
              {requiresMfaInput
                ? "Authenticator Code or Recovery Code (Required)"
                : "Authenticator Code (Optional)"}
            </Label>
            <Input
              id="stepup-mfa-code"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder={
                requiresMfaInput
                  ? "6-digit TOTP or recovery code"
                  : "Leave blank if MFA is not required"
              }
              disabled={isSubmitting}
              className="font-mono tracking-wider"
            />
          </div>

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription className="text-red-300">
                {errorMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => resetAndClose({ cancelled: true })}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                "Verify & Continue"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
