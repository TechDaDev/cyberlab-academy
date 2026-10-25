"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  MailWarning,
  Shield,
  Sparkles,
  Terminal,
  Trophy,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DemoBadge,
  DemoDataBanner,
} from "@/components/shared/demo-data-banner";
import { RoleBadge } from "@/features/roles/role-switcher";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortDate } from "@/lib/utils";

interface DemoModuleItem {
  id: string;
  code: string;
  title: string;
  track: "Foundations" | "SOC Operations" | "Identity Defense";
  progressPct: number;
  lessonsCompleted: string;
  labStatus: "Completed" | "In Progress" | "Locked Preview";
  summary: string;
}

interface DemoMissionItem {
  id: string;
  code: string;
  title: string;
  difficulty: "Introductory" | "Intermediate";
  duration: string;
  status: "Ready for Briefing" | "In Progress" | "Completed";
  targetSubnet: string;
  objectives: string[];
}

const DEMO_SKILL_PROGRESS = [
  { domain: "Auth & Sessions", mastery: 84 },
  { domain: "Packet Triage", mastery: 68 },
  { domain: "HTTP Hardening", mastery: 76 },
  { domain: "SIEM Detection", mastery: 52 },
  { domain: "Incident Briefs", mastery: 71 },
];

const DEMO_MODULES: DemoModuleItem[] = [
  {
    id: "mod-01",
    code: "MOD-01",
    title: "Defensive Reconnaissance & Trust Boundaries",
    track: "Foundations",
    progressPct: 78,
    lessonsCompleted: "7 / 9 lessons",
    labStatus: "In Progress",
    summary:
      "Analyze synthetic network perimeters, service exposure surfaces, and ethical authorization rules without external scanning.",
  },
  {
    id: "mod-02",
    code: "MOD-02",
    title: "Session State, Cookies & Step-Up Authentication",
    track: "Identity Defense",
    progressPct: 100,
    lessonsCompleted: "6 / 6 lessons",
    labStatus: "Completed",
    summary:
      "Inspect HttpOnly cookie attributes, Origin/Fetch-Metadata CSRF guards, Argon2id hashing, and TOTP step-up enforcement.",
  },
  {
    id: "mod-03",
    code: "MOD-03",
    title: "Log Correlation & SOC Alert Triage",
    track: "SOC Operations",
    progressPct: 35,
    lessonsCompleted: "3 / 8 lessons",
    labStatus: "In Progress",
    summary:
      "Correlate authentication audit trails, rate-limit anomalies, and privilege escalation indicators in a deterministic SIEM.",
  },
  {
    id: "mod-04",
    code: "MOD-04",
    title: "Web Transport Hardening & Remediation",
    track: "Foundations",
    progressPct: 0,
    lessonsCompleted: "0 / 7 lessons",
    labStatus: "Locked Preview",
    summary:
      "Validate TLS configurations, Content-Security-Policy directives, and strict host/proxy headers across multi-tier services.",
  },
];

const DEMO_MISSIONS: DemoMissionItem[] = [
  {
    id: "msn-101",
    code: "MSN-01A",
    title: "Operation Glass Harbor — Perimeter Header & Cookie Audit",
    difficulty: "Introductory",
    duration: "45 min timed rubric",
    status: "In Progress",
    targetSubnet: "10.24.10.0/24 (Synthetic)",
    objectives: [
      "Identify missing Cache-Control and Referrer-Policy headers on synthetic staging routes",
      "Verify SameSite=Lax and HttpOnly session flags across simulated endpoints",
      "Submit structured remediation report for instructor review",
    ],
  },
  {
    id: "msn-102",
    code: "MSN-01B",
    title: "Operation Silent Ledger — Credential Stuffing Triage",
    difficulty: "Intermediate",
    duration: "60 min timed rubric",
    status: "Ready for Briefing",
    targetSubnet: "10.24.20.0/24 (Synthetic)",
    objectives: [
      "Distinguish IP-scoped vs account-wide rate-limit triggers in synthetic SIEM events",
      "Confirm zero account-enumeration leakage on registration and recovery endpoints",
      "Recommend threshold tuning without locking out legitimate cohort learners",
    ],
  },
];

