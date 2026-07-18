/**
 * RightSidebar — layout orchestrator (architecture §8).
 *
 * Stacks AlertQueue (P3), SystemHealth (P5), and supporting panels.
 * Updates independently from MainWorkspace (architecture §8).
 *
 * Under constrained space, P5 panels collapse first per §16.6.
 */
import { useLayoutState } from "./LayoutContext";
import { PanelSlot } from "./PanelSlot";
import { AlertQueue } from "../panels/alert-queue/AlertQueue";
import { SystemHealthPanel } from "../panels/system-health/SystemHealthPanel";
import { SensorPanel } from "../panels/sensor/SensorPanel";

export function RightSidebar() {
  const { operationalState } = useLayoutState();

  return (
    <aside className="
      flex flex-col gap-2
      w-72 shrink-0
      overflow-y-auto
    ">
      {/* P3: Alert Queue — §9.5 "Scroll to primary incident" during emergency */}
      <PanelSlot panelId="alert-queue" priority={3} className="flex-[2] min-h-[200px]">
        <AlertQueue />
      </PanelSlot>

      {/* P5: System Health — collapses first under constrained space */}
      <PanelSlot
        panelId="system-health"
        priority={5}
        className={`
          flex-1 min-h-[100px]
          ${operationalState === "Emergency" ? "max-h-[120px]" : ""}
        `}
      >
        <SystemHealthPanel />
      </PanelSlot>

      {/* P6: Metadata — lowest priority, hidden first */}
      <PanelSlot
        panelId="sensor-panel"
        priority={6}
        className={`flex-1 min-h-[150px] ${operationalState === "Emergency" ? "hidden" : ""}`}
      >
        <SensorPanel />
      </PanelSlot>
    </aside>
  );
}
