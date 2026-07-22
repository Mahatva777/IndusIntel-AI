"""Domain models for the Industrial Safety Intelligence Risk Engine.

Contains only dataclasses, enums, and lightweight field validation
representing the Risk Engine's own vocabulary: the evidence produced by
individual rules, the compound risk assessment fused from that evidence,
and the ingestion contract for the (not-yet-built) computer vision
pipeline. No fusion logic, no scoring math, and no I/O live here --
that responsibility belongs to future collaborators such as
risk_engine/fusion.py and risk_engine/scoring.py.

This module mirrors the conventions established in simulator/models.py:
frozen, slots-based dataclasses; tuples instead of lists for immutable
collections; Enums for vocabularies the Risk Engine itself owns; and
__post_init__ used only for cheap guard-clause validation.
"""

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Optional


# ============================================================
# SHARED VALIDATION HELPERS (guard clauses only, no business logic)
# ============================================================

def _validate_unit_interval(value: float, field_name: str) -> None:
    """Raise ValueError if ``value`` is outside the closed [0.0, 1.0] range."""
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{field_name} must be within [0.0, 1.0], got {value}")


def _require_non_empty(value: str, field_name: str) -> None:
    """Raise ValueError if ``value`` is an empty or whitespace-only string."""
    if not value.strip():
        raise ValueError(f"{field_name} must not be empty")


# ============================================================
# CORE RISK VOCABULARY
# ============================================================

class RiskDimension(Enum):
    """One of the independent axes the Risk Engine scores separately."""

    WORKER = "worker"
    EQUIPMENT = "equipment"
    PROCESS = "process"
    COMPLIANCE = "compliance"
    EMERGENCY = "emergency"


class EvidenceSource(Enum):
    """Where a single piece of evidence originated.

    Extensible by design: adding a new source (e.g. KNOWLEDGE_GRAPH)
    never requires changing EvidenceFragment or CompoundRiskAssessment --
    only a new rule module that emits fragments tagged with it.
    """

    SENSOR_TELEMETRY = "sensor_telemetry"
    PERMIT_SYSTEM = "permit_system"
    MAINTENANCE_RECORD = "maintenance_record"
    WORKER_CONTEXT = "worker_context"
    COMPUTER_VISION = "computer_vision"
    HISTORICAL_TREND = "historical_trend"
    KNOWLEDGE_GRAPH = "knowledge_graph"  # reserved; not populated by any rule yet


