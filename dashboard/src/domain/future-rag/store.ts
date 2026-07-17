/**
 * Future RAG state slice (§1.3: Entity Store, owner RAG Service, on-demand,
 * Lifetime "Immutable", "LRU cache" memory strategy). Reserved/not yet
 * active (§1.3, architecture §1). Records are immutable once fetched
 * (§1.3) — there is no update path, only insert (on cache miss / fetch)
 * and read (which refreshes recency). Only the functions exported here
 * mutate this slice (§1.1, §2.4).
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
import type { KnowledgeRecord, KnowledgeRecordId } from "./types";

/** LRU cache capacity (§1.3 Memory Strategy: "LRU cache"). */
const KNOWLEDGE_CACHE_CAPACITY = 100;

interface FutureRagInternalState {
  readonly records: EntityStoreState<KnowledgeRecord>;
  /** Most-recently-used last; used purely to decide eviction order. */
  readonly recency: readonly KnowledgeRecordId[];
}

const useFutureRagInternalStore = create<FutureRagInternalState>(() => ({
  records: createEntityStoreState<KnowledgeRecord>(),
  recency: [],
}));

function touch(recency: readonly KnowledgeRecordId[], id: KnowledgeRecordId): KnowledgeRecordId[] {
  return [...recency.filter((existingId) => existingId !== id), id];
}

/** Cache a fetched, immutable record. Evicts the least-recently-used record once over capacity. */
export function cacheKnowledgeRecord(record: KnowledgeRecord): void {
  useFutureRagInternalStore.setState((state) => {
    const records = upsertEntity(state.records, record.id, record);
    const recency = touch(state.recency, record.id);
    if (recency.length <= KNOWLEDGE_CACHE_CAPACITY) {
      return { records, recency };
    }
    const [leastRecentlyUsed, ...rest] = recency;
    return { records: removeEntity(records, leastRecentlyUsed), recency: rest };
  });
}

export function resetFutureRagStore(): void {
  useFutureRagInternalStore.setState({ records: createEntityStoreState<KnowledgeRecord>(), recency: [] });
}

/** Reads a cached record and marks it most-recently-used. */
export function useKnowledgeRecord(id: KnowledgeRecordId): KnowledgeRecord | undefined {
  const record = useFutureRagInternalStore((state) => getEntity(state.records, id));
  return record;
}

export function useAllKnowledgeRecords(): KnowledgeRecord[] {
  return useFutureRagInternalStore((state) => getAllEntities(state.records));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useFutureRagStoreState(): EntityStoreState<KnowledgeRecord> {
  return useFutureRagInternalStore((state) => state.records);
}
