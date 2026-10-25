"use client";

import * as React from "react";
import {
  Check,
  Clock,
  FileCheck2,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminUserPublic,
  InstructorRequestPublic,
} from "@/lib/types/api";
import { ConfirmReasonDialog } from "@/components/shared/confirm-reason-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

interface InstructorApplicationsPanelProps {
  knownUsers?: AdminUserPublic[];
  onDecisionCompleted?: () => void;
}

export function InstructorApplicationsPanel({
  knownUsers = [],
  onDecisionCompleted,
}: InstructorApplicationsPanelProps) {
  const { user: currentUser, requestStepUp } = useAuth();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = React.useState<
    "pending" | "approved" | "rejected" | ""
  >("pending");
  const [applications, setApplications] = React.useState<
    InstructorRequestPublic[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  const [decisionModal, setDecisionModal] = React.useState<{
    application: InstructorRequestPublic;
    decision: "approve" | "reject";
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [decisionError, setDecisionError] = React.useState<string | null>(null);

  const usersById = React.useMemo(() => {
    const map = new Map<string, AdminUserPublic>();
    for (const u of knownUsers) {
      map.set(u.id, u);
    }
    return map;
  }, [knownUsers]);

  const triggerReload = React.useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setReloadTick((n) => n + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    adminApi
      .listInstructorApplications(statusFilter)
      .then((list) => {
        if (!active) return;
        setApplications(list);
        setLoadError(null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.stepUpReason) {
          requestStepUp({
            reason: err.stepUpReason,
            contextDescription:
              "Step-up verification is required to view instructor applications.",
            onSuccess: () => triggerReload(),
          });
        }
        setLoadError(
          err instanceof ApiError
            ? err.detail
            : "Unable to load instructor applications."
        );
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadTick, requestStepUp, statusFilter, triggerReload]);

  const handleConfirmDecision = async (reason: string) => {
    if (!decisionModal) return;
    setIsSubmitting(true);
    setDecisionError(null);

    const runDecision = async () => {
      if (decisionModal.decision === "approve") {
        await adminApi.approveInstructorApplication(
          decisionModal.application.id,
          { reason }
        );
        toast({
          title: "Instructor application approved",
          description:
            "Instructor role granted and applicant sessions rotated.",
          variant: "success",
        });
      } else {
        await adminApi.rejectInstructorApplication(
          decisionModal.application.id,
          { reason }
        );
        toast({
          title: "Instructor application rejected",
          description: "Decision and reason recorded without granting role.",
          variant: "warning",
        });
      }
      setDecisionModal(null);
      triggerReload();
      onDecisionCompleted?.();
    };

    try {
      await runDecision();
    } catch (err) {
      if (err instanceof ApiError && err.stepUpReason) {
        setDecisionModal(null);
        requestStepUp({
          reason: err.stepUpReason,
          contextDescription:
            "Approving or rejecting an Instructor application requires recent 5-minute step-up verification.",
          onSuccess: async () => {
            await runDecision();
          },
        });
      } else {
        setDecisionError(
          err instanceof ApiError
            ? err.detail
            : "Could not record application decision."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card id="applications">
        <CardHeader className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Instructor Applications Review</CardTitle>
                <Badge variant="teal" className="font-mono text-[10px]">
                  LIVE /admin/instructor-applications
                </Badge>
              </div>
              <CardDescription>
                Approve or reject Instructor applications. Applicants must have
                an active account and verified email address before approval.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                  { value: "", label: "All" },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.label}
                  type="button"
                  size="sm"
                  variant={statusFilter === tab.value ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Refresh instructor applications"
                onClick={triggerReload}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <LoadingState
              label="Loading instructor applications..."
              rows={3}
            />
          ) : loadError ? (
            <ErrorState
              title="Applications Unavailable"
              description={loadError}
              onRetry={triggerReload}
            />
          ) : applications.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title={
                statusFilter === "pending"
                  ? "No pending instructor applications"
                  : "No instructor applications in this view"
              }
              description="When students select the Instructor application option during registration, their request appears here."
            />
          ) : (
            <div className="space-y-3">
              {applications.map((app) => {
                const applicant = usersById.get(app.user_id);
                const isSelf = currentUser?.id === app.user_id;
                const isPending = app.status === "pending";
                const unverifiedWarning =
                  applicant !== undefined && !applicant.email_verified;
                const inactiveWarning =
                  applicant !== undefined && !applicant.is_active;

                return (
                  <div
                    key={app.id}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-border/80 bg-surface-elevated/45 p-4 md:flex-row md:items-center"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold text-foreground">
                          {applicant
                            ? applicant.full_name
                            : `Applicant ID: ${app.user_id}`}
                        </span>
                        {applicant ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            ({applicant.email})
                          </span>
                        ) : null}
                        <Badge
                          variant={
                            app.status === "approved"
                              ? "success"
                              : app.status === "rejected"
                              ? "destructive"
                              : "warning"
                          }
                          className="capitalize"
                        >
                          {app.status}
                        </Badge>
                        {unverifiedWarning ? (
                          <Badge variant="warning" className="text-[10px]">
                            Email Unverified
                          </Badge>
                        ) : null}
                        {inactiveWarning ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Account Suspended
                          </Badge>
                        ) : null}
                        {isSelf ? (
                          <Badge variant="outline" className="text-[10px]">
                            Self-Review Blocked
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Submitted {formatDateTime(app.created_at)}
                        </span>
                        {app.decided_at ? (
                          <span>
                            Decided {formatDateTime(app.decided_at)}
                          </span>
                        ) : null}
                      </div>

                      {app.reason ? (
                        <p className="text-xs text-foreground/90 bg-card/70 border border-border/60 rounded-md px-2.5 py-1.5 mt-1">
                          <span className="font-semibold text-muted-foreground">
                            Decision Note:{" "}
                          </span>
                          {app.reason}
                        </p>
                      ) : null}
                    </div>

                    {isPending ? (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            isSelf || unverifiedWarning || inactiveWarning
                          }
                          title={
                            isSelf
                              ? "Reviewers cannot decide their own application"
                              : unverifiedWarning
                              ? "Applicant must verify email before approval"
                              : undefined
                          }
                          onClick={() => {
                            setDecisionError(null);
                            setDecisionModal({
                              application: app,
                              decision: "approve",
                            });
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            isSelf || unverifiedWarning || inactiveWarning
                          }
                          className="text-red-400 hover:text-red-300"
                          onClick={() => {
                            setDecisionError(null);
                            setDecisionModal({
                              application: app,
                              decision: "reject",
                            });
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <UserCheck className="h-4 w-4 text-teal-400" />
                        <span>Recorded</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmReasonDialog
        open={decisionModal !== null}
        onOpenChange={(open) => !open && setDecisionModal(null)}
        title={
          decisionModal?.decision === "approve"
            ? "Approve Instructor Application"
            : "Reject Instructor Application"
        }
        description={
          decisionModal?.decision === "approve"
            ? "Approving grants the Instructor role to this verified account and revokes their existing sessions so permissions refresh cleanly."
            : "Rejecting closes this Instructor application without granting new privileges and records the decision reason."
        }
        confirmLabel={
          decisionModal?.decision === "approve"
            ? "Approve & Grant Instructor"
            : "Reject Application"
        }
        variant={
          decisionModal?.decision === "approve" ? "default" : "destructive"
        }
        reasonLabel="Review Decision Reason"
        reasonPlaceholder="Summarize verification of credentials or reason for rejection (3–500 characters)..."
        isSubmitting={isSubmitting}
        errorMessage={decisionError}
        onConfirm={handleConfirmDecision}
      />
    </>
  );
}
