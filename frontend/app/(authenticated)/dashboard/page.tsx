"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/shared/states";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardIndexPage() {
  const router = useRouter();
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) {
      router.replace(ROLE_METADATA[user.active_role].dashboardPath);
    }
  }, [user, router]);

  return (
    <LoadingState label="Routing to your active role workspace..." rows={3} />
  );
}
