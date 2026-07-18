import { EVENT_LOG_SIZE, SERVICE_NAMES } from "./config.js";

/**
 * One record per service. `sequence` is the server's authoritative
 * counter (§4.17.1) — it always advances, even for an event the debug
 * channel chooses not to *broadcast*, because the backend's own state
 * isn't affected by a simulated delivery failure. `entitiesByType` is the
 * service's current world state, used to answer full-resync snapshot
 * requests (§4.17.8). `log` is a bounded ring buffer of recently emitted
 * envelopes, used to answer partial-resync range requests (§4.17.7) — an
 * event that was generated but deliberately not broadcast (a "dropped"
 * event, for demoing gaps) is still written here, exactly like a real
 * backend that persisted the write but whose delivery to one client was
 * lost in transit.
 */
function createServiceState() {
  return {
    sequence: 0,
    entitiesByType: new Map(), // entityType -> Map(entityId -> entity)
    log: [], // ring buffer of { ...envelope, service }
    lastEnvelope: null,
    debug: {
      dropNextCount: 0,
      duplicateNextCount: 0,
      delayNextMs: 0,
      forceRangeUnavailableOnce: false,
    },
  };
}

export const services = new Map(SERVICE_NAMES.map((name) => [name, createServiceState()]));

export function nextSequence(service) {
  const s = services.get(service);
  s.sequence += 1;
  return s.sequence;
}

export function getEntity(service, entityType, id) {
  const bucket = services.get(service).entitiesByType.get(entityType);
  return bucket ? bucket.get(id) : null;
}

export function recordEvent(service, envelope) {
  const s = services.get(service);
  s.log.push(envelope);
  if (s.log.length > EVENT_LOG_SIZE) s.log.shift();
  s.lastEnvelope = envelope;

  let bucket = s.entitiesByType.get(envelope.entityType);
  if (!bucket) {
    bucket = new Map();
    s.entitiesByType.set(envelope.entityType, bucket);
  }
  const id = entityKey(envelope.entityType, envelope.payload);
  if (envelope.operation === "delete") {
    if (id !== undefined) bucket.delete(id);
  } else if (id !== undefined) {
    bucket.set(id, envelope.payload);
  }
}

/**
 * Most entities key on `id`, but Telemetry Reading keys on `sensorId`
 * (§1.4 "Entity Map — fast updates by sensor ID") and System Health keys
 * on `service` (§1.4 "Flat Map — independent service statuses") — neither
 * has an `id` field, per Appendix A.
 */
function entityKey(entityType, payload) {
  if (entityType === "TelemetryReading") return payload?.sensorId;
  if (entityType === "ServiceHealthSnapshot") return payload?.service;
  return payload?.id;
}

export function getSnapshot(service) {
  const s = services.get(service);
  const entities = [];
  for (const bucket of s.entitiesByType.values()) {
    for (const entity of bucket.values()) entities.push(entity);
  }
  return { service, watermark: s.sequence, entities };
}

export function getRange(service, fromSequenceId, toSequenceId) {
  const s = services.get(service);
  if (s.debug.forceRangeUnavailableOnce) {
    s.debug.forceRangeUnavailableOnce = false;
    return null;
  }
  const events = s.log.filter((e) => e.sequenceId >= fromSequenceId && e.sequenceId <= toSequenceId);
  // If we don't actually have full coverage of the requested range anymore
  // (evicted from the ring buffer), be honest and report unavailable —
  // exactly the case §4.17.7's fallback exists for.
  const haveAll = events.length === toSequenceId - fromSequenceId + 1;
  return haveAll ? { service, events } : null;
}

export function getLastEnvelope(service) {
  return services.get(service).lastEnvelope;
}

export function getDebugState(service) {
  return services.get(service).debug;
}

export function debugSnapshotSummary() {
  const summary = {};
  for (const [service, s] of services.entries()) {
    summary[service] = {
      sequence: s.sequence,
      entityCount: [...s.entitiesByType.values()].reduce((sum, bucket) => sum + bucket.size, 0),
      logSize: s.log.length,
    };
  }
  return summary;
}
