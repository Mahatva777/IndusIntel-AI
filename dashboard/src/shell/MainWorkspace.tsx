/**
 * MainWorkspace — layout orchestrator (architecture §8).
 *
 * CSS Grid layout hosting named PanelSlot placeholders for every
 * panel family per the §8 component tree. Implements §16.6 graceful
 * degradation: higher-priority panels win layout when space is
 * constrained — P6 collapses first, then P5, etc.
 *
 * §9.11 step 2: Dashboard Layout is a pure function of Operational State.
 */
import { useLayoutState } from "./LayoutContext";
import { PanelSlot } from "./PanelSlot";
import { IncidentWorkspace } from "./IncidentWorkspace";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";
import { CCTVPanel } from "../panels/cctv/CCTVPanel";

export function MainWorkspace() {
  const { panelsExpanded } = useLayoutState();

  return (
    <main className="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
      {/* Top area: Digital Twin + Incident Workspace + Right Sidebar */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* P3: Digital Twin — §9.5 "Highlight affected zone" during emergency */}
        <PanelSlot
          panelId="digital-twin"
          priority={3}
          className={`
            ${panelsExpanded ? "flex-1" : "flex-[1.5]"}
            min-w-[300px]
          `}
        />

        {/* P5: CCTV in center */}
        <PanelSlot panelId="cctv-panel" priority={5} className="flex-1 min-w-[300px]">
          <CCTVPanel />
        </PanelSlot>

        {/* Incident Workspace: IncidentFocus (P1) + Recommendations (P2) + Evidence (P2) */}
        <IncidentWorkspace />

        {/* Right Sidebar: AlertQueue (P3) + SystemHealth (P5) + Metadata (P6) */}
        <RightSidebar />
      </div>

      {/* Bottom strip: Timeline (P4) + Workers (P4) + Permits (P4) + CCTV (P5) */}
      <BottomPanel />
    </main>
  );
}
