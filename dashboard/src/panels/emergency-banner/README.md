# Panel — EmergencyBanner (P1)

**Spec references:** §16.6 (P1), §10.3 (focus order 1), §9.4–9.6, §9.11

Visible iff Operational State = Emergency; content = Primary Incident. A derived selector, not local state — recomputed, never persisted, reconstructed from the current Primary Incident the instant it changes (§9.11).

**Open item, flagged rather than guessed:** DASHBOARD_ARCHITECTURE.md §8's Component Hierarchy diagram does not include Emergency Banner as a node under DashboardShell/MainWorkspace/etc., even though §9.11, §10.3, and §16.6 all treat it as a distinct, independently-prioritized UI element. Its exact mount point in the shell tree is undefined. It's placed under panels/ here as its own feature module (consistent with everything else in §16.6), but wiring it into DashboardShell in a later prompt will need that mount point confirmed — please clarify or point me to where §8 intends it to live.

**Scaffold status:** folder and boundary only. No component logic is implemented yet — that is out of scope for this prompt (see project README.md → "Scaffold Only").
