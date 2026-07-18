import { randomUUID } from "node:crypto";
import { getDebugState, nextSequence, recordEvent } from "./state.js";

let broadcaster = () => {};

/** Wired up by wsServer.js once the WebSocket server exists. */
export function setBroadcaster(fn) {
  broadcaster = fn;
}

/**
 * Emit one domain event for `service`/`entityType`. Builds a §4.6-shaped
 * envelope, assigns the next per-service sequence ID (§4.17.1), records it
 * into server state (so later snapshot/range requests reflect it — see
 * state.js's comment on why this happens even for a "dropped" event), and
 * then broadcasts it, honoring whatever debug scenario is currently armed
 * for this service.
 */
export function emitEvent(service, entityType, operation, payload, { serviceVersion = "1.0.0" } = {}) {
  const envelope = {
    eventId: randomUUID(),
    sequenceId: nextSequence(service),
    timestamp: new Date().toISOString(),
    serviceVersion,
    entityType,
    operation,
    payload,
    service,
  };
  recordEvent(service, envelope);

  const debug = getDebugState(service);

  if (debug.dropNextCount > 0) {
    debug.dropNextCount -= 1;
    // eslint-disable-next-line no-console
    console.log(`[debug] dropped ${service} seq=${envelope.sequenceId} (${entityType}/${operation}) — simulated gap`);
    return envelope;
  }

  if (debug.delayNextMs > 0) {
    const delayMs = debug.delayNextMs;
    debug.delayNextMs = 0;
    console.log(`[debug] delaying ${service} seq=${envelope.sequenceId} by ${delayMs}ms`);
    setTimeout(() => broadcaster(service, envelope), delayMs);
    return envelope;
  }

  broadcaster(service, envelope);

  if (debug.duplicateNextCount > 0) {
    debug.duplicateNextCount -= 1;
    console.log(`[debug] re-sending duplicate of ${service} seq=${envelope.sequenceId}`);
    // Same eventId + sequenceId on purpose — this is what duplicate
    // suppression (§4.8/§4.17.5) is supposed to catch and ignore.
    broadcaster(service, envelope);
  }

  return envelope;
}
