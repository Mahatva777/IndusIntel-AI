# 00 – Project Context

## Vision

This repository implements an **Industrial Safety Intelligence Layer** for a high‑risk coke‑oven and by‑product plant, inspired by the ET AI Hackathon problem statement on “AI‑Powered Industrial Safety Intelligence for Zero‑Harm Operations.”[web:324][web:322] It is not a single CCTV analytics project, a one‑off gas alarm system, or a basic SCADA dashboard. Instead, it is a **unified intelligence layer** that fuses:

- IoT gas detectors and environmental sensors
- SCADA/PLC process tags and historians
- Digital permit‑to‑work and maintenance records
- Worker location, PPE information, and shift logs
- CCTV / Computer Vision event streams
- Historical incidents and regulatory guidance (OISD, DGMS, Factory Act)

into a single, explainable risk picture for safety officers, operators, and autonomous agents.[web:321][web:114]

The core philosophy is: **data exists, but intelligence is missing**. This platform exists to close that gap.

## Hackathon Problem Context

The ET AI Hackathon highlights a recurring failure pattern in Indian heavy industry:

- Plants have gas detectors, SCADA systems, CCTV, permits, and documented procedures.[web:114]
- Serious incidents still occur, often with fatal outcomes.
- Post‑incident analyses show relevant sensor warnings, near‑miss reports, and permit information were present, but never fused into a timely, actionable decision.[web:324][web:321]

Typical failure modes include:

- Gas alarms acknowledged locally but not correlated with ongoing confined space work.[web:321]
- Hot work permits issued in zones where flammable gas readings are elevated.[web:214][web:323]
- CCTV capturing PPE violations or unauthorized entries without automated linkage to risk.
- SCADA showing abnormal pressure or flow patterns with no connection to safety workflows.

The problem is **not** the absence of technology – it is the absence of a unified intelligence layer bridging these systems.

## Why Current Safety Systems Are Insufficient

### Siloed instrumentation

Modern plants typically have:

- Gas detectors with default alarm thresholds (e.g., 10% LEL “warning”, 20% LEL “danger”; 25/50 ppm CO; 5/10 ppm H₂S).[web:214][web:119]
- SCADA/PLC monitoring pressures, levels, flows, valve states, and equipment status.[web:114]
- CCTV systems focused on recording, sometimes with basic analytics.
- Permit‑to‑work systems for confined space, hot work, isolation, etc.[web:321][web:323]

These systems are **siloed**:

- Gas alarms may trigger locally or in SCADA, but are rarely cross‑referenced with active permits and worker location in real time.
- CCTV analytics are disconnected from permit data and risk models.
- Historians store extensive time‑series, but safety decisions are often based on a few dashboard widgets.

### Manual correlation under pressure

Safety officers, supervisors, and operators are expected to manually correlate:

- Gas trends (ppm, %LEL, O₂ levels),
- Equipment states (pumps, valves, dampers),
- Permits (confined space, hot work, isolation),
- Worker movements, PPE levels, and shift changes,

often **while an event is evolving**. Coke‑oven gas and blast‑furnace gas hazard studies show that significant harm can occur within tens of seconds to a few minutes in enclosed or poorly ventilated areas.[web:143][web:114]

Human cognition alone cannot reliably detect the complex patterns that precede major incidents.

### No explicit compound‑risk modeling

Most tools treat each sensor or system independently:

- A gas detector raises an alarm based on ppm or %LEL.
- A permit system tracks approvals and expiries.
- A CCTV system flags PPE violations.

None of them explicitly model **compound risk conditions**, such as:

- Elevated gas levels + active confined space permit + poor ventilation.
- Elevated %LEL + hot work + insufficient isolation.
- High coke temperature + degraded quench water + smoke detector spikes.

This is where most severe incidents originate: **several weak signals combining into a critical configuration.**[web:324]

### Limited geospatial awareness

Traditional HMI/SCADA screens are tag‑centric, not spatial:

- They show trends and numerical values, but not **where** risks are emerging.
- They do not visualize worker movement, permit overlap, and hazard zones on a plant map.[web:325]

Without geospatial awareness:

- Evacuation routes and muster points are hard to reason about under stress.
- It is difficult to see how risks propagate across levels and areas (e.g., basement galleries vs battery top).

## Why Digital Twins and Predictive Intelligence

Digital twins combine real‑time IoT data, AI analysis, and spatial models to provide a living representation of the plant.[web:322][web:326]

