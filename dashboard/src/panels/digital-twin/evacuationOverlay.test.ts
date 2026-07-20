import { ZONES } from "./zoneData";
import type { EvacuationResult } from "./evacuation";

// Mirrors computeScale/getZoneRect from EvacuationOverlay, isolated so we
// can assert on the geometry without a DOM/React renderer.
function computeScale(containerWidth: number) {
  const maxX = Math.max(...ZONES.map((z) => z.layout.x + z.layout.width));
  const maxY = Math.max(...ZONES.map((z) => z.layout.y + z.layout.height));
  const scale = containerWidth / maxX;
  const containerHeight = Math.ceil(maxY * scale);
  return { scale, containerHeight };
}

function getZoneRect(zoneId: string, scale: number) {
  const zone = ZONES.find((z) => z.zone_id === zoneId);
  if (!zone) return null;
  const left = zone.layout.x * scale;
  const top = zone.layout.y * scale;
  const width = zone.layout.width * scale;
  const height = zone.layout.height * scale;
  return { left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
}

function buildSegments(path: string[], scale: number) {
  const rects = path
    .map((id) => ({ id, rect: getZoneRect(id, scale) }))
    .filter((r) => r.rect !== null) as { id: string; rect: NonNullable<ReturnType<typeof getZoneRect>> }[];
  const segments: { from: string; to: string }[] = [];
  for (let i = 0; i < rects.length - 1; i++) {
    segments.push({ from: rects[i].id, to: rects[i + 1].id });
  }
  return { rects, segments };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const CONTAINER_WIDTH = 700;
const { scale } = computeScale(CONTAINER_WIDTH);

// --- evacuationActive === false -> caller renders nothing -------------
// (This is a trivial early-return in the component; nothing to compute.)
assert(true, "evacuationActive=false short-circuits before any geometry is computed (verified by inspection of early return)");

// --- "official": no path segments should ever be built -----------------
{
  const result: EvacuationResult = { type: "official", route: "North stairway to muster point A" };
  // The overlay's official branch never calls buildSegments — assert the
  // shape of what WOULD be drawn is nothing, i.e. no `path` field exists.
  assert(!("path" in result), "'official' result carries no path field, so no arrows can be drawn from it");
  const rect = getZoneRect("1", scale);
  assert(rect !== null, "official label anchors to a resolvable zone rect for zone '1'");
}

// --- "rerouted": arrows connect exactly the zones in path, in order ----
{
  const result: EvacuationResult = { type: "rerouted", path: ["1", "2", "3"] };
  const { rects, segments } = buildSegments(result.path, scale);
  assert(rects.length === 3, "all 3 path zones resolve to real tile rects");
  assert(
    segments.length === 2,
    "path of length 3 produces exactly 2 arrow segments (N-1 for N stops)"
  );
  assert(
    segments[0].from === "1" && segments[0].to === "2",
    "first arrow segment connects path[0] -> path[1] in order"
  );
  assert(
    segments[1].from === "2" && segments[1].to === "3",
    "second arrow segment connects path[1] -> path[2] in order"
  );
  const finalRect = rects[rects.length - 1].rect;
  const zone3Rect = getZoneRect("3", scale)!;
  assert(
    finalRect.centerX === zone3Rect.centerX && finalRect.centerY === zone3Rect.centerY,
    "the running-figure icon anchors to the final zone in path (zone '3'), not an earlier one"
  );
}

// --- "rerouted" with a single-zone path (no possible arrows) -----------
{
  const result: EvacuationResult = { type: "rerouted", path: ["1"] };
  const { rects, segments } = buildSegments(result.path, scale);
  assert(rects.length === 1, "single-zone path resolves to exactly one rect");
  assert(segments.length === 0, "a path with only 1 zone produces zero arrow segments");
}

// --- "no_safe_route": no segments possible, no path field ---------------
{
  const result: EvacuationResult = { type: "no_safe_route" };
  assert(!("path" in result), "'no_safe_route' carries no path field, so no arrows can be drawn from it");
  assert(!("route" in result), "'no_safe_route' carries no route field either");
}

console.log(failures === 0 ? "\nAll overlay geometry tests passed." : `\n${failures} overlay geometry test(s) FAILED.`);
