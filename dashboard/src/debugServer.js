import { createServer } from "node:http";
import { DEBUG_PORT, SERVICE_NAMES } from "./config.js";
import { debugSnapshotSummary, getDebugState } from "./state.js";
import {
  acknowledgeIncident,
  listActiveIncidents,
  resolveIncident,
  triggerIncidentLifecycleDemo,
  triggerPrimaryIncidentChangeDemo,
} from "./incidentScenarios.js";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (raw.length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function requireService(res, service) {
  if (!SERVICE_NAMES.includes(service)) {
    send(res, 400, { error: `unknown service "${service}"`, validServices: SERVICE_NAMES });
    return false;
  }
  return true;
}

/**
 * Every route here is a deliberate way to exercise the streaming client's
 * §4.17 resync logic on demand, plus the §9 incident-lifecycle scenarios.
 * See README.md for `curl` examples of each.
 */
export function startDebugServer({ forceDisconnectAll, connectedCount }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const body = req.method === "POST" ? await readJsonBody(req) : {};

      if (req.method === "GET" && url.pathname === "/debug/status") {
        return send(res, 200, {
          connectedClients: connectedCount(),
          services: debugSnapshotSummary(),
          activeIncidents: listActiveIncidents(),
        });
      }

      if (req.method === "POST" && url.pathname === "/debug/drop-sequence") {
        const { service, count = 1 } = body;
        if (!requireService(res, service)) return;
        getDebugState(service).dropNextCount += count;
        return send(res, 200, { ok: true, service, willDrop: count });
      }

      if (req.method === "POST" && url.pathname === "/debug/duplicate") {
        const { service, count = 1 } = body;
        if (!requireService(res, service)) return;
        getDebugState(service).duplicateNextCount += count;
        return send(res, 200, { ok: true, service, willDuplicate: count });
      }

      if (req.method === "POST" && url.pathname === "/debug/delay") {
        const { service, ms = 3000 } = body;
        if (!requireService(res, service)) return;
        getDebugState(service).delayNextMs = ms;
        return send(res, 200, { ok: true, service, delayMs: ms });
      }

      if (req.method === "POST" && url.pathname === "/debug/range-unavailable") {
        const { service } = body;
        if (!requireService(res, service)) return;
        getDebugState(service).forceRangeUnavailableOnce = true;
        return send(res, 200, { ok: true, service, note: "next range_request for this service will report unavailable" });
      }

      if (req.method === "POST" && url.pathname === "/debug/disconnect") {
        const closed = forceDisconnectAll();
        return send(res, 200, { ok: true, closedConnections: closed });
      }

      if (req.method === "POST" && url.pathname === "/debug/incident-lifecycle") {
        const incidentId = triggerIncidentLifecycleDemo();
        return send(res, 200, { ok: true, incidentId, note: "creation -> T+15/30/60/120s escalation -> auto-ack at T+125s -> auto-resolve at T+140s" });
      }

      if (req.method === "POST" && url.pathname === "/debug/primary-incident-change") {
        const firstIncidentId = triggerPrimaryIncidentChangeDemo();
        return send(res, 200, { ok: true, firstIncidentId, note: "a Critical incident becomes Primary, then an Emergency incident in another zone takes over 5s later" });
      }

      if (req.method === "POST" && url.pathname === "/debug/acknowledge-incident") {
        const { incidentId } = body;
        const ok = acknowledgeIncident(incidentId);
        return send(res, ok ? 200 : 404, { ok });
      }

      if (req.method === "POST" && url.pathname === "/debug/resolve-incident") {
        const { incidentId } = body;
        const ok = resolveIncident(incidentId);
        return send(res, ok ? 200 : 404, { ok });
      }

      send(res, 404, { error: "not found", routes: [
        "GET  /debug/status",
        "POST /debug/drop-sequence      { service, count? }",
        "POST /debug/duplicate          { service, count? }",
        "POST /debug/delay              { service, ms? }",
        "POST /debug/range-unavailable  { service }",
        "POST /debug/disconnect",
        "POST /debug/incident-lifecycle",
        "POST /debug/primary-incident-change",
        "POST /debug/acknowledge-incident { incidentId }",
        "POST /debug/resolve-incident     { incidentId }",
      ] });
    } catch (err) {
      send(res, 500, { error: String(err) });
    }
  });

  server.listen(DEBUG_PORT, () => {
    console.log(`[debug] HTTP debug control channel listening on http://localhost:${DEBUG_PORT}`);
  });

  return server;
}
