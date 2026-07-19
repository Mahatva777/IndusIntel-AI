/**
 * DEPRECATED: This is a divergent standalone implementation, never a validated port.
 * It is kept only for offline component development without a running backend.
 * Do not let it remain reachable from any default dashboard run path.
 * 
 * The real risk engine is the Python risk_engine package.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIncident, listActiveIncidents, resolveIncident } from "./incidentScenarios.js";
import { emitEvent } from "./emit.js";
import { getEntity } from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sensorsData = [];
let permitsData = [];
let workersData = [];

// Logger hook populated by csvScenario.js
let appendLog = (msg) => { console.log(msg); };
export function setRiskLogger(loggerFn) {
  appendLog = loggerFn;
}

// Simple CSV parser
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim());
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || "";
    });
    results.push(obj);
  }
  return results;
}

export function initRiskEngine() {
  const dataDir = path.resolve(__dirname, "../../data");
  const configDir = path.resolve(__dirname, "../../config");
  sensorsData = parseCSV(`${configDir}/sensors.csv`);
  permitsData = parseCSV(`${dataDir}/permits.csv`);
  workersData = parseCSV(`${dataDir}/workers.csv`);
  console.log(`[RiskEngine] Loaded ${sensorsData.length} sensors, ${permitsData.length} permits, ${workersData.length} workers.`);
  for (const p of permitsData) {
    console.log(`[RiskEngine] Permit loaded: id=${p.permit_id} zone_id="${p.zone_id}" status="${p.status}" type="${p.permit_type}"`);
  }
}

// Maps sensorId -> incidentId
const activeIncidentsBySensor = new Map();

// Map zone numbers (1, 2, 3, 4) to Dashboard Zone IDs
const ZONE_MAP = {
  "1": "zone-furnace-bay",
  "2": "zone-loading-dock",
  "3": "zone-compressor-room", // We'll map Z3 and Z4 to compressor room or generic for demo since Dashboard only has 3 zones
  "4": "zone-compressor-room" 
};

export function evaluateTelemetry(telemetry) {
  const sensor = sensorsData.find(s => s.sensor_id === telemetry.sensorId);
  if (!sensor) return;

  const value = telemetry.value;
  let severity = "Normal";
  
  const normMin = parseFloat(sensor.normal_min);
  const normMax = parseFloat(sensor.normal_max);
  const warnMin = parseFloat(sensor.warning_min);
  const warnMax = parseFloat(sensor.warning_max);
  const critMin = parseFloat(sensor.critical_min);
  const critMax = parseFloat(sensor.critical_max);

  let exceededBounds = "";

  if (!isNaN(normMin) && !isNaN(normMax) && value >= normMin && value <= normMax) {
    severity = "Normal";
  } else if (!isNaN(warnMin) && !isNaN(warnMax) && value >= warnMin && value <= warnMax) {
    severity = "High"; // High corresponds to Warning in Dashboard UI
    if (value < normMin) {
      exceededBounds = `value ${value.toFixed(2)} is in low warning range [${warnMin}, ${normMin})`;
    } else {
      exceededBounds = `value ${value.toFixed(2)} is in high warning range (${normMax}, ${warnMax}]`;
    }
  } else if (!isNaN(critMin) && !isNaN(critMax) && value >= critMin && value <= critMax) {
    severity = "Critical";
    if (value < warnMin) {
      exceededBounds = `value ${value.toFixed(2)} is in low critical range [${critMin}, ${warnMin})`;
    } else {
      exceededBounds = `value ${value.toFixed(2)} is in high critical range (${warnMax}, ${critMax}]`;
    }
  } else {
    // Value falls completely outside all defined ranges
    severity = "Critical";
    exceededBounds = `value ${value.toFixed(2)} is outside all defined ranges`;
  }

  const existingIncidentId = activeIncidentsBySensor.get(telemetry.sensorId);

  if (severity !== "Normal") {
    // We have a violation
    appendLog(`[RiskEngine] Sensor ${telemetry.sensorId} violated thresholds (${exceededBounds}). Target severity: ${severity}.`);
    
    if (existingIncidentId) {
      // Check if incident is still active and update it
      const inc = getEntity("Incident", "Incident", existingIncidentId);
      if (inc && inc.status === "Active") {
        if (inc.severity !== severity || inc.riskScore < (severity === "Critical" ? 70 : 50)) {
           const newScore = severity === "Critical" ? Math.max(inc.riskScore, 75) : Math.max(inc.riskScore, 45);
           appendLog(`[RiskEngine] Escalating incident ${existingIncidentId} to ${severity} (Score: ${newScore}).`);
           emitEvent("Incident", "Incident", "update", { ...inc, severity, riskScore: newScore });
        }
      } else {
        // Incident was resolved manually but sensor is still bad, create a new one
        appendLog(`[RiskEngine] Incident was resolved but sensor is still bad. Triggering new incident.`);
        triggerIncidentWorkflow(sensor, telemetry, severity, exceededBounds);
      }
    } else {
      // Create new incident
      appendLog(`[RiskEngine] No active incident for ${telemetry.sensorId}. Triggering workflow.`);
      triggerIncidentWorkflow(sensor, telemetry, severity, exceededBounds);
    }
  } else {
    // Normal readings
    if (existingIncidentId) {
      appendLog(`[RiskEngine] Sensor ${telemetry.sensorId} recovered. Resolving incident ${existingIncidentId}.`);
      resolveIncident(existingIncidentId);
      activeIncidentsBySensor.delete(telemetry.sensorId);
    }
  }
  
  return severity;
}

function triggerIncidentWorkflow(sensor, telemetry, severity, exceededBounds) {
  const zoneNumMatch = telemetry.sensorId.match(/^Z(\d)_/);
  const zoneNum = zoneNumMatch ? zoneNumMatch[1] : "1";
  
  appendLog(`[RiskEngine] Checking permits for zone "${zoneNum}": total permits=${permitsData.length}`);
  const zonePermits = permitsData.filter(p => {
    const match = p.zone_id === zoneNum && p.status === "ACTIVE";
    appendLog(`[RiskEngine]   Permit ${p.permit_id}: zone_id="${p.zone_id}" vs "${zoneNum}", status="${p.status}" → ${match ? "MATCH" : "no match"}`);
    return match;
  });
  appendLog(`[RiskEngine] Found ${zonePermits.length} active permits for zone ${zoneNum}`);
  const zoneWorkers = workersData.filter(w => w.current_zone === zoneNum);
  
  let riskScore = severity === "Critical" ? 70 : 40; 
  if (sensor.alarm_priority === "1") riskScore += 20;
  
  let riskDetails = [];
  
  if (zonePermits.length > 0) {
    riskScore += 20;
    riskDetails.push(`Active permits: ${zonePermits.map(p => p.permit_type).join(", ")}`);
  }
  
  if (zoneWorkers.length > 0) {
    riskScore += 15;
    riskDetails.push(`${zoneWorkers.length} workers in zone`);
  }
  
  riskScore = Math.min(riskScore, 99);
  
  let mappedSeverity = "Medium";
  if (riskScore >= 80) mappedSeverity = "Emergency";
  else if (riskScore >= 60) mappedSeverity = "Critical";
  else if (riskScore >= 40) mappedSeverity = "High";
  
  let rootCause = `${sensor.sensor_type} violation (${exceededBounds})`;
  let recommendation = `Inspect ${sensor.equipment_tag}. Monitor ${sensor.sensor_name}.`;
  
  if (riskDetails.length > 0) {
    rootCause += ` | Context: ${riskDetails.join(" | ")}`;
    recommendation += ` Warn active workers!`;
  }
  
  appendLog(`[RiskEngine] Creating ${mappedSeverity} incident for ${telemetry.zoneId} (Score: ${riskScore})`);
  
  const id = createIncident({
    name: `[${sensor.sensor_name}] Threshold Violation`,
    severity: mappedSeverity,
    zoneId: telemetry.zoneId,
    autoAcknowledgeAfterMs: 0, 
    riskScore,
    confidenceScore: 0.95,
    recommendationContent: recommendation
  });

  activeIncidentsBySensor.set(telemetry.sensorId, id);
}

