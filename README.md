# IndusIntel-AI: Agentic AI-Powered Industrial Safety Intelligence

IndusIntel-AI is an **Agentic AI-powered Industrial Safety Intelligence platform** that brings together data from IoT sensors, SCADA systems, permit-to-work logs, CCTV feeds, and shift records into a single predictive layer. Operating as a Multi-Agent System (MAS), it detects compound risk conditions—like the co-occurrence of maintenance activity and hazardous gas accumulation—that no single sensor would flag alone, triggering preemptive interventions before they escalate.

## 🌟 Best Features (Agentic Capabilities)

- **Compound Risk Detection Engine**: A Multi-agent system that correlates gas sensor readings, work permit activity, equipment maintenance status, and shift changeover patterns to identify dangerous combinations (e.g., confined space entry during abnormal process conditions) hours before they become critical.
- **Geospatial Safety Heatmap**: A real-time geospatial layer over the plant layout that visualises risk zones dynamically as conditions change—integrating worker location data, hazardous area classifications, and active permit overlaps to give safety officers situational awareness across the entire facility.
- **Incident Pattern Intelligence**: A RAG-powered agent that cross-references near-miss reports, historical incident data, and OISD/Factory Act regulatory guidance to identify recurring patterns that manual investigations miss—and surfaces them as actionable prevention priorities.
- **Digital Permit Intelligence Agent**: An AI that analyses active permits against real-time plant conditions and flags dangerous simultaneous operations (SIMOPS)—for example, hot work permits issued in proximity to areas with elevated gas readings.
- **Emergency Response Orchestrator**: An autonomous agent that, on confirmed trigger, immediately initiates evacuation protocols, alerts response teams across channels, preserves sensor evidence, and generates a preliminary regulatory-compliant incident report.
- **Quality & Compliance Audit Agent**: An AI layer that continuously monitors safety procedures, inspection records, and statutory compliance documentation against regulatory standards (OISD, DGMS), autonomously generating corrective action workflows.
- **Computer Vision & CCTV Analytics**: Live looping camera feeds with CV pipelines to autonomously detect PPE compliance (helmet, vest, gloves) and unauthorized entry into restricted zones.

## 🏗 System Architecture

The platform operates on a decoupled client-server architecture, enabling high throughput and responsive UI updates.

```mermaid
graph TD
    subgraph Data Sources
        S[IoT Sensors]
        P[Permit System]
        W[Worker Tracking/RFID]
        CV[CCTV / CV Engine]
    end

    subgraph Backend - Agentic Risk Engine
        RE[Multi-Agent Coordinator]
        FE[Fusion Engine]
        AM[Alert Manager]
        RAG[Incident Pattern Agent]
        ERO[Emergency Response Orchestrator]
        SSE[FastAPI SSE Server]
        
        RE -->|"Evaluates State"| FE
        FE -->|"Fuses Evidence"| AM
        AM <-->|"Queries"| RAG
        AM -->|"Prioritizes & Escalates"| ERO
        ERO -->|"Dispatches"| SSE
    end

    subgraph Frontend - Dashboard
        DT[Digital Twin & Heatmap]
        CCTV[CCTV Panel]
        AQ[Alert Queue]
        EC[Evidence Chain]
        
        SSE -->|"Streams Events"| DT
        SSE -->|"Streams Events"| CCTV
        SSE -->|"Streams Events"| AQ
        SSE -->|"Streams Events"| EC
    end

    S --> RE
    P --> RE
    W --> RE
    CV --> RE
```

## 🤖 Multi-Agent Layer

IndusIntel-AI operates as a true **Multi-Agent System**. Individual autonomous agents inspect distinct slices of plant state and report findings into a central coordinator, directly fulfilling the challenge statement's requirements:

1. **Rule-Based Detection Agents (~13 autonomous agents)**
   - **Challenge Statement Mapping:** *Compound Risk Detection Engine*
   - Each subclass in `sensor_rules.py`, `permit_rules.py`, `worker_rules.py`, `cv_rules.py`, and `trend_rules.py` acts as an independent agent. They run concurrently without knowledge of one another, emitting evidence fragments that the `FusionEngine` combines via noisy-OR.
2. **Digital Permit Intelligence Agent**
   - **Challenge Statement Mapping:** *Digital Permit Intelligence Agent*
   - Correlates SIMOPS and detects conflicts (e.g., hot work near gas). This agent orchestrates the permit-specific detection rules into a cohesive summary.
