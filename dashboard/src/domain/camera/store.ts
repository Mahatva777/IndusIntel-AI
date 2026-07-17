/**
 * Camera state slice (§1.3: Entity Store, owner Camera Service,
 * event-driven, "Metadata only" memory strategy — frames never enter
 * application state, §1.6/§2.10). Only the functions exported here mutate
 * this slice (§1.1, §2.4).
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
import type { Camera, CameraId } from "./types";

interface CameraInternalState {
  readonly cameras: EntityStoreState<Camera>;
}

const useCameraInternalStore = create<CameraInternalState>(() => ({
  cameras: createEntityStoreState<Camera>(),
}));

export function upsertCamera(camera: Camera): void {
  useCameraInternalStore.setState((state) => ({
    cameras: upsertEntity(state.cameras, camera.id, camera),
  }));
}

export function removeCamera(id: CameraId): void {
  useCameraInternalStore.setState((state) => ({
    cameras: removeEntity(state.cameras, id),
  }));
}

export function resetCameraStore(): void {
  useCameraInternalStore.setState({ cameras: createEntityStoreState<Camera>() });
}

export function useCamera(id: CameraId): Camera | undefined {
  return useCameraInternalStore((state) => getEntity(state.cameras, id));
}

export function useAllCameras(): Camera[] {
  return useCameraInternalStore((state) => getAllEntities(state.cameras));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useCameraStoreState(): EntityStoreState<Camera> {
  return useCameraInternalStore((state) => state.cameras);
}
