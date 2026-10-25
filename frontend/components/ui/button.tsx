import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 font-semibold shadow-xs hover:from-cyan-400 hover:to-sky-400 active:scale-[0.99]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/80 hover:bg-secondary/80 hover:border-cyan-500/35",
        outline:
          "border border-border bg-surface/60 text-foreground hover:bg-surface-elevated hover:border-cyan-500/40",
        ghost:
          "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
        destructive:
          "bg-red-600 text-white font-semibold shadow-xs hover:bg-red-500",
        warning:
          "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25",
        link: "text-cyan-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
