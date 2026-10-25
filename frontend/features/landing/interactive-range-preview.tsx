"use client";

import * as React from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  FileCode2,
  Network,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RangeNode {
  id: string;
  name: string;
  subnet: string;
  role: string;
  status: "NOMINAL" | "OBSERVED" | "HARDENED";
  telemetry: string[];
  x: number;
  y: number;
}

const RANGE_NODES: RangeNode[] = [
  {
    id: "edge-gw",
    name: "edge-gw-01.sim.local",
    subnet: "10.24.0.1/24",
    role: "Ingress Inspection & TLS Termination",
    status: "HARDENED",
    telemetry: [
      "TLS 1.3 strict cipher profile enforced",
      "Origin & Fetch-Metadata validation active",
      "Rate-limit bucket: 0 anomalous bursts",
    ],
    x: 82,
    y: 110,
  },
  {
    id: "web-app",
    name: "portal-app-02.sim.local",
    subnet: "10.24.10.14/24",
    role: "Synthetic Web Application Target",
    status: "OBSERVED",
    telemetry: [
      "HTTP response headers audited (CSP, Referrer-Policy)",
      "Session cookie flags: HttpOnly, SameSite=Lax",
      "Synthetic log stream forwarded to SIEM collector",
    ],
    x: 245,
    y: 58,
  },
  {
    id: "siem-core",
    name: "siem-collector.sim.local",
    subnet: "10.24.20.8/24",
    role: "Deterministic Telemetry & Grading Engine",
    status: "NOMINAL",
    telemetry: [
      "Immutable security audit trail synchronized",
      "Evidence hash verification: SHA-256 deterministic",
      "Server-authoritative mission timer ready",
    ],
    x: 245,
    y: 162,
  },
  {
    id: "id-vault",
    name: "identity-vault.sim.local",
    subnet: "10.24.30.5/24",
    role: "Argon2id & TOTP Verification Boundary",
    status: "HARDENED",
    telemetry: [
      "Argon2id credential verification active",
      "Fernet-encrypted TOTP step-up enforcement",
      "Last-Administrator advisory lock armed",
    ],
    x: 412,
    y: 110,
  },
];

