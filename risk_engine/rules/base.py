"""Rule contract and shared infrastructure for risk_engine/rules/*.py.

Defines the structural Rule Protocol every rule module implements, plus
pure, dependency-free utility functions rules commonly need (sensor value
lookup, elapsed time, linear severity normalization, fragment construction).
Zero business logic: no thresholds, no scoring weights, no zone/permit
reasoning. Those live in the concrete rule modules.
"""

from typing import Optional, Protocol, Sequence, runtime_checkable

from risk_engine.context import PlantSnapshot
from risk_engine.models import EvidenceFragment, EvidenceSource, RiskDimension


@runtime_checkable
class Rule(Protocol):
    """Structural contract for any rule that inspects a PlantSnapshot.

    A rule is a pure function of a snapshot: given the same snapshot it
    must always return the same evidence, and it must never mutate the
    snapshot or perform I/O. Implementations live in sibling modules
    (sensor_rules.py, permit_rules.py, ...); none of them need to inherit
    from anything here.
    """

    rule_id: str

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        """Produce zero or more EvidenceFragment values for this snapshot."""
        ...


# A rule set is just an ordered collection, constructed by the caller
# (e.g. RuleEngine's __init__) and passed in -- no global registry.
RuleSet = Sequence[Rule]


def resolve_sensor_value(
    snapshot: PlantSnapshot, sensor_id: str
) -> Optional[float]:
    """Look up a sensor's current value, or None if absent from the snapshot.

    Centralizes the null-check every rule otherwise repeats around
    ``snapshot.get_sensor_reading(...)``.
    """
    reading = snapshot.get_sensor_reading(sensor_id)
    return reading.value if reading is not None else None


def elapsed_seconds(later: float, earlier: float) -> float:
    """Return the non-negative elapsed time between two timestamps.

    Clamped at 0.0 so an out-of-order pair (bad data, clock skew) never
    produces a negative duration that would corrupt a rate-of-change or
    time-in-state calculation downstream.
    """
    return max(later - earlier, 0.0)


def linear_severity(value: float, low: float, high: float) -> float:
    """Map a raw sensor value onto a normalized [0.0, 1.0] severity scale.

    ``value <= low`` -> 0.0 (no contribution); ``value >= high`` -> 1.0
    (maximal contribution); linear interpolation between. ``low``/``high``
    are typically a sensor's warning/critical thresholds, supplied by the
    calling rule -- this function has no knowledge of sensors.csv itself.

    Raises:
        ValueError: if ``high <= low`` (degenerate or inverted range).
    """
    if high <= low:
        raise ValueError(f"high ({high}) must exceed low ({low})")
    fraction = (value - low) / (high - low)
    return max(0.0, min(1.0, fraction))


def make_fragment(
    *,
    rule_id: str,
    source: EvidenceSource,
    dimension: RiskDimension,
    finding: str,
    severity_contribution: float,
    timestamp: float,
    zone_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    sensor_id: Optional[str] = None,
    worker_id: Optional[str] = None,
    confidence: float = 1.0,
    applicable_regulation: Optional[str] = None,
    supporting_context: tuple[str, ...] = (),
) -> EvidenceFragment:
    """Convenience constructor reducing EvidenceFragment boilerplate.

    Purely a keyword-forwarding wrapper -- no defaulting logic beyond what
    EvidenceFragment itself already defines, no validation beyond what
    EvidenceFragment.__post_init__ already performs. Exists only so every
    rule module doesn't repeat the same eleven-argument constructor call.
    """
    return EvidenceFragment(
        rule_id=rule_id,
        source=source,
        dimension=dimension,
        finding=finding,
        severity_contribution=severity_contribution,
        timestamp=timestamp,
        zone_id=zone_id,
        equipment_id=equipment_id,
        sensor_id=sensor_id,
        worker_id=worker_id,
        confidence=confidence,
        applicable_regulation=applicable_regulation,
        supporting_context=supporting_context,
    )