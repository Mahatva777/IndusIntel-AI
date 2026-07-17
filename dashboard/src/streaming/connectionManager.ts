/**
 * Connection lifecycle (§4.2 Connection Lifecycle, §4.3 Connection Rules,
 * §4.4 Reconnect Policy, §4.5 Heartbeat Policy).
 *
 * Frozen state diagram (§4.2):
 *   Connecting → Authenticating → Synchronizing → Live
 *   Live → Reconnecting (Connection Lost) → Synchronizing → Live
 *   Live → Closed (Logout)
 *
 * This module owns *only* the phase transitions and the socket-level
 * mechanics (transport open/close, auth handshake, heartbeat, backoff). It
 * does not know about sequence IDs or stores — `Synchronizing` is exposed
 * as a hook the `StreamingClient` fills in with a full resync (§4.4
 * "Successful reconnect → Full snapshot synchronization").
 */
import type { ConnectionPhase } from "./types";

export interface ConnectionTransport {
  connect(): Promise<void>;
  disconnect(): void;
  authenticate(): Promise<void>;
  sendHeartbeat(): void;
  onMessage(handler: (raw: unknown) => void): void;
  onClose(handler: (reason: unknown) => void): void;
  onHeartbeatAck(handler: () => void): void;
}

export interface ReconnectPolicyConfig {
  /** §4.4 "First retry → Immediate". */
  readonly firstRetryDelayMs: number;
  /** Base delay the exponential backoff grows from, starting at the *second* retry (§4.4 "Subsequent retries → Exponential backoff"). */
  readonly baseBackoffMs: number;
  readonly backoffMultiplier: number;
  /** §4.4 "Maximum retry interval → Fixed upper bound". */
  readonly maxRetryDelayMs: number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicyConfig = {
  firstRetryDelayMs: 0,
  baseBackoffMs: 1_000,
  backoffMultiplier: 2,
  maxRetryDelayMs: 30_000,
};

export interface HeartbeatConfig {
  readonly intervalMs: number;
  /** §4.5 "Missed Heartbeats → Transition to Reconnecting". */
  readonly missedBeatsBeforeReconnect: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 15_000,
  missedBeatsBeforeReconnect: 2,
};

export interface ConnectionManagerEvents {
  onPhaseChange?(phase: ConnectionPhase, previous: ConnectionPhase): void;
  /** §4.5 "UI Indicator → Connection degraded". */
  onDegraded?(): void;
  /** The Synchronizing phase's actual work — caller performs a full resync here. */
  synchronize(): Promise<void>;
}

export class ConnectionManager {
  private phase: ConnectionPhase = "Closed";
  private readonly transport: ConnectionTransport;
  private readonly events: ConnectionManagerEvents;
  private readonly reconnectPolicy: ReconnectPolicyConfig;
  private readonly heartbeatConfig: HeartbeatConfig;

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private missedBeats = 0;
  private manuallyClosed = false;

  constructor(
    transport: ConnectionTransport,
    events: ConnectionManagerEvents,
    reconnectPolicy: ReconnectPolicyConfig = DEFAULT_RECONNECT_POLICY,
    heartbeatConfig: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG,
  ) {
    this.transport = transport;
    this.events = events;
    this.reconnectPolicy = reconnectPolicy;
    this.heartbeatConfig = heartbeatConfig;
    this.transport.onClose(() => this.handleConnectionLost());
    this.transport.onHeartbeatAck(() => {
      this.missedBeats = 0;
    });
  }

  getPhase(): ConnectionPhase {
    return this.phase;
  }

  private setPhase(next: ConnectionPhase): void {
    const previous = this.phase;
    if (previous === next) return;
    this.phase = next;
    this.events.onPhaseChange?.(next, previous);
  }

  /** Initial connect, or an operator-triggered manual reconnect (§4.4 "Manual reconnect → Supported"). */
  async connect(): Promise<void> {
    this.manuallyClosed = false;
    this.reconnectAttempt = 0;
    await this.runConnectSequence();
  }

  private async runConnectSequence(): Promise<void> {
    this.setPhase("Connecting");
    await this.transport.connect();

    this.setPhase("Authenticating");
    await this.transport.authenticate();

    this.setPhase("Synchronizing");
    await this.events.synchronize();

    this.setPhase("Live");
    this.reconnectAttempt = 0;
    this.startHeartbeat();
  }

  /** §4.2 "Live → Closed : Logout". */
  close(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.transport.disconnect();
    this.setPhase("Closed");
  }

  private handleConnectionLost(): void {
    if (this.manuallyClosed || this.phase === "Closed") return;
    this.stopHeartbeat();
    this.setPhase("Reconnecting");
    this.events.onDegraded?.();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay =
      this.reconnectAttempt === 0
        ? this.reconnectPolicy.firstRetryDelayMs
        : Math.min(
            this.reconnectPolicy.baseBackoffMs * this.reconnectPolicy.backoffMultiplier ** (this.reconnectAttempt - 1),
            this.reconnectPolicy.maxRetryDelayMs,
          );
    this.reconnectAttempt += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.runConnectSequence().catch(() => {
        // Connect attempt failed again — treat exactly like another lost connection.
        this.handleConnectionLost();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.missedBeats = 0;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.missedBeats += 1;
      if (this.missedBeats > this.heartbeatConfig.missedBeatsBeforeReconnect) {
        this.handleConnectionLost();
        return;
      }
      this.transport.sendHeartbeat();
    }, this.heartbeatConfig.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
