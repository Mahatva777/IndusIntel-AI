# API — Read

**Spec references:** §3 Dashboard API Specification (§3.1–3.9), §3.2 Service Contract Matrix

Request/response and poll-based read clients for services that are not purely streamed: Health (poll, §3.2), Digital Twin (poll+event, §3.2), Historical Playback (request, user-driven, §3.2), and initial-load reads for any streaming service before its WebSocket connection takes over (§4.2 Connection Lifecycle). One client module per service, named after the Service Contract Matrix row (§3.2).

**Scaffold status:** folder and boundary only. No store, service, or component logic is implemented yet — that is out of scope for this prompt (see project README.md → "Scaffold Only").
