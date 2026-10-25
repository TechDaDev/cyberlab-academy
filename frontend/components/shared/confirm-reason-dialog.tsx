"use client";

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "default",
  requireReason = true,
  reasonLabel = "Administrative Audit Reason",
  reasonPlaceholder = "Document the operational or compliance reason (3–500 characters)...",
  isSubmitting = false,
  errorMessage,
  onConfirm,
}: ConfirmReasonDialogProps) {
  const [reason, setReason] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Callers derive the copy from a nullable "pending action" state that is cleared the
  // moment the mutation resolves. The dialog stays mounted while it animates out, so
  // without this snapshot the closing dialog would flip to the fallback wording.
  const [openCopy, setOpenCopy] = React.useState({
    title,
    description,
    confirmLabel,
    variant,
  });
  if (
    open &&
    (openCopy.title !== title ||
      openCopy.description !== description ||
      openCopy.confirmLabel !== confirmLabel ||
      openCopy.variant !== variant)
  ) {
    setOpenCopy({ title, description, confirmLabel, variant });
  }
  const copy = open ? { title, description, confirmLabel, variant } : openCopy;

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReason("");
      setValidationError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (requireReason) {
      if (trimmed.length < 3) {
        setValidationError("Audit reason must be at least 3 characters.");
        return;
      }
      if (trimmed.length > 500) {
        setValidationError("Audit reason cannot exceed 500 characters.");
        return;
      }
    }
    setValidationError(null);
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert
              className={
                copy.variant === "destructive"
                  ? "h-5 w-5 text-red-400"
                  : "h-5 w-5 text-cyan-400"
              }
            />
            <span>{copy.title}</span>
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {requireReason ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-audit-reason">{reasonLabel}</Label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {reason.trim().length}/500
                </span>
              </div>
              <Textarea
                id="admin-audit-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={reasonPlaceholder}
                maxLength={500}
                disabled={isSubmitting}
                required
              />
              {validationError ? (
                <p role="alert" className="text-xs text-red-400">
                  {validationError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Recorded immutably in the server-side security audit trail with actor and UTC timestamp.
                </p>
              )}
            </div>
          ) : null}

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription className="text-red-300">
                {errorMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={copy.variant === "destructive" ? "destructive" : "default"}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                copy.confirmLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
