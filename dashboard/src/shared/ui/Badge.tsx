/**
 * Badge — §16.5 Badge Semantics.
 *
 * "Badges supplement, never replace, textual information."
 *
 * Each badge type has a distinct visual treatment so operators can
 * identify meaning at a glance without reading the label text.
 */
import React from "react";

export type BadgeType = "numeric" | "severity" | "status" | "health" | "replay" | "warning";

const BADGE_CLASSES: Record<BadgeType, string> = {
  numeric:  "bg-slate-700 text-slate-100",
  severity: "bg-severity-emergency/20 text-severity-emergency",
  status:   "bg-status-active/20 text-status-active",
  health:   "bg-green-900/40 text-green-400",
  replay:   "bg-blue-900/40 text-blue-400",
  warning:  "bg-severity-warning/20 text-severity-warning",
};

interface BadgeProps {
  readonly type: BadgeType;
  readonly children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = React.memo(({ type, children }) => {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-type-6 font-semibold font-industrial tabular-nums ${BADGE_CLASSES[type]}`}
      aria-label={`${type} badge`}
    >
      {children}
    </span>
  );
});

Badge.displayName = "Badge";
