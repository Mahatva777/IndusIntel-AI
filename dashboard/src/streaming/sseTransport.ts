import { ConnectionTransport } from "./connectionManager";
import { ResyncTransport } from "./resyncCoordinator";
import { ServiceEventRange, ServiceName, ServiceSnapshot } from "./types";

export class SseTransport implements ConnectionTransport, ResyncTransport {
  private eventSource: EventSource | null = null;
  private messageHandler: ((raw: unknown) => void) | null = null;
  private closeHandler: ((reason: unknown) => void) | null = null;
  private heartbeatAckHandler: (() => void) | null = null;


  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connect to the new Python API SSE endpoint
      this.eventSource = new EventSource("http://localhost:8000/api/scenario/SCN_GAS_LEAK_CONF_SPACE/stream");

      this.eventSource.onopen = () => {
        resolve();
      };
      
      this.eventSource.onerror = (err) => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
            if (this.closeHandler) this.closeHandler("SSE closed");
        } else {
            reject(err);
        }
      };

      this.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          
          if (data.type === "end") {
              console.log("[sseTransport] SSE stream ended");
              return;
          }

          if (this.messageHandler) {
              this.messageHandler(data);
          }
        } catch (error) {
          console.error("Failed to parse SSE message", error);
        }
      };
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      if (this.closeHandler) this.closeHandler("Disconnected explicitly");
    }
  }

  async authenticate(): Promise<void> {
    // SSE doesn't require a separate auth step for this mock
    return Promise.resolve();
  }

  sendHeartbeat(): void {
    // Mock the heartbeat ack
    if (this.heartbeatAckHandler) {
      this.heartbeatAckHandler();
    }
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

  send(raw: unknown): void {
    // SSE is unidirectional (server-to-client).
    // For a real app, this would use fetch() to send a command.
    console.warn("send() not implemented for SSE transport", raw);
  }

  async fetchSnapshot(service: ServiceName): Promise<ServiceSnapshot> {
    console.log(`[sseTransport] Fetch snapshot requested: ${service}`);
    // In a real app we'd fetch /api/scenario/.../run to get the snapshot
    // For now, return empty as SSE will push everything
    return {
      service,
      watermark: 0,
      entities: []
    };
  }

  async fetchRange(service: ServiceName, fromSequenceId: number, toSequenceId: number): Promise<ServiceEventRange | null> {
    console.log(`[sseTransport] Fetch range requested: ${service} ${fromSequenceId}-${toSequenceId}`);
    return null;
  }
}
