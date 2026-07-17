/**
 * Derived Selectors (§2.9). All seven selectors named in §2.9's table are
 * implemented here as pure combiner functions wrapped in `memoize`
 * (never persisted, never mutated directly, recomputed only when the
 * normalized state references they depend on actually change) plus a thin
 * React hook per selector that reads the relevant raw state from each
 * owning store and feeds it through the memoized combiner.
 *
 * This module only *reads* other slices (via each store's `use*StoreState`
 * accessor) — it never imports a mutator, consistent with §1.1 "Only the
 * owning service/store may update a slice."
 */
import { getAllEntities, type EntityStoreState } from "@shared/normalization";
import type { Incident, Permit, ServiceHealthSnapshot, Worker, Zone } from "../../state-layer/src/types/entities";
import type { IncidentId, ZoneId } from "../../state-layer/src/types/ids";

import { useIncidentStoreState } from "@domain/incident/store";
import { useWorkerStoreState } from "@domain/worker/store";
import { usePermitStoreState } from "@domain/permit/store";
import { useZoneStoreState } from "@domain/zone/store";
import { useTelemetryMapState } from "@domain/telemetry/store";
import { useSystemHealthStoreState } from "@domain/system-health/store";
import { useSelectionState } from "@ui-state/selection/store";

import { compareIncidentPriority, isActiveIncident, selectPrimaryIncident } from "./incidentPriority";
import { memoize } from "./memoize";

// ---------------------------------------------------------------------------
// Active Worker Count — depends on Worker (§2.9)
// ---------------------------------------------------------------------------

/**
 * "Active" here means present in the plant (on-site or currently flagged
 * at risk), excluding workers who are off-site or already evacuated. The
 * Worker Status enum itself is a flagged placeholder (see
 * src/types/entities.ts); this predicate is this layer's interpretation.
 */
function isWorkerActive(worker: Worker): boolean {
  return worker.status === "OnSite" || worker.status === "AtRisk";
}

const computeActiveWorkerCount = memoize((workers: EntityStoreState<Worker>): number => {
  return getAllEntities(workers).filter(isWorkerActive).length;
});

export function useActiveWorkerCount(): number {
  const workers = useWorkerStoreState();
  return computeActiveWorkerCount(workers);
}

// ---------------------------------------------------------------------------
// Active Permit Count — depends on Permit (§2.9)
// ---------------------------------------------------------------------------

const computeActivePermitCount = memoize((permits: EntityStoreState<Permit>): number => {
  return getAllEntities(permits).filter((permit) => permit.status === "Active").length;
});

export function useActivePermitCount(): number {
  const permits = usePermitStoreState();
  return computeActivePermitCount(permits);
}

// ---------------------------------------------------------------------------
// Visible Incidents — depends on Incident + Selection (§2.9)
// ---------------------------------------------------------------------------

/**
 * Active incidents (§8.7/§8.9 — resolved/archived incidents leave the
 * active ranking), priority-ordered per §8.2–§8.5. When a Zone is
 * selected, narrowed to incidents originating in that zone — Selection
 * State is the second dependency this selector is named for (§2.9).
 */
const computeVisibleIncidents = memoize(
  (incidents: EntityStoreState<Incident>, selectedZoneId: ZoneId | null): Incident[] => {
    const active = getAllEntities(incidents).filter(isActiveIncident);
    const scoped = selectedZoneId === null ? active : active.filter((incident) => incident.zoneId === selectedZoneId);
    return scoped.sort(compareIncidentPriority);
  },
);

export function useVisibleIncidents(): Incident[] {
  const { incidents } = useIncidentStoreState();
  const { selectedZoneId } = useSelectionState();
  return computeVisibleIncidents(incidents, selectedZoneId);
}

// ---------------------------------------------------------------------------
// Highest Risk Zone — depends on Incident + Telemetry (§2.9)
// ---------------------------------------------------------------------------

