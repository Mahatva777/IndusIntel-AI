# 10 – Demo Script

## Purpose

This script describes a second‑by‑second demo of the platform during a **Gas Leak During Confined Space Entry** scenario.

## Scenario Overview

Scenario: `SCN_GAS_LEAK_CONF_SPACE`

- Zones: 3 (Basement Valve Gallery), 4 (Tar Area).
- Permits: Confined space permit P001.
- Events timeline: `EV_NORMAL_PRODUCTION@0-18;EV_GAS_LEAK_MINOR@18-28;EV_GAS_LEAK_MAJOR@28-50;EV_EMERGENCY_SHUTDOWN@50-60`.[code_file:319]

## Timeline

### 0–18 s – Normal Production

- Dashboard:

  - Heatmap green in all zones.
  - Digital twin shows workers and permits, but risk cards are low.

- Telemetry:

  - Gas sensors within normal ranges.
  - Pressure, temperature, level stable.

- Risk Engine:

  - Detects no anomalies; all risk scores are low.

### 18–28 s – Minor Gas Leak

- Telemetry:

  - H₂S and CO sensors in Zone 3 start rising slowly (minor leak behaviour).[file:290][code_file:318]
  - O₂ gradually falls toward warning range.

- Dashboard:

  - Zone 3 shifts to yellow.
  - Sensor cards for `Z3_H2S_01`, `Z3_CO_01`, `Z3_O2_01` show rising trends.

- Risk Engine:

  - Raises a early warning alert: “Minor gas leak in basement valve gallery.”
  - Risk score increases, but no emergency.

### 28–40 s – Major Gas Leak, Confined Space Entry

- Telemetry:

  - Gas sensors cross warning/critical thresholds; %LEL approaches danger limits.[web:214][web:119]
  - O₂ drops below confined space acceptable limits.

- Dashboard:

  - Zone 3 turns orange, then red.
  - Confined space permit P001 is active; worker W003 is present in Zone 3.

- Risk Engine:

  - Detects compound risk: gas leak + confined space entry + worker presence.
  - Raises “Gas Leak During Confined Space Entry” alert.
  - Emergency banner appears: “Evacuate Zone 3, SCBA only, isolate gas.”

### 40–50 s – Escalation and Emergency Shutdown

- Telemetry:

  - Gas trends continue; emergency shutdown event begins.
  - Flow and pressure signals show controlled ramp‑down.

- Dashboard:

  - Heatmap shows Zone 3 and 4 red; other zones yellow.
  - Worker panel shows evacuation progress.

- Risk Engine:

  - Triggers emergency shutdown scenario: closing valves, stopping pumps, reducing flows.
  - Suggests muster points and evacuation routes using digital twin.

### 50–60 s – Stabilization

- Telemetry:

  - Gas values begin to stabilize or fall (recovery behaviour).
  - O₂ climbs back toward normal range.

- Dashboard:

  - Heatmap gradually shifts orange → yellow → green.
  - Emergency banner transitions to “Incident Stabilized; Investigation Mode.”

- Risk Engine:

  - Logs the incident.
  - Calls RAG to generate an incident report referencing relevant OISD and confined space rules.[web:84][web:321]

## Judge Experience

Judges see:

- Live digital twin and heatmap showing evolving risk.
- CCTV feeds with CV overlays.
- Sensor and permit panels updating in real time.
- Alerts with clear explanations and recommended actions.
- RAG‑generated incident narrative and regulatory references.

This script can be used to guide the demo step‑by‑step.
