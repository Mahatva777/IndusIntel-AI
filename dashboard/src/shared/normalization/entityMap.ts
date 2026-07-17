/**
 * Entity Map normalization type (§1.4 "Entity Map — fast updates by sensor
 * ID"). Used only by Telemetry (§1.3), whose Memory Strategy is a "Sliding
 * window buffer" (§1.3) and whose Lifetime Policy freezes to "Frozen" under
 * replay (§1.5) rather than being disposed like other live slices.
 *
 * Distinct from Entity Store: an Entity Map optimizes for "replace the
 * latest value for this key, keep a bounded trailing history" rather than
 * for cross-referencing many related entities. Each key holds its current
 * value plus a fixed-size ring of prior values so panels can show a recent
 * trend without the store growing unbounded (§1.6 Memory Rules, §2.10).
 */
export interface EntityMapEntry<T> {
  readonly latest: T;
  /** Most recent first; length capped at the map's configured window size. */
  readonly history: readonly T[];
}

export interface EntityMapState<T> {
  readonly byId: Readonly<Record<string, EntityMapEntry<T>>>;
}

export function createEntityMapState<T>(): EntityMapState<T> {
  return { byId: {} };
}

/**
 * Push a new value for `id`, becoming the latest and shifting the previous
 * latest into history, trimmed to `windowSize`.
 */
export function pushToEntityMap<T>(
  state: EntityMapState<T>,
  id: string,
  value: T,
  windowSize: number,
): EntityMapState<T> {
  const existing = state.byId[id];
  const nextHistory = existing
    ? [existing.latest, ...existing.history].slice(0, Math.max(windowSize - 1, 0))
    : [];
  return {
    byId: {
      ...state.byId,
      [id]: { latest: value, history: nextHistory },
    },
  };
}

export function getLatest<T>(state: EntityMapState<T>, id: string): T | undefined {
  return state.byId[id]?.latest;
}

export function getHistory<T>(state: EntityMapState<T>, id: string): readonly T[] {
  return state.byId[id]?.history ?? [];
}

export function getAllLatest<T>(state: EntityMapState<T>): T[] {
  return Object.values(state.byId).map((entry) => entry.latest);
}