3. **Quality & Compliance Audit Agent**
   - **Challenge Statement Mapping:** *Quality & Compliance Audit Agent*
   - Continuously monitors active permits. If procedural flags (like gas tests or LOTO isolations) are missing, it autonomously surfaces corrective action workflows.
4. **Incident Pattern Intelligence (RAG)**
   - **Challenge Statement Mapping:** *Incident Pattern Intelligence (RAG)*
   - A retrieval agent (`rag.py`) that searches historical near-misses and OISD safety regulations, appending regulatory precedents directly to dashboard alerts.
5. **Emergency Response Orchestrator**
   - **Challenge Statement Mapping:** *Emergency Response Orchestrator*
   - Triggers when CRITICAL compound risks escalate. It packages preserved sensor evidence, references evacuation protocols, and dispatches multi-channel stubs.

## 🔄 Data Flow Diagram

```mermaid
flowchart LR
    A[Telemetry / Data] -->|CSV / Stream| B(Snapshot Producer)
    B --> C{Multi-Agent Coordinator}
    
    subgraph Multi-Agent Layer
        C --> R1[Detection Agents]
        C --> R2[Permit Intelligence Agent]
        C --> R3[Compliance Audit Agent]
    end
    
    R1 -->|Evidence Fragments| D[Fusion Engine]
    D -->|Compound Risk Assessment| E[Alert Manager]
    E <-->|RAG Query| F[Incident Pattern Intelligence]
    E -->|CRITICAL Risk| G[Emergency Response Orchestrator]
    
    R2 --> H
    R3 --> H
    E --> H
    G --> H
    
    H((Agent SSE Stream)) -->|Real-time Events| I[Dashboard Client]
```

## 👥 Use Case Diagram

```mermaid
flowchart LR
    Actor1([Safety Officer])
    Agent1([Emergency Response Orchestrator])
    Agent2([Compliance Audit Agent])
    
    Actor1 --> UC1(Monitor Geospatial Safety Heatmap)
    Actor1 --> UC2(View Compound Risk Alerts)
    Actor1 --> UC3(Review RAG-enriched Incident Patterns)
    Actor1 --> UC5(Monitor CCTV Feeds)
    
    Agent2 --> UC4(Generate Corrective Action Workflows)
    Actor1 --> UC4(Acknowledge Recommendations)
    
    Agent1 --> UC6(Trigger Evacuation & Dispatch Notifications)
    Actor1 --> UC6(Manage Evacuation Protocols)
```

## 🧠 Risk Engine Logic & Risk Score Calculation

The heart of IndusIntel-AI is its **Compound Risk Fusion** engine. Rather than relying on simple threshold alerts (which often lead to alarm fatigue), the engine contextualizes multiple data streams (e.g., elevated gas readings + active hot work permit in the same zone).

### Evidence Generation
Each autonomous detection agent (sensor, permit, trend, worker) independently evaluates the plant state and produces **Evidence Fragments**. Each fragment acts as an immutable unit of risk evidence with a `severity_contribution` ranging from 0.0 to 1.0.

### Risk Score Calculation (Noisy-OR Fusion)
Instead of naive summation, the Fusion Engine uses a **Noisy-OR** probability model to combine severity scores across multiple independent agents. This ensures the score scales sensibly with the number and strength of independent signals, without exceeding 1.0.

1. **Intra-Dimension Fusion**: Evidence is grouped by risk dimension (e.g., Worker, Equipment, Process). The combined score for a dimension is calculated as:  
   `Score = 1.0 - Π (1.0 - severity_i)`
2. **Overall Compound Score**: A weighted Noisy-OR combines dimension scores into an overall severity (0.0 to 1.0).
3. **Severity Bands**:
   - `CRITICAL`: ≥ 0.75
   - `HIGH`: ≥ 0.50
   - `MEDIUM`: ≥ 0.25
   - `LOW`: < 0.25

### Escalation and Alerting
The **Alert Manager** applies cooldowns to prevent noise and statefully escalates unacknowledged `HIGH` alerts to `CRITICAL` after a sustained period. A CRITICAL compound risk immediately triggers the **Emergency Response Orchestrator** to initiate evacuation protocols and dispatch notifications.

## 🚀 Getting Started

1. **Run the Backend (Risk Engine)**
   ```bash
   # Make sure you are in the root directory (ET)
   python -m uvicorn risk_engine.api:app --reload
   ```

2. **Run the Frontend (Dashboard)**
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

3. **View the Dashboard**
   Open your browser to `http://localhost:5173`. The mock risk engine will immediately begin streaming telemetry and incidents.
