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
import { TimelinePanel } from "../panels/timeline/TimelinePanel";
import { WorkerPanel } from "../panels/worker/WorkerPanel";
import { EvidenceChain } from "../panels/evidence-chain/EvidenceChain";
import { SensorPanel } from "../panels/sensor/SensorPanel";
import { SystemHealthPanel } from "../panels/system-health/SystemHealthPanel";

export function BottomPanel() {
  return (
    <div className="flex flex-col gap-4 mt-4 border-t border-[var(--color-border-primary)] pt-4 pb-12 shrink-0">
      
      {/* Top Row: Live Telemetry & Evidence Chain */}
      <div className="grid grid-cols-2 gap-4 min-h-[400px] max-h-[500px]">
        <div className="min-w-0 min-h-0 h-full overflow-hidden">
          <SensorPanel />
        </div>
        <div className="min-w-0 min-h-0 h-full overflow-hidden">
          <EvidenceChain />
        </div>
      </div>

      {/* Bottom Row: Timeline, Workers, Plant Health */}
      <div className="grid grid-cols-3 gap-4 min-h-[300px]">
        <div className="min-w-0 min-h-0 h-full overflow-hidden">
          <TimelinePanel />
        </div>
        <div className="min-w-0 min-h-0 h-full overflow-hidden">
          <WorkerPanel />
        </div>
        <div className="min-w-0 min-h-0 h-full overflow-hidden">
          <SystemHealthPanel />
        </div>
      </div>
      
    </div>
  );
}
