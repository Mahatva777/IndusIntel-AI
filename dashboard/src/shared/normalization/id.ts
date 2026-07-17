/**
 * Lightweight nominal ID typing.
 *
 * Appendix A explicitly declines to freeze concrete TypeScript interfaces,
 * leaving representation to implementation. IDs are strings on the wire
 * (§2.2/§2.12 Primary Entity IDs), but every store in this layer references
 * related entities by ID only, never by nested object (§2.5 Reference
 * Rules). Branding string IDs per entity type turns "passed a Worker ID
 * where a Zone ID was expected" into a compile error instead of a runtime
 * bug — this is an implementation choice, not something the spec mandates,
 * and costs nothing at runtime (it erases to `string`).
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type EntityId<B extends string> = Brand<string, B>;

/** Narrows a raw string into a branded ID. Use at the API/streaming boundary only. */
export function asId<B extends string>(raw: string): EntityId<B> {
  return raw as EntityId<B>;
}
