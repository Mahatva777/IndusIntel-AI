import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { emitEvent } from "./emit.js";
import { scaled } from "./config.js";
import { createIncident, listActiveIncidents, clearTimers, clearAllTimers } from "./incidentScenarios.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startCsvDemo() {
  console.log("[csv-demo] Starting CSV demo stream...");
  
  const filePath = path.resolve(__dirname, "../../data/telemetry2.csv");
  if (!fs.existsSync(filePath)) {
    console.error(`[csv-demo] Could not find ${filePath}`);
    return;
  }

  // Setup Logging
  const logPath = path.resolve(__dirname, "./demo_run.log");
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const log = (msg) => {
    console.log(msg);
    logStream.write(`${new Date().toISOString()} ${msg}\n`);
  };
  setRiskLogger(log);
  log("[csv-demo] Logging initialized.");

  // Initialize Risk Engine contexts
  initRiskEngine();

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let isFirstLine = true;
  let startTime = Date.now();

  // Delete any existing incidents so the plant starts Normal
  clearAllTimers();
  const activeIncs = listActiveIncidents();
  console.log(`[csv-demo] Deleting ${activeIncs.length} active incidents...`);
  for (const inc of activeIncs) {
    console.log(`[csv-demo] Deleting incident ${inc.id}`);
    emitEvent("Incident", "Incident", "delete", { id: inc.id });
  }
  
  // Start CV Detections interval for worker-1 in every frame (e.g. 500ms)
  const cvInterval = setInterval(() => {
    emitEvent("CV", "CvDetection", "create", {
      id: `cv-${randomUUID().slice(0, 8)}`,
      cameraId: "camera-1",
      timestamp: new Date().toISOString(),
      confidence: 0.98,
      workerId: "worker-1",
      incidentId: null
    });
  }, scaled(500));

  // Stop CV Detections after 60s
  setTimeout(() => clearInterval(cvInterval), scaled(60000));

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }
    
    const parts = line.split(",");
    if (parts.length < 4) continue;

    const offsetSec = parseFloat(parts[0]);
    if (isNaN(offsetSec)) continue;

    const zoneStr = parts[1];
    const sensorId = parts[2];
    const value = parseFloat(parts[3]);
    
    // Map zone_id 1 -> zone-furnace-bay, 2 -> zone-loading-dock
    const zoneId = zoneStr === "1" ? "zone-furnace-bay" : 
                   zoneStr === "2" ? "zone-loading-dock" : "zone-compressor-room";

    const targetTime = startTime + scaled(offsetSec * 1000);
    const delay = targetTime - Date.now();
    
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    
    const telemetry = {
      sensorId,
      zoneId,
      equipmentId: "unknown",
      value,
      timestamp: new Date().toISOString()
    };
    
    // The JS mock risk engine is DEPRECATED.
    // In a real environment, this CSV demo runner is completely replaced by 
    // the Python API SSE stream. This file is kept only if you still run 
    // without the Python backend.
    telemetry.severity = "Normal";
    
    emitEvent("Telemetry", "TelemetryReading", "create", telemetry);
    
    // If offset is beyond 60 seconds, stop the demo
    if (offsetSec >= 60) break;
  }
  
  log("[csv-demo] CSV demo finished.");
  logStream.end();
}
