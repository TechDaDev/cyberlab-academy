import { Badge } from "@/components/ui/badge";
import {
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from "@/lib/types/academic";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<
  ContentStatus,
  "success" | "warning" | "outline"
> = {
  published: "success",
  draft: "warning",
  archived: "outline",
};

export function ContentStatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: ContentStatus;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className={cn("font-mono text-[10px] uppercase", className)}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "published" && "bg-emerald-500",
            status === "draft" && "bg-amber-500",
            status === "archived" && "bg-muted-foreground"
          )}
        />
      ) : null}
      {CONTENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ResourceTypeBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", className)}>
      {type.replace(/_/g, " ")}
    </Badge>
  );
}
