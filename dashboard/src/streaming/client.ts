/**
 * StreamingClient — composes everything in this module into the single
 * object the rest of the app talks to. This is the piece §4.14's sequence
 * diagram describes end to end: `Backend → Stream → Dashboard → Store →
 * Panels`, with "Missing sequence → Resynchronize" (§4.14) implemented via
 * `SequenceTracker` + `ResyncCoordinator`.
 */
import { ConnectionManager, type ConnectionTransport, type HeartbeatConfig, type ReconnectPolicyConfig } from "./connectionManager";
import { ResyncCoordinator, type ResyncCoordinatorEvents, type ResyncTransport } from "./resyncCoordinator";
import { SequenceTracker, type SequenceTrackerConfig } from "./sequenceTracker";
import { createPriorityScheduler, type PriorityQueueConfig, type PriorityScheduler } from "./backpressure";
import { setServiceHealth } from "@domain/system-health/store";
import { SERVICE_NAMES, type ConnectionPhase, type EventEnvelope, type ServiceName } from "./types";

/** Raw wire message before envelope validation — same shape as `EventEnvelope` but untrusted. */
type RawMessage = Record<string, unknown>;

export interface StreamingClientConfig {
  readonly sequenceTracker?: SequenceTrackerConfig;
  readonly reconnectPolicy?: ReconnectPolicyConfig;
  readonly heartbeat?: HeartbeatConfig;
  readonly priorityQueue?: PriorityQueueConfig;
}

export interface StreamingClientDeps {
  readonly connectionTransport: ConnectionTransport;
  readonly resyncTransport: ResyncTransport;
  /** Extracts which service a raw wire message belongs to, e.g. from a routing header. Not itself part of the envelope (§4.6 lists only the seven payload fields). */
  readonly resolveService: (raw: RawMessage) => ServiceName | null;
  readonly scheduler?: PriorityScheduler;
}

/** §4.6 Event Envelope Rules — every field is required. */
function validateEnvelope(raw: RawMessage): EventEnvelope | null {
  const { eventId, sequenceId, timestamp, serviceVersion, entityType, operation, payload } = raw;
  if (typeof eventId !== "string" || eventId.length === 0) return null;
  if (typeof sequenceId !== "number" || !Number.isFinite(sequenceId)) return null;
  if (typeof timestamp !== "string" || timestamp.length === 0) return null;
  if (typeof serviceVersion !== "string" || serviceVersion.length === 0) return null;
  if (typeof entityType !== "string" || entityType.length === 0) return null;
  if (operation !== "create" && operation !== "update" && operation !== "delete") return null;
  if (payload === undefined) return null;
  return { eventId, sequenceId, timestamp, serviceVersion, entityType, operation, payload };
}

export class StreamingClient {
  private readonly deps: StreamingClientDeps;
  private readonly trackers: Map<ServiceName, SequenceTracker> = new Map();
  private readonly connectionManager: ConnectionManager;
  private readonly resyncCoordinator: ResyncCoordinator;
  private readonly scheduler: PriorityScheduler;
  private renderingSuspended = false;

  constructor(deps: StreamingClientDeps, config: StreamingClientConfig = {}) {
    this.deps = deps;
    this.scheduler = deps.scheduler ?? createPriorityScheduler(config.priorityQueue);

    for (const service of SERVICE_NAMES) {
      const tracker = new SequenceTracker(service, config.sequenceTracker);
      tracker.setGapTimeoutHandler((decision) => {
        if (decision.kind === "partial-resync") {
          void this.resyncCoordinator.partialResync(service, decision.fromSequenceId, decision.toSequenceId);
        }
      });
      this.trackers.set(service, tracker);
    }

    const resyncEvents: ResyncCoordinatorEvents = {
      onRenderingSuspended: () => {
        this.renderingSuspended = true;
      },
      onRenderingResumed: () => {
        this.renderingSuspended = false;
        this.scheduler.flush();
      },
    };
    this.resyncCoordinator = new ResyncCoordinator(this.trackers, deps.resyncTransport, resyncEvents);

    deps.connectionTransport.onMessage((raw) => this.handleRawMessage(raw as RawMessage));

    this.connectionManager = new ConnectionManager(
      deps.connectionTransport,
      {
        synchronize: () => this.resyncCoordinator.fullResync("reconnect"),
        onPhaseChange: (phase: ConnectionPhase) => {
          setServiceHealth({
            service: "Network",
            status: phase === "Live" ? "online" : "offline",
            lastUpdated: new Date().toISOString(),
            latencyMs: null,
          });
        },
      },
      config.reconnectPolicy,
      config.heartbeat,
    );
  }

  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  close(): void {
    this.connectionManager.close();
    this.scheduler.dispose();
  }

  getPhase(): ConnectionPhase {
    return this.connectionManager.getPhase();
  }

  getWatermark(service: ServiceName): number | null {
    return this.trackers.get(service)?.getWatermark() ?? null;
  }

  private handleRawMessage(raw: RawMessage): void {
    const service = this.deps.resolveService(raw);
    if (service === null) return; // unroutable — not a domain event (e.g. a heartbeat ack), ignore

    const envelope = validateEnvelope(raw);
    if (envelope === null) return; // §4.6: malformed envelope, never applied

    // §4.11: "Live Events → Continue buffering" while replay/resync suspends rendering.
    // Ordering/dedupe still runs so nothing is lost, but the apply is deferred via the
    // scheduler's flush-on-resume rather than skipped.
    const tracker = this.trackers.get(service);
    if (!tracker) return;

    const decision = tracker.receive(envelope);
    if (decision.kind === "apply") {
      this.scheduler.schedule(service, () => this.resyncCoordinator.applyOrdered(service, decision.events));
    } else if (decision.kind === "overflow") {
      void this.resyncCoordinator.fullResync("buffer-overflow", service);
    }
    // "buffered" / "discarded" → nothing to apply yet.
  }

  isRenderingSuspended(): boolean {
    return this.renderingSuspended;
  }
}
