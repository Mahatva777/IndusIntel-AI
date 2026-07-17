/**
 * Future CV state slice (§1.3: Entity Store, owner CV Service,
 * event-driven, "Rolling buffer" memory strategy). Reserved/not yet active
 * (§1.3, architecture §1) — the store exists so the domain boundary is
 * real, but nothing streams into it yet. CV Detections are append-only
 * once recorded (Appendix A) — no update/remove path. Only the functions
 * exported here mutate this slice (§1.1, §2.4).
 */
import { create } from "zustand";
import {
  createEntityStoreState,
  getAllEntities,
  getEntity,
  removeEntity,
  upsertEntity,
  type EntityStoreState,
} from "@shared/normalization";
import type { CvDetection, CvDetectionId } from "./types";

/** "Rolling buffer" memory strategy (§1.3) — oldest detections are pruned once this cap is exceeded. */
const CV_DETECTION_ROLLING_CAP = 500;

interface FutureCvInternalState {
  readonly detections: EntityStoreState<CvDetection>;
}

const useFutureCvInternalStore = create<FutureCvInternalState>(() => ({
  detections: createEntityStoreState<CvDetection>(),
}));

/** Detections are append-only (Appendix A); this adds new records and rolls off the oldest over the cap. */
export function addCvDetection(detection: CvDetection): void {
  useFutureCvInternalStore.setState((state) => {
    let next = upsertEntity(state.detections, detection.id, detection);
    const overflow = next.allIds.length - CV_DETECTION_ROLLING_CAP;
    if (overflow > 0) {
      for (const staleId of next.allIds.slice(0, overflow)) {
        next = removeEntity(next, staleId);
      }
    }
    return { detections: next };
  });
}

export function resetFutureCvStore(): void {
  useFutureCvInternalStore.setState({ detections: createEntityStoreState<CvDetection>() });
}

export function useCvDetection(id: CvDetectionId): CvDetection | undefined {
  return useFutureCvInternalStore((state) => getEntity(state.detections, id));
}

export function useAllCvDetections(): CvDetection[] {
  return useFutureCvInternalStore((state) => getAllEntities(state.detections));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useFutureCvStoreState(): EntityStoreState<CvDetection> {
  return useFutureCvInternalStore((state) => state.detections);
}
