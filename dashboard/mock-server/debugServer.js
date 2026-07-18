import { createServer } from "node:http";
import { DEBUG_PORT, SERVICE_NAMES } from "./config.js";
import { debugSnapshotSummary, getDebugState } from "./state.js";
import {
  acknowledgeIncident,
  listActiveIncidents,
  resolveIncident,
  escalateIncident,
  silenceAlert,
  closeIncident,
  openIncident,
  dispatchResponse,
  triggerIncidentLifecycleDemo,
  triggerPrimaryIncidentChangeDemo,
} from "./incidentScenarios.js";
import { getEntity } from "./state.js";
import { emitEvent } from "./emit.js";

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
  res.writeHead(status, { 
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  if (body) {
    res.end(JSON.stringify(body, null, 2));
  } else {
    res.end();
  }
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

      if (req.method === "POST" && url.pathname.startsWith("/api/action/")) {
        const correlationId = req.headers["x-correlation-id"];
        if (!correlationId) {
          return send(res, 400, { error: "Missing X-Correlation-ID header" });
        }
        
        const action = url.pathname.replace("/api/action/", "");
        
        // Helper for CAS
        const enforceCAS = (entityType, serviceName, id, field, expectedValue) => {
          const entity = getEntity(serviceName, entityType, id);
          if (!entity) return { error: "Not found", status: 404 };
          if (entity[field] !== expectedValue) {
            return { error: { classification: "Concurrency", isVersionConflict: true }, status: 409 };
          }
          return { entity, status: 200 };
        };

        if (action === "acknowledge-alert") {
          const { incidentId } = body;
          const ok = acknowledgeIncident(incidentId);
          return send(res, ok ? 200 : 404, { success: ok, correlationId });
        }
        
        if (action === "escalate-incident") {
          const { incidentId, expectedEscalationLevel } = body;
          const cas = enforceCAS("Incident", "Incident", incidentId, "escalationLevel", expectedEscalationLevel);
          if (cas.status !== 200) return send(res, cas.status, cas.error);
          
          escalateIncident(incidentId);
          return send(res, 200, { success: true, correlationId });
        }
        
        if (action === "silence-alert") {
          const { incidentId } = body;
          silenceAlert(incidentId);
          return send(res, 200, { success: true, correlationId });
        }

        if (action === "open-incident") {
          const { details } = body;
          const newIncidentId = openIncident(details);
          return send(res, 200, { success: true, newIncidentId, correlationId });
        }

        if (action === "close-incident") {
          const { incidentId } = body;
          const ok = closeIncident(incidentId);
          return send(res, ok ? 200 : 404, { success: ok, correlationId });
        }

        if (action === "dispatch-response") {
          const { incidentId } = body;
          const ok = dispatchResponse(incidentId);
          return send(res, ok ? 200 : 404, { success: ok, correlationId });
        }

        if (action === "suspend-permit") {
          const { permitId, expectedStatus } = body;
          const cas = enforceCAS("Permit", "Permit", permitId, "status", expectedStatus);
          if (cas.status !== 200) return send(res, cas.status, cas.error);
          
          emitEvent("Permit", "Permit", "update", { ...cas.entity, status: "Suspended" });
          return send(res, 200, { success: true, correlationId });
        }

        if (action === "resume-permit") {
          const { permitId, expectedStatus } = body;
          const cas = enforceCAS("Permit", "Permit", permitId, "status", expectedStatus);
          if (cas.status !== 200) return send(res, cas.status, cas.error);
          
          emitEvent("Permit", "Permit", "update", { ...cas.entity, status: "Active" });
          return send(res, 200, { success: true, correlationId });
        }

        if (action === "worker-notes") {
          const { workerId, note } = body;
          const worker = getEntity("Worker", "Worker", workerId);
          if (!worker) return send(res, 404, { error: "Worker not found" });
          // Note doesn't technically mutate worker object fields in this schema, but let's simulate updating
          // or just pretend it persisted
          return send(res, 200, { success: true, correlationId });
        }

        return send(res, 404, { error: "Unknown action" });
      }

      if (req.method === "POST" && url.pathname === "/debug/error") {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", () => {
          console.log("[FRONTEND ERROR]", body);
          res.writeHead(200); res.end("OK");
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/debug/start-csv-demo") {
        const { stopBackgroundGenerators } = await import("./generators.js");
        const { startCsvDemo } = await import("./csvScenario.js");
        stopBackgroundGenerators();
        startCsvDemo().catch(console.error);
        return send(res, 200, { ok: true, note: "stopped random generators and started CSV telemetry/cv stream" });
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
