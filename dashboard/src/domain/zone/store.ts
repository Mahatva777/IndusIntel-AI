/**
 * Zone state slice (§1.7: Entity Store, owner Digital Twin Service,
 * "On change (poll + event)", "Session cache" memory strategy).
 *
 * Identity/geometry/topology-membership ONLY (§1.7 Clarifications). Zone
 * *operational* status (e.g. risk level) is never stored here — it's the
 * `Zone Summary` derived selector (§2.9), computed from this slice plus
 * Telemetry and Incident. Do not add operational fields to this store.
 * Read-only from the Dashboard's perspective; no §6 write path.
 */
import { create } from "zustand";
import {
  createEntityStoreState,
  getAllEntities,
  getEntity,
  upsertEntity,
  type EntityStoreState,
} from "@shared/normalization";
import type { Zone, ZoneId } from "./types";

interface ZoneInternalState {
  readonly zones: EntityStoreState<Zone>;
}

const useZoneInternalStore = create<ZoneInternalState>(() => ({
  zones: createEntityStoreState<Zone>(),
}));

export function upsertZone(zone: Zone): void {
  useZoneInternalStore.setState((state) => ({
    zones: upsertEntity(state.zones, zone.id, zone),
  }));
}

export function resetZoneStore(): void {
  useZoneInternalStore.setState({ zones: createEntityStoreState<Zone>() });
}

export function useZone(id: ZoneId): Zone | undefined {
  return useZoneInternalStore((state) => getEntity(state.zones, id));
}

export function useAllZones(): Zone[] {
  return useZoneInternalStore((state) => getAllEntities(state.zones));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useZoneStoreState(): EntityStoreState<Zone> {
  return useZoneInternalStore((state) => state.zones);
}
