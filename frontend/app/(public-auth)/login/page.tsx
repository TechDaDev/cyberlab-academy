import * as React from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/shared/states";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading sign-in form..." rows={4} />}>
      <LoginForm />
    </React.Suspense>
  );
}
