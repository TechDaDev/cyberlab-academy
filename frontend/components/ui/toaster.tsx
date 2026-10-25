"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 pointer-events-none"
    >
      {toasts.map((item) => {
        const variant = item.variant ?? "default";
        const Icon =
          variant === "success"
            ? CheckCircle2
            : variant === "warning"
            ? AlertTriangle
            : variant === "destructive"
            ? ShieldAlert
            : Info;

        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3",
              variant === "success" &&
                "border-emerald-500/45 bg-card/95 text-foreground",
              variant === "warning" &&
                "border-amber-500/45 bg-card/95 text-foreground",
              variant === "destructive" &&
                "border-red-500/50 bg-card/95 text-foreground",
              variant === "default" &&
                "border-cyan-500/40 bg-card/95 text-foreground"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                variant === "success" && "text-emerald-400",
                variant === "warning" && "text-amber-400",
                variant === "destructive" && "text-red-400",
                variant === "default" && "text-cyan-400"
              )}
            />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold leading-tight">{item.title}</p>
              {item.description ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
