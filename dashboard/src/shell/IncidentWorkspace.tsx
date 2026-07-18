/**
 * IncidentWorkspace — layout orchestrator (architecture §8).
 *
 * Owns composition of IncidentFocus (P1), Recommendations (P2), and
 * EvidenceChain (P2). Expands when panelsExpanded is true (§9.5).
 *
 * §9.6 Visual Persistence: Recommendation Panel and Evidence Chain
 * remain persistent during emergency — handled by PanelSlot expansion.
 */
import { useLayoutState } from "./LayoutContext";
import { PanelSlot } from "./PanelSlot";
import { IncidentFocus } from "../panels/incident-focus/IncidentFocus";
import { RecommendationPanel } from "../panels/recommendation/RecommendationPanel";
import { EvidenceChain } from "../panels/evidence-chain/EvidenceChain";

export function IncidentWorkspace() {
  const { panelsExpanded } = useLayoutState();

  return (
    <div
      className={`
        flex flex-col gap-2
        transition-all duration-[var(--anim-duration-emphasis)]
        ${panelsExpanded ? "flex-[2]" : "flex-1"}
      `}
    >
      {/* P1: Incident Focus — §16.6 highest priority */}
      <PanelSlot panelId="incident-focus" priority={1} className="flex-[2] min-h-[200px]">
        <IncidentFocus />
      </PanelSlot>

      {/* P2: Recommendations — §9.5 "Expand" during emergency, §9.6 "Persistent" */}
      <PanelSlot panelId="recommendations" priority={2} className="flex-1 min-h-[120px]">
        <RecommendationPanel />
      </PanelSlot>

      {/* P2: Evidence Chain — §9.5 "Expand" during emergency, §9.6 "Persistent" */}
      <PanelSlot panelId="evidence-chain" priority={2} className="flex-1 min-h-[120px]">
        <EvidenceChain />
      </PanelSlot>
    </div>
  );
}
