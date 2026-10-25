"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Cpu,
  GraduationCap,
  Layers,
  Lock,
  Network,
  Radar,
  ShieldCheck,
  Terminal,
  UserCheck,
} from "lucide-react";
import { BackendModeBar } from "@/components/layout/backend-mode-bar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CyberLogo } from "@/components/shared/cyber-logo";
import { InteractiveRangePreview } from "@/features/landing/interactive-range-preview";
import { ROLE_METADATA } from "@/features/roles/role-metadata";
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

export default function LandingPage() {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground cyber-grid-bg">
      <BackendModeBar />

      {/* Public Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="CyberLab Academy Home">
            <CyberLogo />
          </Link>

          <nav
            aria-label="Landing page sections"
            className="hidden md:flex items-center gap-6 text-sm text-muted-foreground"
          >
            <a href="#overview" className="hover:text-foreground transition-colors">
              Platform
            </a>
            <a href="#theory" className="hover:text-foreground transition-colors">
              Theory
            </a>
            <a href="#labs" className="hover:text-foreground transition-colors">
              Interactive Labs
            </a>
            <a href="#missions" className="hover:text-foreground transition-colors">
              Missions
            </a>
            <a href="#progress" className="hover:text-foreground transition-colors">
              Progress & Roles
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {isAuthenticated && user ? (
              <Button asChild size="sm">
                <Link
                  href={ROLE_METADATA[user.active_role].dashboardPath}
                >
                  <span>Open {ROLE_METADATA[user.active_role].label} Console</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">
                    <span>Create Account</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 cyber-radial-spotlight">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-20 lg:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3.5 py-1 text-xs font-medium text-cyan-600 dark:text-cyan-300">
                <Radar className="h-3.5 w-3.5" />
                <span>Cybersecurity Education & Deterministic Range Platform</span>
              </div>

              <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.1]">
                Master Modern Cyber Defense Through{" "}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-teal-400 bg-clip-text text-transparent">
                  Theory, Labs, and Live Missions
                </span>
              </h1>

              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg leading-relaxed">
                CyberLab Academy bridges structured security engineering theory
                with deterministic browser simulations and mission-graded SOC
                scenarios — built from the ground up with role-scoped
                governance, Argon2id identity security, and TOTP step-up
                verification.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {isAuthenticated && user ? (
                  <Button asChild size="lg">
                    <Link
                      href={ROLE_METADATA[user.active_role].dashboardPath}
                    >
                      <span>Return to Command Center</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg">
                      <Link href="/register">
                        <span>Enroll as Student</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link href="/login">Sign In to Console</Link>
                    </Button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-border/80 pt-6">
                <div>
                  <p className="font-display text-2xl font-bold text-foreground">
                    3-Stage
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Theory → Guided Lab → Assessed Mission
                  </p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-foreground">
                    100% Safe
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Authorized synthetic simulation targets
                  </p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-foreground">
                    4 Roles
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Session-scoped RBAC & MFA step-up
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <InteractiveRangePreview />
            </div>
          </div>
        </section>

        {/* Platform Overview */}
        <section
          id="overview"
          className="border-y border-border/75 bg-surface/65 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl space-y-3">
              <Badge variant="default" className="font-mono uppercase">
                Platform Architecture
              </Badge>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Engineered Like a Security Operations Center, Designed for Deep Learning
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Unlike static video portals or unguided capture-the-flag boards,
                CyberLab Academy structures every competency into progressive
                phases so learners build analytical rigor before entering timed
                scenarios.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card id="theory" className="cyber-panel-interactive">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-500/12 text-cyan-400">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <CardTitle>1. Structured Theoretical Mastery</CardTitle>
                  <CardDescription>
                    Clear architectural breakdowns of protocols, threat models,
                    authentication state machines, and defensive telemetry.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Original threat-modeling diagrams & packet breakdowns</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Defensive engineering mindset & ethical scope boundaries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Concept checkpoints prior to sandbox execution</span>
                  </div>
                </CardContent>
              </Card>

              <Card id="labs" className="cyber-panel-interactive">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-teal-500/35 bg-teal-500/12 text-teal-400">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <CardTitle>2. Interactive Browser Laboratories</CardTitle>
                  <CardDescription>
                    Deterministic TypeScript simulation environments for safe,
                    repeatable inspection of synthetic network & application state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Zero risk to external networks — strictly synthetic targets</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Instant state reset, guided hints, and artifact capture</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Future orchestrated container range isolation roadmap</span>
                  </div>
                </CardContent>
              </Card>

              <Card id="missions" className="cyber-panel-interactive">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/35 bg-violet-500/12 text-violet-400">
                    <Compass className="h-5 w-5" />
                  </div>
                  <CardTitle>3. Mission-Based Simulations</CardTitle>
                  <CardDescription>
                    Realistic incident investigations and defensive hardening
                    briefs with server-authoritative timing and rubric scoring.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Verified-email gating before official graded missions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Versioned grading criteria & immutable audit records</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Instructor cohort visibility & structured feedback</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Student Progress & Four-Role Governance */}
        <section id="progress" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 sm:py-20 space-y-14">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-6">
              <Badge variant="teal" className="font-mono uppercase">
                Student Progress & Competency Telemetry
              </Badge>
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Measurable Readiness Across Every Defensive Domain
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Students track module completion, laboratory objectives, mission
                accuracy, and competency milestones in one unified workspace,
                while instructors and managers maintain clear operational
                oversight.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Layers,
                    title: "Domain Skill Matrix",
                    desc: "Track Network Defense, Identity Security, Log Triage, and Hardening.",
                  },
                  {
                    icon: Network,
                    title: "Evidence Portfolios",
                    desc: "Structured mission findings instead of guesswork multiple-choice.",
                  },
                  {
                    icon: Award,
                    title: "Verified Milestones",
                    desc: "Earn competency badges backed by server-verified mission runs.",
                  },
                  {
                    icon: Lock,
                    title: "Production-Grade Auth",
                    desc: "HttpOnly sessions, TOTP MFA, recovery codes, and session revocation.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="rounded-xl border border-border/80 bg-card/75 p-4 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-cyan-400" />
                        <h3 className="font-display text-sm font-semibold">
                          {item.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Four Role Ecosystem Overview */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-2xl border border-border/85 bg-card/90 p-6 shadow-cyber-panel space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      Role-Scoped Platform Workspaces
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Independent role assignments with per-session active role
                      switching
                    </p>
                  </div>
                  <Cpu className="h-5 w-5 text-cyan-400" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      icon: GraduationCap,
                      role: "Student",
                      tag: "Self-Service Signup",
                      desc: "Interactive modules, guided sandboxes, missions, and personal security controls.",
                    },
                    {
                      icon: BookOpen,
                      role: "Instructor",
                      tag: "Verified + Approved",
                      desc: "Cohort oversight, lab readiness monitoring, and student mission analytics.",
                    },
                    {
                      icon: UserCheck,
                      role: "Manager",
                      tag: "5m Step-Up Auth",
                      desc: "Student & Instructor lifecycle management and instructor application reviews.",
                    },
                    {
                      icon: ShieldCheck,
                      role: "Administrator",
                      tag: "TOTP MFA Required",
                      desc: "Privileged Manager/Admin governance, last-Admin protection, and security posture.",
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.role}
                        className="rounded-xl border border-border/80 bg-surface-elevated/55 p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
                            <Icon className="h-4 w-4 text-cyan-400" />
                            {item.role}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-500 dark:text-cyan-300">
                            {item.tag}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action Banner */}
          <div className="rounded-2xl border border-cyan-500/35 bg-gradient-to-r from-cyan-500/12 via-sky-500/8 to-violet-500/12 p-8 sm:p-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-2 max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to Enter the CyberLab Range?
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Register a Student account (with optional Instructor application
                review) or sign in to an existing CyberLab Academy identity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button asChild size="lg">
                <Link href="/register">
                  <span>Create Student Account</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Sign In</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/80 bg-surface/80 py-8 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <CyberLogo subtitle="Milestone 01C — Identity, Access & Role Workspaces" />
          <p className="text-center sm:text-right">
            Authorized synthetic training platform. Server-authoritative RBAC &
            session security powered by FastAPI + Next.js.
          </p>
        </div>
      </footer>
    </div>
  );
}
