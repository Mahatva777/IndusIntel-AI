import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingClient, type StreamingClientDeps } from "../client";
import type { ConnectionTransport } from "../connectionManager";
import type { ResyncTransport } from "../resyncCoordinator";
import { SERVICE_NAMES, type EventEnvelope, type ServiceEventRange, type ServiceName, type ServiceSnapshot } from "../types";

import { getAllIncidentsSnapshot, resetIncidentStore } from "@domain/incident/store";
import type { Incident, IncidentId } from "@domain/incident/types";

function makeIncident(sequenceId: number): Incident {
  return {
    id: `incident-${sequenceId}` as IncidentId,
    zoneId: "zone-1" as never,
    status: "Active",
    severity: "Critical",
    escalationLevel: "None",
    riskScore: sequenceId,
    confidenceScore: 0.9,
    workerIds: [],
    permitIds: [],
    createdAt: new Date(sequenceId * 1000).toISOString(),
  };
}

function incidentEnvelope(sequenceId: number): EventEnvelope {
  return {
    eventId: `evt-incident-${sequenceId}`,
    sequenceId,
    timestamp: new Date(sequenceId * 1000).toISOString(),
    serviceVersion: "1.0.0",
    entityType: "Incident",
    operation: "update",
    payload: makeIncident(sequenceId),
  };
}

/** Minimal fake transport: message delivery is driven by the test via `deliver`. */
class FakeConnectionTransport implements ConnectionTransport {
  private messageHandler: ((raw: unknown) => void) | null = null;
  private closeHandler: ((reason: unknown) => void) | null = null;
  private heartbeatAckHandler: (() => void) | null = null;
  connectCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }
  disconnect(): void {}
  async authenticate(): Promise<void> {}
  sendHeartbeat(): void {
    this.heartbeatAckHandler?.();
  }
  onMessage(handler: (raw: unknown) => void): void {
    this.messageHandler = handler;
  }
  onClose(handler: (reason: unknown) => void): void {
    this.closeHandler = handler;
  }
  onHeartbeatAck(handler: () => void): void {
    this.heartbeatAckHandler = handler;
  }
  deliver(raw: unknown): void {
    this.messageHandler?.(raw);
  }
  simulateConnectionLost(): void {
    this.closeHandler?.("connection lost");
  }
}

class FakeResyncTransport implements ResyncTransport {
  fetchRangeImpl: (service: ServiceName, from: number, to: number) => Promise<ServiceEventRange | null>;
  fetchSnapshotImpl: (service: ServiceName) => Promise<ServiceSnapshot>;
  fetchRangeCalls: Array<{ service: ServiceName; from: number; to: number }> = [];
  fetchSnapshotCalls: ServiceName[] = [];

  constructor(opts: {
    fetchRange?: (service: ServiceName, from: number, to: number) => Promise<ServiceEventRange | null>;
    fetchSnapshot?: (service: ServiceName) => Promise<ServiceSnapshot>;
  }) {
    this.fetchRangeImpl = opts.fetchRange ?? (async () => null);
    this.fetchSnapshotImpl =
      opts.fetchSnapshot ?? (async (service) => ({ service, watermark: 0, entities: [] }));
  }

  async fetchRange(service: ServiceName, fromSequenceId: number, toSequenceId: number) {
    this.fetchRangeCalls.push({ service, from: fromSequenceId, to: toSequenceId });
    return this.fetchRangeImpl(service, fromSequenceId, toSequenceId);
  }

  async fetchSnapshot(service: ServiceName) {
    this.fetchSnapshotCalls.push(service);
    return this.fetchSnapshotImpl(service);
  }
}

function resolveIncidentOnly(raw: Record<string, unknown>): ServiceName | null {
  return raw.entityType === "Incident" ? "Incident" : null;
}

