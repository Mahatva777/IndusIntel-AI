# Dashboard Mock Streaming Server

A local, dependency-light Node.js WebSocket server that emulates the
backend streaming contract from `FRONTEND_ENGINEERING_SPEC.md` — §3.2
Service Contract Matrix and §4 Streaming Architecture — so the dashboard
(and the `src/streaming/` client from the previous prompt) can be built
and demoed with **no real backend**.

It does **not** implement a real backend. It's a fixture: seeded world
data, a handful of background generators producing synthetic traffic, two
scripted incident scenarios, and an HTTP debug channel for deliberately
breaking the stream on demand so the client's resync logic (§4.17) has
something real to react to.

## Running it

```bash
cd mock-server
npm install
npm start
```

This starts:

- a **WebSocket server** on `ws://localhost:8080` (the live stream)
- an **HTTP debug server** on `http://localhost:8081` (the control channel)

Two environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_AUTH_TOKEN` | `dev-token` | Token the `auth` message must present |
| `TIME_SCALE` | `1` | Multiplies every timing (§9.2's T+15/30/60/120s, §3.2's 500ms telemetry cadence, etc.). `1` = real spec timing. `0.1` = 10x faster, useful for demos so you don't wait 2 minutes for a Plant Manager escalation. |
| `WS_PORT` / `DEBUG_PORT` | `8080` / `8081` | Ports, if you need to change them |

```bash
TIME_SCALE=0.1 npm start   # demo-speed
```

On boot it seeds one snapshot's worth of state for every service (zones,
equipment, workers, permits, cameras, service health) and — a few seconds
in — automatically runs both required demo scenarios once (see below), so
`npm start` alone is enough to see something real streaming.

## Wire protocol

One WebSocket connection, JSON messages both directions. This is the
contract a real `ConnectionTransport` / `ResyncTransport` implementation
(the interfaces the streaming client's `connectionManager.ts` /
`resyncCoordinator.ts` were written against) needs to speak.

**Client → Server**

| Message | Purpose |
|---|---|
| `{ type: "auth", token }` | §4.2 Authenticating phase |
| `{ type: "snapshot_request", requestId, service }` | §4.2 Synchronizing / §4.17.8 Full Resynchronization |
| `{ type: "range_request", requestId, service, fromSequenceId, toSequenceId }` | §4.17.7 Partial Resynchronization |
| `{ type: "heartbeat" }` | §4.5 Heartbeat Policy |

**Server → Client**

| Message | Purpose |
|---|---|
| `{ type: "auth_ack" }` / `{ type: "auth_error", message }` | Auth result |
| `{ type: "snapshot", requestId, service, watermark, entities }` | Full current state for one service |
| `{ type: "range_response", requestId, service, events }` or `{ ..., available: false }` | Missing-range fill, or an honest "I don't have it anymore" (§4.17.7 fallback trigger) |
| `{ type: "event", service, eventId, sequenceId, timestamp, serviceVersion, entityType, operation, payload }` | A live domain event — the seven §4.6 envelope fields plus a `service` routing tag |
| `{ type: "heartbeat_ack" }` | Heartbeat reply |

Services emitted: `Telemetry`, `Incident`, `Worker`, `Permit`, `Camera`,
`DigitalTwin` (also carries Zone/Equipment events, routed by
`entityType` — see `src/generators.js`'s comment for why), `SystemHealth`
— matching this deliverable's required list. Each has its own strictly
increasing `sequenceId` counter (§4.17.1).

## Debug control channel

Plain HTTP, so it's `curl`-able from anywhere. Full route list is also
returned by any unmatched request.

```bash
# Current sequence counters, entity counts, connected clients, active incidents
curl http://localhost:8081/debug/status

# Drop the next N events for a service — simulates a gap on the wire.
# The event still happens server-side (recoverable via range_request /
# a snapshot), it's just never broadcast — like a real dropped packet.
curl -X POST http://localhost:8081/debug/drop-sequence \
  -H 'Content-Type: application/json' -d '{"service":"Worker","count":1}'

# Re-send the very next emitted event for a service a second time,
# same eventId + sequenceId — exercises duplicate suppression (§4.8).
curl -X POST http://localhost:8081/debug/duplicate \
  -H 'Content-Type: application/json' -d '{"service":"Camera","count":1}'

# Hold the next event for a service back by N ms before broadcasting —
# produces a late/out-of-order arrival.
curl -X POST http://localhost:8081/debug/delay \
  -H 'Content-Type: application/json' -d '{"service":"Telemetry","ms":4000}'

