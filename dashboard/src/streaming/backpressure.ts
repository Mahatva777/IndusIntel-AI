/**
 * Back-pressure strategy (§4.10) and update priority (§4.13).
 *
 *   Critical (Incident)            → applied synchronously, immediately —
 *                                     "Critical incident updates always
 *                                     preempt telemetry rendering" (§4.10).
 *   High (Permit)                  → queued, flushed before Medium/Low.
 *   Medium (Telemetry, Worker)     → "Burst telemetry → Batch render" /
 *                                     "Large worker updates → Incremental
 *                                     processing": coalesced per-entity
 *                                     (last write wins within a flush) and
 *                                     capped per tick.
 *   Low (Camera, DigitalTwin,
 *        SystemHealth, CV, RAG)    → "Camera metadata burst → Queue":
 *                                     FIFO, drained last.
 *
 * This module only decides *when* an already-validated, already-ordered
 * event gets handed to the store adapter — it never reorders events within
 * a single service stream (that's `SequenceTracker`'s job) and never
 * touches services whose events haven't cleared ordering yet.
 */
import type { ServiceName, UpdatePriority } from "./types";
import { SERVICE_PRIORITY } from "./types";

export interface PriorityScheduler {
  /** Enqueue one apply callback for a given service; Critical runs immediately. */
  schedule(service: ServiceName, apply: () => void): void;
  /** Force-drain everything queued (e.g. before a resync suspends rendering). */
  flush(): void;
  dispose(): void;
}

export interface PriorityQueueConfig {
  /** How often queued (non-Critical) work is flushed. */
  readonly tickMs: number;
  /** §4.10 "Large worker updates → Incremental processing": max Medium-priority items applied per tick. */
  readonly mediumChunkSize: number;
}

export const DEFAULT_PRIORITY_QUEUE_CONFIG: PriorityQueueConfig = {
  tickMs: 50,
  mediumChunkSize: 25,
};

type QueueItem = { readonly service: ServiceName; readonly apply: () => void };

export function createPriorityScheduler(config: PriorityQueueConfig = DEFAULT_PRIORITY_QUEUE_CONFIG): PriorityScheduler {
  const queues: Record<UpdatePriority, QueueItem[]> = { Critical: [], High: [], Medium: [], Low: [] };
  let timer: ReturnType<typeof setInterval> | null = null;

  function ensureTimer(): void {
    if (timer !== null) return;
    timer = setInterval(drainOnce, config.tickMs);
  }

  function drainOnce(): void {
    // High priority fully, every tick (§4.13: High above Medium/Low).
    while (queues.High.length > 0) {
      const item = queues.High.shift();
      item?.apply();
    }
    // Medium priority in bounded chunks — incremental processing (§4.10).
    let processed = 0;
    while (queues.Medium.length > 0 && processed < config.mediumChunkSize) {
      const item = queues.Medium.shift();
      item?.apply();
      processed += 1;
    }
    // Low priority — queued, drained last, one full pass (§4.10 "Camera metadata burst → Queue").
    while (queues.Low.length > 0) {
      const item = queues.Low.shift();
      item?.apply();
    }
    if (queues.High.length === 0 && queues.Medium.length === 0 && queues.Low.length === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    schedule(service, apply) {
      const priority = SERVICE_PRIORITY[service];
      if (priority === "Critical") {
        // §4.10: Critical incident updates always preempt — run now, no queueing.
        apply();
        return;
      }
      queues[priority].push({ service, apply });
      ensureTimer();
    },
    flush() {
      drainOnce();
      // Medium may need more than one pass if it was chunked.
      while (queues.Medium.length > 0) drainOnce();
    },
    dispose() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      queues.Critical = [];
      queues.High = [];
      queues.Medium = [];
      queues.Low = [];
    },
  };
}
