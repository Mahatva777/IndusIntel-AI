"""Alert generation for the Risk Engine (risk_engine/alerts.py).

The output boundary of the Risk Engine: takes CompoundRiskAssessments
from fusion.py and decides which become Alerts, at what priority, and
in what shape a dashboard/notification layer can consume directly.

Fusion decides "how risky is this zone right now" as a continuous,
stateless score. This module adds the two things fusion deliberately
does NOT do, both of which require memory across snapshots:
  - noise control (cooldown dedup) so a sustained CRITICAL condition
    produces one alert, not one per 0.5s timestep
  - escalation (sustained-HIGH -> CRITICAL) so an unacknowledged
    warning that lingers becomes an emergency on its own, without
    requiring the underlying severity score to climb any further

AlertManager is therefore intentionally stateful (per-zone cooldown
clocks, per-zone HIGH-since timestamps, per-zone acknowledgment flags)
-- unlike every Rule and unlike FusionEngine, which are pure. That
statefulness is confined entirely to this module; CompoundRiskAssessment
and Alert themselves remain immutable value objects.
"""

from dataclasses import dataclass, field
from typing import Optional, Sequence

from risk_engine.models import CompoundRiskAssessment, RiskSeverityBand

_DEFAULT_COOLDOWN_SECONDS = 10.0
_DEFAULT_HIGH_ESCALATION_SECONDS = 20.0

# Ordering for band comparisons; RiskSeverityBand itself carries no order.
_BAND_ORDER: dict[RiskSeverityBand, int] = {
    RiskSeverityBand.LOW: 0,
    RiskSeverityBand.MEDIUM: 1,
    RiskSeverityBand.HIGH: 2,
    RiskSeverityBand.CRITICAL: 3,
}

# Stripped from rule_id before title-casing, so "PERMIT_CONFINED_SPACE_GAS"
# reads as "Confined Space Gas" on a dashboard instead of the raw rule_id.
_RULE_ID_PREFIXES = ("SENSOR_", "PERMIT_", "WORKER_", "CV_", "TREND_")


@dataclass(slots=True, frozen=True)
class Alert:
    """One dashboard-ready alert derived from a single zone's assessment.

    ``severity_band`` is the alert's *effective* band, which may be
    escalated above ``assessment.severity_band`` (see AlertManager's
    sustained-HIGH escalation) -- always read severity from here, not
    from the nested assessment, when deciding how to present the alert.
    """

    alert_id: str
    zone_id: str
    timestamp: float
    severity_band: RiskSeverityBand
    is_compound: bool
    title: str
    explanation: str
    recommended_action: str
    evidence_summary: tuple[str, ...]
    assessment: CompoundRiskAssessment


@dataclass(slots=True, frozen=True)
class PlantEmergencyAlert:
    """Plant-wide banner emitted whenever any zone alert is CRITICAL and
    compound. Aggregates every alert raised in that same processing
    batch (not just the triggering one) since an emergency responder
    needs the whole plant picture, not only the worst zone."""

    alert_id: str
    timestamp: float
    zone_alerts: tuple[Alert, ...] = field(default_factory=tuple)
    summary: str = ""


def _short_label(rule_id: str) -> str:
    label = rule_id
    for prefix in _RULE_ID_PREFIXES:
        if label.startswith(prefix):
            label = label[len(prefix):]
            break
    return label.replace("_", " ").title()


def _evidence_summary(assessment: CompoundRiskAssessment) -> tuple[str, ...]:
    ranked = sorted(
        assessment.evidence, key=lambda f: f.severity_contribution, reverse=True
    )
    return tuple(f.finding for f in ranked[:3])


def _build_title(assessment: CompoundRiskAssessment, band: RiskSeverityBand) -> str:
    """Short label from up to two highest-severity, distinct-rule findings,
    e.g. "Confined Space Gas + Hazardous Zone - Zone 3 CRITICAL"."""
    ranked = sorted(
        assessment.evidence, key=lambda f: f.severity_contribution, reverse=True
    )
    labels: list[str] = []
    seen_rules: set[str] = set()
    for fragment in ranked:
        if fragment.rule_id in seen_rules:
            continue
        seen_rules.add(fragment.rule_id)
        labels.append(_short_label(fragment.rule_id))
        if len(labels) == 2:
            break
    condition = " + ".join(labels) if labels else "Risk Condition"
    return f"{condition} - Zone {assessment.zone_id} {band.value}"


