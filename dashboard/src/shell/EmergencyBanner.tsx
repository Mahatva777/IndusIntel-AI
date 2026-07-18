/**
 * EmergencyBanner — §9.5/§9.6/§9.11/§16.6 P1/§16.7 Level 1.
 *
 * Visibility is a pure function of `DashboardDerivationChain.emergencyBannerVisible`.
 * Content = Primary Incident severity, zone, escalation level.
 * Never locally toggled — §9.11 "the UI State Machine has no independent input".
 *
 * §9.6 Visual Persistence: "Emergency Banner — Persistent" → remains visible
 * as long as operational state is Emergency; removed only on resolution (§9.7).
 *
 * §10.3 Focus Order Priority 1 — receives role="alert" and aria-live="assertive".
 * §9.10 — renders backend-published escalationLevel, never starts a local countdown.
 */
import React from "react";
import { useLayoutState } from "./LayoutContext";
import { SeverityIndicator } from "../shared/ui/SeverityIndicator";
import { Typo } from "../shared/ui/Typography";
import { Badge } from "../shared/ui/Badge";
import type { EscalationLevel } from "../types/entities";

const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  None:                   "",
  Reminder:               "Reminder Sent",
  AudibleReminder:        "Audible Reminder",
  SupervisorEscalated:    "Supervisor Escalated",
  PlantManagerEscalated:  "Plant Manager Escalated",
  Acknowledged:           "Acknowledged",
};

export const EmergencyBanner: React.FC = React.memo(() => {
  const { emergencyBannerVisible, primaryIncident, escalationLevel } = useLayoutState();

  // §9.11: visibility is derived, never toggled
  if (!emergencyBannerVisible || !primaryIncident) {
    return null;
  }

  const escalationLabel = ESCALATION_LABELS[escalationLevel];
  const isEscalated =
    escalationLevel === "SupervisorEscalated" ||
    escalationLevel === "PlantManagerEscalated";

  return (
    <div
      tabIndex={1}
      role="alert"
      aria-live="assertive"
      className={`
        relative z-panel-p1 w-full
        bg-severity-emergency/10 border-b-2 border-severity-emergency
        px-6 py-3
        animate-attention
      `}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: severity + primary message */}
        <div className="flex items-center gap-3">
          <SeverityIndicator severity={primaryIncident.severity} />
          <Typo level={1} className="text-severity-emergency">
            EMERGENCY
          </Typo>
          <Typo level={4} className="text-slate-200">
            Incident {primaryIncident.id} — Zone {primaryIncident.zoneId}
          </Typo>
        </div>

        {/* Right: escalation state from backend (§9.10) */}
        <div className="flex items-center gap-3">
          {escalationLabel && (
            <Badge type={isEscalated ? "warning" : "status"}>
              {escalationLabel}
            </Badge>
          )}
          <Typo level={5} className="text-slate-400 tabular-nums">
            Risk: {primaryIncident.riskScore.toFixed(1)}
          </Typo>
        </div>
      </div>
    </div>
  );
});

EmergencyBanner.displayName = "EmergencyBanner";
