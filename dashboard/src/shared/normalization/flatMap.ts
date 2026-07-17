/**
 * Flat Map normalization type (§1.4 "Flat Map — independent service
 * statuses"). Used only by System Health (§1.3), keyed by backend service
 * name with a "Latest snapshot" memory strategy — each key's value fully
 * replaces the previous one, and there is no cross-referencing between
 * keys the way there is in an Entity Store (§2.6/§2.7 relate real domain
 * entities to each other; service health entries are independent of one
 * another by definition).
 */
export interface FlatMapState<T> {
  readonly byKey: Readonly<Record<string, T>>;
}

export function createFlatMapState<T>(): FlatMapState<T> {
  return { byKey: {} };
}

/** Replace the snapshot for a single key. */
export function setFlatMapEntry<T>(state: FlatMapState<T>, key: string, value: T): FlatMapState<T> {
  return { byKey: { ...state.byKey, [key]: value } };
}

export function getFlatMapEntry<T>(state: FlatMapState<T>, key: string): T | undefined {
  return state.byKey[key];
}

export function getAllFlatMapEntries<T>(state: FlatMapState<T>): T[] {
  return Object.values(state.byKey);
}
