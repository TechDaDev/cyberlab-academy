import * as React from "react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PlannedFeatureCardProps {
  title: string;
  description: string;
  contractNote: string;
  milestoneTag?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function PlannedFeatureCard({
  title,
  description,
  contractNote,
  milestoneTag = "Unavailable in OpenAPI v0.2.0",
  icon: Icon = Lock,
  className,
}: PlannedFeatureCardProps) {
  return (
    <Card
      className={cn(
        "border-dashed border-border/90 bg-surface/50 opacity-95",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {milestoneTag}
          </Badge>
        </div>
        <CardDescription className="pt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/70 bg-surface-elevated/50 px-3 py-2 text-xs text-muted-foreground font-mono">
          {contractNote}
        </div>
      </CardContent>
    </Card>
  );
}
