/**
 * Per-service sequence tracker (§4.17.1: one independent watermark per
 * service stream). Pure decision engine — it never touches a store or the
 * network directly; it tells the caller what to do with each event
 * (`apply`, `buffer`, `discard`, or escalate to `partial-resync-timeout` /
 * `overflow`) and the caller (StreamingClient) carries that out. Kept
 * framework-free so it's trivially unit-testable per the deliverable's
 * required test scenarios.
 */
import type { EventEnvelope, ServiceName } from "./types";

export interface SequenceTrackerConfig {
  /** §4.17.3/§4.4: "short, fixed upper bound" buffer window before a gap escalates to partial resync. */
  readonly bufferWindowMs: number;
  /** §4.17.3/§4.17.4: buffer overflow / "large gap" threshold — max out-of-order events held per service. */
  readonly maxBufferSize: number;
  /** §4.17.5: dedupe scope is "per service, keyed on Sequence ID + Event ID" — bound the seen-set so it doesn't grow forever. */
  readonly maxSeenEventIds: number;
}

export const DEFAULT_SEQUENCE_TRACKER_CONFIG: SequenceTrackerConfig = {
  bufferWindowMs: 2000,
  maxBufferSize: 25,
  maxSeenEventIds: 500,
};

export type SequenceDecision =
  /** §4.7/§4.17.2: in order (or now unblocked from the buffer) — apply immediately. */
  | { readonly kind: "apply"; readonly events: readonly EventEnvelope[] }
  /** §4.17.3: out of order, held until the gap resolves or the window/overflow threshold trips. */
  | { readonly kind: "buffered" }
  /** §4.7/§4.8/§4.17.5/§4.17.6: duplicate or stale — never applied, never rendered. */
  | { readonly kind: "discarded"; readonly reason: "duplicate" | "stale" }
  /** §4.17.3/§4.17.4/§4.17.8: buffer exceeded its bound — caller must trigger full resync. */
  | { readonly kind: "overflow" };

/**
 * §4.17.4/§4.17.7: fired by the caller's buffer-window timer, not by
 * `receive` itself, since the trigger is "unresolved *after* the buffer
 * window" — a time-based event, not an arrival-based one.
 */
export type GapTimeoutDecision =
  | { readonly kind: "none" }
  | { readonly kind: "partial-resync"; readonly fromSequenceId: number; readonly toSequenceId: number };

export class SequenceTracker {
  readonly service: ServiceName;
  private readonly config: SequenceTrackerConfig;

  /** Highest sequence ID actually applied to the store. Null until first sync. */
  private watermark: number | null = null;
  /** Out-of-order events, keyed by sequenceId, awaiting the gap to fill. */
  private buffer = new Map<number, EventEnvelope>();
  /** §4.17.5 dedupe set, insertion-ordered so it can be trimmed to `maxSeenEventIds`. */
  private seenEventIds = new Set<string>();
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private onGapTimeout: ((decision: GapTimeoutDecision) => void) | null = null;

  constructor(service: ServiceName, config: SequenceTrackerConfig = DEFAULT_SEQUENCE_TRACKER_CONFIG) {
    this.service = service;
    this.config = config;
  }

  /** Register the callback invoked when a buffered gap's window expires (§4.17.4/§4.17.7). */
  setGapTimeoutHandler(handler: (decision: GapTimeoutDecision) => void): void {
    this.onGapTimeout = handler;
  }

  getWatermark(): number | null {
    return this.watermark;
  }

  getBufferedCount(): number {
    return this.buffer.size;
  }

  /**
   * Called by the resync coordinator once a snapshot or range fetch
   * establishes (or re-establishes) the watermark (§4.17.7 outcome,
   * §4.17.8 outcome). Clears any in-flight buffer/timer — a resync always
   * supersedes buffered state (§4.17.6: "arriving mid-resynchronization →
   * discard, snapshot supersedes").
   */
  setWatermark(watermark: number): void {
    this.watermark = watermark;
    this.clearBuffer();
  }

  reset(): void {
    this.watermark = null;
    this.clearBuffer();
    this.seenEventIds.clear();
  }

