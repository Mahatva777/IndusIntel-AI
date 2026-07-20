import { useDashboardStatus } from "../../derived/selectors";
import { useAllIncidents } from "../../domain/incident/store";
import { useAllWorkers } from "../../domain/worker/store";
import { useAllPermits } from "../../domain/permit/store";
import type { SeverityBand, WorkerState, PermitState } from "./ZoneMap";

export interface PlantSnapshotState {
  timestamp: string | null;
  severities: Record<string, SeverityBand>;
  workers: WorkerState[];
  permits: PermitState[];
  connected: boolean;
}

export function useDigitalTwinState(): PlantSnapshotState {
  const allIncidents = useAllIncidents();
  const allWorkers = useAllWorkers();
  const allPermits = useAllPermits();
  const dashboardStatus = useDashboardStatus();

  const severities: Record<string, SeverityBand> = {};
  
  // Rank for comparisons
  const rank = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  for (const inc of allIncidents) {
    if (inc.status === "Archived" || inc.status === "Resolved" || !inc.zoneId) continue;
    
    let band: SeverityBand = "LOW";
    if (inc.severity === "Emergency" || inc.severity === "Critical") band = "CRITICAL";
    else if (inc.severity === "High") band = "HIGH";
    else if (inc.severity === "Medium") band = "MEDIUM";
    
    const existing = severities[inc.zoneId];
    if (!existing || rank[band] > rank[existing]) {
      severities[inc.zoneId] = band;
    }
  }

  const workers: WorkerState[] = allWorkers.map(w => ({
    worker_id: w.id,
    name: "Worker " + w.id,
    role: "Operator",
    current_zone: w.zoneId || "unknown",
    ppe_level: "Standard",
    medical_status: "Cleared"
  }));

  const permits: PermitState[] = allPermits.map(p => ({
    permit_id: p.id,
    zone_id: p.zoneId || "unknown",
    permit_type: p.type || "General",
    status: p.status === "Active" ? "active" : "closed",
    workers_assigned: p.workerId ? [String(p.workerId)] : []
  }));

  return {
    timestamp: new Date().toISOString(),
    severities,
    workers,
    permits,
    connected: dashboardStatus.infrastructureHealthy
  };
}
