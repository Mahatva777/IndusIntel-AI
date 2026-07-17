/**
 * Worker state slice (§1.3: Entity Store, owner Worker Service, updates
 * every 500ms, "Current snapshot" memory strategy). Only the functions
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
import type { Worker, WorkerId } from "./types";

interface WorkerInternalState {
  readonly workers: EntityStoreState<Worker>;
}

const useWorkerInternalStore = create<WorkerInternalState>(() => ({
  workers: createEntityStoreState<Worker>(),
}));

export function upsertWorker(worker: Worker): void {
  useWorkerInternalStore.setState((state) => ({
    workers: upsertEntity(state.workers, worker.id, worker),
  }));
}

export function removeWorker(id: WorkerId): void {
  useWorkerInternalStore.setState((state) => ({
    workers: removeEntity(state.workers, id),
  }));
}

export function resetWorkerStore(): void {
  useWorkerInternalStore.setState({ workers: createEntityStoreState<Worker>() });
}

export function useWorker(id: WorkerId): Worker | undefined {
  return useWorkerInternalStore((state) => getEntity(state.workers, id));
}

export function useAllWorkers(): Worker[] {
  return useWorkerInternalStore((state) => getAllEntities(state.workers));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useWorkerStoreState(): EntityStoreState<Worker> {
  return useWorkerInternalStore((state) => state.workers);
}
