/**
 * Permit state slice (§1.3: Entity Store, owner Permit Service,
 * event-driven, "Active permits only" memory strategy). Only the functions
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
import type { Permit, PermitId } from "./types";

interface PermitInternalState {
  readonly permits: EntityStoreState<Permit>;
}

const usePermitInternalStore = create<PermitInternalState>(() => ({
  permits: createEntityStoreState<Permit>(),
}));

export function upsertPermit(permit: Permit): void {
  usePermitInternalStore.setState((state) => ({
    permits: upsertEntity(state.permits, permit.id, permit),
  }));
}

/** "Active permits only" memory strategy (§1.3) — closed permits are pruned by the caller. */
export function removePermit(id: PermitId): void {
  usePermitInternalStore.setState((state) => ({
    permits: removeEntity(state.permits, id),
  }));
}

export function resetPermitStore(): void {
  usePermitInternalStore.setState({ permits: createEntityStoreState<Permit>() });
}

export function usePermit(id: PermitId): Permit | undefined {
  return usePermitInternalStore((state) => getEntity(state.permits, id));
}

export function useAllPermits(): Permit[] {
  return usePermitInternalStore((state) => getAllEntities(state.permits));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function usePermitStoreState(): EntityStoreState<Permit> {
  return usePermitInternalStore((state) => state.permits);
}

/** Non-reactive snapshot of internal state — for write-path CAS reads (§6.6). */
export function getPermitStoreSnapshot(): PermitInternalState {
  return usePermitInternalStore.getState();
}
