/**
 * SystemHealthPanel — P5 panel (§16.6).
 *
 * Backend service health per §1.3 (Flat Map, 5–10s update frequency,
 * Latest Snapshot memory strategy). Keyed by service name with each
 * value fully replaced on update — independent statuses, no
 * cross-referencing (§1.4).
 *
 * No write actions — health state is read-only.
 */
import { useAllServiceHealth } from "../../domain/system-health/store";
import { Typo, Badge } from "../../shared/ui";
import type { ServiceHealthSnapshot, ServiceHealthStatus } from "../../types/entities";

const STATUS_CONFIG: Record<ServiceHealthStatus, { dot: string; label: string; sort: number }> = {
  offline:  { dot: "bg-severity-emergency", label: "Offline",  sort: 0 },
  degraded: { dot: "bg-severity-warning",   label: "Degraded", sort: 1 },
  online:   { dot: "bg-severity-normal",    label: "Online",   sort: 2 },
};

export function SystemHealthPanel() {
  const services = useAllServiceHealth();

  // Sort: offline first, then degraded, then online
  const sorted = [...services].sort(
    (a, b) => STATUS_CONFIG[a.status].sort - STATUS_CONFIG[b.status].sort,
  );

  const offlineCount = services.filter((s) => s.status === "offline").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;

  // --- Empty state ---
  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No service data</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Health metrics will appear on first poll (5–10s).
        </Typo>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>System Health</Typo>
        <div className="flex items-center gap-1.5">
          {offlineCount > 0 && <Badge type="severity">{offlineCount} offline</Badge>}
          {degradedCount > 0 && <Badge type="warning">{degradedCount} degraded</Badge>}
          {offlineCount === 0 && degradedCount === 0 && (
            <Badge type="health">All healthy</Badge>
          )}
        </div>
      </div>

      {/* Service table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-3 py-1.5 text-type-6 font-industrial font-medium text-slate-500">Service</th>
              <th className="text-left px-3 py-1.5 text-type-6 font-industrial font-medium text-slate-500">Status</th>
              <th className="text-right px-3 py-1.5 text-type-6 font-industrial font-medium text-slate-500">Latency</th>
              <th className="text-right px-3 py-1.5 text-type-6 font-industrial font-medium text-slate-500">Updated</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((service) => (
              <ServiceRow key={service.service} service={service} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceHealthSnapshot }) {
  const config = STATUS_CONFIG[service.status];
  const isHealthy = service.status === "online";

  return (
    <tr className={`
      border-b border-slate-800/50
      ${!isHealthy ? "bg-slate-800/30" : ""}
    `}>
      <td className="px-3 py-1.5">
        <Typo level={5} className={isHealthy ? "text-slate-300" : "text-slate-200"}>
          {service.service}
        </Typo>
      </td>
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} />
          <Typo level={6} className={isHealthy ? "text-slate-400" : "text-slate-200"}>
            {config.label}
          </Typo>
        </span>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Typo level={6} className="text-slate-400 tabular-nums">
          {service.latencyMs !== null ? `${service.latencyMs}ms` : "—"}
        </Typo>
      </td>
      <td className="px-3 py-1.5 text-right">
        <Typo level={6} className="text-slate-500 tabular-nums">
          {new Date(service.lastUpdated).toLocaleTimeString()}
        </Typo>
      </td>
    </tr>
  );
}
