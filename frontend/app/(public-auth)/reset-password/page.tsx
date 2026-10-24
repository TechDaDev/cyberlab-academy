import * as React from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/shared/states";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={<LoadingState label="Preparing password reset..." rows={3} />}
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
