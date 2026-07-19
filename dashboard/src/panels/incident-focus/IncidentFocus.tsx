/**
 * IncidentFocus — P1 panel (§16.6), always reflects the Primary Incident (§8.6).
 *
 * Controls: Incident Focus Panel, Emergency Banner content, Operations Narrative.
 * Expands during emergencies (§9.5 — handled by PanelSlot, this panel fills space).
 *
 * Write actions wired through useOperatorActions (§6), never mutating stores directly:
 *  - Acknowledge Alert (§6.3 row 1): no confirmation, Operator+
 *  - Escalate Incident (§6.3 row 2): confirmation required, Supervisor+
 *  - Close Incident (§6.3 row 5): confirmation required, Supervisor+
 *  - Dispatch Response (§6.3 row 8): confirmation required, Supervisor+
 */
import { useState, useCallback } from "react";
import { useLayoutState } from "../../shell/LayoutContext";
import { useSelectionState } from "../../ui-state/selection/store";
import { useDashboardStatus } from "../../derived/selectors";
import { useOperatorActions } from "../../shared/hooks/useOperatorActions";
import {
  SeverityIndicator,
  StatusBadge,
  Badge,
  Typo,
  ConfirmDialog,
} from "../../shared/ui";
import { alarmPriorityForSeverity } from "../../types/entities";
import type { EscalationLevel } from "../../types/entities";

const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  None:                  "None",
  Reminder:              "Reminder Sent",
  AudibleReminder:       "Audible Reminder",
  SupervisorEscalated:   "Supervisor Escalated",
  PlantManagerEscalated: "Plant Manager Escalated",
  Acknowledged:          "Acknowledged",
};

type ConfirmAction = "escalate" | "close" | "dispatch" | null;

