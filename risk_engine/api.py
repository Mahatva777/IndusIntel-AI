import asyncio
import json
import uuid
import time
from typing import AsyncGenerator
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from pydantic import BaseModel

from risk_engine.engine import RiskEngine
from risk_engine.models import CompoundRiskAssessment, EvidenceFragment, RiskSeverityBand
from risk_engine.alerts import Alert
import risk_engine.agents as agents

app = FastAPI(title="Risk Engine API")

class NotificationModePayload(BaseModel):
    mode: str

@app.get("/api/notifications/mode")
def get_notification_mode():
    return {"mode": agents._notification_dispatcher.get_mode()}

@app.post("/api/notifications/mode")
def set_notification_mode(payload: NotificationModePayload):
    updated_mode = agents._notification_dispatcher.set_mode(payload.mode)
    return {"mode": updated_mode}

outputs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cv_engine", "outputs"))
if os.path.exists(outputs_path):
    app.mount("/cctv", StaticFiles(directory=outputs_path), name="cctv")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
_DATA_ROOT = Path(__file__).resolve().parent.parent / "data"

def get_engine() -> RiskEngine:
    return RiskEngine.from_config(config_dir=_CONFIG_DIR, data_root=_DATA_ROOT)

def _serialize_fragment(f: EvidenceFragment, incident_id: str, iso_time: str, ev_id: str) -> dict:
    source_name = f.source.name
    source_type = "System"
    if source_name == "TREND_ANALYSIS":
        source_type = "System"
    elif source_name == "SENSOR_THRESHOLD":
        source_type = "Sensor"
    elif source_name == "WORKER_CONTEXT":
        source_type = "Worker"
    elif source_name == "PERMIT_SYSTEM":
        source_type = "Permit"
        
    # Find permitId properly - depending on how data is loaded, maybe it's in supporting_context?
    # Actually, the PERMIT_SYSTEM fragment usually sets equipment_id to the permit_id in this mock setup.
    permit_id = f.equipment_id if source_type == "Permit" else None
    
    return {
        "id": ev_id,
        "incidentId": incident_id,
        "sourceType": source_type,
        "createdAt": iso_time,
        "sensorId": f.sensor_id,
        "workerId": f.worker_id,
        "permitId": permit_id,
        "ruleId": f.rule_id,
        "finding": f.finding,
        "severityContribution": f.severity_contribution
    }

def _serialize_assessment(a: CompoundRiskAssessment, iso_time: str, incident_id: str) -> dict:
    severity_map = {
        RiskSeverityBand.LOW: "Low",
        RiskSeverityBand.MEDIUM: "Medium",
        RiskSeverityBand.HIGH: "High",
        RiskSeverityBand.CRITICAL: "Critical"
    }
    
    worker_ids = sorted(list({f.worker_id for f in a.evidence if f.worker_id}))
    permit_ids = sorted(list({f.equipment_id for f in a.evidence if f.source.name == "PERMIT_SYSTEM" and f.equipment_id}))

    return {
        "id": incident_id,
        "name": f"Compound Risk - Zone {a.zone_id}",
        "severity": severity_map.get(a.severity_band, "Normal"),
        "status": "Active",
        "zoneId": str(a.zone_id) if a.zone_id else "plant",
        "createdAt": iso_time,
        "riskScore": int(a.overall_severity * 100),
        "confidenceScore": int(a.confidence * 100),
        "escalationLevel": "None",
        "acknowledgedBy": None,
        "resolvedAt": None,
        "workerIds": worker_ids,
        "permitIds": permit_ids,
        "evidenceIds": [],
        "recommendationIds": []
    }

@app.get("/api/scenario/{scenario_id}/run")
def run_scenario(scenario_id: str):
    engine = get_engine()
    alerts = engine.run(scenario_id)
    return {"status": "ok", "alerts_count": len(alerts)}

