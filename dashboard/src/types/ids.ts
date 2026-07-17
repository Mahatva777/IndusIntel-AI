/**
 * Primary Entity IDs (§2.2 Primary Entity IDs; §2.12 "Primary IDs (extends
 * §2.2)"). One branded ID type per entity so foreign-key fields (§2.3,
 * §2.12 Relationships) can only hold a reference of the correct kind —
 * the spec requires IDs-not-objects (§2.5) but doesn't otherwise constrain
 * representation, so branding is this layer's implementation choice.
 */
import type { EntityId } from "@shared/normalization/id";

export type SensorId = EntityId<"Sensor">;
export type EquipmentId = EntityId<"Equipment">;
export type ZoneId = EntityId<"Zone">;
export type WorkerId = EntityId<"Worker">;
export type PermitId = EntityId<"Permit">;
export type IncidentId = EntityId<"Incident">;
export type CameraId = EntityId<"Camera">;
export type RecommendationId = EntityId<"Recommendation">;
export type EvidenceId = EntityId<"Evidence">;
export type TimelineEventId = EntityId<"TimelineEvent">;
export type CvDetectionId = EntityId<"CvDetection">;
export type KnowledgeRecordId = EntityId<"KnowledgeRecord">;
/** Singleton per plant/site (§2.12 Primary IDs). */
export type DigitalTwinId = EntityId<"DigitalTwin">;
