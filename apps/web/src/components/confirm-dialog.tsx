"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";

export type ConfirmTone = "default" | "danger" | "ok";

/**
 * Native modal for irreversible or money-moving actions. Matches the app
 * shell (not the PayPal sandbox chrome). Esc / backdrop cancel when idle.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  busyLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const actionLabel = busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="confirm-dialog__card">
        <div className="confirm-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descId}>{description}</p> : null}
        </div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          {tone === "danger" ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={onConfirm}
              disabled={busy}
              autoFocus
            >
              {actionLabel}
            </button>
          ) : (
            <LiquidButton
              type="button"
              size="lg"
              className="rounded-full"
              onClick={onConfirm}
              disabled={busy}
              autoFocus
            >
              {actionLabel}
            </LiquidButton>
          )}
        </div>
      </div>
    </dialog>
  );
}