@app.get("/api/scenario/{scenario_id}/stream")
async def stream_scenario(scenario_id: str):
    engine = get_engine()
    sequence_ids = {}
    
    def envelope(service: str, entityType: str, op: str, payload: dict, ts: str) -> dict:
        seq = sequence_ids.get(service, 0) + 1
        sequence_ids[service] = seq
        return {
            "eventId": str(uuid.uuid4()),
            "sequenceId": seq,
            "timestamp": ts,
            "serviceVersion": "1.0.0",
            "service": service,
            "entityType": entityType,
            "operation": op,
            "payload": payload
        }

    async def event_generator() -> AsyncGenerator[str, None]:
        emitted_incidents = set()
        emitted_evidence = set()
        emitted_workers = set()
        emitted_permits = set()
        
        # Reset notification cooldowns when scenario stream restarts
        agents._notification_dispatcher.reset_cooldown()
        
        # The frontend ConnectionManager takes a few microtasks to transition
        # from Connecting -> Authenticating -> Synchronizing -> Live after onopen.
        # Delaying the first tick ensures no events are dropped.
        await asyncio.sleep(1.0)
        
        for snapshot, alerts in engine.stream(scenario_id):
            await asyncio.sleep(0.5) # Tick pace
            
            iso_time = f"2024-01-01T00:{int(snapshot.timestamp // 60):02d}:{int(snapshot.timestamp % 60):02d}Z"
            # Zone mapping for frontend compatibility
            def map_zone(zid: str) -> str:
                if zid == "1": return "zone-furnace-bay"
                if zid == "2": return "zone-loading-dock"
                if zid == "3": return "zone-compressor-room"
                if zid == "4": return "zone-valve-gallery"
                return zid
                
            from risk_engine.engine import _build_sensor_thresholds
            thresholds = _build_sensor_thresholds(engine._config_loader)
            
            # Emit Emergency Report (Agent)
            if engine.emergency_history and engine.emergency_history[-1].timestamp == snapshot.timestamp:
                emergency = engine.emergency_history[-1]
                report = agents.emergency_response(emergency)
                agent_msg = envelope("Agent", "EmergencyReport", "create", report, iso_time)
                yield f"data: {json.dumps(agent_msg)}\n\n"
            
            # Emit Telemetry
            for reading in snapshot.sensor_readings.values():
                severity = "Normal"
                cfg = thresholds.get(reading.sensor_id)
                
                if cfg:
                    # Normal is innermost. If within normal bounds, it is safe.
                    if cfg.normal_min <= reading.value <= cfg.normal_max:
                        severity = "Normal"
                    else:
                        # Outside normal. Check if it breached the upper bounds.
                        if reading.value > cfg.normal_max:
                            if cfg.warning_max >= cfg.normal_max and reading.value <= cfg.warning_max:
                                severity = "High"
                            else:
                                severity = "Critical"
                        # Or check if it breached the lower bounds.
                        elif reading.value < cfg.normal_min:
                            if cfg.warning_min <= cfg.normal_min and reading.value >= cfg.warning_min:
                                severity = "High"
                            else:
                                severity = "Critical"
                else:
                    # Fallback to simulation quality if threshold missing
                    if reading.quality.value == "CRIT":
                        severity = "Critical"
                    elif reading.quality.value == "WARN":
                        severity = "High"
                    elif reading.quality.value == "FAULT":
                        severity = "Informational"

                payload = {
                    "sensorId": reading.sensor_id,
                    "zoneId": map_zone(str(reading.zone_id)),
                    "equipmentId": "unknown",
                    "value": reading.value,
                    "timestamp": iso_time,
                    "severity": severity
                }
                msg = envelope("Telemetry", "TelemetryReading", "create", payload, iso_time)
                yield f"data: {json.dumps(msg)}\n\n"
            
            # Emit Incidents and Evidence
            for zone_id, a in engine.latest_assessments.items():
                if a.severity_band == RiskSeverityBand.LOW:
                    continue
                    
                incident_id = f"inc-{a.zone_id}"
                inc_payload = _serialize_assessment(a, iso_time, incident_id)
                inc_payload["zoneId"] = map_zone(inc_payload["zoneId"])
                
                op = "update" if incident_id in emitted_incidents else "create"
                emitted_incidents.add(incident_id)
                
                msg = envelope("Incident", "Incident", op, inc_payload, iso_time)
                yield f"data: {json.dumps(msg)}\n\n"
                
                for f in a.evidence:
                    import hashlib
                    # Use a stable suffix based on entities involved, NOT the finding text.
                    # This way if the finding text updates (e.g. 10s -> 11s), it updates the existing evidence.
                    stable_suffix = f"{f.rule_id}-{f.sensor_id}-{f.worker_id}-{f.equipment_id}"
                    ev_hash = hashlib.md5(stable_suffix.encode()).hexdigest()[:8]
                    ev_id = f"ev-{incident_id}-{ev_hash}"
                    
                    op = "update" if ev_id in emitted_evidence else "create"
                    emitted_evidence.add(ev_id)
                    ev_payload = _serialize_fragment(f, incident_id, iso_time, ev_id)
                    ev_msg = envelope("Incident", "Evidence", op, ev_payload, iso_time)
                    yield f"data: {json.dumps(ev_msg)}\n\n"
                        
            # Emit Recommendations
            for alert in alerts:
                incident_id = f"inc-{alert.assessment.zone_id}"
                rec_payload = {
                    "id": f"rec-{uuid.uuid4().hex[:8]}",
                    "incidentId": incident_id,
                    "content": alert.recommended_action,
                    "createdAt": iso_time,
                    "acknowledged": False,
                    "precedent": alert.precedent
                }
                rec_msg = envelope("Incident", "Recommendation", "create", rec_payload, iso_time)
                yield f"data: {json.dumps(rec_msg)}\n\n"
                
            # Emit Workers and Permits
            for zone_context in snapshot.zones.values():
                # Workers
                for worker in zone_context.workers_present:
                    worker_id = worker.worker_id
                    worker_op = "update" if worker_id in emitted_workers else "create"
                    emitted_workers.add(worker_id)
                    worker_payload = {
                        "id": worker_id,
                        "zoneId": map_zone(zone_context.zone_id),
                        "status": "Active",
                        "position": None,
                        "permitId": None
                    }
                    w_msg = envelope("Worker", "Worker", worker_op, worker_payload, iso_time)
                    yield f"data: {json.dumps(w_msg)}\n\n"
                
                # Permits
                for permit in zone_context.active_permits:
                    permit_id = permit.permit_id
                    permit_op = "update" if permit_id in emitted_permits else "create"
                    emitted_permits.add(permit_id)
                    
                    status_mapping = {
                        "ACTIVE": "Active",
                        "SUSPENDED": "Suspended",
                        "RESUMED": "Resumed",
                        "CLOSED": "Closed",
                    }
                    p_status = status_mapping.get(permit.status.upper(), "Active")
                    
                    permit_payload = {
                        "id": permit_id,
                        "status": p_status,
                        "workerId": permit.workers_assigned[0] if permit.workers_assigned else "unknown",
                        "equipmentId": permit.equipment_id,
                        "zoneId": map_zone(zone_context.zone_id),
                        "type": permit.permit_type,
                    }
                    p_msg = envelope("Permit", "Permit", permit_op, permit_payload, iso_time)
                    yield f"data: {json.dumps(p_msg)}\n\n"
                
                # Compliance Agent check
                compliance_findings = agents.compliance_check(zone_context)
                if compliance_findings:
                    # Deterministic ID based on zone so it overwrites in UI instead of spamming
                    base_id = f"comp-{zone_context.zone_id}"
                    comp_payload = {
                        "id": base_id,
                        "zoneId": map_zone(zone_context.zone_id),
                        "findings": list(compliance_findings),
                        "timestamp": iso_time
                    }
                    comp_msg = envelope("Agent", "ComplianceFinding", "create", comp_payload, iso_time)
                    yield f"data: {json.dumps(comp_msg)}\n\n"
                    
                    inc_payload = {
                        "id": f"inc-{base_id}",
                        "name": "Permit Breach Detected",
                        "severity": "Low",
                        "status": "Active",
                        "zoneId": map_zone(zone_context.zone_id),
                        "createdAt": iso_time,
                        "riskScore": 15,
                        "confidenceScore": 100,
                        "escalationLevel": "None",
                        "acknowledgedBy": None,
                        "resolvedAt": None,
                        "workerIds": [],
                        "permitIds": [],
                        "evidenceIds": [],
                        "recommendationIds": []
                    }
                    inc_msg = envelope("Incident", "Incident", "create", inc_payload, iso_time)
                    yield f"data: {json.dumps(inc_msg)}\n\n"
                
        # Send end signal
        yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("risk_engine.api:app", host="0.0.0.0", port=8000, reload=True)
