import { useZoneSummaries } from "../../derived/selectors";
import { useAllWorkers } from "../../domain/worker/store";
import { useAllPermits } from "../../domain/permit/store";
import { Typo, SeverityIndicator } from "../../shared/ui";

export function DigitalTwinPanel() {
  const summaries = useZoneSummaries();
  const allWorkers = useAllWorkers();
  const allPermits = useAllPermits();

  return (
    <div
      role="region"
      aria-label="Digital Twin"
      className="flex flex-col h-full focus:outline-none border border-[var(--color-border-primary)] bg-[var(--color-surface-base)] relative overflow-hidden"
    >
      {/* CSS Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none" 
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--color-border-primary) 1px, transparent 1px),
            linear-gradient(to bottom, var(--color-border-primary) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}
      />
      
      <div className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)]">
        <Typo level={3} className="font-mono uppercase tracking-wider text-xs">Digital Twin</Typo>
      </div>

      <div className="relative z-10 flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2 min-h-0">
        {summaries.slice(0, 4).map(zone => {
          const workersInZone = allWorkers.filter(w => w.zoneId === zone.zoneId).length;
          const permitsInZone = allPermits.filter(p => p.zoneId === zone.zoneId && p.status === "Active").length;
          
          return (
            <div key={zone.zoneId} className="border border-[var(--color-border-primary)] bg-[var(--color-surface-elevated)]/80 flex flex-col p-3 justify-between">
              <div>
                <Typo level={5} className="font-mono text-[var(--color-text-primary)] uppercase tracking-wider mb-2">
                  {zone.name || zone.zoneId}
                </Typo>
                {zone.highestActiveSeverity ? (
                  <SeverityIndicator severity={zone.highestActiveSeverity} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold font-mono tracking-wider uppercase border border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
                    <span className="text-[10px]">■</span>
                    Healthy
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-4 font-mono text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                <span>W: {workersInZone}</span>
                <span>P: {permitsInZone}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
