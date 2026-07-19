/**
 * IncidentWorkspace — layout orchestrator (architecture §8).
 *
 * Owns composition of IncidentFocus (P1), Recommendations (P2), and
 * EvidenceChain (P2). Expands when panelsExpanded is true (§9.5).
 *
 * §9.6 Visual Persistence: Recommendation Panel and Evidence Chain
 * remain persistent during emergency — handled by PanelSlot expansion.
 */
import { PanelSlot } from "./PanelSlot";
import { IncidentFocus } from "../panels/incident-focus/IncidentFocus";
import { CCTVPanel } from "../panels/cctv/CCTVPanel";

export function IncidentWorkspace() {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Incident Focus on Top */}
      <PanelSlot panelId="incident-focus" priority={1} className="flex-none">
        <IncidentFocus />
      </PanelSlot>

      {/* CCTV panel taking the remaining height */}
      <PanelSlot panelId="cctv-panel" priority={5} className="flex-1 min-h-0 overflow-hidden">
        <CCTVPanel />
      </PanelSlot>
    </div>
  );
}
