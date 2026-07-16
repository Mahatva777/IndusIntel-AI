"""Compound-risk fusion for the Risk Engine (risk_engine/fusion.py).

Combines EvidenceFragments from every rule module into one
CompoundRiskAssessment per zone. This is the module that turns "several
independent rules each fired" into "here is one explainable, ranked risk
picture." No rule module here is aware of any other -- fusion is the
only place that reasons across rule boundaries.

Aggregation uses noisy-OR (see module docstring in the accompanying
explanation) rather than naive summation, at both the fragment->dimension
and dimension->overall steps, so severity never needs clipping and
scales sensibly with both the number and strength of independent signals.
"""

from typing import Mapping, Optional, Sequence

from risk_engine.context import PlantSnapshot
from risk_engine.models import (
    CompoundRiskAssessment,
    DimensionScore,
    EvidenceFragment,
    RiskDimension,
    RiskSeverityBand,
)

_PLANT_WIDE_ZONE_KEY = "PLANT"  # bucket for cross-zone fragments (zone_id=None)

DEFAULT_DIMENSION_WEIGHTS: Mapping[RiskDimension, float] = {
    RiskDimension.EMERGENCY: 2.0,
    RiskDimension.WORKER: 1.2,
    RiskDimension.EQUIPMENT: 1.0,
    RiskDimension.PROCESS: 1.0,
    RiskDimension.COMPLIANCE: 0.8,
}

_DEFAULT_ACTIONS: Mapping[RiskSeverityBand, str] = {
    RiskSeverityBand.LOW: "Continue routine monitoring.",
    RiskSeverityBand.MEDIUM: "Increase monitoring frequency and notify shift supervisor.",
    RiskSeverityBand.HIGH: "Alert safety officer immediately and prepare evacuation readiness.",
    RiskSeverityBand.CRITICAL: "Evacuate the zone immediately and initiate emergency shutdown.",
}


def _combine_severities(severities: Sequence[float]) -> float:
    """Noisy-OR: probability at least one independent signal is a true risk."""
    if not severities:
        return 0.0
    product_of_absence = 1.0
    for s in severities:
        product_of_absence *= 1.0 - s
    return 1.0 - product_of_absence


def _weighted_overall(
    dimension_scores: Mapping[RiskDimension, float],
    weights: Mapping[RiskDimension, float],
) -> float:
    """Weighted noisy-OR across dimensions; weight = exponent on absence-term."""
    product = 1.0
    for dimension, score in dimension_scores.items():
        weight = weights.get(dimension, 1.0)
        product *= (1.0 - score) ** weight
    return max(0.0, min(1.0, 1.0 - product))


def _severity_band(score: float) -> RiskSeverityBand:
    if score >= 0.75:
        return RiskSeverityBand.CRITICAL
    if score >= 0.50:
        return RiskSeverityBand.HIGH
    if score >= 0.25:
        return RiskSeverityBand.MEDIUM
    return RiskSeverityBand.LOW


def _build_explanation(
    zone_id: str, compound: bool, ranked_fragments: Sequence[EvidenceFragment]
) -> str:
    """Human-readable summary naming the zone, condition, and top findings."""
    top = ranked_fragments[:3]
    findings = "; ".join(f.finding for f in top)
    kind = (
        "compound risk (multiple independent evidence sources corroborate)"
        if compound
        else "an isolated risk signal (single evidence source)"
    )
    return f"Zone {zone_id}: {kind}. Top contributing factors: {findings}."


def _recommended_action(top_fragment: EvidenceFragment, band: RiskSeverityBand) -> str:
    """Concrete action derived from severity band, annotated with regulation
    if the highest-severity fragment cites one."""
    base = _DEFAULT_ACTIONS[band]
    if top_fragment.applicable_regulation:
        return f"{base} Reference: {top_fragment.applicable_regulation}."
    return base


class FusionEngine:
    """Fuses pre-collected EvidenceFragments into one
    CompoundRiskAssessment per zone that produced any.

    This module does NOT call rules directly -- rule orchestration
    (update()/evaluate() lifecycle, error isolation) is the
    responsibility of risk_engine.rule_engine.RuleEngine.
    """

    def __init__(
        self,
        dimension_weights: Optional[Mapping[RiskDimension, float]] = None,
    ) -> None:
        self._weights = {**DEFAULT_DIMENSION_WEIGHTS, **(dimension_weights or {})}

    def assess(
        self,
        snapshot: PlantSnapshot,
        fragments: Sequence[EvidenceFragment],
    ) -> tuple[CompoundRiskAssessment, ...]:
        """Fuse pre-collected evidence into one assessment per zone.

        Args:
            snapshot: The current plant snapshot (provides timestamp,
                      zone structure and scenario_id for assessments).
            fragments: EvidenceFragments already collected by RuleEngine.

        Returns:
            One CompoundRiskAssessment per zone that produced at least
            one fragment.  Zones with zero fragments produce no assessment.
        """
        fragments_by_zone = self._group_by_zone(fragments)
        return tuple(
            self._build_assessment(zone_id, zone_fragments, snapshot)
            for zone_id, zone_fragments in fragments_by_zone.items()
        )

    @staticmethod
    def _group_by_zone(
        fragments: Sequence[EvidenceFragment],
    ) -> dict[str, list[EvidenceFragment]]:
        by_zone: dict[str, list[EvidenceFragment]] = {}
        for fragment in fragments:
            key = fragment.zone_id or _PLANT_WIDE_ZONE_KEY
            by_zone.setdefault(key, []).append(fragment)
        return by_zone

    def _build_assessment(
        self,
        zone_id: str,
        fragments: list[EvidenceFragment],
        snapshot: PlantSnapshot,
    ) -> CompoundRiskAssessment:
        compound = len({f.source for f in fragments}) >= 2

        by_dimension: dict[RiskDimension, list[float]] = {}
        for f in fragments:
            by_dimension.setdefault(f.dimension, []).append(f.severity_contribution)
        dimension_scores = tuple(
            DimensionScore(dimension=dim, score=_combine_severities(scores))
            for dim, scores in by_dimension.items()
        )

        overall = _weighted_overall(
            {d.dimension: d.score for d in dimension_scores}, self._weights
        )
        band = _severity_band(overall)
        ranked = sorted(fragments, key=lambda f: f.severity_contribution, reverse=True)
        confidence = sum(f.confidence for f in fragments) / len(fragments)

        return CompoundRiskAssessment(
            assessment_id=f"{zone_id}_{snapshot.timestamp}",
            zone_id=zone_id,
            timestamp=snapshot.timestamp,
            overall_severity=overall,
            severity_band=band,
            confidence=confidence,
            compound_risk_detected=compound,
            explanation=_build_explanation(zone_id, compound, ranked),
            recommended_action=_recommended_action(ranked[0], band),
            evidence=tuple(fragments),
            dimension_scores=dimension_scores,
            scenario_id=snapshot.scenario_id,
        )