# Force the *next* range_request for a service to report unavailable —
# exercises the §4.17.7 fallback into a full resync.
curl -X POST http://localhost:8081/debug/range-unavailable \
  -H 'Content-Type: application/json' -d '{"service":"Incident"}'

# Force-close every connected WebSocket — exercises §4.2
# Live → Reconnecting → Synchronizing → Live and §4.4's reconnect policy.
curl -X POST http://localhost:8081/debug/disconnect

# Run the full incident-lifecycle scenario again, on demand.
curl -X POST http://localhost:8081/debug/incident-lifecycle

# Run the Primary Incident change scenario again, on demand.
curl -X POST http://localhost:8081/debug/primary-incident-change

# Manually acknowledge / resolve a specific incident right now, instead
# of waiting for its auto-ack/auto-resolve timers.
curl -X POST http://localhost:8081/debug/acknowledge-incident \
  -H 'Content-Type: application/json' -d '{"incidentId":"incident-xxxxxxxx"}'
curl -X POST http://localhost:8081/debug/resolve-incident \
  -H 'Content-Type: application/json' -d '{"incidentId":"incident-xxxxxxxx"}'
```

### Producing a gap the resync logic actually has to handle

A single `drop-sequence` call only removes one event from the wire. The
sequence tracker in `src/streaming/sequenceTracker.ts` needs the *next*
event on that service to arrive before it notices anything's missing (a
gap is only detectable in hindsight, once a higher sequence ID shows up).
Since Worker and Telemetry both emit every 500ms, the gap surfaces almost
immediately after a `drop-sequence` call — good for the "small gap
resolves via partial resync" scenario. For a full-resync-via-overflow
demo, fire several `drop-sequence` calls in a row (more than the
tracker's `maxBufferSize`, default 25) before the buffer window elapses.

## Incident scenarios

### Full lifecycle (creation → escalation → acknowledgement → resolution)

`POST /debug/incident-lifecycle` (also runs once automatically ~5s after
boot):

1. Creates an **Emergency**-severity incident (`Incident/create`) — only
   Emergency incidents get the §9.2 escalation timeline (§8.10 Escalation
   Rules).
2. ~2s later, emits a `Recommendation/create` and `Evidence/create` tied
   to it, so the Recommendation/Evidence panels have something to show.
3. Emits `Incident/update` with `escalationLevel` transitioning
   `None → Reminder → AudibleReminder → SupervisorEscalated →
   PlantManagerEscalated` at T+15s / T+30s / T+60s / T+120s (§9.2, §9.10 —
   the server is the sole timer owner, exactly as §9.10 requires; the
   dashboard should only ever render whatever arrives).
4. Auto-acknowledges at T+125s (`escalationLevel: "Acknowledged"`,
   stopping further escalation per §9.7) — or call
   `/debug/acknowledge-incident` earlier to short-circuit the wait.
5. Auto-resolves at T+140s (`status: "Resolved"`) — or call
   `/debug/resolve-incident` earlier.

### Primary Incident change (§8/§9.11)

`POST /debug/primary-incident-change` (also runs once automatically ~20s
after boot):

1. Creates a **Critical** incident in one zone. With no other active
   incident yet, it's the only candidate — it becomes Primary.
2. ~5s later, creates an **Emergency** incident in a different zone. Per
   §8.2's Severity-first evaluation order, Emergency (rank 1) outranks
   Critical (rank 2) regardless of any other attribute, so the Primary
   Incident flips to the new one — exercising the frontend's
   `selectPrimaryIncident` / Dashboard Operational State derivation
   (§9.11) purely from the incident stream, with the dashboard computing
   nothing itself.

## Files

```
src/
├── config.js             Ports, auth token, TIME_SCALE, service list
├── seed.js                Static zones/workers/permits/cameras/equipment/sensors
├── state.js                Per-service sequence counters, entity snapshots, event log ring buffer, debug toggles
├── emit.js                  Envelope builder + debug hook application (drop/duplicate/delay) + broadcast
├── generators.js             Background synthetic traffic for all 7 services
├── incidentScenarios.js       The two required incident scenarios
├── wsServer.js                 WebSocket wire protocol implementation
├── debugServer.js               HTTP debug control channel
└── index.js                     Entry point
scripts/
└── smoke-test.js                Example client exercising every message type and every debug route end to end — `node scripts/smoke-test.js` against a running server
```
