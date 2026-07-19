import { useAllPermits } from "../../domain/permit/store";
import { useDashboardStatus } from "../../derived/selectors";
import { Typo, StatusBadge, Badge } from "../../shared/ui";

export function ActivePermitsPanel() {
  const allPermits = useAllPermits();
  const { infrastructureHealthy } = useDashboardStatus();
  
  // Filter for active permits only
  const activePermits = allPermits.filter(p => p.status === "Active");

  if (activePermits.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-surface-base)] border border-[var(--color-border-primary)] focus:outline-none">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)]">
          <Typo level={3} className="font-mono uppercase tracking-wider text-xs">Active Permits</Typo>
          <Badge type="numeric">0</Badge>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-4">
          <Typo level={5} className="text-[var(--color-text-secondary)] font-mono uppercase tracking-wider text-xs">No Active Permits</Typo>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Active Permits"
      className={`flex flex-col h-full focus:outline-none border border-[var(--color-border-primary)] bg-[var(--color-surface-base)] transition-opacity duration-300 ${!infrastructureHealthy ? "opacity-60 saturate-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)]">
        <Typo level={3} className="font-mono uppercase tracking-wider text-xs">Active Permits</Typo>
        <Badge type="numeric">{activePermits.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {activePermits.map(permit => (
          <div key={permit.id} className="flex flex-col p-2 border border-[var(--color-border-primary)] bg-[var(--color-surface-elevated)]">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <Typo level={5} className="font-mono font-bold text-[var(--color-text-primary)]">{permit.id}</Typo>
                <Badge type="status">{permit.type || 'Permit'}</Badge>
              </div>
              <StatusBadge status={permit.status} variant="pill" />
            </div>
            
            <div className="flex items-center justify-between mt-1">
              <Typo level={6} className="font-mono text-[var(--color-text-secondary)] uppercase text-xs">
                {String(permit.zoneId || 'Zone N/A')}
              </Typo>
              <div className="flex gap-4">
                {permit.gasTestRequired && permit.gasTestValidity && (
                  <Typo level={6} className="font-mono text-[var(--color-text-secondary)] uppercase text-xs">
                    Gas Valid: {new Date(permit.gasTestValidity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </Typo>
                )}
                {permit.expiresAt && (
                  <Typo level={6} className="font-mono text-[var(--color-text-secondary)] uppercase text-xs">
                    Exp: {new Date(permit.expiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </Typo>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
