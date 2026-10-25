import * as React from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/shared/states";
import { VerifyEmailView } from "@/features/auth/verify-email-view";

export const metadata: Metadata = {
  title: "Verify Email",
};

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={<LoadingState label="Preparing email verification..." rows={3} />}
    >
      <VerifyEmailView />
    </React.Suspense>
  );
}
