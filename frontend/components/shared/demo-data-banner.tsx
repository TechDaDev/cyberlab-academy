import * as React from "react";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DemoDataBannerProps {
  title?: string;
  description?: string;
  className?: string;
}

export function DemoDataBanner({
  title = "Synthetic Curriculum & Telemetry Preview",
  description = "Identity, session state, and role authorization on this screen are live. Class rosters, mission telemetry, assessments, and progress metrics below use synthetic demonstration data until Milestone 02 simulation APIs are published.",
  className,
}: DemoDataBannerProps) {
  return (
    <div
      role="note"
      aria-label="Demonstration data notice"
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/15 text-amber-500 dark:text-amber-300">
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant="warning" className="font-mono text-[10px] uppercase">
              Demo Telemetry
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="warning"
      className={cn("font-mono text-[10px] uppercase tracking-wider", className)}
    >
      Demo Preview
    </Badge>
  );
}