export interface ZoneRisk {
  readonly zoneId: ZoneId;
  readonly highestSeverityRank: number; // 1 = Emergency (most severe), matching §8.3
  readonly incidentCount: number;
  readonly averageTelemetryValue: number | null;
}

const SEVERITY_RISK_RANK: Record<Incident["severity"], number> = {
  Emergency: 1,
  Critical: 2,
  High: 3,
  Medium: 4,
  Low: 5,
  Informational: 6,
};

/**
 * Ranks zones by the most severe active incident originating there
 * (§8.3 Severity Ranking), using average live telemetry magnitude in the
 * zone purely as a tie-breaker. The spec freezes Incident Severity as
 * authoritative (§8.10) but defines no formula for deriving zone risk
 * directly from raw telemetry values, so telemetry is used only to break
 * ties among equally-severe zones — flagged interpretation.
 */
const computeHighestRiskZone = memoize(
  (
    incidents: EntityStoreState<Incident>,
    telemetry: ReturnType<typeof useTelemetryMapState>,
  ): ZoneRisk | undefined => {
    const active = getAllEntities(incidents).filter(isActiveIncident);
    const byZone = new Map<ZoneId, ZoneRisk>();

    for (const incident of active) {
      const existing = byZone.get(incident.zoneId);
      const rank = SEVERITY_RISK_RANK[incident.severity];
      if (!existing) {
        byZone.set(incident.zoneId, {
          zoneId: incident.zoneId,
          highestSeverityRank: rank,
          incidentCount: 1,
          averageTelemetryValue: null,
        });
      } else {
        byZone.set(incident.zoneId, {
          ...existing,
          highestSeverityRank: Math.min(existing.highestSeverityRank, rank),
          incidentCount: existing.incidentCount + 1,
        });
      }
    }

    if (byZone.size === 0) return undefined;

    const readingsByZone = new Map<ZoneId, number[]>();
    for (const reading of Object.values(telemetry.byId)) {
      const zoneId = reading.latest.zoneId;
      if (!byZone.has(zoneId)) continue;
      const list = readingsByZone.get(zoneId) ?? [];
      list.push(reading.latest.value);
      readingsByZone.set(zoneId, list);
    }

    const zones = [...byZone.values()].map((zone) => {
      const readings = readingsByZone.get(zone.zoneId);
      const averageTelemetryValue =
        readings && readings.length > 0 ? readings.reduce((sum, v) => sum + v, 0) / readings.length : null;
      return { ...zone, averageTelemetryValue };
    });

    zones.sort((a, b) => {
      if (a.highestSeverityRank !== b.highestSeverityRank) {
        return a.highestSeverityRank - b.highestSeverityRank;
      }
      if (a.incidentCount !== b.incidentCount) {
        return b.incidentCount - a.incidentCount;
      }
      return (b.averageTelemetryValue ?? 0) - (a.averageTelemetryValue ?? 0);
    });

    return zones[0];
  },
);

export function useHighestRiskZone(): ZoneRisk | undefined {
  const { incidents } = useIncidentStoreState();
  const telemetry = useTelemetryMapState();
  return computeHighestRiskZone(incidents, telemetry);
}

// ---------------------------------------------------------------------------
// Zone Summary — depends on Zone + Telemetry (§2.9), extended per §1.7
// Clarifications to also fold in Incident for zone-level aggregation.
// ---------------------------------------------------------------------------

export interface ZoneSummary {
  readonly zoneId: ZoneId;
  readonly name: string;
  readonly activeIncidentCount: number;
  readonly highestActiveSeverity: Incident["severity"] | null;
  readonly telemetryReadingCount: number;
}