const DEMO_RECENT_ACTIVITY = [
  {
    id: "act-1",
    title: "Completed Lab Checkpoint: Cookie & Origin Boundary Inspection",
    meta: "MOD-02 • Deterministic Browser Sandbox",
    when: "Yesterday",
  },
  {
    id: "act-2",
    title: "Reviewed Theoretical Lesson: Threat Modeling Authorized Scope",
    meta: "MOD-01 • Section 4 of 9",
    when: "2 days ago",
  },
  {
    id: "act-3",
    title: "Unlocked Mission Briefing: Operation Glass Harbor",
    meta: "MSN-01A • Synthetic Range Preview",
    when: "4 days ago",
  },
];

const DEMO_ACHIEVEMENTS = [
  {
    title: "Zero-Trust Initiate",
    desc: "Completed Identity & Session Defense theoretical track",
    earned: true,
  },
  {
    title: "Clean Scope Analyst",
    desc: "Zero out-of-scope actions across 5 consecutive sandbox labs",
    earned: true,
  },
  {
    title: "First Graded Mission",
    desc: "Unlocks when Milestone 02 server-graded mission APIs launch",
    earned: false,
  },
];

export function StudentDashboard() {
  const { user } = useAuth();
  const [trackFilter, setTrackFilter] = React.useState<string>("ALL");
  const [selectedMission, setSelectedMission] =
    React.useState<DemoMissionItem | null>(null);

  if (!user) return null;

  const filteredModules =
    trackFilter === "ALL"
      ? DEMO_MODULES
      : DEMO_MODULES.filter((mod) => mod.track === trackFilter);

  return (
    <div className="space-y-6">
      {/* Live Account Welcome & Verification Banner */}
      <div className="rounded-2xl border border-border/85 bg-gradient-to-r from-surface via-surface-elevated/85 to-cyan-950/25 p-6 shadow-cyber-panel">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={user.active_role} active />
              <Badge
                variant={user.email_verified ? "success" : "warning"}
                className="font-mono text-[10px]"
              >
                {user.email_verified
                  ? "EMAIL VERIFIED"
                  : "EMAIL VERIFICATION PENDING"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                Joined {formatShortDate(user.created_at)}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {user.full_name}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
              Your authenticated identity ({user.email}) and assigned roles (
              {user.roles.join(", ")}) are synchronized with the CyberLab
              account service.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/profile">Manage Profile</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/settings/mfa">
                <Shield className="h-4 w-4" />
                <span>Configure MFA</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Live Unverified Email Callout (if unverified) */}
      {!user.email_verified ? (
        <Alert variant="warning">
          <MailWarning className="h-4 w-4" />
          <AlertTitle>Verify Your Email Before Official Assessments</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              You can manage your account settings now, but future formally
              assessed missions and Instructor role approvals require a verified
              email address.
            </span>
            <Button asChild variant="warning" size="sm" className="shrink-0">
              <Link href="/settings/profile">Verify / Resend Link</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Mandatory Explicit Demo Data Notice */}
      <DemoDataBanner />

      {/* Top Learning Progress KPI Row (Demo) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Curriculum Progress",
            value: "53%",
            sub: "16 / 30 lessons reviewed",
            icon: BookOpen,
          },
          {
            label: "Sandbox Labs Completed",
            value: "4 / 8",
            sub: "Deterministic browser engine",
            icon: Terminal,
          },
          {
            label: "Mission Readiness Score",
            value: "74 / 100",
            sub: "Synthetic competency index",
            icon: Compass,
          },
          {
            label: "Earned Milestones",
            value: "2 / 3",
            sub: "Module 01–02 track",
            icon: Trophy,
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                  <DemoBadge />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <p className="font-display text-2xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <Icon className="h-5 w-5 text-cyan-400" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Performance Summary Chart + Assigned Missions */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Competency Telemetry</CardTitle>
              <DemoBadge />
            </div>
            <CardDescription>
              Domain mastery across introductory defensive modules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={DEMO_SKILL_PROGRESS}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148, 163, 184, 0.14)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="domain"
                    type="category"
                    width={108}
                    tick={{ fill: "#CBD5E1", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1324",
                      borderColor: "rgba(56, 189, 248, 0.3)",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="mastery"
                    name="Mastery %"
                    fill="#06B6D4"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card id="missions" className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Assigned Missions Preview</CardTitle>
              <DemoBadge />
            </div>
            <CardDescription>
              Inspect synthetic mission briefings. Official server-timed mission
              attempts launch in Milestone 02.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {DEMO_MISSIONS.map((msn) => (
              <div
                key={msn.id}
                className="rounded-xl border border-border/80 bg-surface-elevated/55 p-4 space-y-3 transition-colors hover:border-cyan-500/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-400">
                      {msn.code}
                    </span>
                    <Badge variant="teal">{msn.difficulty}</Badge>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {msn.duration}
                  </span>
                </div>
                <div>
                  <h4 className="font-display text-sm font-semibold text-foreground">
                    {msn.title}
                  </h4>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    Authorized Scope: {msn.targetSubnet}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Badge variant="outline">{msn.status}</Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedMission(msn)}
                  >
                    Open Mission Briefing
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Available Modules Preview */}
      <Card id="modules">
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Available Curriculum Modules</CardTitle>
                <DemoBadge />
              </div>
              <CardDescription>
                Structured theoretical modules paired with browser laboratory
                checkpoints
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["ALL", "Foundations", "Identity Defense", "SOC Operations"].map(
                (track) => (
                  <Button
                    key={track}
                    type="button"
                    size="sm"
                    variant={trackFilter === track ? "default" : "outline"}
                    onClick={() => setTrackFilter(track)}
                    className="h-8 text-xs"
                  >
                    {track === "ALL" ? "All Tracks" : track}
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {filteredModules.map((mod) => (
            <div
              key={mod.id}
              className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-elevated/45 p-4 space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-cyan-400">
                    {mod.code} • {mod.track}
                  </span>
                  <Badge
                    variant={
                      mod.labStatus === "Completed"
                        ? "success"
                        : mod.labStatus === "In Progress"
                        ? "default"
                        : "outline"
                    }
                  >
                    {mod.labStatus}
                  </Badge>
                </div>
                <h4 className="font-display text-base font-semibold text-foreground">
                  {mod.title}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {mod.summary}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {mod.lessonsCompleted}
                  </span>
                  <span className="font-mono text-cyan-400">
                    {mod.progressPct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/70">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-teal-400"
                    style={{ width: `${mod.progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent Activity + Achievements */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Recent Learning Activity</CardTitle>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEMO_RECENT_ACTIVITY.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/75 bg-surface-elevated/45 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <Activity className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {act.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{act.meta}</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                  {act.when}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Achievements Preview</CardTitle>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEMO_ACHIEVEMENTS.map((ach) => (
              <div
                key={ach.title}
                className="flex items-start gap-3 rounded-lg border border-border/75 bg-surface-elevated/45 p-3.5"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    ach.earned
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {ach.earned ? (
                    <Award className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {ach.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ach.desc}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Mission Briefing Preview Modal */}
      <Dialog
        open={selectedMission !== null}
        onOpenChange={(open) => !open && setSelectedMission(null)}
      >
        <DialogContent>
          {selectedMission ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 pb-1">
                  <Badge variant="default" className="font-mono">
                    {selectedMission.code}
                  </Badge>
                  <DemoBadge />
                </div>
                <DialogTitle>{selectedMission.title}</DialogTitle>
                <DialogDescription>
                  Authorized Synthetic Target: {selectedMission.targetSubnet} •{" "}
                  {selectedMission.duration}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mission Objectives (Demonstration Preview)
                </p>
                <ul className="space-y-2">
                  {selectedMission.objectives.map((obj) => (
                    <li
                      key={obj}
                      className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-elevated/50 p-2.5 text-xs"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
                <Alert variant="info">
                  <AlertDescription className="text-xs">
                    Server-timed mission execution and grading endpoints are not
                    yet published in OpenAPI v0.2.0. This briefing previews the
                    upcoming Milestone 02 simulation workflow.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedMission(null)}
                >
                  Close Briefing
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
