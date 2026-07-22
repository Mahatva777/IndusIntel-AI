/**
 * Entity Contract types.
 *
 * Source of truth for *field presence and mutability* is Appendix A –
 * Entity Contract Summary, cross-referenced against Sections 1–9 per the
 * appendix's own precedence note ("Where this appendix and Sections 1–9
 * appear to disagree, Sections 1–9 govern"). Appendix A explicitly states
 * it "does not define TypeScript interfaces or JSON payload shapes" — so
 * every interface below is this layer's implementation of that contract,
 * not a restatement of something already frozen verbatim. Enum-like union
 * types are drawn from concrete spec language (§8.3 Severity Ranking,
 * §8.10 Alarm Priority Mapping, §9.10 escalationLevel transitions, §7.5
 * Prioritization Levels, Appendix A Permit/Camera status lists). Where the
 * spec names a field but never enumerates its values (e.g. Worker Status),
 * a placeholder union is used and called out below — same pattern as the
 * §16 token-value gap already flagged in the scaffold README.
 */
import type {
  CameraId,
  CvDetectionId,
  DigitalTwinId,
  EquipmentId,
  EvidenceId,
  IncidentId,
  KnowledgeRecordId,
  PermitId,
  RecommendationId,
  SensorId,
  TimelineEventId,
  WorkerId,
  ZoneId,
} from "./ids";

/** §8.3 Severity Ranking. Domain severity — distinct from the §16.2 UI token
 * hierarchy (Emergency/Critical/Warning/Advisory/Normal/Information), which
 * names *display* tiers, not this data model's enum. */
export type IncidentSeverity = "Emergency" | "Critical" | "High" | "Medium" | "Low" | "Informational";

/** §8.10 Alarm Priority Mapping — always derived from IncidentSeverity, never assigned independently. */
export type AlarmPriority = "P1" | "P2" | "P3" | "P4" | "P5";

/** §9.10 Single Source of Truth — server-published escalation state machine. */
export type EscalationLevel =
  | "None"
  | "Reminder"
  | "AudibleReminder"
  | "SupervisorEscalated"
  | "PlantManagerEscalated"
  | "Acknowledged";

/**
 * Incident lifecycle status. Appendix A lists "Status" as a mutable field
 * distinct from `escalationLevel` and `Acknowledged By`; §8.7 Incident
 * Queue Behavior implies Active → (Acknowledged, ordered) → Resolved →
 * Archived as the lifecycle. Not verbatim-enumerated by the spec.
 */
export type IncidentStatus = "Active" | "Resolved" | "Archived";

export interface Incident {
  readonly id: IncidentId;
  name?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  /** Alarm Priority is a pure function of severity (§8.10) — always derive, never set independently. */
  readonly zoneId: ZoneId; // "Zone (of origin)" — immutable per Appendix A
  readonly createdAt: string; // ISO timestamp, immutable per Appendix A
  riskScore: number; // Compound Risk Score, §8.2 priority attribute #2
  confidenceScore: number; // §8.2 priority attribute #6
  escalationLevel: EscalationLevel;
  acknowledgedBy: WorkerId | null;
  resolvedAt: string | null;
  workerIds: readonly WorkerId[]; // "Workers at Risk", §8.2 priority attribute #4
  permitIds: readonly PermitId[];
  evidenceIds: readonly EvidenceId[];
  recommendationIds: readonly RecommendationId[];
}

/** §8.10 — pure function of Incident.severity, exposed as a derived helper rather than stored state. */
export function alarmPriorityForSeverity(severity: IncidentSeverity): AlarmPriority {
  switch (severity) {
    case "Emergency":
      return "P1";
    case "Critical":
      return "P2";
    case "High":
      return "P3";
    case "Medium":
    case "Low":
      return "P4";
    case "Informational":
      return "P5";
  }
}

/**
 * Worker Status — Appendix A requires the field but never enumerates
 * values. PLACEHOLDER union pending backend contract confirmation.
 */
export type WorkerStatus = "OnSite" | "OffSite" | "AtRisk" | "Evacuated";

export interface Worker {
  readonly id: WorkerId;
  zoneId: ZoneId | null;
  status: WorkerStatus;
  position: { readonly x: number; readonly y: number; readonly zoneId: ZoneId } | null;
  permitId: PermitId | null;
}

/** Appendix A: "Status (Active/Suspended/Resumed/Closed)". */
export type PermitStatus = "Active" | "Suspended" | "Resumed" | "Closed";

export interface Permit {
  readonly id: PermitId;
  status: PermitStatus;
  readonly workerId: WorkerId; // assigned at issue, immutable per Appendix A
  equipmentId: EquipmentId;
  zoneId?: ZoneId | string;
  type?: string;
  gasTestRequired?: boolean;
  gasTestValidity?: string;
  expiresAt?: string;
}

/**
 * Telemetry Reading — the live streamed value entity, distinct from the
 * Sensor metadata entity folded into Equipment (§2.2 terminology note).
 */
