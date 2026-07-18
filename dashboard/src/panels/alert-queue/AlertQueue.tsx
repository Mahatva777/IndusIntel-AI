/**
 * AlertQueue — P3 panel (§16.6), implements §8.7 Incident Queue Behavior.
 *
 * Queue positions per §8.7:
 *   Primary  → Expanded
 *   Secondary → Collapsed summary
 *   Resolved → Archived
 *   Acknowledged → Remains ordered
 *
 * §7 Alarm Flood Strategy: uses groupAlarms() for grouping display.
 * §9.5: Scrolls to Primary Incident during emergencies.
 *
 * Write actions:
 *   - Acknowledge per incident row (no confirmation, §6.4)
 *   - Silence (confirmation required, Supervisor+, §6.4)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLayoutState } from "../../shell/LayoutContext";
import { useDashboardStatus, useVisibleIncidents } from "../../derived/selectors";
import { useAllIncidents } from "../../domain/incident/store";
import { useOperatorActions } from "../../shared/hooks/useOperatorActions";
import { useCrossPanelInteractions } from "../../shared/hooks/useCrossPanelInteractions";
import { useSelectionState } from "../../ui-state/selection/store";
import { groupAlarms } from "../../derived/incident-logic/alarm-flood";
import {
  SeverityIndicator,
  StatusBadge,
  Badge,
  Typo,
  ConfirmDialog,
} from "../../shared/ui";
import type { Incident } from "../../types/entities";
import { alarmPriorityForSeverity } from "../../types/entities";

export function AlertQueue() {
  const { primaryIncident, operationalState, emergencyBannerVisible } = useLayoutState();
  const visibleIncidents = useVisibleIncidents();
  const allIncidents = useAllIncidents();
  const { state: actionState, acknowledgeAlert, silenceAlert: silenceAlertAction } = useOperatorActions();
  const { onIncidentClick } = useCrossPanelInteractions();
  const { selectedIncidentId } = useSelectionState();
  const { infrastructureHealthy } = useDashboardStatus();

  const [silenceTarget, setSilenceTarget] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // §9.5: Scroll to Primary Incident during emergencies
  useEffect(() => {
    if (emergencyBannerVisible && primaryRef.current) {
      primaryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [emergencyBannerVisible, primaryIncident?.id]);

  const onRefresh = useCallback(() => {}, []);

  // Separate resolved incidents for the archived section
  const resolvedIncidents = allIncidents.filter((i) => i.status !== "Active");

  // §7 Alarm Flood: group active incidents
  const alarmGroups = groupAlarms(visibleIncidents);

  // --- Empty state ---
  if (visibleIncidents.length === 0 && resolvedIncidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No alerts</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          The alert queue is empty.
        </Typo>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Alert Queue — active and archived incidents"
      aria-roledescription="Incident alert queue"
      className={`flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg transition-opacity duration-300 ${!infrastructureHealthy ? "opacity-60 saturate-50 pointer-events-none" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] shrink-0">
        <Typo level={3}>Alert Queue</Typo>
        <div className="flex items-center gap-2">
          <Badge type="numeric">{visibleIncidents.length}</Badge>
          {operationalState !== "Normal" && (
            <Badge type="severity">{operationalState}</Badge>
          )}
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1" role="list" aria-label="Active incidents">
        {alarmGroups.map((group) => {
          const isPrimary = group.primaryAlarmIncident.id === primaryIncident?.id;

          return (
            <div key={group.groupId}>
              {/* §8.7: Primary = Expanded, Secondary = Collapsed */}
              <IncidentRow
                ref={isPrimary ? primaryRef : undefined}
                incident={group.primaryAlarmIncident}
                isPrimary={isPrimary}
                isSelected={selectedIncidentId === group.primaryAlarmIncident.id}
                onClick={() => onIncidentClick(group.primaryAlarmIncident.id)}
                supportingCount={group.alarmCount - 1}
                loading={actionState.loading}
                onAcknowledge={() =>
                  acknowledgeAlert(group.primaryAlarmIncident.id, onRefresh)
                }
                onSilence={() =>
                  setSilenceTarget(group.primaryAlarmIncident.id)
                }
                infrastructureHealthy={infrastructureHealthy}
              />

              {/* Supporting incidents (collapsed by default, shown under primary) */}
              {isPrimary && group.supportingIncidents.length > 0 && (
                <div className="ml-4 mt-1 space-y-1">
                  {group.supportingIncidents.map((si) => (
                    <IncidentRow
                      key={si.id}
                      incident={si}
                      isPrimary={false}
                      isSelected={selectedIncidentId === si.id}
                      onClick={() => onIncidentClick(si.id)}
                      supportingCount={0}
                      loading={actionState.loading}
                      onAcknowledge={() => acknowledgeAlert(si.id, onRefresh)}
                      onSilence={() => setSilenceTarget(si.id)}
                      infrastructureHealthy={infrastructureHealthy}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* §8.7: Resolved → Archived section */}
        {resolvedIncidents.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-2">
              <Typo level={6} className="text-slate-500 uppercase tracking-widest">
                Archived ({resolvedIncidents.length})
              </Typo>
            </div>
            {resolvedIncidents.slice(0, 5).map((incident) => (
              <div
                key={incident.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/30 opacity-50"
              >
                <SeverityIndicator severity={incident.severity} compact />
                <Typo level={6} className="text-slate-500">{incident.id}</Typo>
                <StatusBadge status="Resolved" variant="dot" />
              </div>
            ))}
          </>
        )}
      </div>

      {/* §6.4: Silence requires confirmation */}
      <ConfirmDialog
        open={silenceTarget !== null}
        actionName="Silence Alert"
        message={`This will silence alert ${silenceTarget}. The incident will remain active but audible reminders will stop. This action will be audited.`}
        variant="warning"
        onConfirm={() => {
          if (silenceTarget) {
            silenceAlertAction(silenceTarget as any, onRefresh);
          }
          setSilenceTarget(null);
        }}
        onCancel={() => setSilenceTarget(null)}
      />
    </div>
  );
}

// --- Sub-component ---

import { forwardRef } from "react";

interface IncidentRowProps {
  incident: Incident;
  isPrimary: boolean;
  isSelected: boolean;
  onClick: () => void;
  supportingCount: number;
  loading: boolean;
  onAcknowledge: () => void;
  onSilence: () => void;
  infrastructureHealthy: boolean;
}

const IncidentRow = forwardRef<HTMLButtonElement, IncidentRowProps>(
  ({ incident, isPrimary, isSelected, onClick, supportingCount, loading, onAcknowledge, onSilence, infrastructureHealthy }, ref) => {
    const priority = alarmPriorityForSeverity(incident.severity);
    const isAcknowledged = incident.escalationLevel === "Acknowledged";

    return (
      <button
        ref={ref}
        onClick={onClick}
        tabIndex={3}
        aria-label={`Incident ${incident.id}, severity ${incident.severity}, zone ${incident.zoneId}${isPrimary ? ", primary incident" : ""}${isSelected ? ", selected" : ""}`}
        aria-current={isSelected ? "true" : undefined}
        role="listitem"
        className={`
          w-full text-left rounded-lg border px-3 transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
          ${isPrimary
            ? "py-3 bg-severity-emergency/5 border-severity-emergency/20"
            : isAcknowledged
              ? isSelected
                ? "py-2 bg-slate-700/50 border-slate-500 opacity-90"
                : "py-2 bg-slate-800/30 border-slate-700 opacity-70 hover:bg-slate-800/50"
              : isSelected
                ? "py-2 bg-slate-700/50 border-slate-500"
                : "py-2 bg-slate-800/50 border-slate-700 hover:bg-slate-700/50"
          }
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SeverityIndicator severity={incident.severity} compact={!isPrimary} />
            <Typo level={isPrimary ? 4 : 5} className="text-slate-200 truncate max-w-[200px]" title={incident.name || incident.id}>
              {incident.name || incident.id}
            </Typo>
            <Badge type="severity">{priority}</Badge>
            {supportingCount > 0 && (
              <Badge type="numeric">+{supportingCount}</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Typo level={6} className="text-slate-500">
              {String(incident.zoneId)}
            </Typo>

            {/* Acknowledge — no confirmation (§6.4) */}
            {!isAcknowledged && (
              <button
                onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
                disabled={!infrastructureHealthy || loading}
                tabIndex={3}
                aria-label={`Acknowledge incident ${incident.id}`}
                className="
                  px-2 py-1 rounded text-type-6 font-semibold font-industrial
                  bg-status-acknowledged/20 text-status-acknowledged
                  hover:bg-status-acknowledged/30 transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                "
              >
                Ack
              </button>
            )}

            {/* Silence — confirmation required (§6.4) */}
            <button
              onClick={(e) => { e.stopPropagation(); onSilence(); }}
              disabled={!infrastructureHealthy || loading}
              tabIndex={3}
              aria-label={`Silence alert ${incident.id}`}
              className="
                px-2 py-1 rounded text-type-6 font-semibold font-industrial
                bg-slate-700 text-slate-300
                hover:bg-slate-600 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              "
            >
              Silence
            </button>
          </div>
        </div>

        {/* Expanded content for Primary (§8.7) */}
        {isPrimary && (
          <div className="flex gap-4 mt-2 pt-2 border-t border-slate-700/50">
            <Typo level={6} className="text-slate-400">
              Risk: {incident.riskScore.toFixed(1)}
            </Typo>
            <Typo level={6} className="text-slate-400">
              Workers: {incident.workerIds.length}
            </Typo>
            <Typo level={6} className="text-slate-400">
              Confidence: {(incident.confidenceScore * 100).toFixed(0)}%
            </Typo>
            {incident.permitIds.length > 0 && (
              <Badge type="warning">Permit Conflict</Badge>
            )}
          </div>
        )}
      </button>
    );
  },
);

IncidentRow.displayName = "IncidentRow";