const computeZoneSummaries = memoize(
  (
    zones: EntityStoreState<Zone>,
    incidents: EntityStoreState<Incident>,
    telemetry: ReturnType<typeof useTelemetryMapState>,
  ): ZoneSummary[] => {
    const activeIncidents = getAllEntities(incidents).filter(isActiveIncident);

    return getAllEntities(zones).map((zone) => {
      const zoneIncidents = activeIncidents.filter((incident) => incident.zoneId === zone.id);
      const highestActiveSeverity =
        zoneIncidents.length === 0
          ? null
          : zoneIncidents.reduce((highest, incident) =>
              SEVERITY_RISK_RANK[incident.severity] < SEVERITY_RISK_RANK[highest.severity] ? incident : highest,
            ).severity;

      const telemetryReadingCount = Object.values(telemetry.byId).filter(
        (entry) => entry.latest.zoneId === zone.id,
      ).length;

      return {
        zoneId: zone.id,
        name: zone.name,
        activeIncidentCount: zoneIncidents.length,
        highestActiveSeverity,
        telemetryReadingCount,
      };
    });
  },
);

export function useZoneSummaries(): ZoneSummary[] {
  const zones = useZoneStoreState();
  const { incidents } = useIncidentStoreState();
  const telemetry = useTelemetryMapState();
  return computeZoneSummaries(zones, incidents, telemetry);
}

export function useZoneSummary(zoneId: ZoneId): ZoneSummary | undefined {
  return useZoneSummaries().find((summary) => summary.zoneId === zoneId);
}

// ---------------------------------------------------------------------------
// Visible Recommendations — depends on Recommendation + Incident (§2.9)
// ---------------------------------------------------------------------------

const computeVisibleRecommendations = memoize(
  (incidentState: ReturnType<typeof useIncidentStoreState>) => {
    const activeIncidentIds = new Set(
      getAllEntities(incidentState.incidents)
        .filter(isActiveIncident)
        .map((incident) => incident.id),
    );
    return getAllEntities(incidentState.recommendations).filter((recommendation) =>
      activeIncidentIds.has(recommendation.incidentId),
    );
  },
);

export function useVisibleRecommendations() {
  const incidentState = useIncidentStoreState();
  return computeVisibleRecommendations(incidentState);
}

// ---------------------------------------------------------------------------
// Dashboard Status — depends on System Health + Incident (§2.9)
// ---------------------------------------------------------------------------

/** §9.11 Derivation Chain: Dashboard Operational State is a pure function of the Primary Incident. */
export type DashboardOperationalState = "Normal" | "Elevated" | "Emergency";

export interface DashboardStatus {
  readonly operationalState: DashboardOperationalState;
  readonly primaryIncidentId: IncidentId | null;
  readonly infrastructureHealthy: boolean;
  readonly degradedServices: readonly string[];
}

function operationalStateForIncident(incident: Incident | undefined): DashboardOperationalState {
  if (!incident) return "Normal";
  if (incident.severity === "Emergency") return "Emergency";
  if (incident.severity === "Critical") return "Elevated";
  return "Normal";
}

const computeDashboardStatus = memoize(
  (
    incidents: EntityStoreState<Incident>,
    services: ReturnType<typeof useSystemHealthStoreState>,
  ): DashboardStatus => {
    const primary = selectPrimaryIncident(getAllEntities(incidents));
    const allServices: ServiceHealthSnapshot[] = Object.values(services.byKey);
    const degradedServices = allServices
      .filter((service) => service.status !== "online")
      .map((service) => service.service);

    return {
      operationalState: operationalStateForIncident(primary),
      primaryIncidentId: primary?.id ?? null,
      infrastructureHealthy: degradedServices.length === 0,
      degradedServices,
    };
  },
);

export function useDashboardStatus(): DashboardStatus {
  const { incidents } = useIncidentStoreState();
  const services = useSystemHealthStoreState();
  return computeDashboardStatus(incidents, services);
}

/** Convenience re-export — §8.6 Primary Incident is the anchor for several derived selectors above. */
export { selectPrimaryIncident } from "./incidentPriority";
