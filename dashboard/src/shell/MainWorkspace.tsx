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
import { PanelSlot } from "./PanelSlot";
import { IncidentWorkspace } from "./IncidentWorkspace";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";
import { DigitalTwinPanel } from "../panels/digital-twin/DigitalTwinPanel";

export function MainWorkspace() {
  return (
    <main className="flex-1 flex flex-col gap-2 p-2 w-full max-w-full relative">
      {/* Top area: Digital Twin (25%) + Incident Workspace (45%) + Right Sidebar (30%) */}
      <div className="grid grid-cols-[25fr_45fr_30fr] gap-2 w-full h-[calc(100vh-60px)] shrink-0">
        {/* P3: Digital Twin — §9.5 "Highlight affected zone" during emergency */}
        <PanelSlot
          panelId="digital-twin"
          priority={3}
          className="h-full overflow-hidden"
        >
          <DigitalTwinPanel />
        </PanelSlot>

        {/* Center Column: Incident Workspace (IncidentFocus + CCTV) */}
        <IncidentWorkspace />

        {/* Right Sidebar: AlertQueue (P3) + Permits + Recommendations (P2) */}
        <RightSidebar />
      </div>

      {/* Bottom strip: Timeline (P4) + Workers (P4) + Permits (P4) + CCTV (P5) */}
      <BottomPanel />
    </main>
  );
}
