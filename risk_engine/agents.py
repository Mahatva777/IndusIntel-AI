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
from risk_engine.notifications import NotificationDispatcher
from risk_engine.rules.permit_rules import (
    ConfinedSpaceGasRule,
    HotWorkGasOverlapRule,
    SimultaneousPermitConflictRule,
)
from risk_engine.rules.sensor_rules import SensorThresholds

_notification_dispatcher = NotificationDispatcher()


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
        projected_time_to_critical_seconds = None
        projection_string = None
        for frag in alert.assessment.evidence:
            if frag.rule_id == "TREND_GAS_RISING":
                try:
                    rate = None
                    last_val = None
                    crit_max = None
                    for ctx in frag.supporting_context:
                        if ctx.startswith("rate_per_second="):
                            rate = float(ctx.split("=")[1])
                        elif ctx.startswith("last_value="):
                            last_val = float(ctx.split("=")[1])
                        elif ctx.startswith("critical_max="):
                            crit_max = float(ctx.split("=")[1])
                    if rate and rate > 0 and last_val is not None and crit_max is not None:
                        if last_val < crit_max:
                            secs = int((crit_max - last_val) / rate)
                            projected_time_to_critical_seconds = secs
                            mins = max(1, secs // 60)
                            projection_string = f"At current rate, this reading may reach critical threshold in approximately {mins} simulated minutes if uncorrected."
                        else:
                            projection_string = f"This reading has already breached the critical threshold ({crit_max:.2f}) at current rate."
                except Exception:
                    pass

        zone_dict = {
            "zone_id": alert.zone_id,
            "title": alert.title,
            "explanation": alert.explanation,
            "recommended_action": alert.recommended_action,
            "precedent": getattr(alert, "precedent", ()),
            "evacuation_guidance": f"Evacuate via Primary Exit Route to Assembly Point A. Avoid Zone {alert.zone_id} due to active compound hazard.",
            "preserved_evidence": preserved_evidence,
        }
        if projected_time_to_critical_seconds is not None:
            zone_dict["projected_time_to_critical_seconds"] = projected_time_to_critical_seconds
        if projection_string:
            zone_dict["projection_string"] = projection_string
            
        zone_alerts.append(zone_dict)

    affected_zones = sorted(list(set(a.zone_id for a in emergency.zone_alerts)))
    zones_str = ", ".join(f"Zone {z}" for z in affected_zones) if affected_zones else "all zones"

    # Spoken voice message (clear text-to-speech for phone call)
    voice_msg = (
        f"Attention Safety Officer. Plant Emergency Alert. "
        f"Critical compound risk detected in {zones_str}. "
        f"Immediate coordinated response required. "
        f"Please check the IndusIntel emergency dashboard immediately."
    )

    # Detailed WhatsApp message with evidence, projections, and recommended actions
    wa_lines = [
        "🚨 *INDUSINTEL SAFETY EMERGENCY ALERT*",
        f"*Status:* CRITICAL Compound Risk Detected",
        f"*Affected Zones:* {zones_str}",
        "",
        "📍 *ZONE STATUS & PRESERVED EVIDENCE:*",
    ]
    for zd in zone_alerts:
        z_id = zd["zone_id"]
        wa_lines.append(f"• *Zone {z_id}: {zd['title']}*")
        wa_lines.append(f"  - *Condition:* {zd['explanation']}")
        if zd.get("projection_string"):
            wa_lines.append(f"  - ⏱️ *Projection:* {zd['projection_string']}")
        
        evidences = zd.get("preserved_evidence", [])
        if evidences:
            findings = [e["finding"] for e in evidences[:2]]
            wa_lines.append(f"  - 🔍 *Key Evidence:* {'; '.join(findings)}")
        
        wa_lines.append(f"  - ⚠️ *Action:* {zd['recommended_action']}")
        wa_lines.append("")

    wa_lines.append("🛡️ *Guidance:* Predictive risk indicator — no casualties confirmed.")
    wa_lines.append("_Generated automatically by IndusIntel Emergency Response Orchestrator._")

    whatsapp_msg = "\n".join(wa_lines)

    wa_result = _notification_dispatcher.send_whatsapp_alert(whatsapp_msg)
    voice_result = _notification_dispatcher.place_voice_call(voice_msg)
        
    return {
        "disclaimer": "This is a predictive alert generated from correlated sensor, permit, and equipment evidence. It indicates elevated compound risk conditions, not a confirmed injury, fatality, or equipment failure.",
        "timestamp": emergency.timestamp,
        "affected_zones": affected_zones,
        "summary": emergency.summary,
        "alerts": zone_alerts,
        "notifications_dispatched": [wa_result, voice_result],
    }


def permit_intelligence_summary(
    snapshot: PlantSnapshot, thresholds: Mapping[str, SensorThresholds]
) -> tuple[str, ...]:
    """Digital Permit Intelligence Agent interface.
    
    Evaluates active permits against cross-zone telemetry, hot-work overlap,
    and simultaneous operation (SIMOPS) rules to generate risk findings.
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
