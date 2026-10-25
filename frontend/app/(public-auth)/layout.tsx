"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { BackendModeBar } from "@/components/layout/backend-mode-bar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CyberLogo } from "@/components/shared/cyber-logo";

export default function PublicAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground cyber-grid-bg">
      <BackendModeBar />

      <header className="border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Return to CyberLab Academy landing page">
            <CyberLogo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Platform Overview</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8 cyber-radial-spotlight">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-12">
          {/* Left Security Architecture Panel (Desktop) */}
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-between space-y-6 rounded-2xl border border-border/80 bg-surface/80 p-7 shadow-cyber-panel">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
                Identity & Session Boundary
              </span>
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Zero-Trust Account Security by Default
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                CyberLab Academy enforces server-side session cookies,
                per-session role isolation, and step-up verification across
                every training and administrative workflow.
              </p>
            </div>

            <div className="space-y-3.5 pt-2">
              {[
                {
                  icon: Lock,
                  title: "Opaque HttpOnly Session Cookies",
                  desc: "No JWTs or credentials stored in browser localStorage.",
                },
                {
                  icon: ShieldCheck,
                  title: "Session-Scoped Active Roles",
                  desc: "Switch between Student, Instructor, Manager, and Administrator independently per session.",
                },
                {
                  icon: KeyRound,
                  title: "TOTP Step-Up & Recovery",
                  desc: "5-minute verification windows and Fernet-encrypted MFA for privileged operations.",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-elevated/50 p-3.5"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
