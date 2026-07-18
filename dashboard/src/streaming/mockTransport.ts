import { ConnectionTransport } from "./connectionManager";
import { ResyncTransport } from "./resyncCoordinator";
import { EventEnvelope, ServiceEventRange, ServiceName, ServiceSnapshot } from "./types";

export class MockTransport implements ConnectionTransport, ResyncTransport {
  private ws: WebSocket | null = null;
  private messageHandler: ((raw: unknown) => void) | null = null;
  private closeHandler: ((reason: unknown) => void) | null = null;
  private heartbeatAckHandler: (() => void) | null = null;
  
  private requestCounter = 0;
  private pendingRequests = new Map<string, { resolve: (data: any) => void; reject: (err: any) => void }>();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket("ws://localhost:8080");

      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      
      this.ws.onclose = (e) => {
        if (this.closeHandler) this.closeHandler(e.reason);
        for (const req of this.pendingRequests.values()) {
          req.reject(new Error("WebSocket closed"));
        }
        this.pendingRequests.clear();
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "event" || data.type === "range_response") {
            console.log(`[mockTransport] Msg: ${data.type} service=${data.service} seq=${data.sequenceId || ""}`);
          }

          if (data.type === "heartbeat_ack" && this.heartbeatAckHandler) {
            this.heartbeatAckHandler();
            return;
          }

          if (data.type === "auth_ack") {
            const req = this.pendingRequests.get("auth");
            if (req) {
              this.pendingRequests.delete("auth");
              req.resolve(undefined);
            }
            return;
          }

          if (data.type === "auth_error") {
            const req = this.pendingRequests.get("auth");
            if (req) {
              this.pendingRequests.delete("auth");
              req.reject(new Error(data.message));
            }
            return;
          }

          if (data.type === "snapshot" || data.type === "range_response") {
            const req = this.pendingRequests.get(data.requestId);
            if (req) {
              this.pendingRequests.delete(data.requestId);
              req.resolve(data);
            }
            return;
          }

          // If it's a domain event, we just pass the envelope to messageHandler
          // The mock server wraps it in { type: "event", ...envelope }, but the client expects the raw envelope.
          if (data.type === "event" && this.messageHandler) {
            // we delete 'type' because the envelope doesn't have it, but honestly client will just ignore it.
            this.messageHandler(data);
            return;
          }

          // Fallback if client expects anything else
          if (this.messageHandler) {
            this.messageHandler(data);
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async authenticate(): Promise<void> {
    if (!this.ws) throw new Error("Not connected");
    return new Promise((resolve, reject) => {
      this.pendingRequests.set("auth", { resolve, reject });
      this.ws!.send(JSON.stringify({ type: "auth", token: "dev-token" }));
    });
  }

  sendHeartbeat(): void {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({ type: "heartbeat" }));
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

  // ResyncTransport implementation
  async fetchRange(service: ServiceName, fromSequenceId: number, toSequenceId: number): Promise<ServiceEventRange | null> {
    if (!this.ws) return null;
    const requestId = `range-${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.ws!.send(JSON.stringify({
        type: "range_request",
        requestId,
        service,
        fromSequenceId,
        toSequenceId
      }));
    }).then((data: any) => {
      if (data.available === false) return null;
      return {
        service: data.service,
        events: data.events
      };
    }).catch(() => null);
  }

  async fetchSnapshot(service: ServiceName): Promise<ServiceSnapshot> {
    if (!this.ws) throw new Error("Not connected");
    const requestId = `snapshot-${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.ws!.send(JSON.stringify({
        type: "snapshot_request",
        requestId,
        service
      }));
    }).then((data: any) => ({
      service: data.service,
      watermark: data.watermark,
      entities: data.entities
    }));
  }
}
