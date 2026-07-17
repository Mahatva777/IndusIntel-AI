# Shell — Layout

**Spec references:** DASHBOARD_ARCHITECTURE.md §8 (Dashboard Component Hierarchy), Ownership Model (`Dashboard → Layout → Feature Modules → Panels → Widgets`).

Layout orchestrators only. Per §8, these own application layout, navigation,
and global synchronization, and explicitly do **not** own business data.
They compose components from `src/panels/` but never talk to each other
directly (`Panel → Panel → Panel` is explicitly disallowed by §8's
Dependency Rules) — only `Global State → Panel → Widgets`.

Component tree frozen by §8:

```
DashboardShell
├── GlobalStatusBar
├── NavigationRail
└── MainWorkspace
    ├── DigitalTwin              (panels/digital-twin)
    ├── IncidentWorkspace
    │   ├── IncidentFocus        (panels/incident-focus)
    │   ├── RecommendationPanel  (panels/recommendation)
    │   └── EvidenceChain        (panels/evidence-chain)
    ├── RightSidebar
    │   ├── AlertQueue           (panels/alert-queue)
    │   ├── OperationsNarrative  (panels/operations-narrative)
    │   └── SystemHealth         (panels/system-health)
    └── BottomPanel
        ├── Timeline             (panels/timeline)
        ├── WorkerPanel          (panels/worker)
        ├── PermitPanel          (panels/permit)
        ├── SensorPanel          (panels/sensor)
        └── CCTVPanel            (panels/cctv)
```

**Open item:** Emergency Banner does not appear in this diagram at all,
despite being independently prioritized elsewhere in the spec. See
`src/panels/emergency-banner/README.md` for the flagged gap.

**Scaffold status:** every file here is a structural placeholder (`return
null`). No panel is mounted, no state is read, no layout CSS beyond the
outer `DashboardShell` frame exists yet — that's later-prompt work.
