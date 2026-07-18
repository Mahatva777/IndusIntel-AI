import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SequenceTracker } from "./sequenceTracker";
import type { EventEnvelope } from "./types";

function envelope(sequenceId: number, overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: `evt-${sequenceId}`,
    sequenceId,
    timestamp: new Date(0).toISOString(),
    serviceVersion: "1.0.0",
    entityType: "Incident",
    operation: "update",
    payload: { sequenceId },
    ...overrides,
  };
}

describe("SequenceTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies in-order events immediately and advances the watermark (§4.7/§4.17.2)", () => {
    const tracker = new SequenceTracker("Incident", { bufferWindowMs: 1000, maxBufferSize: 5, maxSeenEventIds: 100 });
    tracker.setWatermark(0);

    const d1 = tracker.receive(envelope(1));
    expect(d1).toEqual({ kind: "apply", events: [envelope(1)] });
    expect(tracker.getWatermark()).toBe(1);

    const d2 = tracker.receive(envelope(2));
    expect(d2.kind).toBe("apply");
    expect(tracker.getWatermark()).toBe(2);

    const d3 = tracker.receive(envelope(3));
    expect(d3.kind).toBe("apply");
    expect(tracker.getWatermark()).toBe(3);
    expect(tracker.getBufferedCount()).toBe(0);
  });

  it("discards duplicate and stale (below watermark) events without applying (§4.7/§4.8/§4.17.5/§4.17.6)", () => {
    const tracker = new SequenceTracker("Incident");
    tracker.setWatermark(5);

    expect(tracker.receive(envelope(5))).toEqual({ kind: "discarded", reason: "stale" });
    expect(tracker.receive(envelope(3))).toEqual({ kind: "discarded", reason: "stale" });

    // A duplicate Event ID for a sequence we haven't seen yet is still ignored.
    tracker.receive(envelope(6));
    expect(tracker.receive(envelope(6))).toEqual({ kind: "discarded", reason: "duplicate" });
  });

  it("buffers a single-sequence gap and applies both events in order once it fills within the window (§4.17.3/§4.17.4)", () => {
    const tracker = new SequenceTracker("Incident", { bufferWindowMs: 2000, maxBufferSize: 10, maxSeenEventIds: 100 });
    tracker.setWatermark(1); // already applied seq 1

    const decisionForSeq3 = tracker.receive(envelope(3)); // expected 2, gap of exactly one
    expect(decisionForSeq3).toEqual({ kind: "buffered" });
    expect(tracker.getWatermark()).toBe(1);
    expect(tracker.getBufferedCount()).toBe(1);

    vi.advanceTimersByTime(1000); // still inside the buffer window

    const decisionForSeq2 = tracker.receive(envelope(2));
    expect(decisionForSeq2.kind).toBe("apply");
    if (decisionForSeq2.kind === "apply") {
      expect(decisionForSeq2.events.map((e) => e.sequenceId)).toEqual([2, 3]);
    }
    expect(tracker.getWatermark()).toBe(3);
    expect(tracker.getBufferedCount()).toBe(0);
  });

  it("escalates an unresolved gap to a partial-resync request once the buffer window elapses (§4.17.4/§4.17.7)", () => {
    const tracker = new SequenceTracker("Incident", { bufferWindowMs: 1000, maxBufferSize: 10, maxSeenEventIds: 100 });
    tracker.setWatermark(10);

    const onGapTimeout = vi.fn();
    tracker.setGapTimeoutHandler(onGapTimeout);

    tracker.receive(envelope(13)); // gap: expected 11, got 13
    expect(onGapTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(onGapTimeout).toHaveBeenCalledWith({ kind: "partial-resync", fromSequenceId: 11, toSequenceId: 12 });
    // The event stays buffered, not discarded, while the partial resync is pending.
    expect(tracker.getBufferedCount()).toBe(1);
  });

  it("applying a resynced range fills the gap and drains any now-contiguous buffered events (§4.17.7 outcome)", () => {
    const tracker = new SequenceTracker("Incident");
    tracker.setWatermark(10);
    tracker.receive(envelope(13)); // buffered, gap at 11-12

    const applied = tracker.applyResyncedRange([envelope(11), envelope(12)]);
    expect(applied.map((e) => e.sequenceId)).toEqual([11, 12, 13]);
    expect(tracker.getWatermark()).toBe(13);
    expect(tracker.getBufferedCount()).toBe(0);
  });

  it("signals overflow once the buffer exceeds its bound, discarding buffered state for a full resync (§4.17.3/§4.17.4/§4.17.8)", () => {
    const tracker = new SequenceTracker("Incident", { bufferWindowMs: 5000, maxBufferSize: 3, maxSeenEventIds: 100 });
    tracker.setWatermark(0);

    expect(tracker.receive(envelope(2)).kind).toBe("buffered");
    expect(tracker.receive(envelope(3)).kind).toBe("buffered");
    expect(tracker.receive(envelope(4)).kind).toBe("buffered");
    const overflowDecision = tracker.receive(envelope(5));

    expect(overflowDecision).toEqual({ kind: "overflow" });
    expect(tracker.getBufferedCount()).toBe(0); // buffer discarded per §4.17.3
  });

  it("keeps other services' watermarks untouched — trackers are fully independent (§4.17.1)", () => {
    const incidentTracker = new SequenceTracker("Incident");
    const telemetryTracker = new SequenceTracker("Telemetry");
    incidentTracker.setWatermark(100);
    telemetryTracker.setWatermark(5);

    incidentTracker.receive(envelope(101));
    expect(incidentTracker.getWatermark()).toBe(101);
    expect(telemetryTracker.getWatermark()).toBe(5);
  });
});
