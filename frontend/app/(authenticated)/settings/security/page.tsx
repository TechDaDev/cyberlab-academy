import type { Metadata } from "next";
import { SecurityPasswordView } from "@/features/profile/security-password-view";

export const metadata: Metadata = {
  title: "Password & Step-Up",
};

export default function SecuritySettingsPage() {
  return <SecurityPasswordView />;
}
