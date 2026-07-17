/**
 * Streaming Architecture shared types (§4). See individual fields below
 * for the spec clause each one is frozen by.
 */

/**
 * §4.17.1: sequence IDs are per owning service, not global and not
 * per-entity. The frozen list names Telemetry, Incident, Worker, Permit,
 * Camera, System Health, CV, RAG. Digital Twin is included here per this
 * prompt's explicit task list; §3.2/§1.7 give Zone and Equipment the same
 * owner (Digital Twin Service) and the same "Poll + Event, on change"
 * update method, so Zone/Equipment change events are routed through the
 * Digital Twin service stream's own watermark and dispatched by Entity
 * Type (§4.6) rather than getting independent counters of their own — flagged
 * interpretation, same pattern as other spec gaps this codebase notes
 * explicitly (see state-layer NOTES.md).
 */
export const SERVICE_NAMES = [
  "Telemetry",
  "Incident",
  "Worker",
  "Permit",
  "Camera",
  "DigitalTwin",
  "SystemHealth",
  "CV",
  "RAG",
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/** §4.6 Event Envelope Rules. */
export interface EventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly sequenceId: number;
  readonly timestamp: string;
  readonly serviceVersion: string;
  readonly entityType: string;
  readonly operation: "create" | "update" | "delete";
  readonly payload: TPayload;
}

/** §4.2 Connection Lifecycle (frozen state diagram). */
export type ConnectionPhase =
  | "Connecting"
  | "Authenticating"
  | "Synchronizing"
  | "Live"
  | "Reconnecting"
  | "Closed";

/** §4.13 Update Priority. */
export type UpdatePriority = "Critical" | "High" | "Medium" | "Low";

export const SERVICE_PRIORITY: Record<ServiceName, UpdatePriority> = {
  Incident: "Critical",
  Permit: "High",
  Telemetry: "Medium",
  Worker: "Medium",
  Camera: "Low",
  DigitalTwin: "Low",
  SystemHealth: "Low",
  CV: "Low",
  RAG: "Low",
};

/**
 * A snapshot fetched during (re)synchronization (§4.3 Synchronizing,
 * §4.17.8 Full Resynchronization). `entities` is intentionally untyped
 * here — the store adapter for each service knows how to bulk-load its
 * own payload shape.
 */
export interface ServiceSnapshot<TEntity = unknown> {
  readonly service: ServiceName;
  readonly watermark: number;
  readonly entities: readonly TEntity[];
}

/**
 * A contiguous range of missed events, fetched during partial
 * resynchronization (§4.17.7).
 */
export interface ServiceEventRange {
  readonly service: ServiceName;
  readonly events: readonly EventEnvelope[];
}
