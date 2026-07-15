# 05 – Risk Engine

## Purpose

The Risk Engine is the core of the Industrial Intelligence Layer. It transforms telemetry, context and CV events into **compound‑risk assessments**, alerts, and recommendations.

## Inputs

- `telemetry.csv` – sensor values, quality, `simulation_state`, `event_id`.[file:289]
- Config:

  - `zones.csv` – hazard types, PPE, permit requirements.[output/zones.csv]
  - `equipment.csv` – criticality, sensor groups.[output/equipment.csv]
  - `sensors.csv` – thresholds, physical limits, behaviour hints.[file:290]
  - `permits.csv`, `workers.csv`, `maintenance.csv`, `shifts.csv`, `incidents.csv`.
- CV events from CV Engine:

  - PPE violations.
  - Smoke/fire detections.
  - Zone occupancy/worker tracking.
  - Unauthorized entries.

- RAG knowledge:

  - Regulatory references (OISD, DGMS, Factory Act).
  - Historical incidents and near‑misses.

## Compound Risk Detection

The engine explicitly models **compound configurations**, such as:

- Elevated gas readings + confined space entry + poor ventilation.[web:321][web:214]
- Elevated %LEL + hot work permit + inadequate isolation or gas tests.[web:323][web:114]
- High coke temperature + degraded quench water + smoke detector spikes.[web:254]
- Worker collapse in hazardous zone + gas abnormality + PPE violation.

### Rule Layers

1. **Sensor rules**:

   - Evaluate each sensor’s value against warning/critical thresholds.
   - Consider rate of change and physical plausibility.

2. **Permit rules**:

   - Inspect active permits per zone/equipment.
   - Confined space permits require continuous gas monitoring; any anomaly increases risk.
   - Hot work permits in zones with high %LEL or flammable vapours trigger explosion risk rules.

3. **Maintenance rules**:

   - Ongoing maintenance tasks raise baseline risk.
   - Maintenance in high‑risk zones (valve gallery, tar extractor) interacting with abnormal telemetry triggers specific checks.

4. **Worker rules**:

   - Worker presence in hazardous zones is matched to PPE levels and permit coverage.
   - Unauthorized presence or PPE violations increase risk.

5. **CV rules**:

   - PPE violation events: worker present without required PPE.
   - Smoke/fire detection events.
   - Zone occupancy events indicating crowding or unexpected presence.

### Fusion Logic

Sensor fusion:

- Combine gas readings (CO, H₂S, NH₃, LEL, O₂) per zone to compute gas hazard scores.
- Combine thermal, pressure, level, and flow data to detect abnormal process states.

Permit fusion:

- Map permit types (confined space, hot work, maintenance) to zones and equipment.
- For each zone, compute permit‑risk modifiers.

Maintenance fusion:

- Use maintenance tasks and priorities to affect process risk weighting.

Worker fusion:

- Combine worker locations, PPE levels, and permit coverage.

CV fusion:

- Overlay CV events onto zone states (PPE, occupancy, smoke/fire).

Compound rules:

- If:

  - Gas score > threshold AND
  - Confined space permit active AND
  - Worker present in zone

  THEN raise “Gas Leak During Confined Space Entry” risk.

- If:

  - %LEL in warning/danger bands AND
  - Hot work permit active in zone AND
  - Isolation not confirmed

  THEN raise “Explosion Risk” and escalate.

## Risk Scoring

Risk score per zone/equipment/worker:

- Base score from sensor anomalies:

  - Weighted by severity and number of sensors.
- Modifiers from permits and maintenance:

  - Confined space/hot work add multipliers when anomalies exist.
- Modifiers from workers and CV:

  - Violations and presence in high‑risk zones boost scores.

Scores can be expressed on 0–100 scale and mapped to:

- Green (low risk)
- Yellow (moderate)
- Orange (high)
- Red (critical)

Aligned with event metadata colours and dashboard heatmap colours.[code_file:317]

## Alert Generation and Escalation

Alerts:

- Structured objects containing:

  - Risk type (gas leak, explosion risk, fire, worker collapse).
  - Affected zones and equipment.
  - Contributing sensors, permits, workers, CV events.
  - Risk score and severity.

Escalation:

- Rules define:

  - When to notify supervisors/safety officers.
  - When to initiate emergency shutdown scenarios.
  - When to escalate to agents (WhatsApp, calls, reports).

Risk escalation path example:

- Minor gas leak → monitor and log.
- Major gas leak + confined space entry + worker present → immediate evacuation and emergency shutdown.

## Future ML Possibilities

Beyond rules:

- Train models on simulated and real telemetry to predict:

  - Probability of incident given current telemetry and context.
  - Expected time to threshold breach.

- Use anomaly detection on multi‑sensor time‑series.
- Learn typical patterns leading to incidents from `incidents.csv` and near‑miss data, improving early detection.[web:324]

The Risk Engine is designed to be rule‑driven initially, with clear pathways for ML integration.
