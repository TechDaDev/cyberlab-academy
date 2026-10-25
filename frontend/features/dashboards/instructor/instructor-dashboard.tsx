"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DemoBadge,
  DemoDataBanner,
} from "@/components/shared/demo-data-banner";
import { EmptyState } from "@/components/shared/states";
import { RoleBadge } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/utils";

const DEMO_COHORTS = [
  {
    id: "coh-01",
    code: "CYB-101-A",
    name: "Foundations of Defensive Security — Autumn Cohort",
    enrolled: 28,
    activeLabs: 3,
    avgScore: "82%",
    schedule: "Sun / Tue • 18:00 AST",
  },
  {
    id: "coh-02",
    code: "SOC-204-B",
    name: "Authentication, Session & SIEM Analysis Practicum",
    enrolled: 19,
    activeLabs: 2,
    avgScore: "79%",
    schedule: "Mon / Wed • 19:30 AST",
  },
];

const DEMO_COMPLETION_DATA = [
  { module: "MOD-01", theory: 92, lab: 81, mission: 74 },
  { module: "MOD-02", theory: 88, lab: 79, mission: 69 },
  { module: "MOD-03", theory: 71, lab: 58, mission: 46 },
  { module: "MOD-04", theory: 44, lab: 31, mission: 18 },
];

const DEMO_ASSIGNMENTS = [
  {
    id: "asg-1",
    title: "MSN-01A: Perimeter Header & Session Cookie Audit",
    cohort: "CYB-101-A",
    submitted: "23 / 28",
    due: "Oct 28, 2026",
    status: "Open Rubric",
  },
  {
    id: "asg-2",
    title: "LAB-02: Origin & Fetch-Metadata CSRF Verification",
    cohort: "SOC-204-B",
    submitted: "19 / 19",
    due: "Oct 25, 2026",
    status: "Ready for Review",
  },
  {
    id: "asg-3",
    title: "MSN-01B: Credential Stuffing SIEM Triage Brief",
    cohort: "SOC-204-B",
    submitted: "11 / 19",
    due: "Nov 02, 2026",
    status: "In Progress",
  },
];

const DEMO_STUDENTS = [
  {
    id: "st-1",
    name: "Zainab Al-Khatib",
    cohort: "CYB-101-A",
    modulesCompleted: "3 / 4",
    missionAvg: 91,
    readiness: "On Track",
  },
  {
    id: "st-2",
    name: "Omar Al-Rawi",
    cohort: "CYB-101-A",
    modulesCompleted: "2 / 4",
    missionAvg: 78,
    readiness: "On Track",
  },
  {
    id: "st-3",
    name: "Huda Salman",
    cohort: "SOC-204-B",
    modulesCompleted: "3 / 4",
    missionAvg: 86,
    readiness: "On Track",
  },
  {
    id: "st-4",
    name: "Karim Darwish",
    cohort: "SOC-204-B",
    modulesCompleted: "1 / 4",
    missionAvg: 58,
    readiness: "Needs Lab Support",
  },
];