export function IncidentFocus() {
  const { focusedIncident, operationalState, escalationLevel } = useLayoutState();
  const { infrastructureHealthy } = useDashboardStatus();
  const {
    state: actionState,
    clearError,
    acknowledgeAlert,
    escalateIncident,
    closeIncident,
    dispatchResponse,
  } = useOperatorActions();
  const { selectedWorkerId } = useSelectionState();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // Stub refresh — in production this triggers a data re-fetch
  const onRefresh = useCallback(() => {}, []);

  // --- Write action handlers ---

  const handleAcknowledge = useCallback(() => {
    if (!focusedIncident) return;
    acknowledgeAlert(focusedIncident.id, onRefresh);
  }, [focusedIncident, acknowledgeAlert, onRefresh]);

  const handleConfirmedAction = useCallback(() => {
    if (!focusedIncident || !confirmAction) return;
    switch (confirmAction) {
      case "escalate":
        escalateIncident(focusedIncident.id, onRefresh);
        break;
      case "close":
        closeIncident(focusedIncident.id, onRefresh);
        break;
      case "dispatch":
        dispatchResponse(focusedIncident.id, onRefresh);
        break;
    }
    setConfirmAction(null);
  }, [focusedIncident, confirmAction, escalateIncident, closeIncident, dispatchResponse, onRefresh]);

  // --- Empty state ---
  if (!focusedIncident) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Typo level={4} className="text-slate-500">No active incidents</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          The plant is operating normally.
        </Typo>
      </div>
    );
  }

  const priority = alarmPriorityForSeverity(focusedIncident.severity);
  const isEmergency = operationalState === "Emergency";
  
  // §12 matrix: Incident Panel dims if worker is selected but not involved
  const isDimmed = selectedWorkerId && !focusedIncident.workerIds.includes(selectedWorkerId);

  return (
    <div
      role="region"
      aria-label={`Incident Focus Panel — ${focusedIncident.id}, severity ${focusedIncident.severity}`}
      aria-roledescription="Primary incident detail panel"
      className={`flex flex-col h-full p-4 gap-4 focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg transition-opacity duration-300 ${isDimmed ? "opacity-30 pointer-events-none" : ""} ${!infrastructureHealthy ? "opacity-60 saturate-50" : ""}`}
    >
      {/* Header: severity + ID + priority badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SeverityIndicator severity={focusedIncident.severity} />
          <Typo level={2} className="text-slate-100 truncate" title={focusedIncident.name || focusedIncident.id}>
            {focusedIncident.name || focusedIncident.id}
          </Typo>
          <Badge type="severity">{priority}</Badge>
        </div>
        <StatusBadge
          status={focusedIncident.status === "Active" ? "Active" : "Resolved"}
        />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Zone" value={String(focusedIncident.zoneId)} />
        <MetricCard label="Risk Score" value={focusedIncident.riskScore.toFixed(1)} />
        <MetricCard label="Evidence Strength" value={
          focusedIncident.confidenceScore >= 0.8 ? "Very Strong" :
          focusedIncident.confidenceScore >= 0.6 ? "Strong" :
          focusedIncident.confidenceScore >= 0.4 ? "Moderate" : "Weak"
        } />
        <MetricCard label="Workers at Risk" value={String(focusedIncident.workerIds.length)} highlight={focusedIncident.workerIds.length > 0} />
      </div>

      {/* Escalation state (§9.10 — from backend, never computed locally) */}
      <div className={`
        flex items-center justify-between rounded-lg px-4 py-2
        ${isEmergency ? "bg-severity-emergency/10 border border-severity-emergency/30" : "bg-slate-800/50 border border-slate-700"}
      `}>
        <div className="flex items-center gap-2">
          <Typo level={5} className="text-slate-400">Escalation:</Typo>
          <Typo level={4} className={isEmergency ? "text-severity-emergency" : "text-slate-200"}>
            {ESCALATION_LABELS[escalationLevel]}
          </Typo>
        </div>
        {focusedIncident.permitIds.length > 0 && (
          <Badge type="warning">Permit Conflict</Badge>
        )}
      </div>

      {/* Error banner */}
      {actionState.error && (
        <div className="flex items-center justify-between bg-severity-emergency/10 border border-severity-emergency/30 rounded-lg px-4 py-2">
          <Typo level={5} className="text-severity-emergency">
            {actionState.lastAction} failed: {actionState.error}
          </Typo>
          <button
            onClick={clearError}
            tabIndex={2}
            aria-label="Dismiss error message"
            className="text-type-6 text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action buttons — §6.3 Operator Action Matrix */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-[var(--color-border-subtle)]">
        {/* Acknowledge — no confirmation (§6.4) */}
        <ActionButton
          label="Acknowledge"
          tabIndex={2}
          onClick={handleAcknowledge}
          disabled={!infrastructureHealthy || actionState.loading || escalationLevel === "Acknowledged"}
          className="bg-status-acknowledged/20 text-status-acknowledged hover:bg-status-acknowledged/30"
        />
        {/* Escalate — confirmation required (§6.4) */}
        <ActionButton
          label="Escalate"
          tabIndex={2}
          onClick={() => setConfirmAction("escalate")}
          disabled={!infrastructureHealthy || actionState.loading}
          className="bg-severity-warning/20 text-severity-warning hover:bg-severity-warning/30"
        />
        {/* Dispatch — confirmation required (§6.4) */}
        <ActionButton
          label="Dispatch"
          tabIndex={2}
          onClick={() => setConfirmAction("dispatch")}
          disabled={!infrastructureHealthy || actionState.loading}
          className="bg-severity-advisory/20 text-severity-advisory hover:bg-severity-advisory/30"
        />
        {/* Close — confirmation required (§6.4) */}
        <ActionButton
          label="Close"
          tabIndex={2}
          onClick={() => setConfirmAction("close")}
          disabled={!infrastructureHealthy || actionState.loading}
          className="bg-severity-critical/20 text-severity-critical hover:bg-severity-critical/30"
        />
      </div>

      {/* §6.4 Confirmation Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        actionName={
          confirmAction === "escalate" ? "Escalate Incident" :
          confirmAction === "close" ? "Close Incident" :
          confirmAction === "dispatch" ? "Dispatch Response" : ""
        }
        message={
          confirmAction === "escalate"
            ? `This will escalate incident ${focusedIncident.id} to the next authority level. This action will be audited.`
            : confirmAction === "close"
              ? `This will close incident ${focusedIncident.id}. Ensure the incident is fully resolved before closing.`
              : `This will dispatch a response team for incident ${focusedIncident.id}. This action will be audited.`
        }
        variant={confirmAction === "close" ? "danger" : "warning"}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// --- Sub-components ---

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2" role="status" aria-label={`${label}: ${value}`}>
      <Typo level={6} className="text-slate-500">{label}</Typo>
      <Typo level={4} className={highlight ? "text-severity-warning" : "text-slate-100"}>
        {value}
      </Typo>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  className,
  tabIndex,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  tabIndex?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
      aria-label={`${label} action${disabled ? " (disabled)" : ""}`}
      className={`
        flex-1 px-3 py-2 rounded-lg
        text-type-5 font-semibold font-industrial
        transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
        ${className}
      `}
    >
      {label}
    </button>
  );
}