describe("StreamingClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIncidentStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers in-order events straight through to the owning store (§4.7/§4.17.2, §1.1 ownership respected)", async () => {
    const connectionTransport = new FakeConnectionTransport();
    const resyncTransport = new FakeResyncTransport({
      fetchSnapshot: async (service) => ({ service, watermark: 0, entities: [] }),
    });
    const deps: StreamingClientDeps = {
      connectionTransport,
      resyncTransport,
      resolveService: resolveIncidentOnly,
    };
    const client = new StreamingClient(deps);
    await client.connect();
    expect(client.getPhase()).toBe("Live");

    connectionTransport.deliver(incidentEnvelope(1));
    connectionTransport.deliver(incidentEnvelope(2));
    connectionTransport.deliver(incidentEnvelope(3));

    expect(client.getWatermark("Incident")).toBe(3);
    expect(getAllIncidentsSnapshot().map((i) => i.id).sort()).toEqual(["incident-1", "incident-2", "incident-3"]);

    client.close();
  });

  it("buffers a small gap and applies both events, in order, once the missing sequence arrives within the window (§4.17.3/§4.17.4)", async () => {
    const connectionTransport = new FakeConnectionTransport();
    const resyncTransport = new FakeResyncTransport({
      fetchSnapshot: async (service) => ({ service, watermark: 0, entities: [] }),
    });
    const client = new StreamingClient(
      { connectionTransport, resyncTransport, resolveService: resolveIncidentOnly },
      { sequenceTracker: { bufferWindowMs: 2000, maxBufferSize: 10, maxSeenEventIds: 100 } },
    );
    await client.connect();

    connectionTransport.deliver(incidentEnvelope(1));
    connectionTransport.deliver(incidentEnvelope(3)); // gap: watermark 1, expected 2
    expect(client.getWatermark("Incident")).toBe(1);
    expect(getAllIncidentsSnapshot().map((i) => i.id).sort()).toEqual(["incident-1"]);

    vi.advanceTimersByTime(500); // still well inside the buffer window
    connectionTransport.deliver(incidentEnvelope(2)); // fills the gap

    expect(client.getWatermark("Incident")).toBe(3);
    expect(getAllIncidentsSnapshot().map((i) => i.id).sort()).toEqual(["incident-1", "incident-2", "incident-3"]);
    expect(resyncTransport.fetchRangeCalls).toHaveLength(0); // never needed a resync

    client.close();
  });

  it("triggers a partial resync for just the missing range when a gap outlasts the buffer window (§4.17.4/§4.17.7)", async () => {
    const connectionTransport = new FakeConnectionTransport();
    const resyncTransport = new FakeResyncTransport({
      fetchSnapshot: async (service) => ({ service, watermark: 0, entities: [] }),
      fetchRange: async (service, from, to) => {
        const events: EventEnvelope[] = [];
        for (let seq = from; seq <= to; seq += 1) events.push(incidentEnvelope(seq));
        return { service, events };
      },
    });
    const client = new StreamingClient(
      { connectionTransport, resyncTransport, resolveService: resolveIncidentOnly },
      { sequenceTracker: { bufferWindowMs: 1000, maxBufferSize: 10, maxSeenEventIds: 100 } },
    );
    await client.connect();
    const snapshotCallsAfterConnect = resyncTransport.fetchSnapshotCalls.length; // connect's own Synchronizing-phase sync

    connectionTransport.deliver(incidentEnvelope(1));
    connectionTransport.deliver(incidentEnvelope(4)); // gap: expected 2, got 4 (missing 2, 3)
    expect(client.getWatermark("Incident")).toBe(1);

    await vi.advanceTimersByTimeAsync(1000); // buffer window elapses, unresolved

    expect(resyncTransport.fetchRangeCalls).toEqual([{ service: "Incident", from: 2, to: 3 }]);
    // Partial resync is scoped to this service only (§4.17.7) — no *additional* snapshot fetches beyond connect's.
    expect(resyncTransport.fetchSnapshotCalls).toHaveLength(snapshotCallsAfterConnect);
    expect(client.getWatermark("Incident")).toBe(4); // range applied, then buffered #4 drained
    expect(getAllIncidentsSnapshot().map((i) => i.id).sort()).toEqual([
      "incident-1",
      "incident-2",
      "incident-3",
      "incident-4",
    ]);

    client.close();
  });

  it("falls back to a full resync of every service when the missing range is unavailable (§4.17.7 fallback, §4.17.8)", async () => {
    const connectionTransport = new FakeConnectionTransport();
    const snapshotIncidents = [makeIncident(100)];
    const resyncTransport = new FakeResyncTransport({
      fetchRange: async () => null, // range unavailable
      fetchSnapshot: async (service) =>
        service === "Incident"
          ? { service, watermark: 100, entities: snapshotIncidents }
          : { service, watermark: 0, entities: [] },
    });
    const client = new StreamingClient(
      { connectionTransport, resyncTransport, resolveService: resolveIncidentOnly },
      { sequenceTracker: { bufferWindowMs: 1000, maxBufferSize: 10, maxSeenEventIds: 100 } },
    );
    await client.connect();

    connectionTransport.deliver(incidentEnvelope(1));
    connectionTransport.deliver(incidentEnvelope(4));

    await vi.advanceTimersByTimeAsync(1000);

    // Every service got a fresh snapshot, not just Incident (§4.17.8 "Scope: All service streams").
    expect(new Set(resyncTransport.fetchSnapshotCalls)).toEqual(new Set(SERVICE_NAMES));
    expect(client.getWatermark("Incident")).toBe(100);
    expect(getAllIncidentsSnapshot().map((i) => i.id)).toEqual(["incident-100"]);

    client.close();
  });

  it("discards the buffer and triggers a full resync of every service on overflow (§4.17.3/§4.17.4/§4.17.8)", async () => {
    const connectionTransport = new FakeConnectionTransport();
    const snapshotIncidents = [makeIncident(200)];
    const resyncTransport = new FakeResyncTransport({
      fetchSnapshot: async (service) =>
        service === "Incident"
          ? { service, watermark: 200, entities: snapshotIncidents }
          : { service, watermark: 0, entities: [] },
    });
    const client = new StreamingClient(
      { connectionTransport, resyncTransport, resolveService: resolveIncidentOnly },
      { sequenceTracker: { bufferWindowMs: 5000, maxBufferSize: 3, maxSeenEventIds: 100 } },
    );
    await client.connect();

    connectionTransport.deliver(incidentEnvelope(1)); // watermark -> 1
    // Each of these is out of order (gap at 2) and piles into the buffer.
    connectionTransport.deliver(incidentEnvelope(3));
    connectionTransport.deliver(incidentEnvelope(4));
    connectionTransport.deliver(incidentEnvelope(5));
    // Fourth buffered (out-of-order) arrival exceeds maxBufferSize=3 -> overflow.
    connectionTransport.deliver(incidentEnvelope(6));

    await vi.waitFor(() => {
      expect(client.getWatermark("Incident")).toBe(200);
    });

    expect(new Set(resyncTransport.fetchSnapshotCalls)).toEqual(new Set(SERVICE_NAMES));
    expect(getAllIncidentsSnapshot().map((i) => i.id)).toEqual(["incident-200"]);

    client.close();
  });
});
