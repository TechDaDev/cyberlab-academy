"use client";

import * as React from "react";
import { CloudCog, PlugZap, RefreshCw, ServerOff } from "lucide-react";
import { isPreviewDemoFeatureAllowed } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function BackendModeBar() {
  const { apiMode, backendHealth, setMode, recheckBackendHealth } = useAuth();
  const [checking, setChecking] = React.useState(false);

  if (apiMode === "preview-demo") {
    return (
      <div
        role="region"
        aria-label="Cloud Preview Demo Adapter status"
        className="border-b border-amber-500/40 bg-amber-500/12 px-4 py-2 text-xs"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-foreground">
            <CloudCog className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong className="font-semibold text-amber-500 dark:text-amber-300">
                Cloud Preview Demo Adapter Active:
              </strong>{" "}
              Account actions are running against an isolated in-memory preview
              simulation and are{" "}
              <strong className="underline">not persisted</strong> to a FastAPI
              database.
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => void setMode("live")}
          >
            <PlugZap className="h-3.5 w-3.5 text-cyan-400" />
            <span>Switch to Live FastAPI (/api/v1)</span>
          </Button>
        </div>
      </div>
    );
  }

  if (backendHealth === "unreachable") {
    const canUsePreview = isPreviewDemoFeatureAllowed();
    return (
      <div
        role="region"
        aria-label="FastAPI backend connection notice"
        className="border-b border-cyan-500/35 bg-cyan-500/10 px-4 py-2 text-xs"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-foreground">
            <ServerOff className="h-4 w-4 shrink-0 text-cyan-400" />
            <span>
              <strong className="font-semibold text-cyan-500 dark:text-cyan-300">
                FastAPI Backend Unreachable:
              </strong>{" "}
              Start local FastAPI on{" "}
              <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono">
                127.0.0.1:8000
              </code>{" "}
              for live persistence
              {canUsePreview
                ? ", or enable the labeled Cloud Preview Demo Adapter to inspect UI workflows."
                : "."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await recheckBackendHealth();
                setChecking(false);
              }}
            >
              <RefreshCw
                className={`h-3 w-3 ${checking ? "animate-spin" : ""}`}
              />
              <span>Retry FastAPI</span>
            </Button>
            {canUsePreview ? (
              <Button
                type="button"
                variant="warning"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => void setMode("preview-demo")}
              >
                <CloudCog className="h-3.5 w-3.5" />
                <span>Enable Preview Demo Mode</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
