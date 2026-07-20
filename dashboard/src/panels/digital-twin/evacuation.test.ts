import { computeEvacuation, EvacuationResult } from "./evacuation";
import { ZONES, ADJACENCY } from "./zoneData";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function pathIsValidAdjacencyWalk(path: string[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    if (!ADJACENCY[from] || !ADJACENCY[from].includes(to)) return false;
  }
  return true;
}

// --- (a) all zones safe -> "official" ---------------------------------
{
  const severities: Record<string, string> = {
    "1": "LOW",
    "2": "LOW",
    "3": "MEDIUM",
    "4": "LOW",
  };
  const result = computeEvacuation("1", severities);
  assert(result.type === "official", "(a) all-safe zone returns type 'official'");
  if (result.type === "official") {
    const zone1 = ZONES.find((z) => z.zone_id === "1")!;
    assert(
      result.route === zone1.evacuation_route,
      "(a) official route matches ZONES[1].evacuation_route exactly"
    );
  }
}

// --- (a-2) all zones safe via missing/unknown severities ---------------
{
  const severities: Record<string, string> = {}; // nothing reported -> treated safe
  const result = computeEvacuation("2", severities);
  assert(
    result.type === "official",
    "(a-2) missing severity for own zone is treated as safe -> 'official'"
  );
}

// --- (b) own zone CRITICAL, adjacent zone LOW -> "rerouted" ------------
{
  // Zone 1 is adjacent to 2 and 3. Make 1 CRITICAL, 3 also HIGH so the
  // only safe path is through/into 2.
  const severities: Record<string, string> = {
    "1": "CRITICAL",
    "2": "LOW",
    "3": "HIGH",
    "4": "MEDIUM",
  };
  const result = computeEvacuation("1", severities);
  assert(result.type === "rerouted", "(b) own-zone CRITICAL with safe neighbor returns 'rerouted'");
  if (result.type === "rerouted") {
    assert(result.path[0] === "1", "(b) path starts at the worker's current zone");
    assert(
      result.path[result.path.length - 1] === "2",
      "(b) path ends at the nearest safe zone (zone 2)"
    );
    assert(
      pathIsValidAdjacencyWalk(result.path),
      "(b) every hop in the path is a valid ADJACENCY edge"
    );
    // The starting zone is expected to be unsafe (that's why we're
    // rerouting at all) and is included as path[0] per spec. Every hop
    // AFTER the start must avoid HIGH/CRITICAL zones.
    assert(
      result.path.slice(1).every((id) => !["HIGH", "CRITICAL"].includes(severities[id] ?? "")),
      "(b) no HIGH/CRITICAL zone appears anywhere after the starting zone in the path"
    );
  }
}

// --- (b-2) nearest safe zone is 2 hops away, must skip a HIGH neighbor -
{
  // 1 is CRITICAL. Its direct neighbors 2 and 3 are both unsafe, so the
  // BFS must go further out. 2's other neighbor 4 is safe.
  const severities: Record<string, string> = {
    "1": "CRITICAL",
    "2": "HIGH",
    "3": "CRITICAL",
    "4": "LOW",
  };
  const result = computeEvacuation("1", severities);
  // Note: 4 is not directly adjacent to 1 (ADJACENCY["1"] = ["2","3"]),
  // and both 2 and 3 are unsafe, so 4 is unreachable without passing
  // through an unsafe zone -> expect no_safe_route here.
  assert(
    result.type === "no_safe_route",
    "(b-2) safe zone only reachable by passing through an unsafe zone -> 'no_safe_route'"
  );
}

// --- (c) own zone + all reachable zones HIGH/CRITICAL -> "no_safe_route"
{
  const severities: Record<string, string> = {
    "1": "CRITICAL",
    "2": "HIGH",
    "3": "CRITICAL",
    "4": "HIGH",
  };
  const result = computeEvacuation("1", severities);
  assert(
    result.type === "no_safe_route",
    "(c) all zones HIGH/CRITICAL returns 'no_safe_route' without throwing"
  );
  if (result.type === "no_safe_route") {
    assert(Object.keys(result).length === 1, "(c) no_safe_route carries no extra fields");
  }
}

// --- (d) unknown current_zone -> fails safe, does not throw ------------
{
  let threw = false;
  let result: EvacuationResult | undefined;
  try {
    result = computeEvacuation("does-not-exist", { "1": "LOW" });
  } catch {
    threw = true;
  }
  assert(!threw, "(d) unknown current_zone does not throw");
  assert(result?.type === "no_safe_route", "(d) unknown current_zone returns 'no_safe_route'");
}

// --- (e) own zone HIGH (not just CRITICAL) also triggers rerouting -----
{
  const severities: Record<string, string> = {
    "1": "HIGH",
    "2": "LOW",
    "3": "MEDIUM",
    "4": "LOW",
  };
  const result = computeEvacuation("1", severities);
  assert(result.type === "rerouted", "(e) own-zone HIGH (not only CRITICAL) also triggers reroute");
}

console.log(failures === 0 ? "\nAll evacuation tests passed." : `\n${failures} evacuation test(s) FAILED.`);
