/**
 * Digital Twin state slice (§1.7: Entity Store, owner Digital Twin
 * Service, "On change (poll + event)", "Session cache" memory strategy;
 * §2.12 confirms Entity Store normalization for consistency with Incident/
 * Worker/Permit/Camera). Read-only from the Dashboard's perspective — no
 * write path (§1.7 Clarifications) — but this slice still needs a
 * mutation entry point for data arriving via poll/event (§3.2), which is
 * distinct from an operator-initiated §6 write.
 *
 * `id` is a singleton per plant/site (§2.12 Primary IDs), so this store
 * only ever holds zero or one entity, still expressed as an Entity Store
 * for consistency with §2.12's Normalization Strategy note.
 */
import { create } from "zustand";
import {
  createEntityStoreState,
  getAllEntities,
  getEntity,
  upsertEntity,
  type EntityStoreState,
} from "@shared/normalization";
import type { DigitalTwin, DigitalTwinId } from "./types";

interface DigitalTwinInternalState {
  readonly twins: EntityStoreState<DigitalTwin>;
}

const useDigitalTwinInternalStore = create<DigitalTwinInternalState>(() => ({
  twins: createEntityStoreState<DigitalTwin>(),
}));

export function upsertDigitalTwin(twin: DigitalTwin): void {
  useDigitalTwinInternalStore.setState((state) => ({
    twins: upsertEntity(state.twins, twin.id, twin),
  }));
}

export function resetDigitalTwinStore(): void {
  useDigitalTwinInternalStore.setState({ twins: createEntityStoreState<DigitalTwin>() });
}

export function useDigitalTwin(id: DigitalTwinId): DigitalTwin | undefined {
  return useDigitalTwinInternalStore((state) => getEntity(state.twins, id));
}

/** Convenience accessor for the (typically singular) active twin. */
export function useAllDigitalTwins(): DigitalTwin[] {
  return useDigitalTwinInternalStore((state) => getAllEntities(state.twins));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useDigitalTwinStoreState(): EntityStoreState<DigitalTwin> {
  return useDigitalTwinInternalStore((state) => state.twins);
}
