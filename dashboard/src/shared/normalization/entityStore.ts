/**
 * Entity Store normalization type (§1.4 "Entity Store — frequent lookup and
 * cross-reference", §2.6 Normalized Store, §2.11 Normalization Principles).
 *
 * Used by every state slice whose Normalization column in §1.3/§1.7 reads
 * "Entity Store": Incident, Worker, Permit, Camera, Digital Twin, Zone,
 * Equipment, Future CV, Future RAG, plus the Incident-owned Recommendation
 * and Evidence sub-entities (see src/domain/incident/store.ts).
 *
 * Shape: `byId` gives O(1) lookup by primary ID (§2.2/§2.12); `allIds`
 * preserves insertion order for stable iteration without scanning the map.
 * Entities are replaced in place by ID on update (§2.10 Memory Management
 * Rules: "Live entities | Replace in place by ID"), never duplicated
 * (§1.1, §1.6, §2.11 principle 1: "Every entity exists exactly once").
 */
export interface EntityStoreState<T> {
  readonly byId: Readonly<Record<string, T>>;
  readonly allIds: readonly string[];
}

export function createEntityStoreState<T>(): EntityStoreState<T> {
  return { byId: {}, allIds: [] };
}

/** Insert or replace a single entity by ID. Pure — returns a new state object. */
export function upsertEntity<T>(
  state: EntityStoreState<T>,
  id: string,
  entity: T,
): EntityStoreState<T> {
  const isNew = !(id in state.byId);
  return {
    byId: { ...state.byId, [id]: entity },
    allIds: isNew ? [...state.allIds, id] : state.allIds,
  };
}

/** Insert or replace many entities in a single pass (e.g. an initial load). */
export function upsertManyEntities<T>(
  state: EntityStoreState<T>,
  entities: ReadonlyArray<readonly [id: string, entity: T]>,
): EntityStoreState<T> {
  const byId = { ...state.byId };
  const allIds = [...state.allIds];
  for (const [id, entity] of entities) {
    if (!(id in byId)) allIds.push(id);
    byId[id] = entity;
  }
  return { byId, allIds };
}

/** Remove a single entity by ID (e.g. an incident archived out of the active set). */
export function removeEntity<T>(state: EntityStoreState<T>, id: string): EntityStoreState<T> {
  if (!(id in state.byId)) return state;
  const byId = { ...state.byId };
  delete byId[id];
  return { byId, allIds: state.allIds.filter((existingId) => existingId !== id) };
}

export function getEntity<T>(state: EntityStoreState<T>, id: string): T | undefined {
  return state.byId[id];
}

export function getAllEntities<T>(state: EntityStoreState<T>): T[] {
  return state.allIds.map((id) => state.byId[id]).filter((entity): entity is T => entity !== undefined);
}
