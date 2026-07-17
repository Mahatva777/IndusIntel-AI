# Industrial Safety Dashboard — Project Scaffold

React 18 + TypeScript, Zustand, native WebSocket, Recharts, Tailwind CSS, Vite.

This is the **project scaffold only**, built from two frozen specs:

- `DASHBOARD_ARCHITECTURE.md` — system architecture, referenced below as **architecture §N**.
- `FRONTEND_ENGINEERING_SPEC.md` — frontend engineering contract, Sections 1–17 + Appendix A, referenced below as **§N**.

No panels, state stores, or streaming logic are implemented yet. Every
folder below exists to establish a domain boundary; most contain only a
`README.md` and a placeholder `index.ts` / `*.tsx` (`export {}` or `return
null`) so the boundary is real and the project compiles, without
pre-deciding logic that belongs to a later prompt.

## Two things flagged rather than guessed

These came up while building the scaffold. Neither blocks the scaffold
itself, but both should be resolved before the folders they touch are
filled in:

1. **§16's design tokens have no concrete values.** §16.2–16.7 freezes
   token *names*, *hierarchy order*, and *semantic meaning* (e.g. Severity:
   Emergency > Critical > Warning > Advisory > Normal > Information) but
   explicitly states it defines "semantic UI behavior independent of
   implementation technology" (§16.1) — no hex colors, font sizes, or
   durations anywhere in the document. `src/shared/tokens/tokens.css`
   implements the frozen structure with clearly marked `PLACEHOLDER`
   values so the app renders something legible. See
   `src/shared/tokens/README.md` for the full list and what to do about it.

2. **Emergency Banner's mount point isn't in the frozen component tree.**
   Architecture §8's Component Hierarchy diagram doesn't include an
   `EmergencyBanner` node anywhere, even though §9.11, §10.3 (focus order
   1), and §16.6 (P1 priority) all treat it as a distinct, independently
   prioritized UI element. It's scaffolded under `src/panels/` like every
   other panel, but where it actually mounts in `DashboardShell` needs
   confirming before that wiring happens. See
   `src/panels/emergency-banner/README.md`.

## Folder structure → spec mapping

```
src/
├── shell/            Layout orchestrators only (architecture §8). Own no
│                      business data. DashboardShell, GlobalStatusBar,
│                      NavigationRail, MainWorkspace, IncidentWorkspace,
│                      RightSidebar, BottomPanel.
│
├── domain/            Domain State (§1.2, §1.3, §1.7). One folder per
│                      state slice, one Zustand store per folder in a
│                      later prompt. Single source of truth per §1.1.
│   ├── telemetry/
│   ├── incident/
│   ├── worker/
│   ├── permit/
│   ├── camera/
│   ├── digital-twin/  Read-only spatial slice (§1.7, §3.8)
│   ├── zone/          Identity/geometry only — NOT operational status (§1.7)
│   ├── equipment/     Static metadata only — NOT live operational state (§1.7, §3.8)
│   ├── system-health/
│   ├── future-cv/     Reserved, not yet active (§1.3, architecture §1)
│   └── future-rag/    Reserved, not yet active (§1.3, architecture §1)
│
├── ui-state/          UI State (§1.2). Selection, Navigation, Timeline.
│   ├── selection/
│   ├── navigation/
│   └── timeline/
│
├── derived/            Derived State (§1.2, §2.9, §5.6). Read-only computed
│                      selectors — never persisted, never mutated directly.
│
├── streaming/          Streaming Architecture (§4). Native WebSocket client,
│                      connection lifecycle, reconnect/heartbeat, event
│                      envelope, per-service sequence handling (§4.17),
│                      back-pressure. Serves every streaming service in
│                      §3.2 — Telemetry, Incident, Worker, Permit,
│                      Recommendation, Evidence, Timeline, Future CV.
│
├── api/
│   ├── read/           Request/poll clients for non-streamed reads (§3):
│   │                    Health, Digital Twin, Historical Playback, and
│   │                    initial loads. One file per service (§3.2).
│   └── write/           Operator Write Path (§6). One file per action in
│                        the §6.3 Action Matrix (Acknowledge, Escalate,
│                        Silence, Open/Close Incident, Suspend/Resume
│                        Permit, Dispatch, Worker Notes).
│
├── panels/             One folder per panel family, named and grouped by
│   │                    §16.6 Panel Priority (P1 highest → P6 lowest):
│   ├── emergency-banner/     P1 — see "flagged" note above
│   ├── incident-focus/       P1
│   ├── recommendation/       P2
│   ├── evidence-chain/       P2
│   ├── digital-twin/         P3  (the panel component; domain/digital-twin/ is its data)
│   ├── alert-queue/          P3
│   ├── worker/               P4
│   ├── permit/                P4
│   ├── timeline/               P4  (the panel component; ui-state/timeline/ is its data)
│   ├── cctv/                   P5
│   ├── system-health/          P5
│   └── operations-narrative/   P6
│   └── sensor/                 P6
│
├── shared/
│   ├── tokens/          Design tokens (§16.2–16.7) — see "flagged" note above.
│   └── components/      Reserved for shared UI primitives (§16.5, §10.6–10.7). Empty.
│
├── types/               Reserved. Appendix A explicitly leaves TS interfaces
│                        to implementation — deliberately not filled in here.
│
├── styles/index.css      Tailwind entry point, imports tokens.css.
├── App.tsx                Renders DashboardShell only.
├── main.tsx                React root.
└── vite-env.d.ts
```

## Why `domain/zone` and `domain/equipment` are split from `domain/telemetry`

§1.7 and §3.8 are explicit and easy to misread: Zone and Equipment slices
hold **identity, geometry, and static metadata** only, owned by the Digital
Twin Service. Live *operational* values (running/stopped/fault, current
readings) stay in `domain/telemetry`, owned by the Telemetry Service. The
two are merged only at render time inside a panel — never persisted as one
entity (§3.8 Freeze Rules). Don't collapse these folders later; the spec
freezes them as separate ownership concerns on purpose.

## Why `panels/digital-twin` and `domain/digital-twin` both exist

Same pattern throughout `panels/`: the panel folder is the **presentation**
component (§8 Ownership Model: `Layout → Feature Modules → Panels →
Widgets`), the domain/ui-state folder is the **data** it renders. They
share a name because they represent the same concept at different layers,
not because they're duplicates.

## Path aliases

`@domain/*`, `@ui-state/*`, `@derived/*`, `@streaming/*`, `@api/*`,
`@panels/*`, `@shell/*`, `@shared/*`, `@types/*` all resolve to the matching
`src/` folder (configured identically in `tsconfig.json` and
`vite.config.ts` — keep both in sync if a boundary is renamed).

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run lint
npm run build
```

## What's next (not in this scaffold)

- Zustand stores in `src/domain/*` and `src/ui-state/*` (§1, §5).
- The WebSocket client in `src/streaming/` (§4).
- Read/write clients in `src/api/*` (§3, §6).
- Derived selectors in `src/derived/` (§2.9, §5.6).
- Actual panel components in `src/panels/*` (§9, architecture §16.6).
- Resolving the two flagged items above.
