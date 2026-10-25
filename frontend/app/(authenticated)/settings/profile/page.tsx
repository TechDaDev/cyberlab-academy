import type { Metadata } from "next";
import { ProfileSettingsView } from "@/features/profile/profile-settings-view";

export const metadata: Metadata = {
  title: "Profile & Roles",
};

export default function ProfileSettingsPage() {
  return <ProfileSettingsView />;
}