export interface TelemetryReading {
  readonly sensorId: SensorId;
  readonly equipmentId: EquipmentId;
  readonly zoneId: ZoneId;
  value: number;
  severity?: string;
  readonly timestamp: string; // immutable per Appendix A
}

/** Appendix A: "Status (Active/Unavailable)". */
export type CameraStatus = "Active" | "Unavailable";

export interface Camera {
  readonly id: CameraId;
  readonly zoneId: ZoneId;
  status: CameraStatus;
  metadata: Readonly<Record<string, unknown>>;
}

/**
 * Recommendation and Evidence: relationship-frozen by §2.3/§2.7, owned by
 * their own backend services (§2.4, §3.2), but §1.2/§1.3 do not list them
 * as top-level Application State slices. FLAGGED (same pattern as the
 * README's two flagged scaffold gaps): treated here as Entity Stores owned
 * and exported alongside the Incident store (src/domain/incident/store.ts)
 * rather than as one of the 14 requested top-level stores, since every
 * relationship they participate in is anchored to Incident (§2.3: Incident
 * → Evidence, Recommendation → Incident).
 */
export interface Recommendation {
  readonly id: RecommendationId;
  readonly incidentId: IncidentId;
  readonly content: string;
  readonly createdAt: string;
  acknowledged: boolean;
}

export type EvidenceSourceType = "Sensor" | "Camera" | "Worker" | "Permit" | "System";

export interface Evidence {
  readonly id: EvidenceId;
  readonly incidentId: IncidentId;
  readonly sourceType: EvidenceSourceType;
  readonly createdAt: string;
  readonly sensorId: SensorId | null;
  readonly workerId: WorkerId | null;
  readonly permitId: PermitId | null;
  readonly ruleId?: string;
  readonly finding?: string;
  readonly severityContribution?: number;
}

/** §4.6/§4.17.1 Timeline Event envelope; Appendix A: append-only, never edited. */
export interface TimelineEvent {
  readonly id: TimelineEventId;
  readonly sequenceId: number;
  readonly entityType: "Incident" | "Worker" | "Permit" | "Telemetry" | "Camera" | "System" | "Agent";
  readonly entityId: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Spatial entities (§1.7, §2.12)
// ---------------------------------------------------------------------------

/**
 * Zone geometry — §1.7/§2.12 freeze Zone as identity + geometry + topology
 * membership but (like §16's token values) do not freeze a concrete
 * geometry payload shape. A closed polygon in plant-plan coordinates is
 * this layer's placeholder, flagged pending confirmation from the Digital
 * Twin Service contract.
 */
export interface ZoneGeometry {
  readonly floor: string;
  readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface Zone {
  readonly id: ZoneId;
  readonly digitalTwinId: DigitalTwinId; // §2.12 Zone → Digital Twin
  name: string;
  geometry: ZoneGeometry;
  equipmentIds: readonly EquipmentId[];
  cameraIds: readonly CameraId[];
}

/**
 * Equipment — static identity/metadata only (§1.7: "not live operational
 * state"; live values stay in Telemetry, merged only at render time, §3.8
 * Freeze Rules). Sensor metadata (§2.2 terminology note) is folded in here
 * rather than modeled as its own store, per §1.7's explicit instruction
 * that Sensor identity lives "as part of Equipment metadata".
 */
export interface EquipmentSensor {
  readonly id: SensorId;
  readonly kind: string;
}

export interface Equipment {
  readonly id: EquipmentId;
  readonly zoneId: ZoneId; // §2.3/§2.12 Equipment → Zone
  readonly digitalTwinId: DigitalTwinId; // §2.12 Equipment → Digital Twin
  name: string;
  type: string;
  spec: Readonly<Record<string, unknown>>;
  installedAt: string;
  sensors: readonly EquipmentSensor[];
}

export interface DigitalTwin {
  /** Singleton per plant/site (§2.12 Primary IDs). */
  readonly id: DigitalTwinId;
  zoneIds: readonly ZoneId[];
  equipmentIds: readonly EquipmentId[];
  cameraIds: readonly CameraId[];
  /** Base overlays (heatmaps, sensor overlays) per §1.7 Purpose column. */
  overlays: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// System Health (§1.3 Flat Map)
// ---------------------------------------------------------------------------

export type ServiceHealthStatus = "online" | "degraded" | "offline";

export interface ServiceHealthSnapshot {
  readonly service: string;
  status: ServiceHealthStatus;
  readonly lastUpdated: string;
  latencyMs: number | null;
}

// ---------------------------------------------------------------------------
// Future CV / Future RAG (§1.3 Entity Store, reserved per README)
// ---------------------------------------------------------------------------

export interface CvDetection {
  readonly id: CvDetectionId;
  readonly cameraId: CameraId;
  readonly timestamp: string;
  readonly confidence: number;
  workerId: WorkerId | null;
  incidentId: IncidentId | null;
}

export interface KnowledgeRecord {
  readonly id: KnowledgeRecordId;
  readonly incidentId: IncidentId | null;
  readonly recommendationId: RecommendationId | null;
  readonly title: string;
  readonly content: string;
}
