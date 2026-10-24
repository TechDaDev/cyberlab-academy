import type { Metadata } from "next";
import { SessionsManager } from "@/features/profile/sessions-manager";

export const metadata: Metadata = {
  title: "Active Sessions",
};

export default function SessionsSettingsPage() {
  return <SessionsManager />;
}
