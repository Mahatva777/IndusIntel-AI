/**
 * ConfirmDialog — §6.4 Confirmation Policy.
 *
 * Reusable confirmation modal required by §6.4 for high-impact actions:
 * Escalate, Silence, Close, Dispatch, Suspend Permit, Resume Permit.
 *
 * "Write confirmation: Required for high-impact actions" (§6.1).
 * "High-impact actions require explicit confirmation" (§6.11 rule 2).
 *
 * §10.2: Dialog Actions — Enter/Escape supported.
 */
import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Typo } from "./Typography";

interface ConfirmDialogProps {
  /** Whether the dialog is currently visible. */
  readonly open: boolean;
  /** Human-readable action name, e.g. "Escalate Incident". */
  readonly actionName: string;
  /** Warning text explaining the consequence of the action. */
  readonly message: string;
  /** Severity-based styling: "warning" for most, "danger" for close/escalate. */
  readonly variant?: "warning" | "danger";
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  actionName,
  message,
  variant = "warning",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // §10.2: Escape closes the dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // Focus the confirm button on open for keyboard accessibility
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-severity-emergency hover:bg-severity-emergency/80"
      : "bg-severity-warning hover:bg-severity-warning/80 text-slate-900";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="
          w-full max-w-md
          bg-[var(--color-surface-overlay)] border border-[var(--color-border-emphasis)]
          rounded-xl p-6 shadow-2xl
          animate-emphasis
        "
        onClick={(e) => e.stopPropagation()}
      >
        <Typo level={3} className="text-slate-100 mb-2">
          <span id="confirm-title">Confirm: {actionName}</span>
        </Typo>
        <p id="confirm-desc" className="text-type-5 font-industrial text-slate-300 mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="
              px-4 py-2 rounded-lg
              text-type-5 font-semibold font-industrial
              bg-slate-700 text-slate-200
              hover:bg-slate-600 transition-colors
            "
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`
              px-4 py-2 rounded-lg
              text-type-5 font-semibold font-industrial text-white
              transition-colors ${confirmClass}
            `}
          >
            {actionName}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
