/**
 * zoneData.test.ts
 *
 * Lightweight standalone checks (console.assert based — no test runner
 * required) confirming structural integrity of the static zone data.
 */

import { ZONES, ADJACENCY } from "./zoneData";

const zoneIds = new Set(ZONES.map((z) => z.zone_id));

// 1. Every zone_id referenced as a key in ADJACENCY exists in ZONES.
for (const id of Object.keys(ADJACENCY)) {
  console.assert(
    zoneIds.has(id),
    `ADJACENCY key "${id}" does not correspond to any zone in ZONES`
  );
}

// 2. Every neighbor referenced in ADJACENCY exists in ZONES.
for (const [id, neighbors] of Object.entries(ADJACENCY)) {
  for (const neighbor of neighbors) {
    console.assert(
      zoneIds.has(neighbor),
      `ADJACENCY["${id}"] references unknown zone "${neighbor}"`
    );
  }
}

// 3. ADJACENCY is symmetric: if A lists B, B must list A.
for (const [id, neighbors] of Object.entries(ADJACENCY)) {
  for (const neighbor of neighbors) {
    const reverse = ADJACENCY[neighbor] ?? [];
    console.assert(
      reverse.includes(id),
      `ADJACENCY asymmetry: "${id}" -> "${neighbor}" but "${neighbor}" does not list "${id}"`
    );
  }
}

// 4. No self-loops.
for (const [id, neighbors] of Object.entries(ADJACENCY)) {
  console.assert(
    !neighbors.includes(id),
    `ADJACENCY["${id}"] contains a self-loop`
  );
}

console.log("zoneData checks complete.");
