/**
 * SeverityIndicator — §16.2 Severity Hierarchy rendering component.
 *
 * Renders a color chip + text label using the severity-* Tailwind tokens.
 * Includes shape-coded icon (not just color) per §10.4 contrast requirements
 * and §16.8 "consistent severity language" rule.
 */
import React from "react";
import type { IncidentSeverity } from "../../types/entities";

const SEVERITY_CONFIG: Record<IncidentSeverity, { label: string; icon: string; className: string }> = {
  Emergency:     { label: "Emergency",     icon: "⬟", className: "bg-severity-emergency text-white" },
  Critical:      { label: "Critical",      icon: "◆", className: "bg-severity-critical text-white" },
  High:          { label: "High",          icon: "▲", className: "bg-severity-warning text-slate-900" },
  Medium:        { label: "Medium",        icon: "●", className: "bg-severity-advisory text-white" },
  Low:           { label: "Low",           icon: "■", className: "bg-severity-advisory text-white" },
  Informational: { label: "Info",          icon: "○", className: "bg-severity-information text-white" },
};

interface SeverityIndicatorProps {
  readonly severity: IncidentSeverity;
  /** Compact mode omits the text label, showing only the icon chip. */
  readonly compact?: boolean;
}

export const SeverityIndicator: React.FC<SeverityIndicatorProps> = React.memo(
  ({ severity, compact = false }) => {
    const config = SEVERITY_CONFIG[severity];
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-none px-2 py-0.5 text-xs font-semibold font-mono tracking-wider uppercase border border-transparent ${config.className}`}
        role="img"
        aria-label={`Severity: ${config.label}`}
      >
        <span aria-hidden="true" className="text-[10px]">{config.icon}</span>
        {!compact && <span>{config.label}</span>}
      </span>
    );
  },
);

SeverityIndicator.displayName = "SeverityIndicator";
