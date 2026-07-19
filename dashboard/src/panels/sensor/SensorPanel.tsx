import { useMemo } from "react";
import { useAllLatestTelemetry } from "../../domain/telemetry/store";
import { Typo } from "../../shared/ui";
import { useDashboardStatus } from "../../derived/selectors";

const SEVERITY_WEIGHTS: Record<string, number> = {
  Emergency: 6,
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Informational: 1,
  Normal: 0
};

const SEVERITY_COLORS: Record<string, string> = {
  Emergency: "text-severity-emergency",
  Critical: "text-severity-critical",
  High: "text-severity-warning",
  Medium: "text-severity-advisory",
  Low: "text-severity-normal",
  Informational: "text-severity-information",
  Normal: "text-teal-400"
};

export function SensorPanel() {
  const latestReadings = useAllLatestTelemetry();
  const { infrastructureHealthy } = useDashboardStatus();

  const sensors = useMemo(() => {
    return [...latestReadings].sort((a, b) => {
      const weightA = SEVERITY_WEIGHTS[a.severity || "Normal"] ?? 0;
      const weightB = SEVERITY_WEIGHTS[b.severity || "Normal"] ?? 0;
      if (weightA !== weightB) return weightB - weightA;
      return a.sensorId.localeCompare(b.sensorId);
    });
  }, [latestReadings]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-panel)] rounded-lg overflow-hidden border border-[var(--color-border-subtle)]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
        <Typo level={4} className="font-semibold uppercase tracking-wider">Live Telemetry</Typo>
        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
          {sensors.length} ACTIVE
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {!infrastructureHealthy && (
          <div className="text-xs text-severity-emergency mb-2 px-1">
            Network offline. Values may be stale.
          </div>
        )}
        
        {sensors.length === 0 ? (
          <div className="text-center py-4">
            <Typo level={6} className="text-slate-500">No sensor data available.</Typo>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sensors.map((reading) => {
              const colorClass = SEVERITY_COLORS[reading.severity || "Normal"] || "text-teal-400";
              return (
                <div 
                  key={reading.sensorId} 
                  className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700 hover:border-slate-500 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <Typo level={6} className="font-medium text-slate-200 truncate">
                      {reading.sensorId}
                    </Typo>
                    <span className="text-[10px] text-slate-400 font-mono truncate">
                      {reading.zoneId || "Unknown Zone"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    <span className={`text-sm font-mono font-bold ${colorClass}`}>
                      {reading.value.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {new Date(reading.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
