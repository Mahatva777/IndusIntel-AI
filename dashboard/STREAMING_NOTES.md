# Streaming Layer — Delivery Notes

Drop `src/streaming/` into the scaffold's `src/streaming/` (the folder was
previously a placeholder per `README.md`). Nothing outside `streaming/` is
touched by this delivery except that it *imports* mutators from the
existing `domain/*` stores — it never redefines them (§1.1 "Only the
owning service/store may update a slice").

## What's here

- `types.ts` — `ServiceName`, `EventEnvelope` (§4.6), `ConnectionPhase`
  (§4.2), `UpdatePriority`/`SERVICE_PRIORITY` (§4.13).
- `sequenceTracker.ts` — the per-service ordering/buffering/gap/dedup
  engine (§4.7–§4.9, §4.17.2–§4.17.6). Pure and framework-free: it returns
  a `SequenceDecision` for the caller to act on rather than touching a
  store or socket itself, which is what makes it directly unit-testable.
- `resyncCoordinator.ts` — partial resync (§4.17.7, scoped to one service)
  and full resync (§4.17.8, scoped to every service stream at once,
  including on reconnect per §4.4/§4.12).
- `connectionManager.ts` — the frozen lifecycle state machine (§4.2/§4.3),
  reconnect backoff (§4.4: immediate first retry, exponential thereafter,
  fixed cap), and heartbeat (§4.5).
- `backpressure.ts` — the priority scheduler (§4.13) and back-pressure
  behavior per event type (§4.10): Critical (Incident) applies
  synchronously and preempts everything else; High (Permit) drains before
  Medium/Low; Medium (Telemetry, Worker) is chunked per tick; Low (Camera,
  Digital Twin, System Health, CV, RAG) is FIFO-queued and drained last.
- `storeAdapters.ts` — the **only** file in this layer that imports a
  `domain/*` store's mutators. Routes a validated event to the right
  store by Service + Entity Type. This is the ownership boundary the rest
  of the module can't bypass by construction.
- `client.ts` — `StreamingClient`, composing all of the above into the
  single object the app talks to (§4.14's `Backend → Stream → Dashboard →
  Store → Panels` flow, with "Missing sequence → Resynchronize" wired
  through `SequenceTracker` + `ResyncCoordinator`).
- `__tests__/` — `sequenceTracker.test.ts` (pure ordering/gap/overflow
  unit tests), `connectionManager.test.ts` (lifecycle/backoff/heartbeat),
  `client.test.ts` (end-to-end: in-order delivery, a gap that resolves
  within the buffer window, a gap that escalates to partial resync, and a
  buffer overflow that escalates to full resync — all four asserted
  against the real `domain/incident/store`, not a mock).

## What's deliberately not here

Per task scope: no UI, no operator write path (§6). Historical replay
(§4.11/§4.15) gets minimal hooks (`isRenderingSuspended()`) but isn't
wired to an actual replay module, since that's UI-triggered and out of
scope here.

## Two things flagged rather than guessed

Same spirit as the state-layer prompt's flagged items.

1. **§4.17.1's frozen service list doesn't include Digital Twin, but this
   prompt's task list does.** §4.17.1's prose names Telemetry, Incident,
   Worker, Permit, Camera, System Health, CV, RAG (8 services). This
   prompt's required deliverable list adds Digital Twin (9). Since §1.7 /
   §3.8 give Digital Twin, Zone, and Equipment the same owner (Digital
   Twin Service) and the same "Poll + Event, on change" update method,
   this is implemented as one shared watermark for all three, with the
   event's Entity Type (§4.6) routing to the right store
   (`storeAdapters.ts`'s `digitalTwinAdapter`). Recommendation, Evidence,
   and Timeline are streaming per §3.2 but aren't in either list — left
   out of the sequence-tracker registry pending the same confirmation the
   state-layer NOTES.md already asked for on Recommendation/Evidence
   ownership. Adding a tenth/eleventh watermark later is a one-line change
   to `SERVICE_NAMES` plus a `storeAdapters.ts` entry.

2. **The `domain/*` store modules this layer imports from weren't inputs
   to this prompt** (only `domain/camera/store.ts` and
   `ui-state/navigation/store.ts` were, as worked examples). This delivery
   assumes the rest exist with the naming pattern those two already
   establish (`upsertX`/`removeX`/`useXStoreState`) — including
   `upsertIncident` and `ingestTelemetryReading`, which the state-layer
   NOTES.md calls out by name as the streaming client's intended landing
   points. If any real store's mutator names differ, only
   `storeAdapters.ts` needs to change — nothing else in this layer knows
   a store's function names.

## Running the tests

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```
