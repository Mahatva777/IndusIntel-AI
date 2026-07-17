import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionManager, type ConnectionTransport } from "../connectionManager";
import type { ConnectionPhase } from "../types";

class FakeTransport implements ConnectionTransport {
  private closeHandler: ((reason: unknown) => void) | null = null;
  private ackHandler: (() => void) | null = null;
  connectCalls = 0;
  heartbeatsSent = 0;
  respondToHeartbeat = true;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }
  disconnect(): void {}
  async authenticate(): Promise<void> {}
  sendHeartbeat(): void {
    this.heartbeatsSent += 1;
    if (this.respondToHeartbeat) this.ackHandler?.();
  }
  onMessage(): void {}
  onClose(handler: (reason: unknown) => void): void {
    this.closeHandler = handler;
  }
  onHeartbeatAck(handler: () => void): void {
    this.ackHandler = handler;
  }
  simulateConnectionLost(): void {
    this.closeHandler?.("lost");
  }
}

describe("ConnectionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks the frozen lifecycle Connecting → Authenticating → Synchronizing → Live (§4.2)", async () => {
    const transport = new FakeTransport();
    const phases: ConnectionPhase[] = [];
    const manager = new ConnectionManager(transport, {
      onPhaseChange: (phase) => phases.push(phase),
      synchronize: async () => {},
    });

    await manager.connect();

    expect(phases).toEqual(["Connecting", "Authenticating", "Synchronizing", "Live"]);
    expect(manager.getPhase()).toBe("Live");
  });

  it("retries immediately on first reconnect attempt, then backs off exponentially up to the fixed cap (§4.4)", async () => {
    const transport = new FakeTransport();
    const phases: ConnectionPhase[] = [];
    const manager = new ConnectionManager(
      transport,
      { onPhaseChange: (phase) => phases.push(phase), synchronize: async () => {} },
      { firstRetryDelayMs: 0, baseBackoffMs: 1000, backoffMultiplier: 2, maxRetryDelayMs: 5000 },
      { intervalMs: 60_000, missedBeatsBeforeReconnect: 5 }, // heartbeat kept out of the way for this test
    );

    await manager.connect();
    phases.length = 0;
    const connectCallsBeforeLoss = transport.connectCalls;

    transport.simulateConnectionLost();
    expect(manager.getPhase()).toBe("Reconnecting");

    // First retry is immediate (0ms).
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.connectCalls).toBe(connectCallsBeforeLoss + 1);
    expect(manager.getPhase()).toBe("Live");
  });

  it("transitions to Reconnecting after missed heartbeats (§4.5)", async () => {
    const transport = new FakeTransport();
    transport.respondToHeartbeat = false;
    const phases: ConnectionPhase[] = [];
    const manager = new ConnectionManager(
      transport,
      { onPhaseChange: (phase) => phases.push(phase), synchronize: async () => {} },
      undefined,
      { intervalMs: 1000, missedBeatsBeforeReconnect: 2 },
    );

    await manager.connect();
    phases.length = 0;

    await vi.advanceTimersByTimeAsync(1000); // miss 1
    await vi.advanceTimersByTimeAsync(1000); // miss 2
    await vi.advanceTimersByTimeAsync(1000); // miss 3 -> exceeds threshold

    expect(phases).toContain("Reconnecting");
  });

  it("releases resources and does not auto-reconnect after an explicit close (§4.2 Live → Closed : Logout, §4.3 Closed → Release resources)", async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport, { synchronize: async () => {} });
    await manager.connect();

    manager.close();
    expect(manager.getPhase()).toBe("Closed");

    transport.simulateConnectionLost(); // late/spurious close event after manual close
    await vi.advanceTimersByTimeAsync(10_000);
    expect(manager.getPhase()).toBe("Closed"); // did not flip to Reconnecting
  });
});
