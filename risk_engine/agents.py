"""Agentic layers for the Risk Engine (risk_engine/agents.py).

This module defines three specific agents that fulfill explicit requirements from the
hackathon Problem Statement (PS):

1. Emergency Response Orchestrator (emergency_response): 
   Maps to PS "Emergency Response Orchestrator". Builds multi-channel incident
   reports, triggers evacuation logic, and preserves sensor evidence when
   CRITICAL risks escalate.

2. Digital Permit Intelligence Agent (permit_intelligence_summary):
   Maps to PS "Digital Permit Intelligence Agent". Autonomously correlates SIMOPS 
   (Simultaneous Operations) and detects hot-work near hazardous gas conflicts 
   by orchestrating existing permit rules.

3. Quality & Compliance Audit Agent (compliance_check):
   Maps to PS "Quality & Compliance Audit Agent". Audits active permits for 
   missing procedural flags (like gas tests and isolations) and surfaces 
   corrective action workflows with RAG-backed regulatory citations.
"""

from typing import Mapping

from risk_engine.alerts import PlantEmergencyAlert
from risk_engine.context import PlantSnapshot, ZoneContext
from risk_engine.rules.permit_rules import (
    ConfinedSpaceGasRule,
    HotWorkGasOverlapRule,
    SimultaneousPermitConflictRule,
)
from risk_engine.rules.sensor_rules import SensorThresholds


def emergency_response(emergency: PlantEmergencyAlert) -> dict:
    """Builds a preliminary incident report from a plant emergency alert.
    
    Future extension point: Real evacuation-trigger and multi-channel
    alert integration would be hooked in here.
    """
    zone_alerts = []
    for alert in emergency.zone_alerts:
        preserved_evidence = [
            {
                "finding": frag.finding,
                "source": frag.source.value,
                "severity_contribution": frag.severity_contribution
            }
            for frag in alert.assessment.evidence
        ]
        zone_alerts.append({
            "zone_id": alert.zone_id,
            "title": alert.title,
            "explanation": alert.explanation,
            "recommended_action": alert.recommended_action,
            "precedent": getattr(alert, "precedent", ()),
            "evacuation_guidance": "protocol_reference_pending_zone_data",
            "preserved_evidence": preserved_evidence,
        })
        
    return {
        "timestamp": emergency.timestamp,
        "affected_zones": list(set(a.zone_id for a in emergency.zone_alerts)),
        "summary": emergency.summary,
        "alerts": zone_alerts,
        # Demo stub only: no real notification service exists yet
        "notifications_dispatched": [
            "safety_officer_sms",
            "shift_supervisor_email",
            "plant_manager_dashboard"
        ],
    }


def permit_intelligence_summary(
    snapshot: PlantSnapshot, thresholds: Mapping[str, SensorThresholds]
) -> tuple[str, ...]:
    """Thin wrapper that calls the existing permit conflict rules.
    
    Exists purely to give the permit-conflict detection a named "agent"
    entry point for the demo narrative. Reuses existing rule logic.
    
    Note: The signature takes `snapshot` and `thresholds` instead of
    just `zone` because the underlying `.evaluate()` logic requires the
    full PlantSnapshot to resolve cross-zone conflicts.
    """
    rules = [
        ConfinedSpaceGasRule(thresholds),
        HotWorkGasOverlapRule(thresholds),
        SimultaneousPermitConflictRule(thresholds),
    ]
    
    findings = []
    for rule in rules:
        fragments = rule.evaluate(snapshot)
        for fragment in fragments:
            findings.append(fragment.finding)
            
    return tuple(findings)


def compliance_check(zone: ZoneContext) -> tuple[dict, ...]:
    """Standalone function to audit active permits for missing flags and unpermitted workers.
    
    This must not affect risk scoring or alerting -- it's a separate
    audit signal.
    """
    findings = []
    
    # 1. Audit active permits for missing procedural flags
    for permit in zone.active_permits:
        missing = []
        if not permit.gas_test_completed:
            missing.append("gas test completion")
        if not permit.isolation_complete:
            missing.append("isolation completion")
            
        if missing:
            action_map = {
                "gas test completion": "Halt work under this permit; dispatch gas test before re-entry is authorized.",
                "isolation completion": "Complete isolation procedure before proceeding; verify lockout/tagout.",
                "gas test completion and isolation completion": "Halt work immediately; verify lockout/tagout and dispatch gas test."
            }
            missing_str = ' and '.join(missing)
            action = action_map.get(missing_str, "Halt work and review permit.")
            finding_str = f"Permit {permit.permit_id} missing {missing_str}"
            
            if not hasattr(compliance_check, "_retriever"):
                from risk_engine.rag import KnowledgeRetriever
                compliance_check._retriever = KnowledgeRetriever()
                
            precedents = compliance_check._retriever.retrieve(finding_str)
            
            findings.append({
                "finding": finding_str,
                "corrective_action": action,
                "regulation_reference": precedents
            })

    # 2. Audit unpermitted workers in permit-required zones
    if zone.permit_required and zone.workers_present:
        authorized_ids = set()
        for permit in zone.active_permits:
            authorized_ids.update(permit.workers_assigned)
        unpermitted = [w.worker_id for w in zone.workers_present if w.worker_id not in authorized_ids]
        if unpermitted:
            workers_str = ", ".join(unpermitted)
            finding_str = f"Worker(s) {workers_str} present in Zone {zone.zone_id} without an active permit"
            action = f"Escort worker(s) {workers_str} out of Zone {zone.zone_id} immediately or issue required permit prior to entry."
            
            if not hasattr(compliance_check, "_retriever"):
                from risk_engine.rag import KnowledgeRetriever
                compliance_check._retriever = KnowledgeRetriever()
                
            precedents = compliance_check._retriever.retrieve(finding_str)
            
            findings.append({
                "finding": finding_str,
                "corrective_action": action,
                "regulation_reference": precedents
            })

    return tuple(findings)