class AlertManager:
    """Stateful filter/escalation/dedup layer sitting downstream of
    FusionEngine. One instance should persist for the lifetime of a
    running scenario -- its per-zone memory is what makes cooldown and
    escalation possible; a fresh instance per snapshot would defeat both.
    """

    def __init__(
        self,
        *,
        min_alert_band: RiskSeverityBand = RiskSeverityBand.HIGH,
        alert_compound_medium: bool = True,
        cooldown_seconds: float = _DEFAULT_COOLDOWN_SECONDS,
        high_escalation_seconds: float = _DEFAULT_HIGH_ESCALATION_SECONDS,
    ) -> None:
        self._min_alert_band = min_alert_band
        self._alert_compound_medium = alert_compound_medium
        self._cooldown_seconds = cooldown_seconds
        self._high_escalation_seconds = high_escalation_seconds
        self._last_alerted: dict[str, tuple[float, RiskSeverityBand]] = {}
        self._high_since: dict[str, float] = {}
        self._acknowledged: set[str] = set()

    def process(
        self, assessments: Sequence[CompoundRiskAssessment]
    ) -> tuple[tuple[Alert, ...], Optional[PlantEmergencyAlert]]:
        """Run one snapshot's worth of assessments through filtering,
        escalation and cooldown, returning surfaced alerts plus an
        optional plant-wide emergency banner."""
        alerts = tuple(
            alert
            for assessment in assessments
            if (alert := self._process_one(assessment)) is not None
        )
        return alerts, self._build_emergency(alerts)

    def acknowledge(self, zone_id: str) -> None:
        """Record that an operator has acknowledged the current condition
        in ``zone_id``, resetting its sustained-HIGH escalation clock."""
        self._acknowledged.add(zone_id)
        self._high_since.pop(zone_id, None)

    def _process_one(self, assessment: CompoundRiskAssessment) -> Optional[Alert]:
        zone_id = assessment.zone_id
        band = self._effective_band(zone_id, assessment)
        if not self._should_alert(band, assessment.compound_risk_detected):
            return None
        if self._in_cooldown(zone_id, assessment.timestamp, band):
            return None
        self._last_alerted[zone_id] = (assessment.timestamp, band)
        return Alert(
            alert_id=f"ALT_{zone_id}_{assessment.timestamp}",
            zone_id=zone_id,
            timestamp=assessment.timestamp,
            severity_band=band,
            is_compound=assessment.compound_risk_detected,
            title=_build_title(assessment, band),
            explanation=assessment.explanation,
            recommended_action=assessment.recommended_action,
            evidence_summary=_evidence_summary(assessment),
            assessment=assessment,
        )

    def _effective_band(
        self, zone_id: str, assessment: CompoundRiskAssessment
    ) -> RiskSeverityBand:
        """Return the band to alert at, escalating HIGH -> CRITICAL once a
        zone has sat unacknowledged in HIGH for the escalation window."""
        band = assessment.severity_band
        if band is not RiskSeverityBand.HIGH:
            self._high_since.pop(zone_id, None)
            if band is not RiskSeverityBand.CRITICAL:
                self._acknowledged.discard(zone_id)
            return band

        if zone_id in self._acknowledged:
            return band
        started_at = self._high_since.setdefault(zone_id, assessment.timestamp)
        if assessment.timestamp - started_at >= self._high_escalation_seconds:
            return RiskSeverityBand.CRITICAL
        return band

    def _should_alert(self, band: RiskSeverityBand, compound: bool) -> bool:
        if _BAND_ORDER[band] >= _BAND_ORDER[self._min_alert_band]:
            return True
        return (
            self._alert_compound_medium
            and band is RiskSeverityBand.MEDIUM
            and compound
        )

    def _in_cooldown(
        self, zone_id: str, timestamp: float, band: RiskSeverityBand
    ) -> bool:
        last = self._last_alerted.get(zone_id)
        if last is None:
            return False
        last_timestamp, last_band = last
        if _BAND_ORDER[band] > _BAND_ORDER[last_band]:
            return False  # any escalation always breaks the cooldown
        return (timestamp - last_timestamp) < self._cooldown_seconds

    @staticmethod
    def _build_emergency(alerts: Sequence[Alert]) -> Optional[PlantEmergencyAlert]:
        triggered = any(
            a.severity_band is RiskSeverityBand.CRITICAL and a.is_compound
            for a in alerts
        )
        if not triggered:
            return None
        timestamp = max(a.timestamp for a in alerts)
        critical_zones = sorted(
            {
                a.zone_id
                for a in alerts
                if a.severity_band is RiskSeverityBand.CRITICAL and a.is_compound
            }
        )
        summary = (
            f"PLANT EMERGENCY: {len(critical_zones)} zone(s) at CRITICAL "
            f"compound risk (Zones: {', '.join(critical_zones)}). "
            f"Immediate coordinated response required."
        )
        return PlantEmergencyAlert(
            alert_id=f"EMERGENCY_{timestamp}",
            timestamp=timestamp,
            zone_alerts=tuple(alerts),
            summary=summary,
        )