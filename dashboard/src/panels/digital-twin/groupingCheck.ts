import { ZONES } from "./zoneData";
import type { WorkerState } from "./ZoneMap";

// Mirrors the grouping logic inside ZoneMap's useMemo, isolated for a
// quick assertion-based sanity check without needing a DOM renderer.
function groupWorkers(workers: WorkerState[]): Record<string, WorkerState[]> {
  const knownZoneIds = new Set(ZONES.map((z) => z.zone_id));
  const grouped: Record<string, WorkerState[]> = {};
  for (const zone of ZONES) grouped[zone.zone_id] = [];
  for (const w of workers) {
    if (knownZoneIds.has(w.current_zone)) {
      grouped[w.current_zone].push(w);
    }
  }
  return grouped;
}

const workers: WorkerState[] = [
  { worker_id: "W001", name: "Shift Safety Officer", role: "Safety Officer", current_zone: "1", ppe_level: "Level 3", medical_status: "FIT" },
  { worker_id: "W002", name: "Basement Technician", role: "Gas Valve Technician", current_zone: "3", ppe_level: "Level 4", medical_status: "FIT" },
  { worker_id: "W003", name: "Tar Operator", role: "Tar Plant Operator", current_zone: "4", ppe_level: "Level 3", medical_status: "FIT" },
  { worker_id: "W004", name: "Quench Operator", role: "Quench Car Operator", current_zone: "2", ppe_level: "Level 2", medical_status: "FIT" },
  // Edge case: a worker referencing a zone_id that doesn't exist in ZONES.
  { worker_id: "W099", name: "Ghost Worker", role: "Unknown", current_zone: "99", ppe_level: "N/A", medical_status: "FIT" },
];

const grouped = groupWorkers(workers);

console.assert(grouped["1"].length === 1 && grouped["1"][0].worker_id === "W001", "Zone 1 should contain exactly W001");
console.assert(grouped["2"].length === 1 && grouped["2"][0].worker_id === "W004", "Zone 2 should contain exactly W004");
console.assert(grouped["3"].length === 1 && grouped["3"][0].worker_id === "W002", "Zone 3 should contain exactly W002");
console.assert(grouped["4"].length === 1 && grouped["4"][0].worker_id === "W003", "Zone 4 should contain exactly W003");

// The unknown-zone worker must not appear in ANY known zone's bucket.
const allGroupedIds = Object.values(grouped).flat().map((w) => w.worker_id);
console.assert(!allGroupedIds.includes("W099"), "Worker with unknown current_zone must not be assigned to any tile");

// Every zone_id in ZONES has a bucket, even if empty (no zone silently omitted).
for (const zone of ZONES) {
  console.assert(Array.isArray(grouped[zone.zone_id]), `Zone ${zone.zone_id} must have a (possibly empty) bucket`);
}

console.log("groupingCheck complete.");
