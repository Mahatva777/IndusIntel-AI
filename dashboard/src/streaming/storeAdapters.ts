/**
 * The only file in the streaming layer allowed to import a domain store's
 * mutators (§1.1 "Only the owning service/store may update a slice";
 * §2.4). Everything else in `src/streaming/` talks in terms of
 * `EventEnvelope`s and `ServiceName`s and never reaches into `@domain/*`
 * directly, so store-ownership rules can't be bypassed by construction.
 *
 * Each adapter's `applyEvent` dispatches on the envelope's Entity Type
 * (§4.6) — this is what lets one service stream (e.g. Digital Twin) fan
 * out to more than one store (Digital Twin, Zone, Equipment; see
 * `types.ts` for why those three share one sequence watermark).
 */
import type { EventEnvelope, ServiceName, ServiceSnapshot } from "./types";

import { removeCamera, upsertCamera } from "@domain/camera/store";
import { removeIncident, replaceAllIncidents, upsertEvidence, upsertIncident, upsertRecommendation } from "@domain/incident/store";
import { removeWorker, upsertWorker } from "@domain/worker/store";
import { removePermit, upsertPermit } from "@domain/permit/store";
import { removeZone, upsertZone } from "@domain/zone/store";
import { removeEquipment, upsertEquipment } from "@domain/equipment/store";
import { removeDigitalTwinElement, upsertDigitalTwinElement } from "@domain/digital-twin/store";
import { ingestTelemetryReading } from "@domain/telemetry/store";
import { setServiceHealth } from "@domain/system-health/store";
import { removeCvDetection, upsertCvDetection } from "@domain/future-cv/store";
import { upsertRagReference } from "@domain/future-rag/store";

import type { Camera, CameraId } from "@domain/camera/types";
import type { Evidence, Incident, IncidentId, Recommendation } from "@domain/incident/types";
import type { Worker, WorkerId } from "@domain/worker/types";
import type { Permit, PermitId } from "@domain/permit/types";
import type { Zone, ZoneId } from "@domain/zone/types";
import type { Equipment, EquipmentId } from "@domain/equipment/types";
import type { DigitalTwinElement, DigitalTwinElementId } from "@domain/digital-twin/types";
import type { SensorId, TelemetryReading } from "@domain/telemetry/types";
import type { ServiceHealthSnapshot } from "@domain/system-health/types";
import type { CvDetection, CvDetectionId } from "@domain/future-cv/types";
import type { RagReference } from "@domain/future-rag/types";

export interface StoreAdapter {
  /** Apply one already-ordered, already-validated event to its owning store(s). */
  applyEvent(event: EventEnvelope): void;
  /**
   * Bulk-replace this service's slice from a resync snapshot (§4.17.8
   * outcome). For services fanned out across multiple stores (Digital
   * Twin/Zone/Equipment), the snapshot payload is expected to be
   * pre-partitioned by entity type.
   */
  applySnapshot(snapshot: ServiceSnapshot): void;
}

function isDeleteOp(event: EventEnvelope): boolean {
  return event.operation === "delete";
}

const cameraAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as Camera;
    if (isDeleteOp(event)) removeCamera(payload.id as CameraId);
    else upsertCamera(payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly Camera[]) upsertCamera(entity);
  },
};

const incidentAdapter: StoreAdapter = {
  applyEvent(event) {
    switch (event.entityType) {
      case "Incident": {
        const payload = event.payload as Incident;
        if (isDeleteOp(event)) removeIncident(payload.id as IncidentId);
        else upsertIncident(payload);
        return;
      }
      case "Recommendation":
        upsertRecommendation(event.payload as Recommendation);
        return;
      case "Evidence":
        upsertEvidence(event.payload as Evidence);
        return;
      default:
        return;
    }
  },
  applySnapshot(snapshot) {
    replaceAllIncidents(snapshot.entities as readonly Incident[]);
  },
};

const workerAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as Worker;
    if (isDeleteOp(event)) removeWorker(payload.id as WorkerId);
    else upsertWorker(payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly Worker[]) upsertWorker(entity);
  },
};

const permitAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as Permit;
    if (isDeleteOp(event)) removePermit(payload.id as PermitId);
    else upsertPermit(payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly Permit[]) upsertPermit(entity);
  },
};

/**
 * §1.7/§3.8: Digital Twin, Zone, and Equipment share one owning service
 * (Digital Twin Service) and — per this deliverable's task list — one
 * sequence watermark; Entity Type (§4.6) routes each event to its own
 * store so §1.1 single-owner-mutates is preserved per slice.
 */
const digitalTwinAdapter: StoreAdapter = {
  applyEvent(event) {
    switch (event.entityType) {
      case "Zone": {
        const payload = event.payload as Zone;
        if (isDeleteOp(event)) removeZone(payload.id as ZoneId);
        else upsertZone(payload);
        return;
      }
      case "Equipment": {
        const payload = event.payload as Equipment;
        if (isDeleteOp(event)) removeEquipment(payload.id as EquipmentId);
        else upsertEquipment(payload);
        return;
      }
      case "DigitalTwinElement":
      default: {
        const payload = event.payload as DigitalTwinElement;
        if (isDeleteOp(event)) removeDigitalTwinElement(payload.id as DigitalTwinElementId);
        else upsertDigitalTwinElement(payload);
        return;
      }
    }
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly DigitalTwinElement[]) upsertDigitalTwinElement(entity);
  },
};

const telemetryAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as TelemetryReading;
    ingestTelemetryReading(payload.sensorId as SensorId, payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly TelemetryReading[]) {
      ingestTelemetryReading(entity.sensorId as SensorId, entity);
    }
  },
};

const systemHealthAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as ServiceHealthSnapshot;
    setServiceHealth(payload.service, payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly ServiceHealthSnapshot[]) {
      setServiceHealth(entity.service, entity);
    }
  },
};

const cvAdapter: StoreAdapter = {
  applyEvent(event) {
    const payload = event.payload as CvDetection;
    if (isDeleteOp(event)) removeCvDetection(payload.id as CvDetectionId);
    else upsertCvDetection(payload);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly CvDetection[]) upsertCvDetection(entity);
  },
};

const ragAdapter: StoreAdapter = {
  applyEvent(event) {
    // §1.3: RAG is Immutable / LRU cache — references are added, never
    // mutated in place; eviction policy is out of scope for this prompt.
    upsertRagReference(event.payload as RagReference);
  },
  applySnapshot(snapshot) {
    for (const entity of snapshot.entities as readonly RagReference[]) upsertRagReference(entity);
  },
};

export const STORE_ADAPTERS: Record<ServiceName, StoreAdapter> = {
  Camera: cameraAdapter,
  Incident: incidentAdapter,
  Worker: workerAdapter,
  Permit: permitAdapter,
  DigitalTwin: digitalTwinAdapter,
  Telemetry: telemetryAdapter,
  SystemHealth: systemHealthAdapter,
  CV: cvAdapter,
  RAG: ragAdapter,
};
