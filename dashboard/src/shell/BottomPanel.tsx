/**
 * BottomPanel — layout orchestrator (architecture §8).
 *
 * Horizontal strip hosting Timeline (P4), WorkerPanel (P4),
 * PermitPanel (P4), and CCTV (P5). Collapsible; P5 panels
 * hide first under constrained space per §16.6.
 *
 * §9.5: Timeline "Continue updating" during emergency.
 * §9.5: Worker Panel "Highlight affected workers" during emergency.
 * §9.5: CCTV "Focus linked camera" during emergency.
 */
import { useLayoutState } from "./LayoutContext";
import { PanelSlot } from "./PanelSlot";
import { TimelinePanel } from "../panels/timeline/TimelinePanel";
import { WorkerPanel } from "../panels/worker/WorkerPanel";
import { PermitPanel } from "../panels/permit/PermitPanel";

export function BottomPanel() {
  const { operationalState } = useLayoutState();
  const isEmergency = operationalState === "Emergency";

  return (
    <div className={`
      flex gap-2 h-52 shrink-0
      transition-all duration-[var(--anim-duration-emphasis)]
      ${isEmergency ? "h-40" : "h-52"}
    `}>
      {/* P4: Timeline — always visible, §9.5 "Continue updating" */}
      <PanelSlot panelId="timeline" priority={4} className="flex-[2]">
        <TimelinePanel />
      </PanelSlot>

      {/* P4: Worker Panel — §9.5 "Highlight affected workers" */}
      <PanelSlot panelId="worker-panel" priority={4} className="flex-1">
        <WorkerPanel />
      </PanelSlot>

      {/* P4: Permit Panel */}
      <PanelSlot panelId="permit-panel" priority={4} className="flex-1">
        <PermitPanel />
      </PanelSlot>
    </div>
  );
}
