/**
 * Resync coordinator (§4.17.7 Partial Resynchronization, §4.17.8 Full
 * Resynchronization, §4.17.9 Resynchronization Flow).
 *
 * Partial resync is scoped to exactly one service ("Affected service
 * only; other streams unaffected", §4.17.7) — it asks that service's
 * transport for the missing sequence range and resumes that one tracker.
 *
 * Full resync is scoped to *every* service stream, even when only one
 * service triggered it ("Scope: All service streams", §4.17.8; also the
 * §4.4/§4.12 reconnect path: "Successful reconnect → Full snapshot
 * synchronization" / "Synchronize → Fetch latest snapshot"). Rendering is
 * suspended until every service's snapshot has been applied (§4.17.8
 * "Rendering: Suspended until every service snapshot is applied").
 */
import { SequenceTracker } from "./sequenceTracker";
import { STORE_ADAPTERS, type StoreAdapter } from "./storeAdapters";
import type { EventEnvelope, ServiceEventRange, ServiceName, ServiceSnapshot } from "./types";
import { SERVICE_NAMES } from "./types";

export interface ResyncTransport {
  /** §4.17.7 mechanism: "Request missing sequence range from owning service." */
  fetchRange(service: ServiceName, fromSequenceId: number, toSequenceId: number): Promise<ServiceEventRange | null>;
  /** §4.17.8 mechanism: "Discard local watermark, fetch latest snapshot per service." */
  fetchSnapshot(service: ServiceName): Promise<ServiceSnapshot>;
}

export interface ResyncCoordinatorEvents {
  onRenderingSuspended?(): void;
  onRenderingResumed?(): void;
  onFullResyncStarted?(reason: "buffer-overflow" | "unresolved-gap" | "reconnect", triggeringService: ServiceName | null): void;
  onFullResyncCompleted?(): void;
  onPartialResyncFailed?(service: ServiceName): void;
}

export class ResyncCoordinator {
  private readonly trackers: ReadonlyMap<ServiceName, SequenceTracker>;
  private readonly transport: ResyncTransport;
  private readonly adapters: Record<ServiceName, StoreAdapter>;
  private readonly events: ResyncCoordinatorEvents;
  private fullResyncInFlight: Promise<void> | null = null;

  constructor(
    trackers: ReadonlyMap<ServiceName, SequenceTracker>,
    transport: ResyncTransport,
    events: ResyncCoordinatorEvents = {},
    adapters: Record<ServiceName, StoreAdapter> = STORE_ADAPTERS,
  ) {
    this.trackers = trackers;
    this.transport = transport;
    this.events = events;
    this.adapters = adapters;
  }

  /**
   * §4.17.7: bounded gap on a single service, unresolved after the buffer
   * window. Fetch just the missing range and resume that service alone.
   * Falls back to full resync if the range isn't available.
   */
  async partialResync(service: ServiceName, fromSequenceId: number, toSequenceId: number): Promise<void> {
    if (toSequenceId < fromSequenceId) return; // nothing actually missing
    const tracker = this.trackers.get(service);
    if (!tracker) return;

    const range = await this.transport.fetchRange(service, fromSequenceId, toSequenceId);
    if (range === null) {
      // §4.17.7 Fallback: "If range unavailable, escalate to full resynchronization."
      this.events.onPartialResyncFailed?.(service);
      await this.fullResync("unresolved-gap", service);
      return;
    }

    const toApply = tracker.applyResyncedRange(range.events);
    this.applyOrdered(service, toApply);
  }

  /**
   * §4.17.8: discard every service's local watermark and fetch a fresh
   * snapshot for all of them, suspending rendering until all are applied.
   * Also the reconnect path's "Synchronizing" phase (§4.2-§4.4, §4.12).
   */
  async fullResync(
    reason: "buffer-overflow" | "unresolved-gap" | "reconnect",
    triggeringService: ServiceName | null = null,
  ): Promise<void> {
    if (this.fullResyncInFlight) {
      // Coalesce concurrent triggers (e.g. two services overflow at once) into one resync.
      return this.fullResyncInFlight;
    }
    this.events.onFullResyncStarted?.(reason, triggeringService);
    this.events.onRenderingSuspended?.();

    this.fullResyncInFlight = (async () => {
      const snapshots = await Promise.all(
        SERVICE_NAMES.map(async (service) => [service, await this.transport.fetchSnapshot(service)] as const),
      );
      for (const [service, snapshot] of snapshots) {
        this.adapters[service].applySnapshot(snapshot);
        this.trackers.get(service)?.setWatermark(snapshot.watermark);
      }
    })();

    try {
      await this.fullResyncInFlight;
    } finally {
      this.fullResyncInFlight = null;
      this.events.onRenderingResumed?.();
      this.events.onFullResyncCompleted?.();
    }
  }

  /** Apply an in-order batch of events to one service's store adapter (§4.17.2 "apply in order"). */
  applyOrdered(service: ServiceName, events: readonly EventEnvelope[]): void {
    const adapter = this.adapters[service];
    for (const event of events) adapter.applyEvent(event);
  }
}
