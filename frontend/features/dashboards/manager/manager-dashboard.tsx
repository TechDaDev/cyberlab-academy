"use client";

import * as React from "react";
import {
  Ban,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { AdminUserPublic, Role } from "@/lib/types/api";
import { InstructorApplicationsPanel } from "@/features/admin/instructor-applications-panel";
import { UserDirectoryPanel } from "@/features/admin/user-directory-panel";
import { RoleBadge } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ManagerDashboard() {
  const { user, requestStepUp } = useAuth();
  const [directorySnapshot, setDirectorySnapshot] = React.useState<
    AdminUserPublic[]
  >([]);
  const [pendingAppsCount, setPendingAppsCount] = React.useState<number>(0);
  const [refreshSeq, setRefreshSeq] = React.useState<number>(0);
  const [activeTab, setActiveTab] = React.useState<string>("all");

  React.useEffect(() => {
    let active = true;
    adminApi
      .listInstructorApplications("pending")
      .then((pending) => {
        if (active) setPendingAppsCount(pending.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshSeq]);

  if (!user) return null;

  const totalAccounts = directorySnapshot.length;
  const studentCount = directorySnapshot.filter((u) =>
    u.roles.includes("student")
  ).length;
  const instructorCount = directorySnapshot.filter((u) =>
    u.roles.includes("instructor")
  ).length;
  const suspendedCount = directorySnapshot.filter((u) => !u.is_active).length;

  const presetRoleForTab: Role | "" =
    activeTab === "students"
      ? "student"
      : activeTab === "instructors"
      ? "instructor"
      : "";

  return (
    <div className="space-y-6">
      {/* Manager Governance Header */}
      <div className="rounded-2xl border border-violet-500/35 bg-gradient-to-r from-surface via-surface-elevated/90 to-violet-950/25 p-6 shadow-cyber-panel">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={user.active_role} active />
              <Badge variant="violet" className="font-mono text-[10px]">
                STUDENT & INSTRUCTOR GOVERNANCE SCOPE
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Manager Account Operations Console
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
              Manage Student and Instructor accounts, review pending Instructor
              applications, and enforce account status policies using live{" "}
              <code className="font-mono text-xs">/api/v1/admin/*</code>{" "}
              endpoints.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              requestStepUp({
                reason: "recent_auth",
                contextDescription:
                  "Refresh your 5-minute Manager authentication window before running sensitive account actions.",
              })
            }
          >
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>Verify 5m Step-Up Window</span>
          </Button>
        </div>
      </div>

      {/* Platform Overview KPIs (Live from /api/v1/admin/*) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Governed Accounts",
            value: String(totalAccounts),
            sub: "Visible Student & Instructor records",
            icon: Users,
          },
          {
            label: "Student Accounts",
            value: String(studentCount),
            sub: "Enrolled learner identities",
            icon: GraduationCap,
          },
          {
            label: "Approved Instructors",
            value: String(instructorCount),
            sub: "Verified teaching accounts",
            icon: BookOpen,
          },
          {
            label: "Pending Applications / Suspended",
            value: `${pendingAppsCount} / ${suspendedCount}`,
            sub: "Awaiting review / currently disabled",
            icon: pendingAppsCount > 0 ? UserCheck : Ban,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </span>
                  <Badge variant="default" className="font-mono text-[10px]">
                    LIVE
                  </Badge>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <p className="font-display text-2xl font-bold text-foreground">
                    {item.value}
                  </p>
                  <Icon className="h-5 w-5 text-cyan-400" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Explicit Authorization Scope Notice */}
      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Manager Authorization Boundary</AlertTitle>
        <AlertDescription className="text-xs">
          Managers are authorized to manage{" "}
          <strong className="text-foreground">Student</strong> and{" "}
          <strong className="text-foreground">Instructor</strong> accounts only.
          Manager and Administrator accounts and privileges are enforced
          exclusively by Administrators on the backend. All mutations require a
          logged audit reason and authentication within 5 minutes.
        </AlertDescription>
      </Alert>

      {/* Focused Management Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Governed Users</TabsTrigger>
          <TabsTrigger value="students">Student Management</TabsTrigger>
          <TabsTrigger value="instructors">Instructor Management</TabsTrigger>
          <TabsTrigger value="applications">
            Instructor Applications ({pendingAppsCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          <UserDirectoryPanel
            actorRole="manager"
            presetRoleFilter=""
            onUsersLoaded={setDirectorySnapshot}
            refreshTrigger={refreshSeq}
          />
          <InstructorApplicationsPanel
            knownUsers={directorySnapshot}
            onDecisionCompleted={() => setRefreshSeq((n) => n + 1)}
          />
        </TabsContent>

        <TabsContent value="students">
          <UserDirectoryPanel
            key={`mgr-${presetRoleForTab || "students"}`}
            actorRole="manager"
            presetRoleFilter={presetRoleForTab}
            refreshTrigger={refreshSeq}
          />
        </TabsContent>

        <TabsContent value="instructors">
          <UserDirectoryPanel
            key={`mgr-${presetRoleForTab || "instructors"}`}
            actorRole="manager"
            presetRoleFilter={presetRoleForTab}
            refreshTrigger={refreshSeq}
          />
        </TabsContent>

        <TabsContent value="applications">
          <InstructorApplicationsPanel
            knownUsers={directorySnapshot}
            onDecisionCompleted={() => setRefreshSeq((n) => n + 1)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
