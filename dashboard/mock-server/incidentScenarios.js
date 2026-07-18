import { randomUUID } from "node:crypto";
import { scaled } from "./config.js";
import { emitEvent } from "./emit.js";
import { PERMITS, WORKERS, ZONES } from "./seed.js";
import { getEntity } from "./state.js";

/**
 * §9.10: the backend is the sole owner/executor of the escalation timer —
 * this is exactly that backend, so it's the one place in the whole system
 * allowed to run a real countdown. The Dashboard client only ever renders
 * whatever `escalationLevel` arrives on the wire.
 */
const ESCALATION_TIMELINE_MS = [
  { atMs: 15_000, level: "Reminder" }, // §9.2 T+15s
  { atMs: 30_000, level: "AudibleReminder" }, // §9.2 T+30s
  { atMs: 60_000, level: "SupervisorEscalated" }, // §9.2 T+60s
  { atMs: 120_000, level: "PlantManagerEscalated" }, // §9.2 T+120s
];

/** incidentId -> { severity, zoneId, timers: Timeout[], acknowledged, resolved } */
const runtime = new Map();

export function clearTimers(id) {
  const r = runtime.get(id);
  if (!r) return;
  for (const t of r.timers) clearTimeout(t);
  r.timers = [];
}

export function clearAllTimers() {
  for (const id of runtime.keys()) {
    clearTimers(id);
  }
}