export function InteractiveRangePreview() {
  const [activeTab, setActiveTab] = React.useState<
    "topology" | "workbench" | "mission"
  >("topology");
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>("web-app");

  const activeNode =
    RANGE_NODES.find((node) => node.id === selectedNodeId) ?? RANGE_NODES[0];

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-card/95 shadow-cyber-glow overflow-hidden">
      {/* Virtual OS Window Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-elevated/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/75" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/75" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/75" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            cyberlab://range-sandbox/module-01-preview
          </span>
        </div>
        <Badge variant="default" className="font-mono text-[10px] uppercase">
          Interactive Architecture Preview
        </Badge>
      </div>

      {/* Mode Switcher Tabs */}
      <div
        role="tablist"
        aria-label="Laboratory preview modes"
        className="grid grid-cols-3 border-b border-border/80 bg-surface/70 text-xs"
      >
        {[
          {
            id: "topology" as const,
            label: "SOC Topology",
            icon: Network,
          },
          {
            id: "workbench" as const,
            label: "Lab Workbench",
            icon: Terminal,
          },
          {
            id: "mission" as const,
            label: "Mission Rubric",
            icon: ShieldCheck,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-3 font-medium transition-colors border-b-2",
                isSelected
                  ? "border-cyan-400 bg-cyan-500/10 text-cyan-500 dark:text-cyan-300"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-surface-elevated/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* View Content */}
      <div className="p-4 sm:p-5">
        {activeTab === "topology" ? (
          <div className="space-y-4">
            <div className="relative rounded-xl border border-border/80 bg-slate-950/85 p-3 overflow-hidden">
              <svg
                viewBox="0 0 495 220"
                className="w-full h-48 sm:h-52 select-none"
                role="img"
                aria-label="Synthetic cybersecurity training subnet topology"
              >
                <defs>
                  <linearGradient id="cyberLink" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.35" />
                    <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {/* Subnet Grid Lines */}
                <g stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1">
                  <line x1="0" y1="55" x2="495" y2="55" />
                  <line x1="0" y1="110" x2="495" y2="110" />
                  <line x1="0" y1="165" x2="495" y2="165" />
                  <line x1="165" y1="0" x2="165" y2="220" />
                  <line x1="330" y1="0" x2="330" y2="220" />
                </g>

                {/* Network Edges */}
                <g stroke="url(#cyberLink)" strokeWidth="2" strokeDasharray="5 4">
                  <line x1="82" y1="110" x2="245" y2="58" />
                  <line x1="82" y1="110" x2="245" y2="162" />
                  <line x1="245" y1="58" x2="412" y2="110" />
                  <line x1="245" y1="162" x2="412" y2="110" />
                  <line x1="245" y1="58" x2="245" y2="162" />
                </g>

                {/* Interactive Nodes */}
                {RANGE_NODES.map((node) => {
                  const isSelected = node.id === activeNode.id;
                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className="cursor-pointer"
                    >
                      {isSelected ? (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="29"
                          fill="rgba(6, 182, 212, 0.16)"
                          stroke="#38BDF8"
                          strokeWidth="1.5"
                        />
                      ) : null}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="20"
                        fill="#0B1324"
                        stroke={isSelected ? "#06B6D4" : "#334155"}
                        strokeWidth="2"
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="5"
                        fill={
                          node.status === "OBSERVED" ? "#F59E0B" : "#10B981"
                        }
                      />
                      <text
                        x={node.x}
                        y={node.y + 36}
                        textAnchor="middle"
                        fill="#E2E8F0"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {node.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                <span>Click any synthetic node to inspect telemetry</span>
                <span className="font-mono text-cyan-400">
                  ISOLATED SANDBOX NET // 10.24.0.0/16
                </span>
              </div>
            </div>

            {/* Selected Node Telemetry Inspector */}
            <div className="rounded-xl border border-border/80 bg-surface-elevated/60 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-semibold text-cyan-500 dark:text-cyan-300">
                    {activeNode.name}{" "}
                    <span className="text-muted-foreground">
                      ({activeNode.subnet})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeNode.role}
                  </p>
                </div>
                <Badge
                  variant={
                    activeNode.status === "OBSERVED" ? "warning" : "success"
                  }
                  className="font-mono text-[10px]"
                >
                  {activeNode.status}
                </Badge>
              </div>
              <ul className="space-y-1.5 pt-1">
                {activeNode.telemetry.map((line) => (
                  <li
                    key={line}
                    className="flex items-center gap-2 font-mono text-xs text-foreground/90"
                  >
                    <Activity className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {activeTab === "workbench" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-slate-950 p-4 font-mono text-xs text-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span>sandbox-analyst@lab-01:~$ inspect-headers --target 10.24.10.14</span>
                <span className="text-emerald-400">DETERMINISTIC ENGINE</span>
              </div>
              <p className="text-cyan-300">
                [+] Target: https://portal-app-02.sim.local (Authorized Synthetic Host)
              </p>
              <p className="text-slate-300">
                [+] Set-Cookie: cyberlab_session=&lt;opaque&gt;; HttpOnly; SameSite=Lax; Secure
              </p>
              <p className="text-slate-300">
                [+] Cache-Control: no-store | Referrer-Policy: no-referrer
              </p>
              <p className="text-amber-300">
                [!] Finding M01-F2: Compare session-scoped active_role isolation across concurrent browsers
              </p>
              <p className="text-emerald-400">
                [✓] Evidence artifact recorded to mission notebook (2/3 objectives complete)
              </p>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-surface-elevated/50 px-3.5 py-2.5 text-xs text-muted-foreground">
              <Cpu className="h-4 w-4 shrink-0 text-cyan-400" />
              <span>
                All laboratory exercises execute against deterministic synthetic targets — never external systems.
              </span>
            </div>
          </div>
        ) : null}

        {activeTab === "mission" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-sm font-semibold">
                  Mission 01: Defensive Surface & Session Audit
                </p>
                <p className="text-xs text-muted-foreground">
                  Server-authoritative rubric preview (scheduled for Milestone 02)
                </p>
              </div>
              <Badge variant="teal" className="font-mono text-[10px]">
                100 PTS
              </Badge>
            </div>
            <div className="space-y-2">
              {[
                {
                  title: "Identify Trust Boundaries & Transport Controls",
                  pts: "30 pts",
                  done: true,
                },
                {
                  title: "Verify Session-Scoped Role Isolation & Step-Up Rules",
                  pts: "40 pts",
                  done: true,
                },
                {
                  title: "Submit Structured Remediation Brief",
                  pts: "30 pts",
                  done: false,
                },
              ].map((obj) => (
                <div
                  key={obj.title}
                  className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-elevated/60 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {obj.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <FileCode2 className="h-4 w-4 text-cyan-400" />
                    )}
                    <span className="font-medium text-foreground">
                      {obj.title}
                    </span>
                  </div>
                  <span className="font-mono text-muted-foreground">
                    {obj.pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
