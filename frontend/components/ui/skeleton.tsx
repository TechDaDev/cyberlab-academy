import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-surface-elevated/90 border border-border/40",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
