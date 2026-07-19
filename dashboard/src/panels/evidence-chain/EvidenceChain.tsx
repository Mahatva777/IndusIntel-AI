/**
 * EvidenceChain — P2 panel (§16.6).
 *
 * Renders the append-only Evidence entity chain (Appendix A) for the
 * Primary Incident. Evidence records are never edited or deleted.
 *
 * §9.5: Expands during emergencies (handled by PanelSlot).
 * §9.6: Persistent.
 *
 * No write actions — evidence is append-only from the backend.
 */
import { useLayoutState } from "../../shell/LayoutContext";
import { useAllEvidence } from "../../domain/incident/store";
import { Typo, Badge } from "../../shared/ui";
import type { Evidence, EvidenceSourceType } from "../../types/entities";

const SOURCE_ICONS: Record<EvidenceSourceType, { icon: string; label: string }> = {
  Sensor: { icon: "📡", label: "Sensor" },
  Camera: { icon: "📷", label: "Camera" },
  Worker: { icon: "👷", label: "Worker" },
  Permit: { icon: "📋", label: "Permit" },
  System: { icon: "⚙️", label: "System" },
};

export function EvidenceChain() {
  const { focusedIncident } = useLayoutState();
  const allEvidence = useAllEvidence();

  // Filter to evidence for the focused incident
  const evidence = focusedIncident
    ? allEvidence
        .filter((e) => e.incidentId === focusedIncident.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // chronological — oldest first
    : [];

  // --- Empty states ---
  if (!focusedIncident) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">
          No active incident — evidence chain will appear here.
        </Typo>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No evidence collected</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Evidence for {focusedIncident.id} will appear here as it is recorded.
        </Typo>
      </div>
    );
  }

  return (
    <div
      tabIndex={5}
      role="region"
      aria-label="Evidence Chain — chronological evidence stream"
      aria-roledescription="Evidence event timeline"
      className="flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>Evidence Chain</Typo>
        <Badge type="numeric">{evidence.length}</Badge>
      </div>

      {/* Timeline chain — append-only, chronological */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative" role="list" aria-label="Incident evidence timeline">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700" aria-hidden="true" />

          {evidence.map((item, idx) => (
            <EvidenceItem key={item.id} evidence={item} isLast={idx === evidence.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EvidenceItem({
  evidence,
  isLast,
}: {
  evidence: Evidence;
  isLast: boolean;
}) {
  const source = SOURCE_ICONS[evidence.sourceType];

  return (
    <div
      role="listitem"
      aria-label={`${source.label} evidence recorded at ${new Date(evidence.createdAt).toLocaleTimeString()}`}
      className={`relative flex gap-4 pl-8 ${isLast ? "" : "pb-4"}`}
    >
      {/* Timeline dot */}
      <div className="absolute left-2.5 top-1 h-3 w-3 rounded-full bg-slate-600 border-2 border-slate-800 z-10" />

      <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">{source.icon}</span>
            <Typo level={5} className="text-slate-200">{source.label} Evidence</Typo>
          </div>
          <Typo level={6} className="text-slate-500 tabular-nums">
            {new Date(evidence.createdAt).toLocaleTimeString()}
          </Typo>
        </div>

        {/* Linked entity references and real findings */}
        <div className="flex flex-col gap-1 mt-2">
          {evidence.ruleId && (
            <Typo level={6} className="text-slate-300 font-medium">
              Rule: {evidence.ruleId}
            </Typo>
          )}
          {evidence.finding && (
            <Typo level={6} className="text-slate-400">
              {evidence.finding}
            </Typo>
          )}
          {evidence.severityContribution !== undefined && (
            <Typo level={6} className="text-severity-warning mt-1">
              Severity Contribution: +{(evidence.severityContribution * 100).toFixed(1)}
            </Typo>
          )}
          
          <div className="flex gap-3 mt-1">
            {evidence.sensorId && (
              <Typo level={6} className="text-severity-advisory">
                Sensor: {evidence.sensorId}
              </Typo>
            )}
            {evidence.workerId && (
              <Typo level={6} className="text-severity-warning">
                Worker: {evidence.workerId}
              </Typo>
            )}
            {evidence.permitId && (
              <Typo level={6} className="text-severity-critical">
                Permit: {evidence.permitId}
              </Typo>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
