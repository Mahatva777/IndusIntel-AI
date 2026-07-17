import type { CameraId, IncidentId, RecommendationId, WorkerId, ZoneId } from "../../types/ids";

/**
 * Selection State — §2.9/§12.3 Selection Ownership Rules: Zone, Worker,
 * Camera, Incident, Recommendation each have "Only one primary selection
 * ... at any time" (§12.3). References other entities by ID only (§2.5);
 * never holds a nested entity object.
 *
 * Hover state is explicitly "Local UI State" (§12.3), not Selection State,
 * so it is intentionally excluded from this slice — it belongs to whatever
 * component is hovering, not to shared global state (§5.5 Local State
 * Responsibilities).
 */
export interface SelectionState {
  readonly selectedZoneId: ZoneId | null;
  readonly selectedWorkerId: WorkerId | null;
  readonly selectedCameraId: CameraId | null;
  readonly selectedIncidentId: IncidentId | null;
  readonly selectedRecommendationId: RecommendationId | null;
}
