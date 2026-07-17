/**
 * Telemetry state slice (§1.3: Entity Map, owner Telemetry Service, updates
 * every 500ms, "Sliding window buffer" memory strategy). Owned exclusively
 * by this module — `ingestTelemetryReading` is the only mutation path
 * exported; the underlying zustand store instance is never exported, so no
 * other module can call `.setState` directly (§1.1 State Ownership Rules,
 * §2.4 "Only the owning service may mutate an entity").
 *
 * Streaming ingestion itself (§4) is out of scope for this slice — this
 * module only defines the store `ingestTelemetryReading` is meant to be
 * called *by* the (not-yet-implemented) streaming client.
 */
import { create } from "zustand";
import {
  createEntityMapState,
  getAllLatest,
  getHistory,
  getLatest,
  pushToEntityMap,
  type EntityMapState,
} from "@shared/normalization";
import type { SensorId, TelemetryReading } from "./types";

/** Trailing readings retained per sensor (§1.6 Memory Rules — bounded, not unbounded history). */
const TELEMETRY_WINDOW_SIZE = 30;

interface TelemetryInternalState {
  readonly map: EntityMapState<TelemetryReading>;
}

const useTelemetryInternalStore = create<TelemetryInternalState>(() => ({
  map: createEntityMapState<TelemetryReading>(),
}));

/** The sole mutation entry point for this slice. */
export function ingestTelemetryReading(reading: TelemetryReading): void {
  useTelemetryInternalStore.setState((state) => ({
    map: pushToEntityMap(state.map, reading.sensorId, reading, TELEMETRY_WINDOW_SIZE),
  }));
}

export function resetTelemetryStore(): void {
  useTelemetryInternalStore.setState({ map: createEntityMapState<TelemetryReading>() });
}

// --- Reads -------------------------------------------------------------

export function useTelemetryReading(sensorId: SensorId): TelemetryReading | undefined {
  return useTelemetryInternalStore((state) => getLatest(state.map, sensorId));
}

export function useTelemetryHistory(sensorId: SensorId): readonly TelemetryReading[] {
  return useTelemetryInternalStore((state) => getHistory(state.map, sensorId));
}

export function useAllLatestTelemetry(): TelemetryReading[] {
  return useTelemetryInternalStore((state) => getAllLatest(state.map));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useTelemetryMapState(): EntityMapState<TelemetryReading> {
  return useTelemetryInternalStore((state) => state.map);
}
