# State Layer — Delivery Notes

Drop the `src/` folder here into the scaffold's `src/` (it only adds files
under `shared/normalization/`, `types/`, `domain/*`, `ui-state/*`, and
`derived/`; it touches nothing in `shell/`, `panels/`, `api/`, or
`streaming/`). Verified with `tsc -b --noEmit` against the frozen
`tsconfig.json`/`tsconfig.app.json` and path aliases — zero errors.

## What's here

- `shared/normalization/` — one reusable generic helper per §1.4
  normalization type: `entityStore.ts` (Entity Store), `entityMap.ts`
  (Entity Map), `flatObject.ts` (Flat Object), `flatMap.ts` (Flat Map),
  `timelineBuffer.ts` (Timeline Buffer). No store copy-pastes its own
  CRUD logic — every domain/ui-state store below is a thin wrapper around
  one of these five.
- `types/ids.ts`, `types/entities.ts` — branded ID types and entity
  interfaces implementing Appendix A + §1.7 + §2.12 (the appendix
  explicitly leaves TS shapes to implementation).
- `domain/*` — one Zustand store per Domain State slice from §1.2:
  telemetry, incident, worker, permit, camera, digital-twin, zone,
  equipment, system-health, future-cv, future-rag.
- `ui-state/*` — selection, navigation, timeline.
- `derived/` — the seven §2.9 selectors (`selectors.ts`), the §8.2–§8.5
  incident priority comparator they share (`incidentPriority.ts`), and the
  memoizer backing all of them (`memoize.ts`).

Every store keeps its internal zustand instance module-private and exports
only named mutator functions plus read hooks — nothing outside a store's
own file can call `.setState` on it (§1.1, §2.4).

## Three things flagged rather than guessed

Same spirit as the two items already flagged in the scaffold's
`README.md` — these don't block the state layer working, but should be
resolved before downstream code (streaming, write actions, panels) leans
on them.

1. **`@types/*` path alias can't actually be used as an import specifier.**
   The frozen `tsconfig.json`/`vite.config.ts` map `@types/*` → `src/types/*`,
   but TypeScript reserves any specifier starting with `@types/` for the
   DefinitelyTyped npm scope and refuses to resolve it to a local path
   (`TS6137: Cannot import type declaration files`), regardless of the
   `paths` config. Every file here imports from `src/types/` via a relative
   path (e.g. `../../types/entities`) instead. The alias mapping itself is
   left untouched in both config files per the "keep both in sync" rule —
   only the import *specifier* usage changes. Worth either renaming the
   alias (e.g. `@entity-types/*`) or accepting relative imports for this
   one boundary in a later prompt.

2. **Recommendation and Evidence aren't in §1.2/§1.3's slice list, but §2.4
   and §3.2 give them their own service ownership.** They're modeled as two
   additional Entity Stores co-located in `domain/incident/store.ts`
   (`useAllRecommendations`, `useAllEvidence`) rather than invented as two
   more top-level stores this task's slice list never named — every
   relationship they have is anchored to Incident. `Visible Recommendations`
   (§2.9) depends on this. Confirm whether Recommendation/Evidence should
   graduate to their own top-level `domain/` folders later.

3. **A few entity fields have no enumerated values anywhere in the spec** —
   `Worker.status` (Appendix A requires it, never lists values),
   `Zone.geometry` (§1.7 says "geometry", no payload shape), and
   `Navigation`'s concrete fields (§1.3 says "Active route/layout", no
   route names). Each is marked `PLACEHOLDER` / "flagged" in a comment at
   its definition (`types/entities.ts`, `ui-state/navigation/types.ts`) —
   same pattern as `tokens.css`'s placeholder values.

## What's deliberately not here

Per the task scope: no streaming client, no §6 operator write-path actions
(Acknowledge/Escalate/Suspend Permit/etc.), no panels. Each store does
expose a small ingest/upsert surface (e.g. `upsertIncident`,
`ingestTelemetryReading`) — that's the landing point the streaming client
will call into once it exists, not a write path of its own.
