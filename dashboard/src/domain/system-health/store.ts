/**
 * System Health state slice (§1.3: Flat Map, owner Health Service, polled
 * every 5–10s, "Latest snapshot" memory strategy). Keyed by service name
 * (e.g. "telemetry", "incident", "streaming") with each key's value fully
 * replaced on update — independent statuses, no cross-referencing (§1.4).
 * Only the functions exported here mutate this slice (§1.1, §2.4).
 */
import { create } from "zustand";
import {
  createFlatMapState,
  getAllFlatMapEntries,
  getFlatMapEntry,
  setFlatMapEntry,
  type FlatMapState,
} from "@shared/normalization";
import type { ServiceHealthSnapshot } from "./types";

interface SystemHealthInternalState {
  readonly services: FlatMapState<ServiceHealthSnapshot>;
}

const useSystemHealthInternalStore = create<SystemHealthInternalState>(() => ({
  services: createFlatMapState<ServiceHealthSnapshot>(),
}));

export function setServiceHealth(snapshot: ServiceHealthSnapshot): void {
  useSystemHealthInternalStore.setState((state) => ({
    services: setFlatMapEntry(state.services, snapshot.service, snapshot),
  }));
}

export function resetSystemHealthStore(): void {
  useSystemHealthInternalStore.setState({ services: createFlatMapState<ServiceHealthSnapshot>() });
}

export function useServiceHealth(service: string): ServiceHealthSnapshot | undefined {
  return useSystemHealthInternalStore((state) => getFlatMapEntry(state.services, service));
}

export function useAllServiceHealth(): ServiceHealthSnapshot[] {
  return useSystemHealthInternalStore((state) => getAllFlatMapEntries(state.services));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useSystemHealthStoreState(): FlatMapState<ServiceHealthSnapshot> {
  return useSystemHealthInternalStore((state) => state.services);
}
