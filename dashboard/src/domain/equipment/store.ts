/**
 * Equipment state slice (§1.7: Entity Store, owner Digital Twin Service,
 * "On change (poll + event)", "Session cache, metadata only" memory
 * strategy).
 *
 * Static identity/metadata ONLY (§1.7 Clarifications, §3.8 Freeze Rules).
 * Live operational state (running/stopped/fault, live values) stays in the
 * Telemetry slice and is merged with this slice only at render time —
 * never persisted as one entity. Sensor metadata (§2.2 terminology note)
 * is folded into `Equipment.sensors` here rather than a separate store,
 * per §1.7's explicit instruction. Read-only from the Dashboard's
 * perspective; no §6 write path.
 */
import { create } from "zustand";
import {
  createEntityStoreState,
  getAllEntities,
  getEntity,
  upsertEntity,
  type EntityStoreState,
} from "@shared/normalization";
import type { Equipment, EquipmentId } from "./types";

interface EquipmentInternalState {
  readonly equipment: EntityStoreState<Equipment>;
}

const useEquipmentInternalStore = create<EquipmentInternalState>(() => ({
  equipment: createEntityStoreState<Equipment>(),
}));

export function upsertEquipment(equipment: Equipment): void {
  useEquipmentInternalStore.setState((state) => ({
    equipment: upsertEntity(state.equipment, equipment.id, equipment),
  }));
}

export function resetEquipmentStore(): void {
  useEquipmentInternalStore.setState({ equipment: createEntityStoreState<Equipment>() });
}

export function useEquipment(id: EquipmentId): Equipment | undefined {
  return useEquipmentInternalStore((state) => getEntity(state.equipment, id));
}

export function useAllEquipment(): Equipment[] {
  return useEquipmentInternalStore((state) => getAllEntities(state.equipment));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useEquipmentStoreState(): EntityStoreState<Equipment> {
  return useEquipmentInternalStore((state) => state.equipment);
}
