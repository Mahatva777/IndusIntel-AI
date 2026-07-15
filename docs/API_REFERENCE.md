# 12 – API Reference (Planned)

## Purpose

This document defines the API surface for the platform. It is aspirational but should guide implementation.

## Telemetry API

### GET /api/telemetry

- **Purpose:** Retrieve telemetry rows.
- **Query params:**
  - `sensor_id` (optional)
  - `zone_id` (optional)
  - `from` / `to` (ISO timestamps)
- **Response:**
  - Array of `{timestamp, zone_id, sensor_id, value, quality, simulation_state, event_id}`.

## Risk API

### GET /api/risk/zones

- **Purpose:** Get risk scores per zone.
- **Response:**
  - Array of `{zone_id, risk_score, severity, reasons}`.

### GET /api/risk/equipment

- **Purpose:** Risk per equipment.
- **Response:**
  - `{equipment_id, risk_score, severity, reasons}`.

### GET /api/risk/alerts

- **Purpose:** Active alerts.
- **Response:**
  - Array of alert objects `{alert_id, type, severity, zone_id, equipment_id, worker_ids, message}`.

## Config API

### GET /api/config/zones

### GET /api/config/equipment

### GET /api/config/sensors

- Used by dashboard, simulator, and external tools.

## CV Events API

### POST /api/cv/events

- **Purpose:** Ingest CV events.
- **Body:**
  - `{event_type, zone_id, worker_id, timestamp, severity, metadata}`.

## RAG API

### POST /api/rag/query

- **Purpose:** Ask “why” or “what next” questions.
- **Body:**
  - `{question, context}`.
- **Response:**
  - `{answer, citations}`.

## Agents API

### POST /api/agents/notify

- **Purpose:** Trigger notification agent.
- **Body:**
  - `{alert_id, channels}`.

### POST /api/agents/report/daily

- **Purpose:** Generate daily report.

## Future Extensions

- Webhooks for external systems (EHS, CMMS, permit systems).
- Authentication/authorization, multi‑tenant support.
- Streaming APIs for telemetry and alerts.
