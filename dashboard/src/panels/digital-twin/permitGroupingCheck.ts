import { ZONES } from "./zoneData";
import type { PermitState } from "./ZoneMap";

// Mirrors the activePermitsByZone grouping logic inside ZoneMap's useMemo,
// isolated for a quick assertion-based check without a DOM renderer.
function groupActivePermits(permits: PermitState[]): Record<string, PermitState[]> {
  const grouped: Record<string, PermitState[]> = {};
  for (const zone of ZONES) grouped[zone.zone_id] = [];
  for (const p of permits) {
    if (p.status === "active" && grouped[p.zone_id]) {
      grouped[p.zone_id].push(p);
    }
  }
  return grouped;
}

const permits: PermitState[] = [
  { permit_id: "P1", zone_id: "1", permit_type: "Hot Work", status: "active", workers_assigned: ["W001"] },
  { permit_id: "P2", zone_id: "1", permit_type: "Confined Space", status: "closed", workers_assigned: [] },
  { permit_id: "P3", zone_id: "3", permit_type: "Confined Space", status: "pending", workers_assigned: [] },
  { permit_id: "P4", zone_id: "4", permit_type: "Gas Testing", status: "active", workers_assigned: ["W003"] },
  { permit_id: "P5", zone_id: "4", permit_type: "Hot Work", status: "active", workers_assigned: [] },
  // Edge case: permit referencing a zone_id not present in ZONES.
  { permit_id: "P99", zone_id: "99", permit_type: "Hot Work", status: "active", workers_assigned: [] },
];

const grouped = groupActivePermits(permits);

// Zone 1: one active permit (Hot Work), the closed one must be excluded.
console.assert(grouped["1"].length === 1 && grouped["1"][0].permit_id === "P1", "Zone 1 should show only the active permit P1");

// Zone 2: no permits at all -> no badge should be shown (empty array).
console.assert(grouped["2"].length === 0, "Zone 2 should have zero active permits (no badge)");

// Zone 3: only a pending permit -> zero active permits -> no badge.
console.assert(grouped["3"].length === 0, "Zone 3 should have zero active permits since its only permit is pending");

// Zone 4: two active permits.
console.assert(grouped["4"].length === 2, "Zone 4 should show two active permits");

// The unknown-zone permit must not leak into any known zone's bucket.
const allIds = Object.values(grouped).flat().map((p) => p.permit_id);
console.assert(!allIds.includes("P99"), "Permit referencing an unknown zone_id must not be assigned to any tile");

// Every zone has a bucket, even if empty.
for (const zone of ZONES) {
  console.assert(Array.isArray(grouped[zone.zone_id]), `Zone ${zone.zone_id} must have a (possibly empty) active-permit bucket`);
}

console.log("permitGroupingCheck complete.");