  private clearBuffer(): void {
    this.buffer.clear();
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private remember(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > this.config.maxSeenEventIds) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest !== undefined) this.seenEventIds.delete(oldest);
    }
  }

  /**
   * Feed one arriving event through the ordering/dedupe/gap rules. The
   * caller is expected to apply `apply` decisions to the store in the
   * given order and to trigger full resync on `overflow`.
   */
  receive(event: EventEnvelope): SequenceDecision {
    // §4.8/§4.17.5: Duplicate Event ID → ignore regardless of sequence position.
    if (this.seenEventIds.has(event.eventId)) {
      return { kind: "discarded", reason: "duplicate" };
    }

    if (this.watermark === null) {
      // Not yet synchronized — nothing to compare against; hold until a
      // snapshot establishes a watermark. Treat as buffered rather than
      // silently dropped so a caller mid-Synchronizing phase doesn't lose it.
      this.buffer.set(event.sequenceId, event);
      this.remember(event.eventId);
      return { kind: "buffered" };
    }

    // §4.7/§4.17.6: sequence ID at or below the applied watermark → stale/duplicate, discard.
    if (event.sequenceId <= this.watermark) {
      this.remember(event.eventId);
      return { kind: "discarded", reason: "stale" };
    }

    // §4.7/§4.17.2: in order — apply this event and any now-contiguous buffered ones.
    if (event.sequenceId === this.watermark + 1) {
      this.remember(event.eventId);
      const toApply: EventEnvelope[] = [event];
      let next = event.sequenceId + 1;
      while (this.buffer.has(next)) {
        const buffered = this.buffer.get(next);
        if (buffered === undefined) break;
        toApply.push(buffered);
        this.buffer.delete(next);
        next += 1;
      }
      this.watermark = next - 1;
      if (this.buffer.size === 0 && this.gapTimer !== null) {
        clearTimeout(this.gapTimer);
        this.gapTimer = null;
      }
      return { kind: "apply", events: toApply };
    }

    // Out of order (§4.17.2/§4.17.3): gap detected, buffer it.
    this.remember(event.eventId);
    this.buffer.set(event.sequenceId, event);

    // §4.17.3/§4.17.4: buffer overflow (large gap) → caller must trigger full resync immediately.
    if (this.buffer.size > this.config.maxBufferSize) {
      this.clearBuffer();
      return { kind: "overflow" };
    }

    // §4.17.4/§4.17.7: start (or leave running) the bounded gap window.
    if (this.gapTimer === null) {
      this.gapTimer = setTimeout(() => this.handleGapTimeout(), this.config.bufferWindowMs);
    }
    return { kind: "buffered" };
  }

  private handleGapTimeout(): void {
    this.gapTimer = null;
    if (this.buffer.size === 0 || this.watermark === null) {
      this.onGapTimeout?.({ kind: "none" });
      return;
    }
    // §4.17.4/§4.17.7: small gap unresolved after the buffer window → partial resync
    // for the missing range only (watermark+1 .. lowest buffered sequence - 1).
    const lowestBuffered = Math.min(...this.buffer.keys());
    this.onGapTimeout?.({
      kind: "partial-resync",
      fromSequenceId: this.watermark + 1,
      toSequenceId: lowestBuffered - 1,
    });
  }

  /**
   * After a partial resync fills [fromSequenceId, toSequenceId], apply the
   * fetched range plus anything already buffered above it, in order
   * (§4.17.7 outcome: "fill gap, resume live application from watermark").
   */
  applyResyncedRange(rangeEvents: readonly EventEnvelope[]): readonly EventEnvelope[] {
    const toApply: EventEnvelope[] = [];
    for (const event of [...rangeEvents].sort((a, b) => a.sequenceId - b.sequenceId)) {
      if (this.watermark !== null && event.sequenceId <= this.watermark) continue;
      toApply.push(event);
      this.remember(event.eventId);
      this.watermark = event.sequenceId;
    }
    // Drain any now-contiguous buffered events too.
    let next = (this.watermark ?? 0) + 1;
    while (this.buffer.has(next)) {
      const buffered = this.buffer.get(next);
      if (buffered === undefined) break;
      toApply.push(buffered);
      this.buffer.delete(next);
      this.watermark = next;
      next += 1;
    }
    return toApply;
  }
}
