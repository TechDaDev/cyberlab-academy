import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmReasonDialog } from "@/components/shared/confirm-reason-dialog";

// Radix unmounts closed content immediately in jsdom, so this stub keeps it mounted the
// way the browser does during the exit animation.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ConfirmReasonDialog closing copy", () => {
  it("keeps the confirmed action's wording while the dialog animates out", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmReasonDialog
        open
        onOpenChange={() => {}}
        title="Approve Instructor Application"
        description="Approving grants the Instructor role."
        confirmLabel="Approve & Grant Instructor"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Approve Instructor Application")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve & Grant Instructor" })).toBeInTheDocument();

    // A resolved mutation clears the pending action, so the callers now pass fallback copy
    // while the dialog is still mounted for its exit animation.
    rerender(
      <ConfirmReasonDialog
        open={false}
        onOpenChange={() => {}}
        title="Reject Instructor Application"
        description="Rejecting closes this application."
        confirmLabel="Reject Application"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Approve Instructor Application")).toBeInTheDocument();
    expect(screen.queryByText("Reject Instructor Application")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve & Grant Instructor" })).toBeInTheDocument();
  });

  it("adopts the new wording when a different action is opened afterwards", () => {
    const { rerender } = render(
      <ConfirmReasonDialog
        open
        onOpenChange={() => {}}
        title="Suspend Synthetic Learner"
        description="Suspending revokes sessions."
        confirmLabel="Confirm Suspension"
        variant="destructive"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Suspend Synthetic Learner")).toBeInTheDocument();

    rerender(
      <ConfirmReasonDialog
        open
        onOpenChange={() => {}}
        title="Reactivate Synthetic Learner"
        description="Reactivating restores sign-in."
        confirmLabel="Confirm Reactivation"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Reactivate Synthetic Learner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Reactivation" })).toBeInTheDocument();
  });
});