class RiskSeverityBand(Enum):
    """Categorical severity band, deliberately aligned with the vocabulary
    already used in config/event_profiles.csv (severity column)."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass(slots=True, frozen=True)
class EvidenceFragment:
    """A single, independently-produced, immutable unit of risk evidence.

    Every rule (sensor rule, permit rule, CV rule, trend rule, future
    knowledge-graph rule) emits zero or more of these instead of a bare
    risk score. A future Fusion Engine combines fragments into a
    CompoundRiskAssessment. Because a fragment is a Value Object -- no
    identity beyond its content -- every fragment that contributed to a
    decision remains individually inspectable after fusion, which is
    what makes the final decision explainable rather than a black box.
    """

    rule_id: str
    source: EvidenceSource
    dimension: RiskDimension
    finding: str
    severity_contribution: float
    timestamp: float
    zone_id: Optional[str] = None
    equipment_id: Optional[str] = None
    sensor_id: Optional[str] = None
    worker_id: Optional[str] = None
    confidence: float = 1.0
    applicable_regulation: Optional[str] = None
    supporting_context: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        _require_non_empty(self.finding, "EvidenceFragment.finding")
        _validate_unit_interval(self.severity_contribution, "severity_contribution")
        _validate_unit_interval(self.confidence, "confidence")


@dataclass(slots=True, frozen=True)
class DimensionScore:
    """The fused severity for a single RiskDimension within an assessment."""

    dimension: RiskDimension
    score: float

    def __post_init__(self) -> None:
        _validate_unit_interval(self.score, "score")


@dataclass(slots=True, frozen=True)
class CompoundRiskAssessment:
    """The Fusion Engine's explainable output for one zone at one instant.

    This is the "single, unified, explainable decision" the project
    exists to produce. It is a pure data container on purpose: the
    reasoning that builds one belongs in risk_engine/fusion.py (future).
    """

    assessment_id: str
    zone_id: str
    timestamp: float
    overall_severity: float
    severity_band: RiskSeverityBand
    confidence: float
    compound_risk_detected: bool
    explanation: str
    recommended_action: str
    evidence: tuple[EvidenceFragment, ...] = field(default_factory=tuple)
    dimension_scores: tuple[DimensionScore, ...] = field(default_factory=tuple)
    scenario_id: Optional[str] = None

    def __post_init__(self) -> None:
        _validate_unit_interval(self.overall_severity, "overall_severity")
        _validate_unit_interval(self.confidence, "confidence")
        _require_non_empty(self.explanation, "CompoundRiskAssessment.explanation")


# ============================================================
# CV INGESTION CONTRACT
# ============================================================
# Defines data models for Computer Vision (PPE detection and restricted zone
# events) produced by cv_engine/ inference outputs.

class PPEItem(Enum):
    """The 5-class PPE vocabulary the CV model should detect.

    IMPORTANT -- read this before training/labelling your CV model.
    The `.value` of each member is the exact class-name string the CV
    pipeline should emit. If your model's own class names differ,
    translate them to these values at the edge (in your CV pipeline's
    adapter code), not inside the Risk Engine:

        PPEItem.HELMET -> "helmet"
        PPEItem.VEST   -> "vest"    (hi-vis vest / FR suit / overalls)
        PPEItem.GLOVES -> "gloves"
        PPEItem.MASK   -> "mask"    (respirator / face mask)
        PPEItem.SHOES  -> "shoes"   (safety boots)

    Note: config/zones.csv's `ppe_required` column uses a richer
    vocabulary ("half-mask respirator", "chemical-resistant gloves",
    "SCBA for entry"). That richer vocabulary is deliberately NOT
    modelled here. Mapping "CV detected MASK" to "zone actually
    requires SCBA, so a mask isn't enough" is a Risk Engine *rule*
    concern, not a data-model concern -- keep that logic out of this
    file and in a future rule module instead.
    """

    HELMET = "helmet"
    VEST = "vest"
    GLOVES = "gloves"
    MASK = "mask"
    SHOES = "shoes"


class CVEventType(Enum):
    """Mirrors the event categories already documented in docs/CV_ENGINE.md."""

    PPE_VIOLATION = "cv_ppe_violation"
    SMOKE_DETECTED = "cv_smoke_detected"
    FIRE_DETECTED = "cv_fire_detected"
    WORKER_ENTER_ZONE = "cv_worker_enter_zone"
    WORKER_EXIT_ZONE = "cv_worker_exit_zone"
    ZONE_OCCUPANCY = "cv_zone_occupancy"
    UNAUTHORIZED_ENTRY = "cv_unauthorized_entry"


@dataclass(slots=True, frozen=True)
class BoundingBox:
    """A normalized (0.0-1.0) bounding box for spatial object localization."""

    x: float
    y: float
    width: float
    height: float


@dataclass(slots=True, frozen=True)
class PPEObservation:
    """Whether one PPE item was detected as worn, for one detected person.

    Only emit one of these per item your model actually classified for
    this detection. Omitting an item entirely is different from
    asserting present=False -- "not observed" and "observed absent"
    are different evidence strengths, and the future Fusion Engine
    needs to be able to tell them apart.
    """

    item: PPEItem
    present: bool
    confidence: float

    def __post_init__(self) -> None:
        _validate_unit_interval(self.confidence, "confidence")


@dataclass(slots=True, frozen=True)
class CVPPEDetection:
    """One CV inference result for one detected person, at one instant.

    STUB -- build your CV pipeline to emit exactly this shape per
    detected person, per processed frame, e.g.:

        CVPPEDetection(
            timestamp=182.5,
            camera_id="CAM-Z4-BASE-01",
            zone_id="3",
            worker_id=None,  # None until RFID/CV identity fusion exists
            person_confidence=0.97,
            observations=(
                PPEObservation(PPEItem.HELMET, present=True, confidence=0.94),
                PPEObservation(PPEItem.VEST, present=True, confidence=0.88),
                PPEObservation(PPEItem.GLOVES, present=False, confidence=0.81),
                PPEObservation(PPEItem.MASK, present=True, confidence=0.76),
                PPEObservation(PPEItem.SHOES, present=True, confidence=0.90),
            ),
            bounding_box=BoundingBox(x=0.41, y=0.22, width=0.09, height=0.31),
        )
    """

    timestamp: float
    camera_id: str
    zone_id: str
    person_confidence: float
    observations: tuple[PPEObservation, ...]
    worker_id: Optional[str] = None
    bounding_box: Optional[BoundingBox] = None

    def __post_init__(self) -> None:
        _validate_unit_interval(self.person_confidence, "person_confidence")
        if not self.observations:
            raise ValueError("CVPPEDetection.observations must not be empty")


@dataclass(slots=True, frozen=True)
class CVEvent:
    """Generic CV event envelope, matching docs/API_REFERENCE.md's
    `POST /api/cv/events` contract: {event_type, zone_id, worker_id,
    timestamp, severity, metadata}.

    Use this for non-PPE CV events (smoke, fire, occupancy, unauthorized
    entry) once those pipelines exist. `metadata` is stored behind a
    MappingProxyType so it is genuinely read-only, not just
    conventionally read-only the way a plain dict field would be.
    """

    event_type: CVEventType
    zone_id: str
    timestamp: float
    severity: str
    worker_id: Optional[str] = None
    metadata: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self) -> None:
        if not isinstance(self.metadata, MappingProxyType):
            object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))