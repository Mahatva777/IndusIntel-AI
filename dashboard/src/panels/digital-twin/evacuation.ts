import { ZONES, ADJACENCY } from "./zoneData";

/**
 * computeEvacuation
 *
 * Pure function — no side effects, no I/O, no randomness. Given a
 * worker's current zone and a snapshot of zone severities, decides
 * whether the zone's official evacuation route is usable, and if not,
 * finds the nearest reachable safe zone via BFS over ADJACENCY.
 *
 * Priority order (see SKILL/prompt for full rationale):
 *   1. The official route is "compromised" only if the worker's OWN
 *      current zone is itself HIGH or CRITICAL. We have no route-path
 *      data beyond the current zone, so we never infer that the
 *      official route passes through other zones.
 *   2. If not compromised, return the official route.
 *   3. If compromised, BFS over ADJACENCY from current_zone, refusing to
 *      traverse through any HIGH/CRITICAL zone, to find the nearest
 *      zone whose severity is LOW, MEDIUM, or unknown/missing (treated
 *      as safe).
 *   4. If no safe zone is reachable, return "no_safe_route" — never
 *      throws, never falls back to the official route in this case.
 */

export type EvacuationResult =
  | { type: "official"; route: string }
  | { type: "rerouted"; path: string[] }
  | { type: "no_safe_route" };

const UNSAFE_BANDS = new Set(["HIGH", "CRITICAL"]);

function isUnsafe(severity: string | undefined): boolean {
  return severity !== undefined && UNSAFE_BANDS.has(severity);
}

function isSafe(severity: string | undefined): boolean {
  return !isUnsafe(severity);
}

function isExitTarget(zoneId: string): boolean {
  const z = ZONES.find((z) => z.zone_id === zoneId);
  if (!z) return zoneId.startsWith("exit");
  return z.hazard_classification === "Safe" || z.parent_area === "External" || z.zone_id.startsWith("exit");
}

/**
 * BFS over ADJACENCY from `start`, refusing to enter any zone whose
 * severity is HIGH/CRITICAL, looking for the nearest safe exit/muster point.
 * Returns the hop path (including `start` as the first element) or null.
 */
function findNearestSafeZone(
  start: string,
  severities: Record<string, string>
): string[] | null {
  const visited = new Set<string>([start]);
  const queue: string[][] = [[start]];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1];

    if (node !== start && isExitTarget(node) && isSafe(severities[node])) {
      return path;
    }

    const neighbors = ADJACENCY[node] ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      // Excluded from traversal entirely — we never route through a
      // HIGH/CRITICAL zone, so it can neither be a waypoint nor a target.
      if (isUnsafe(severities[neighbor])) continue;
      visited.add(neighbor);
      queue.push([...path, neighbor]);
    }
  }

  return null;
}

export function computeEvacuation(
  currentZone: string,
  severities: Record<string, string>
): EvacuationResult {
  const zone = ZONES.find((z) => z.zone_id === currentZone);

  // No known zone record → no official route to reference and no
  // adjacency data to route from. Fail safe rather than throw.
  if (!zone) {
    return { type: "no_safe_route" };
  }

  const ownSeverity = severities[currentZone];
  const officialRouteCompromised = isUnsafe(ownSeverity);

  if (!officialRouteCompromised) {
    return { type: "official", route: zone.evacuation_route };
  }

  const path = findNearestSafeZone(currentZone, severities);
  if (path) {
    return { type: "rerouted", path };
  }

  return { type: "no_safe_route" };
}
