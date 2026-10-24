import type { Metadata } from "next";
import { MfaEnrollmentView } from "@/features/profile/mfa-enrollment-view";

export const metadata: Metadata = {
  title: "Multi-Factor Authentication",
};

export default function MfaSettingsPage() {
  return <MfaEnrollmentView />;
}
