import { Badge } from "@/components/ui/badge";
import {
  COHORT_STATUS_LABELS,
  ENROLLMENT_STATUS_LABELS,
  type CohortStatus,
  type EnrollmentStatus,
} from "@/lib/types/cohorts";
import { cn } from "@/lib/utils";

const COHORT_VARIANT: Record<
  CohortStatus,
  "success" | "default" | "teal" | "outline"
> = {
  draft: "outline",
  active: "success",
  completed: "teal",
  archived: "outline",
};

const COHORT_DOT: Record<CohortStatus, string> = {
  draft: "bg-amber-500",
  active: "bg-emerald-500",
  completed: "bg-cyan-500",
  archived: "bg-muted-foreground",
};

export function CohortStatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: CohortStatus;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <Badge
      variant={COHORT_VARIANT[status]}
      className={cn("font-mono text-[10px] uppercase", className)}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", COHORT_DOT[status])}
        />
      ) : null}
      {COHORT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EnrollmentStatusBadge({
  status,
  className,
}: {
  status: EnrollmentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={status === "active" ? "success" : "outline"}
      className={cn("font-mono text-[10px] uppercase", className)}
    >
      {ENROLLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Assignment window state, taken from the API's own `active` flag. */
export function AssignmentStatusBadge({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant={active ? "success" : "outline"}
      className={cn("font-mono text-[10px] uppercase", className)}
    >
      {active ? "Assigned" : "Removed"}
    </Badge>
  );
}
