"use client";

import * as React from "react";
import QRCode from "qrcode";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LockKeyhole,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { PREVIEW_DEMO_TOTP_CODE } from "@/lib/api/preview-demo-adapter";
import { usersApi } from "@/lib/api/users";
import type { MFAEnrollResponse } from "@/lib/types/api";
import { PlannedFeatureCard } from "@/components/shared/planned-feature-card";
import {
  mfaConfirmSchema,
  mfaEnrollSchema,
  type MfaConfirmFormValues,
  type MfaEnrollFormValues,
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MfaWizardStage =
  | "idle"
  | "pending_confirm"
  | "recovery_codes_once"
  | "already_enabled";

export function MfaEnrollmentView() {
  const { toast } = useToast();
  const { user, apiMode, refreshUser, requestStepUp } = useAuth();

  const [stage, setStage] = React.useState<MfaWizardStage>("idle");
  // Secret & recovery codes live ONLY in transient React component memory — NEVER in localStorage!
  const [enrollmentData, setEnrollmentData] =
    React.useState<MFAEnrollResponse | null>(null);
  const [qrSvgMarkup, setQrSvgMarkup] = React.useState<string | null>(null);
  const [showSecret, setShowSecret] = React.useState(false);
  const [recoveryCodesOnce, setRecoveryCodesOnce] = React.useState<
    string[] | null
  >(null);
  const [acknowledgedSaved, setAcknowledgedSaved] = React.useState(false);
  const [copiedSecret, setCopiedSecret] = React.useState(false);
  const [copiedCodes, setCopiedCodes] = React.useState(false);

  const [showEnrollPassword, setShowEnrollPassword] = React.useState(false);
  const [enrollError, setEnrollError] = React.useState<string | null>(null);
  const [mfaKeyUnavailable, setMfaKeyUnavailable] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const enrollForm = useForm<MfaEnrollFormValues>({
    resolver: zodResolver(mfaEnrollSchema),
    defaultValues: { password: "" },
  });

  const confirmForm = useForm<MfaConfirmFormValues>({
    resolver: zodResolver(mfaConfirmSchema),
    defaultValues: { code: "" },
  });

  // Check current session list to detect if current session is already MFA-verified
  React.useEffect(() => {
    let active = true;
    usersApi
      .listSessions()
      .then((sessions) => {
        if (!active) return;
        const current = sessions.find((s) => s.current);
        if (current?.mfa_verified) {
          setStage((prev) => (prev === "idle" ? "already_enabled" : prev));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Generate QR code SVG strictly client-side (never sends otpauth_uri over the network)
  React.useEffect(() => {
    let active = true;
    const uri = enrollmentData?.otpauth_uri;
    if (!uri) {
      return;
    }
    QRCode.toString(uri, {
      type: "svg",
      margin: 1,
      width: 208,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    })
      .then((svg) => {
        if (active) setQrSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setQrSvgMarkup(null);
      });
    return () => {
      active = false;
    };
  }, [enrollmentData]);

  // Wipe in-memory secrets/recovery codes on unmount
  React.useEffect(() => {
    return () => {
      setEnrollmentData(null);
      setRecoveryCodesOnce(null);
    };
  }, []);

  if (!user) return null;

  const onStartEnroll = async (values: MfaEnrollFormValues) => {
    setEnrollError(null);
    setMfaKeyUnavailable(false);

    const runEnroll = async () => {
      const response = await authApi.enrollMfa({ password: values.password });
      setEnrollmentData(response);
      setStage("pending_confirm");
      enrollForm.reset({ password: "" });
      toast({
        title: "Authenticator secret provisioned",
        description:
          "Scan the QR code and enter a 6-digit code to activate TOTP.",
      });
    };

    try {
      await runEnroll();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setStage("already_enabled");
          enrollForm.reset({ password: "" });
          toast({
            title: "MFA is already enabled",
            description:
              "An authenticator factor is already active on your account.",
          });
          return;
        }
        if (err.isMfaServiceUnavailable) {
          setMfaKeyUnavailable(true);
          setEnrollError(err.detail);
          return;
        }
        if (err.stepUpReason) {
          requestStepUp({
            reason: err.stepUpReason,
            contextDescription:
              "MFA enrollment requires password authentication within the last 5 minutes.",
            onSuccess: async () => {
              await runEnroll();
            },
          });
          return;
        }
        setEnrollError(err.detail);
      } else {
        setEnrollError("Unable to start MFA enrollment.");
      }
    }
  };

  const onConfirmTotp = async (values: MfaConfirmFormValues) => {
    setConfirmError(null);
    try {
      const res = await authApi.confirmMfa({ code: values.code.trim() });
      // Clear raw secret immediately after confirmation; hold recovery codes in memory only
      setEnrollmentData(null);
      setQrSvgMarkup(null);
      setRecoveryCodesOnce(res.recovery_codes);
      setAcknowledgedSaved(false);
      setStage("recovery_codes_once");
      confirmForm.reset({ code: "" });
      await refreshUser();
      toast({
        title: "Multi-Factor Authentication enabled",
        description:
          "Store your 8 recovery codes offline now. All other sessions were revoked.",
        variant: "success",
      });
    } catch (err) {
      setConfirmError(
        err instanceof ApiError
          ? err.detail
          : "Invalid authenticator code. Check device clock synchronization."
      );
    }
  };

  const handleCopyRecoveryCodes = async () => {
    if (!recoveryCodesOnce) return;
    try {
      await navigator.clipboard.writeText(recoveryCodesOnce.join("\n"));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2500);
    } catch {
      toast({
        title: "Clipboard unavailable",
        description: "Select and copy the codes manually or download the file.",
        variant: "warning",
      });
    }
  };

  const handleDownloadRecoveryCodes = () => {
    if (!recoveryCodesOnce) return;
    const content = [
      "CyberLab Academy — One-Time MFA Recovery Codes",
      `Account: ${user.email}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "IMPORTANT: Store these codes in an encrypted password manager or offline vault.",
      "Each recovery code works once during reauthentication and cannot be viewed again.",
      "",
      ...recoveryCodesOnce.map((code, idx) => `${idx + 1}. ${code}`),
      "",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cyberlab-mfa-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Main MFA Enrollment / Status Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>
                  Time-Based One-Time Password (TOTP) Authentication
                </CardTitle>
                <Badge
                  variant={
                    stage === "already_enabled" ||
                    stage === "recovery_codes_once"
                      ? "success"
                      : "default"
                  }
                  className="font-mono text-[10px]"
                >
                  {stage === "already_enabled" ||
                  stage === "recovery_codes_once"
                    ? "MFA ENABLED"
                    : "ENROLLMENT AVAILABLE"}
                </Badge>
              </div>
              <CardDescription>
                Required to activate the{" "}
                <strong className="text-foreground">Administrator</strong> role
                and optional for{" "}
                <strong className="text-foreground">Student</strong>,{" "}
                <strong className="text-foreground">Instructor</strong>, and{" "}
                <strong className="text-foreground">Manager</strong> accounts.
              </CardDescription>
            </div>
            <LockKeyhole className="h-5 w-5 text-cyan-400" />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Stage 1: Start Enrollment */}
          {stage === "idle" ? (
            <div className="grid gap-6 lg:grid-cols-12">
              <form
                onSubmit={enrollForm.handleSubmit(onStartEnroll)}
                noValidate
                className="space-y-4 lg:col-span-7"
              >
                <div className="space-y-2">
                  <Label htmlFor="mfa-enroll-password">
                    Confirm Current Password to Begin Enrollment
                  </Label>
                  <div className="relative">
                    <Input
                      id="mfa-enroll-password"
                      type={showEnrollPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your account password"
                      disabled={enrollForm.formState.isSubmitting}
                      className="pr-10"
                      {...enrollForm.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEnrollPassword((p) => !p)}
                      aria-label={
                        showEnrollPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showEnrollPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {enrollForm.formState.errors.password ? (
                    <p role="alert" className="text-xs text-red-400">
                      {enrollForm.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>

                {enrollError ? (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>
                      {mfaKeyUnavailable
                        ? "Backend MFA_ENCRYPTION_KEY Not Configured"
                        : "Enrollment Request Rejected"}
                    </AlertTitle>
                    <AlertDescription className="space-y-1 text-red-300">
                      <p>{enrollError}</p>
                      {mfaKeyUnavailable ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          Local dev fix: generate a Fernet key and set
                          MFA_ENCRYPTION_KEY on the FastAPI process.
                        </p>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  type="submit"
                  disabled={enrollForm.formState.isSubmitting}
                >
                  {enrollForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating TOTP Secret...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4" />
                      <span>Generate Authenticator QR Code</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="rounded-xl border border-border/80 bg-surface-elevated/50 p-4 text-xs text-muted-foreground space-y-2.5 lg:col-span-5">
                <p className="font-display text-sm font-semibold text-foreground">
                  Enrollment Security Rules
                </p>
                <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                  <li>
                    Requires your current password and a session authenticated
                    within the last <strong className="text-foreground">5 minutes</strong>.
                  </li>
                  <li>
                    Secrets are encrypted at rest with{" "}
                    <code className="font-mono">Fernet</code> on the server.
                  </li>
                  <li>
                    Confirming your 6-digit code rotates this session cookie and
                    automatically revokes all other sessions for your account.
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {/* Stage 2: Scan QR Code + Confirm 6-Digit TOTP */}
          {stage === "pending_confirm" && enrollmentData ? (
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              <div className="lg:col-span-5 flex flex-col items-center rounded-xl border border-cyan-500/35 bg-surface-elevated/60 p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Step 1 — Scan with Authenticator App
                </p>
                {qrSvgMarkup ? (
                  <div
                    role="img"
                    aria-label="TOTP Authenticator Enrollment QR Code"
                    className="rounded-xl bg-white p-3 shadow-md"
                    dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                  />
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
                    Rendering QR code...
                  </div>
                )}

                <div className="w-full space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Manual Setup Key
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSecret((s) => !s)}
                        className="text-cyan-400 hover:underline"
                      >
                        {showSecret ? "Hide" : "Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              enrollmentData.secret
                            );
                            setCopiedSecret(true);
                            setTimeout(() => setCopiedSecret(false), 2000);
                          } catch {
                            // Ignore clipboard restriction
                          }
                        }}
                        className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                      >
                        {copiedSecret ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{copiedSecret ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2 font-mono text-xs break-all text-foreground">
                    {showSecret
                      ? enrollmentData.secret
                      : "••••••••••••••••••••••••••••••••"}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Step 2 — Verify Six-Digit Code
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Scan the QR code in an RFC 6238 TOTP app (such as Ente Auth,
                    Aegis, 1Password, or Google Authenticator), then enter the
                    current 6-digit code below.
                  </p>
                </div>

                {apiMode === "preview-demo" ? (
                  <Alert variant="warning">
                    <KeyRound className="h-4 w-4" />
                    <AlertTitle>Cloud Preview Demo Code</AlertTitle>
                    <AlertDescription className="font-mono text-xs">
                      In Cloud Preview Demo Mode, submit code{" "}
                      <strong>{PREVIEW_DEMO_TOTP_CODE}</strong> to test
                      confirmation and one-time recovery code generation.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <form
                  onSubmit={confirmForm.handleSubmit(onConfirmTotp)}
                  noValidate
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="mfa-totp-code">
                      Six-Digit Authenticator Code
                    </Label>
                    <Input
                      id="mfa-totp-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      disabled={confirmForm.formState.isSubmitting}
                      className="font-mono text-lg tracking-[0.35em] max-w-xs"
                      {...confirmForm.register("code")}
                    />
                    {confirmForm.formState.errors.code ? (
                      <p role="alert" className="text-xs text-red-400">
                        {confirmForm.formState.errors.code.message}
                      </p>
                    ) : null}
                  </div>

                  {confirmError ? (
                    <Alert variant="destructive">
                      <AlertDescription className="text-red-300">
                        {confirmError}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      disabled={confirmForm.formState.isSubmitting}
                    >
                      {confirmForm.formState.isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Confirming TOTP...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          <span>Confirm & Activate MFA</span>
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEnrollmentData(null);
                        setQrSvgMarkup(null);
                        setStage("idle");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {/* Stage 3: One-Time Recovery Codes Presentation (Memory Only!) */}
          {stage === "recovery_codes_once" && recoveryCodesOnce ? (
            <div className="space-y-5">
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  Save Your 8 Recovery Codes Now — Shown Only Once
                </AlertTitle>
                <AlertDescription className="text-xs space-y-1 leading-relaxed">
                  <p>
                    CyberLab Academy stores only SHA-256 digests of these codes
                    and <strong className="text-foreground">never</strong>{" "}
                    persists them in browser storage. Once you leave or close
                    this view, these codes cannot be retrieved again.
                  </p>
                  <p>
                    Each recovery code works once in place of a TOTP code during{" "}
                    <code className="font-mono">/auth/reauthenticate</code> if
                    you lose access to your authenticator device.
                  </p>
                </AlertDescription>
              </Alert>

              <div
                aria-label="One-time MFA recovery codes"
                className="grid grid-cols-1 gap-2.5 rounded-xl border border-amber-500/35 bg-slate-950/90 p-4 sm:grid-cols-2"
              >
                {recoveryCodesOnce.map((code, index) => (
                  <div
                    key={code}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-3.5 py-2 font-mono text-xs text-cyan-200"
                  >
                    <span className="text-slate-500">{index + 1}.</span>
                    <span className="select-all tracking-wider">{code}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyRecoveryCodes()}
                >
                  {copiedCodes ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-cyan-400" />
                  )}
                  <span>
                    {copiedCodes ? "Copied to Clipboard" : "Copy All Codes"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadRecoveryCodes}
                >
                  <Download className="h-4 w-4 text-cyan-400" />
                  <span>Download Offline .txt</span>
                </Button>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="ack-recovery-saved"
                    checked={acknowledgedSaved}
                    onCheckedChange={(checked) =>
                      setAcknowledgedSaved(checked === true)
                    }
                  />
                  <Label
                    htmlFor="ack-recovery-saved"
                    className="text-xs cursor-pointer"
                  >
                    I have stored these 8 recovery codes in a secure offline
                    location
                  </Label>
                </div>

                <Button
                  type="button"
                  disabled={!acknowledgedSaved}
                  onClick={() => {
                    // Wipe codes from component memory immediately upon completion
                    setRecoveryCodesOnce(null);
                    setStage("already_enabled");
                  }}
                >
                  Finish MFA Setup
                </Button>
              </div>
            </div>
          ) : null}

          {/* Stage 4: MFA Already Enabled */}
          {stage === "already_enabled" ? (
            <div className="space-y-4">
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  TOTP Authenticator Active on Your Account
                </AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">
                  Your account has an active TOTP second factor. Whenever you
                  activate the Administrator role or refresh your 5-minute
                  elevated step-up window, verify with a current 6-digit code or
                  one of your unused recovery codes.
                </AlertDescription>
              </Alert>

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  requestStepUp({
                    reason: "recent_mfa",
                    contextDescription:
                      "Verify your password and 6-digit TOTP (or recovery code) to refresh MFA verification on this session.",
                  })
                }
              >
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span>Verify / Refresh Session MFA Now</span>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Section 11 Requirement: Do NOT invent an MFA-disable endpoint; clearly mark unavailable */}
      <PlannedFeatureCard
        icon={Lock}
        title="MFA Disable, Rotation & Recovery Code Regeneration"
        description="Once TOTP MFA is enabled on an account, disabling MFA, rotating the TOTP secret, or regenerating recovery codes is not yet supported through the Milestone 01B API."
        contractNote="OpenAPI v0.2.0 exposes POST /auth/mfa/enroll and POST /auth/mfa/confirm only. Keep your one-time recovery codes safe."
      />
    </div>
  );
}
