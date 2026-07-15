# 08 – RAG (Retrieval-Augmented Generation)

## Purpose

The RAG layer provides **grounded explanations and reports**:

- Answers “why” and “what next” for alerts.
- Generates incident narratives referencing regulations and historical data.
- Supports compliance and audit needs.

## Knowledge Base

Sources (to be ingested as text documents):

- Regulatory:

  - Factory Act safety sections (Indian context).
  - OISD guidelines and standards relevant to gas handling and confined spaces.[web:84]
  - DGMS guidance for accident reporting and safety obligations.

- Incident and near‑miss:

  - Internal `incidents.csv` and near‑miss logs.
  - External case studies (e.g., gas disasters in steel plants, coke‑oven gas incidents).[web:143][web:324]

- Procedures:

  - Confined space entry procedures (O₂, %LEL, toxics testing, ventilation, isolation).[web:321]
  - Hot work procedures (LEL thresholds, isolation, fire watch).[web:323]
  - Gas detector alarm thresholds and default settings.[web:214][web:119]

## Chunking and Metadata

Documents are converted into chunks with metadata:

- `source_type`: regulation, incident, procedure.
- `sector`: coke‑oven, refinery, general industrial.
- `zone/equipment`: where applicable.
- `hazard_type`: gas, fire, confined space, etc.

Chunks are embedded and stored (e.g., in pgvector), indexed for retrieval.

## Retrieval

Given a query (e.g., “Why did we trigger explosion risk in Zone 3?”):

1. Use telemetry and risk context to build a query:

   - Sensors involved, permits, events, zone.

2. Retrieve top‑k chunks relevant to:

   - Gas leak patterns.
   - Confined space rules.
   - Explosion risk thresholds.

3. Provide retrieved evidence to the generator.

## Generation and Citation

The generator:

- Produces explanations and reports referencing retrieved text.
- Includes citations to chunk IDs or document references (e.g., OISD standards, OSHA limits).[web:84][web:214][web:119]

For example:

> “Explosion risk was raised because %LEL exceeded 20% (danger level), hot work was active, and isolation was incomplete, contrary to refinery work‑permit guidance that forbids entry above 5% LEL and demands full isolation before hot work.”[web:214][web:323]

## Hallucination Prevention

Strategies:

- Use **strict retrieval‑based answers** for regulatory and procedural questions.
- Avoid free‑form speculation; limit generation to retrieved evidence and a small set of internal rules.
- For questions where data is missing, respond with explicit “unknown” or “not covered” rather than fabricating content.

The RAG layer is the textual backbone of explainability and compliance.
