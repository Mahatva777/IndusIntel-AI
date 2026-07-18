/**
 * Config for the mock server. All timing knobs default to the values the
 * frozen spec actually names (§9.2 Escalation Timeline: T+15/30/60/120s;
 * §3.2 Telemetry/Worker: every 500ms; §3.2 System Health: every 5-10s) but
 * can be compressed for a faster demo via TIME_SCALE (e.g. TIME_SCALE=0.1
 * runs everything 10x faster) without changing the *shape* of the
 * timeline, only its speed.
 */
export const WS_PORT = Number(process.env.WS_PORT ?? 8080);
export const DEBUG_PORT = Number(process.env.DEBUG_PORT ?? 8081);
export const AUTH_TOKEN = process.env.MOCK_AUTH_TOKEN ?? "dev-token";
export const TIME_SCALE = Number(process.env.TIME_SCALE ?? 1);

/** §4.17.1 (as extended by this task's list): one independent sequence watermark per service. */
export const SERVICE_NAMES = [
  "Telemetry",
  "Incident",
  "Worker",
  "Permit",
  "Camera",
  "DigitalTwin",
  "SystemHealth",
  "CV",
  "RAG",
];

/** How many events per service are kept around to serve §4.17.7 partial-resync range requests. */
export const EVENT_LOG_SIZE = 200;

export const scaled = (ms) => Math.max(0, Math.round(ms * TIME_SCALE));
