/**
 * StatusBadge — §16.3 Status Hierarchy rendering component.
 *
 * Maps lifecycle status to the status-* Tailwind tokens.
 * Text label always accompanies color per §16.8 and §10.4.
 */
import React from "react";

/**
 * All status values from §16.3 that the badge can render.
 * Components pass whichever status type they have; this union
 * covers them all.
 */
export type StatusValue =
  | "Active"
  | "Acknowledged"
  | "Escalated"
  | "Resolved"
  | "Archived"
  | "Unavailable"
  // PermitStatus aliases that map to the same visual language
  | "Suspended"
  | "Resumed"
  | "Closed";

const STATUS_CLASS: Record<StatusValue, string> = {
  Active:       "bg-status-active/20 text-status-active border-status-active/40",
  Acknowledged: "bg-status-acknowledged/20 text-status-acknowledged border-status-acknowledged/40",
  Escalated:    "bg-status-escalated/20 text-status-escalated border-status-escalated/40",
  Resolved:     "bg-status-resolved/20 text-status-resolved border-status-resolved/40",
  Archived:     "bg-status-archived/20 text-status-archived border-status-archived/40",
  Unavailable:  "bg-status-unavailable/20 text-status-unavailable border-status-unavailable/40",
  // Map permit-specific statuses to nearest semantic status
  Suspended:    "bg-status-escalated/20 text-status-escalated border-status-escalated/40",
  Resumed:      "bg-status-active/20 text-status-active border-status-active/40",
  Closed:       "bg-status-archived/20 text-status-archived border-status-archived/40",
};

interface StatusBadgeProps {
  readonly status: StatusValue;
  readonly variant?: "pill" | "dot";
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(
  ({ status, variant = "pill" }) => {
    const classes = STATUS_CLASS[status] ?? STATUS_CLASS.Unavailable;

    const glyph = ["Escalated", "Suspended"].includes(status) ? "▲" : 
                  ["Resolved", "Archived", "Closed"].includes(status) ? "■" : 
                  ["Acknowledged"].includes(status) ? "◆" : "●";

    if (variant === "dot") {
      return (
        <span className="inline-flex items-center gap-1.5" aria-label={`Status: ${status}`}>
          <span className={`inline-flex items-center justify-center font-mono text-[10px] ${classes.split(' ')[1]}`} aria-hidden="true">{glyph}</span>
          <span className="text-type-6 font-mono tracking-wider uppercase text-[var(--color-text-secondary)]">{status}</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-xs font-semibold font-mono tracking-wider uppercase ${classes}`}
        aria-label={`Status: ${status}`}
      >
        <span className="text-[10px] opacity-80">{glyph}</span>
        {status}
      </span>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
