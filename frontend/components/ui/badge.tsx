import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        teal:
          "border-teal-500/35 bg-teal-500/12 text-teal-700 dark:text-teal-300",
        violet:
          "border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300",
        success:
          "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        warning:
          "border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300",
        destructive:
          "border-red-500/40 bg-red-500/12 text-red-700 dark:text-red-300",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
