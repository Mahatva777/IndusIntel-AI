import { scaled } from "./config.js";
import { emitEvent } from "./emit.js";
import { BACKEND_SERVICES, CAMERAS, EQUIPMENT, PERMITS, SENSORS, WORKERS, ZONES } from "./seed.js";

function jitter(baseline, spreadFraction = 0.05) {
  const spread = baseline * spreadFraction;
  return Number((baseline + (Math.random() * 2 - 1) * spread).toFixed(2));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** §3.2 Telemetry: streaming, 500ms. */
function startTelemetry() {
  return setInterval(() => {
    const sensor = pick(SENSORS);
    emitEvent("Telemetry", "TelemetryReading", "create", {
      sensorId: sensor.id,
      zoneId: sensor.zoneId,
      equipmentId: sensor.equipmentId,
      value: jitter(sensor.baseline),
      unit: sensor.unit,
      recordedAt: new Date().toISOString(),
    });
  }, scaled(500));
}

/** §3.2 Worker: streaming, 500ms. */
function startWorker() {
  return setInterval(() => {
    const worker = pick(WORKERS);
    emitEvent("Worker", "Worker", "update", {
      id: worker.id,
      name: worker.name,
      zoneId: worker.zoneId,
      status: worker.status,
      position: { x: jitter(50, 0.3), y: jitter(50, 0.3) },
      updatedAt: new Date().toISOString(),
    });
  }, scaled(500));
}

/** §3.2 System Health: poll-shaped in the spec, modeled here as a streamed snapshot every 5-10s. */
function startSystemHealth() {
  return setInterval(() => {
    const service = pick(BACKEND_SERVICES);
    const status = Math.random() < 0.05 ? "degraded" : "online";
    emitEvent("SystemHealth", "ServiceHealthSnapshot", "update", { service, status });
  }, scaled(5000 + Math.random() * 5000));
}

/** §3.2 Permit: event-driven; low frequency here so it reads clearly in a demo. */
function startPermit() {
  return setInterval(() => {
    const permit = pick(PERMITS);
    emitEvent("Permit", "Permit", "update", {
      id: permit.id,
      zoneId: permit.zoneId,
      workerId: permit.workerId,
      equipmentId: permit.equipmentId,
      status: permit.status,
      updatedAt: new Date().toISOString(),
    });
  }, scaled(15_000));
}

/** §3.2 Camera: event-driven metadata changes. */
function startCamera() {
  return setInterval(() => {
    const camera = pick(CAMERAS);
    emitEvent("Camera", "Camera", "update", {
      id: camera.id,
      zoneId: camera.zoneId,
      name: camera.name,
      status: camera.status,
    });
  }, scaled(20_000));
}

/**
 * §1.7/§3.8 Digital Twin Service owns Digital Twin, Zone, and Equipment —
 * routed here by Entity Type onto that one shared stream (see the
 * streaming client's `types.ts` for why they share a watermark).
 */
function startDigitalTwin() {
  return setInterval(() => {
    const roll = Math.random();
    if (roll < 0.5) {
      const zone = pick(ZONES);
      emitEvent("DigitalTwin", "Zone", "update", { id: zone.id, name: zone.name, geometry: { kind: "polygon", updatedAt: Date.now() } });
    } else {
      const equipment = pick(EQUIPMENT);
      emitEvent("DigitalTwin", "Equipment", "update", { id: equipment.id, zoneId: equipment.zoneId, name: equipment.name });
    }
  }, scaled(25_000));
}

/** Seed every service's initial world state so the very first snapshot isn't empty. */
export function seedInitialState() {
  for (const zone of ZONES) emitEvent("DigitalTwin", "Zone", "create", { id: zone.id, name: zone.name, geometry: { kind: "polygon" } });
  for (const equipment of EQUIPMENT) emitEvent("DigitalTwin", "Equipment", "create", { id: equipment.id, zoneId: equipment.zoneId, name: equipment.name });
  for (const worker of WORKERS) emitEvent("Worker", "Worker", "create", { ...worker, position: { x: 50, y: 50 }, updatedAt: new Date().toISOString() });
  for (const permit of PERMITS) emitEvent("Permit", "Permit", "create", { ...permit, updatedAt: new Date().toISOString() });
  for (const camera of CAMERAS) emitEvent("Camera", "Camera", "create", { ...camera });
  for (const service of BACKEND_SERVICES) emitEvent("SystemHealth", "ServiceHealthSnapshot", "create", { service, status: "online" });
}

let backgroundGeneratorsCleanup = null;

export function startBackgroundGenerators() {
  if (backgroundGeneratorsCleanup) return backgroundGeneratorsCleanup;
  const timers = [startTelemetry(), startWorker(), startSystemHealth(), startPermit(), startCamera(), startDigitalTwin()];
  backgroundGeneratorsCleanup = () => timers.forEach(clearInterval);
  return backgroundGeneratorsCleanup;
}

export function stopBackgroundGenerators() {
  if (backgroundGeneratorsCleanup) {
    backgroundGeneratorsCleanup();
    backgroundGeneratorsCleanup = null;
  }
}