export function InstructorDashboard() {
  const { user } = useAuth();
  const [studentQuery, setStudentQuery] = React.useState("");

  if (!user) return null;

  const filteredStudents = DEMO_STUDENTS.filter(
    (s) =>
      s.name.toLowerCase().includes(studentQuery.trim().toLowerCase()) ||
      s.cohort.toLowerCase().includes(studentQuery.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Live Instructor Identity & Profile Header */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 rounded-2xl border border-teal-500/30 bg-gradient-to-r from-surface via-surface-elevated/90 to-teal-950/25 p-6 shadow-cyber-panel flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={user.active_role} active />
              <Badge variant="success" className="font-mono text-[10px]">
                {user.email_verified ? "VERIFIED INSTRUCTOR" : "UNVERIFIED"}
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Instructor Teaching Console
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Monitor cohort progression, laboratory checkpoints, and mission
              completion across assigned classes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/profile">Edit Instructor Profile</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings/sessions">Review Active Sessions</Link>
            </Button>
          </div>
        </div>

        {/* Live Instructor Profile Summary Card */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Instructor Profile</CardTitle>
              <Badge variant="teal" className="font-mono text-[10px]">
                LIVE /users/me
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-foreground">
                {user.full_name}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono text-foreground truncate max-w-[180px]">
                {user.email}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Assigned Roles</span>
              <span className="font-mono text-cyan-400">
                {user.roles.join(", ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Created</span>
              <span className="text-foreground">
                {formatShortDate(user.created_at)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explicit Demonstration Data Banner */}
      <DemoDataBanner
        title="Cohort, Assignment & Student Telemetry Preview"
        description="Your Instructor identity and active role above are live from /api/v1/users/me. Cohort management, assignments, and student gradebook APIs are scheduled for Milestone 02 and use labeled demonstration data below."
      />

      {/* Class Overview Section */}
      <div id="classes" className="grid gap-4 md:grid-cols-2">
        {DEMO_COHORTS.map((coh) => (
          <Card key={coh.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-teal-400">
                  {coh.code}
                </span>
                <DemoBadge />
              </div>
              <CardTitle className="text-lg">{coh.name}</CardTitle>
              <CardDescription>{coh.schedule}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 border-t border-border/70 pt-4 text-center">
              <div>
                <p className="font-display text-lg font-bold text-foreground">
                  {coh.enrolled}
                </p>
                <p className="text-[11px] text-muted-foreground">Students</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-cyan-400">
                  {coh.activeLabs}
                </p>
                <p className="text-[11px] text-muted-foreground">Active Labs</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-emerald-400">
                  {coh.avgScore}
                </p>
                <p className="text-[11px] text-muted-foreground">Mean Rubric</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mission Completion Statistics + Assignment Overview */}
      <div id="analytics" className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Mission & Lab Completion Statistics</CardTitle>
              <DemoBadge />
            </div>
            <CardDescription>
              Percentage of cohort students completing Theory, Lab, and Mission
              stages per module
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DEMO_COMPLETION_DATA}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148, 163, 184, 0.14)"
                  />
                  <XAxis
                    dataKey="module"
                    tick={{ fill: "#CBD5E1", fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1324",
                      borderColor: "rgba(20, 184, 166, 0.35)",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar
                    dataKey="theory"
                    name="Theory %"
                    fill="#38BDF8"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="lab"
                    name="Guided Lab %"
                    fill="#14B8A6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="mission"
                    name="Mission %"
                    fill="#8B5CF6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Assignment Overview</CardTitle>
              <DemoBadge />
            </div>
            <CardDescription>
              Active laboratory and mission checkpoints
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEMO_ASSIGNMENTS.map((asg) => (
              <div
                key={asg.id}
                className="rounded-xl border border-border/80 bg-surface-elevated/50 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-teal-400">
                    {asg.cohort}
                  </span>
                  <Badge variant="outline">{asg.status}</Badge>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {asg.title}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardCheck className="h-3.5 w-3.5 text-cyan-400" />
                    Submitted: {asg.submitted}
                  </span>
                  <span>Due {asg.due}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Student Overview & Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Student Overview & Performance</CardTitle>
                <DemoBadge />
              </div>
              <CardDescription>
                Synthetic cohort roster demonstrating upcoming class-scoped
                progress tracking
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Filter by student or cohort..."
                aria-label="Filter demonstration students"
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No matching cohort students"
              description="Clear the search filter to view all demonstration student records."
              actionLabel="Reset Filter"
              onAction={() => setStudentQuery("")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pr-4 font-medium">Student</th>
                    <th className="py-2.5 px-4 font-medium">Cohort</th>
                    <th className="py-2.5 px-4 font-medium">Modules</th>
                    <th className="py-2.5 px-4 font-medium">Mission Score</th>
                    <th className="py-2.5 pl-4 font-medium text-right">
                      Readiness
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-surface-elevated/40">
                      <td className="py-3 pr-4 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-cyan-400 shrink-0" />
                          <span>{st.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-teal-400">
                        {st.cohort}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {st.modulesCompleted}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-foreground">
                        {st.missionAvg}%
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <Badge
                          variant={
                            st.readiness === "On Track" ? "success" : "warning"
                          }
                        >
                          {st.readiness === "On Track" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <BookOpen className="h-3 w-3" />
                          )}
                          <span>{st.readiness}</span>
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0" />
            <span>
              In Milestone 02, instructors will only be able to query cohorts to
              which they are explicitly assigned on the backend.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
