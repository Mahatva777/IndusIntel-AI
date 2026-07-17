/**
 * Flat Object normalization type (§1.4 "Flat Object — single UI context /
 * minimal UI state"). Used by Selection and Navigation (§1.3), both owned
 * by a UI Controller rather than a backend service (§1.1) and holding a
 * single active value per field rather than a keyed collection.
 *
 * This is intentionally the thinnest helper: a Flat Object has no
 * relationships or lookup concerns (§2.5 — Selection/Navigation reference
 * other entities by ID only, they don't normalize a collection of their
 * own), so the only shared behavior worth factoring out is an immutable
 * partial-update.
 */
export function updateFlatObject<T extends object>(state: T, patch: Partial<T>): T {
  return { ...state, ...patch };
}