For safety:

- They detect hazards in real time and show them **in context** – where they occur and who is affected.[web:322]
- They support virtual drills and emergency planning, optimizing evacuation routes and response times.[web:322]
- They provide a shared source of truth for layouts, controls, and past events.[web:326]

Predictive intelligence goes further:

- Recognizes early gas accumulation, pressure drift, or water‑quality degradation **before** thresholds are breached.[web:214][web:119]
- Learns from incident and near‑miss data to flag similar precursors.
- Anticipates compound configurations and recommends pre‑emptive actions.

This project adopts digital twins and predictive intelligence as foundational concepts.

## Solution Philosophy – The Industrial Intelligence Layer

We explicitly distinguish this project from generic CCTV analytics:

> **We are NOT building another CCTV analytics tool. We are building an Industrial Intelligence Layer.**

### Core elements

1. **Plant digital twin** – Zones, equipment, sensors, workers, permits, cameras, hazards, and evacuation routes are modeled as data entities and spatial layers.

2. **Multi‑modal ingestion** – The platform ingests:

   - Telemetry from gas detectors, temperature sensors, pressure transmitters, flow/level instruments.
   - SCADA/PLC tag streams and equipment status.
   - Permit‑to‑work records (confined space, hot work, isolation).
   - Maintenance work orders and inspection data.
   - Worker and PPE data, plus CV outputs (PPE detection, zone occupancy, smoke/fire).
   - Historical incidents, near‑miss reports, and regulatory texts (OISD, DGMS, Factory Act).[web:84][web:224]

3. **Simulation engine** – A modular simulator generates realistic telemetry based on plant configuration, events, and behaviour profiles, so the platform can be tested and demonstrated without live plant access.

4. **Risk Engine** – A compound‑risk engine fuses signals across modalities, computes risk scores, explains decisions, and emphasizes false‑negative reduction (the metric that saves lives).

5. **Geospatial dashboard** – A digital‑twin UI showing zones, workers, permits, sensors, and CCTV overlays, augmented with heatmaps and timelines.

6. **CV integration** – Computer Vision becomes another source of events (PPE violation, smoke, fire, unauthorized entry) feeding into risk computation.

7. **RAG and knowledge layer** – Retrieval‑augmented generation over incident reports, near‑miss data, and regulations so the system can justify recommendations and generate compliant incident narratives.

8. **Agents and orchestration** – Future WhatsApp/SMS/call/report/compliance agents operate on top of the risk engine and telemetry, coordinating response and documentation.

## What Success Looks Like

A successful implementation:

- Demonstrates an end‑to‑end **Gas Leak During Confined Space Entry** scenario:

  - The simulator produces realistic second‑by‑second telemetry.
  - The risk engine detects the emerging leak and correlates it with active confined space permits.[web:321]
  - The dashboard highlights basement zones and affected workers on the digital twin.
  - Agents propose and (in future) trigger evacuation, isolation, and notifications.

- Shows **explainable compound‑risk detection**:

  - Risk cards describe which sensors, permits, workers, and events contributed to the current risk score.
  - The system can answer “why did you raise this alert?” citing telemetry and knowledge base entries.

- Provides a foundation for **commercial evolution**:

  - Modular configuration for multiple plants.
  - Clean API for integration with SCADA, historians, EHS, and CMMS.
  - Clear separation between simulation, risk logic, UI, CV, and agents.

## Long‑Term Vision – From Hackathon to Product

Over time, this prototype can evolve into a commercial SaaS platform:

- **Multi‑plant, multi‑tenant** support with per‑plant digital twins and safety baselines.[web:326]
- **Live data ingestion** via MQTT, OPC‑UA, Kafka, Azure/AWS IoT, talking to real SCADA and PLCs.[web:324]
- **Edge AI** deployments near cameras and PLCs for low‑latency CV and local risk assessment.[web:324]
- **Compliance and audit tooling** for OISD, DGMS, and Factory Act, generating audit‑ready reports.[web:84][web:224]
- **Analytics and dashboards** providing injury/near‑miss metrics, leading indicators, and trend analysis for management.

Contributors are building more than a demo: they are helping define a reference architecture for **AI‑powered industrial safety intelligence** that can be adopted, extended, and hardened across real facilities.

This document is the vision anchor. Every change to the repository should preserve the central idea: **a digital‑twin‑centric Industrial Intelligence Layer that fuses all safety‑relevant data into actionable, predictive insight.**