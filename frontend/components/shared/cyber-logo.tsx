import * as React from "react";
import { cn } from "@/lib/utils";

interface CyberLogoProps {
  className?: string;
  compact?: boolean;
  subtitle?: string;
}

export function CyberLogo({
  className,
  compact = false,
  subtitle = "SOC & Range Academy",
}: CyberLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 via-sky-500/10 to-violet-500/15 shadow-xs">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className="h-5 w-5 text-cyan-400"
        >
          <path
            d="M16 3L27 8.5V16.8C27 22.9 22.3 27.6 16 29.5C9.7 27.6 5 22.9 5 16.8V8.5L16 3Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 15.8L14.6 18.9L20.8 12.7"
            stroke="#38BDF8"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="7.5" r="1.2" fill="#14B8A6" />
        </svg>
      </div>
      {!compact ? (
        <div className="flex flex-col leading-none">
          <span className="font-display text-sm font-bold tracking-tight text-foreground sm:text-base">
            CyberLab <span className="text-cyan-500 dark:text-cyan-400">Academy</span>
          </span>
          {subtitle ? (
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
