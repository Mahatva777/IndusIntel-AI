# API — Write (Operator Write Path)

**Spec references:** §6 Operator Write Path (§6.1–6.12), §6.3 Operator Action Matrix

One module per operator action in the §6.3 Action Matrix: Acknowledge Alert, Escalate Incident, Silence Alert, Open Incident, Close Incident, Suspend Permit, Resume Permit, Dispatch Response, Worker Notes. Every write follows the lifecycle in §6.10 (UI Validation → Permission Check → Backend Validation → Execute → Audit Log → State Update → UI Refresh) and never resolves conflicts locally (§6.12) — the backend is the sole arbiter. Safety-critical actions use pessimistic updates only (§6.2).

**Scaffold status:** folder and boundary only. No store, service, or component logic is implemented yet — that is out of scope for this prompt (see project README.md → "Scaffold Only").
