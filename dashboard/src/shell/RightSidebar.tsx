/**
 * RightSidebar — layout orchestrator (architecture §8).
 *
 * Stacks AlertQueue (P3), SystemHealth (P5), and supporting panels.
 * Updates independently from MainWorkspace (architecture §8).
 *
 * Under constrained space, P5 panels collapse first per §16.6.
 */
import { PanelSlot } from "./PanelSlot";
import { AlertQueue } from "../panels/alert-queue/AlertQueue";
import { ActivePermitsPanel } from "../panels/permit/ActivePermitsPanel";
import { RecommendationPanel } from "../panels/recommendation/RecommendationPanel";

export function RightSidebar() {
  return (
    <aside className="
      flex flex-col gap-2
      h-full overflow-hidden
    ">
      {/* P3: Alert Queue */}
      <PanelSlot panelId="alert-queue" priority={3} className="flex-[3] min-h-0 overflow-hidden">
        <AlertQueue />
      </PanelSlot>

      {/* P4: Active Permits - Fixed compact height */}
      <PanelSlot panelId="active-permits" priority={4} className="h-[150px] shrink-0">
        <ActivePermitsPanel />
      </PanelSlot>

      {/* P2: Recommendations */}
      <PanelSlot panelId="recommendations" priority={2} className="flex-[2] min-h-0 overflow-hidden">
        <RecommendationPanel />
      </PanelSlot>
    </aside>
  );
}