function baseIncidentPayload(id, { name, severity, zoneId, workerIds, permitIds, riskScore, confidenceScore }) {
  return {
    id,
    name,
    zoneId,
    status: "Active",
    severity,
    escalationLevel: "None",
    riskScore,
    confidenceScore,
    workerIds,
    permitIds,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a new incident and, if it's Emergency severity, arm the full
 * §9.2 escalation timeline. Critical (and below) incidents auto-focus but
 * never enter the timeline (§8.10 Escalation Rules) — this function
 * honors that distinction rather than escalating everything uniformly.
 */
export function createIncident({
  name = "Unknown Incident",
  severity = "Emergency",
  zoneId = ZONES[0].id,
  workerIds = [WORKERS[0].id],
  permitIds = [PERMITS[0].id],
  riskScore = 90,
  confidenceScore = 0.92,
  autoAcknowledgeAfterMs = null,
  autoResolveAfterMs = null,
  recommendationContent = "Reduce furnace load and dispatch inspection crew.",
} = {}) {
  const id = `incident-${randomUUID().slice(0, 8)}`;
  const payload = baseIncidentPayload(id, { name, severity, zoneId, workerIds, permitIds, riskScore, confidenceScore });
  emitEvent("Incident", "Incident", "create", payload);

  runtime.set(id, { severity, zoneId, timers: [], acknowledged: false, resolved: false });

  // A Recommendation + Evidence pair shortly after creation, so the
  // Recommendation/Evidence panels (§9.5) have something to render —
  // both are modeled on the Incident stream per the state-layer's
  // flagged co-location decision.
  const recTimer = setTimeout(() => {
    emitEvent("Incident", "Recommendation", "create", {
      id: `rec-${id}`,
      incidentId: id,
      content: recommendationContent,
      acknowledged: false,
    });
    emitEvent("Incident", "Evidence", "create", {
      id: `evidence-${id}`,
      incidentId: id,
      sourceType: "Sensor",
      createdAt: new Date().toISOString(),
    });
  }, scaled(2_000));
  runtime.get(id).timers.push(recTimer);

  if (severity === "Emergency") {
    for (const step of ESCALATION_TIMELINE_MS) {
      const timer = setTimeout(() => {
        const r = runtime.get(id);
        if (!r || r.acknowledged || r.resolved) return; // §9.3/§9.7: acknowledged/resolved stops further escalation
        emitEvent("Incident", "Incident", "update", { ...payload, escalationLevel: step.level });
      }, scaled(step.atMs));
      runtime.get(id).timers.push(timer);
    }
  }

  if (autoAcknowledgeAfterMs !== null) {
    const timer = setTimeout(() => acknowledgeIncident(id), scaled(autoAcknowledgeAfterMs));
    runtime.get(id).timers.push(timer);
  }
  if (autoResolveAfterMs !== null) {
    const timer = setTimeout(() => resolveIncident(id), scaled(autoResolveAfterMs));
    runtime.get(id).timers.push(timer);
  }

  return id;
}

/** §9.7 "Acknowledged → Escalation timer stops"; §9.10 escalationLevel becomes "Acknowledged". */
export function acknowledgeIncident(id) {
  const r = runtime.get(id);
  if (!r || r.resolved) return false;
  r.acknowledged = true;
  clearTimers(id);
  const existing = getEntity("Incident", "Incident", id) || {};
  emitEvent("Incident", "Incident", "update", { ...existing, id, escalationLevel: "Acknowledged" });
  return true;
}

/** §8.7/§8.9: resolved incidents leave the active ranking; §9.7 "Resolved → Emergency UI removed". */
export function resolveIncident(id) {
  const r = runtime.get(id);
  if (!r || r.resolved) return false;
  r.resolved = true;
  clearTimers(id);
  const existing = getEntity("Incident", "Incident", id) || {};
  emitEvent("Incident", "Incident", "update", { ...existing, id, status: "Resolved" });
  return true;
}

export function escalateIncident(id) {
  const r = runtime.get(id);
  if (!r || r.resolved) return false;
  // Progress escalation level or just mark it escalated
  const existing = getEntity("Incident", "Incident", id) || {};
  let nextLevel = "SupervisorEscalated";
  if (existing.escalationLevel === "SupervisorEscalated") nextLevel = "PlantManagerEscalated";
  
  emitEvent("Incident", "Incident", "update", { ...existing, id, escalationLevel: nextLevel });
  return true;
}

export function silenceAlert(id) {
  const r = runtime.get(id);
  if (!r || r.resolved) return false;
  const existing = getEntity("Incident", "Incident", id) || {};
  emitEvent("Incident", "Incident", "update", { ...existing, id, escalationLevel: "Acknowledged" }); // treat as acked
  return true;
}

export function openIncident(details) {
  const id = createIncident({
    severity: details.severity || "Advisory",
    zoneId: details.zoneId || "zone-furnace-bay",
    workerIds: details.workerIds || [],
    permitIds: details.permitIds || [],
    riskScore: details.riskScore || 50,
    confidenceScore: 1.0,
  });
  return id;
}

export function closeIncident(id) {
  return resolveIncident(id);
}

export function dispatchResponse(id) {
  const r = runtime.get(id);
  if (!r || r.resolved) return false;
  const existing = getEntity("Incident", "Incident", id) || {};
  // Dispatch doesn't have a direct field in Incident, but we can emit a Recommendation
  emitEvent("Incident", "Recommendation", "create", {
    id: `rec-dispatch-${id}-${Date.now()}`,
    incidentId: id,
    content: "Response team dispatched by Operator.",
    acknowledged: false,
  });
  return true;
}

export function listActiveIncidents() {
  return [...runtime.entries()].filter(([, r]) => !r.resolved).map(([id, r]) => ({ id, ...r, timers: undefined }));
}

/**
 * Full lifecycle demo: creation → escalation timeline → acknowledgement
 * → resolution, unattended. Acknowledge lands just after Plant Manager
 * escalation (T+125s) and resolution follows 15s after that, so a demo
 * left running end to end actually completes — both are still
 * cancelable/overridable via the debug endpoints for `acknowledgeIncident`
 * / `resolveIncident` if you don't want to wait.
 */
export function triggerIncidentLifecycleDemo() {
  return createIncident({
    severity: "Emergency",
    zoneId: ZONES[0].id,
    workerIds: [WORKERS[0].id],
    permitIds: [PERMITS[0].id],
    riskScore: 95,
    confidenceScore: 0.94,
    autoAcknowledgeAfterMs: 125_000,
    autoResolveAfterMs: 140_000,
  });
}

/**
 * §8/§9.11 demo: a Critical incident is Primary (only active incident),
 * then an Emergency incident appears in a different zone and — per §8.2's
 * Severity-first evaluation — becomes the new Primary Incident. Exercises
 * the frontend's `selectPrimaryIncident`/Dashboard Operational State
 * derivation without the dashboard ever computing anything itself.
 */
export function triggerPrimaryIncidentChangeDemo() {
  const firstId = createIncident({
    severity: "Critical",
    zoneId: ZONES[1].id,
    workerIds: [WORKERS[1].id],
    permitIds: [],
    riskScore: 60,
    confidenceScore: 0.8,
  });

  const secondTimer = setTimeout(() => {
    createIncident({
      severity: "Emergency",
      zoneId: ZONES[2].id,
      workerIds: [WORKERS[2].id],
      permitIds: [PERMITS[1].id],
      riskScore: 88,
      confidenceScore: 0.9,
      autoAcknowledgeAfterMs: 125_000,
      autoResolveAfterMs: 140_000,
    });
  }, scaled(5_000));

  // Not tied to either incident's own lifecycle — just needs to fire once.
  runtime.set(`__primary-change-timer-${randomUUID()}`, { timers: [secondTimer], acknowledged: true, resolved: true });

  return firstId;
}
