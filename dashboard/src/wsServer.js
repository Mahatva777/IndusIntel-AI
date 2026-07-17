import { WebSocketServer } from "ws";
import { AUTH_TOKEN, WS_PORT } from "./config.js";
import { setBroadcaster } from "./emit.js";
import { getRange, getSnapshot } from "./state.js";

/**
 * Wire protocol (JSON messages over one WebSocket per client). This is
 * the contract a real `ConnectionTransport`/`ResyncTransport`
 * implementation (from the streaming-client prompt) would speak against;
 * it isn't defined anywhere else, so it's documented in full in the
 * README as well as here.
 *
 * Client → Server
 *   { type: "auth", token }
 *   { type: "snapshot_request", requestId, service }
 *   { type: "range_request", requestId, service, fromSequenceId, toSequenceId }
 *   { type: "heartbeat" }
 *
 * Server → Client
 *   { type: "auth_ack" } | { type: "auth_error", message }
 *   { type: "snapshot", requestId, service, watermark, entities }
 *   { type: "range_response", requestId, service, events } |
 *     { type: "range_response", requestId, service, available: false }
 *   { type: "event", service, eventId, sequenceId, timestamp, serviceVersion, entityType, operation, payload }
 *   { type: "heartbeat_ack" }
 */
export function startWsServer() {
  const wss = new WebSocketServer({ port: WS_PORT });
  const authenticated = new Set();

  setBroadcaster((service, envelope) => {
    const message = JSON.stringify({ type: "event", ...envelope });
    for (const client of authenticated) {
      if (client.readyState === client.OPEN) client.send(message);
    }
  });

  wss.on("connection", (socket) => {
    console.log("[ws] client connected");

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "malformed JSON" }));
        return;
      }

      switch (msg.type) {
        case "auth": {
          if (msg.token === AUTH_TOKEN) {
            authenticated.add(socket);
            socket.send(JSON.stringify({ type: "auth_ack" }));
          } else {
            socket.send(JSON.stringify({ type: "auth_error", message: "invalid token" }));
          }
          return;
        }
        case "snapshot_request": {
          const snapshot = getSnapshot(msg.service);
          socket.send(JSON.stringify({ type: "snapshot", requestId: msg.requestId, ...snapshot }));
          return;
        }
        case "range_request": {
          const range = getRange(msg.service, msg.fromSequenceId, msg.toSequenceId);
          if (range === null) {
            socket.send(JSON.stringify({ type: "range_response", requestId: msg.requestId, service: msg.service, available: false }));
          } else {
            socket.send(JSON.stringify({ type: "range_response", requestId: msg.requestId, ...range }));
          }
          return;
        }
        case "heartbeat": {
          socket.send(JSON.stringify({ type: "heartbeat_ack" }));
          return;
        }
        default:
          socket.send(JSON.stringify({ type: "error", message: `unknown message type: ${msg.type}` }));
      }
    });

    socket.on("close", () => {
      authenticated.delete(socket);
      console.log("[ws] client disconnected");
    });
  });

  console.log(`[ws] mock streaming server listening on ws://localhost:${WS_PORT}`);

  return {
    wss,
    connectedCount: () => wss.clients.size,
    forceDisconnectAll: () => {
      for (const client of wss.clients) client.close(4000, "debug: forced disconnect");
      return wss.clients.size;
    },
  };
}
