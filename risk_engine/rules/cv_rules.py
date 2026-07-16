"""Computer-vision rules for the Risk Engine (risk_engine/rules/cv_rules.py).

============================================================================
CV PIPELINE INTEGRATION GUIDE -- READ THIS BEFORE WRITING ANY CV CODE
============================================================================
The CV model does not exist yet. This module IS the contract it must
satisfy -- it is a stub today and turns into live evidence with ZERO
changes to the Risk Engine the moment your pipeline starts populating
PlantSnapshot.cv_ppe_detections / snapshot.cv_events. That is the whole
point of the CVPPEDetection / CVEvent shapes in risk_engine/models.py:
they are an anti-corruption layer between your model internals and this
codebase. Build to the shapes below, not to whatever your model's raw
output tensor looks like.

1. CAMERA-TO-ZONE MAPPING (config/zones.csv `camera_id` column)
   ------------------------------------------------------------
   CAM-Z2-TOP-01   -> zone_id "1"   (Battery Top Deck)
   CAM-Z6-QCH-01   -> zone_id "2"   (Quench Area / Track)
   CAM-Z4-BASE-01  -> zone_id "3"   (Basement Gas Valve Gallery -- SCBA zone)
   CAM-Z5-TAR-01   -> zone_id "4"   (Tar Extractor & By-Product Area)

   WARNING: the "Z2"/"Z6"/"Z4"/"Z5" embedded in the camera_id is NOT the
   zone_id. It appears to be a camera-rig/mount numbering scheme, not
   plant zone numbering. Do not derive zone_id by parsing the camera_id
   string -- look it up from zones.csv's camera_id column (or from
   SnapshotBuilder, once it exists) and set CVPPEDetection.zone_id /
   CVEvent.zone_id to the *zone_id column value* ("1"..."4"), always as
   a string, matching PlantSnapshot.zones' keys.

2. PPE CLASSES YOUR MODEL MUST OUTPUT (exactly these 5 class names)
   -----------------------------------------------------------------
       helmet, vest, gloves, mask, shoes
   These are PPEItem's enum values in risk_engine/models.py. If your
   detector's internal class names differ (e.g. "hard_hat", "hi_vis"),
   translate them to this vocabulary at the edge of your pipeline --
   never inside the Risk Engine. One PPEObservation per item your model
   actually classified for that person, in that frame. Do not emit an
   observation for an item you didn't evaluate: omitting it is different
   from asserting present=False, and this rule (and the future Fusion
   Engine) needs to be able to tell "not observed" apart from "observed
   absent, worn a hard hat you should not have".

3. WORKER IDENTITY
   -----------------
   worker_id on CVPPEDetection / CVEvent must be left None until an
   RFID/CV identity-fusion step exists. Do NOT invent a worker_id from a
   visual tracking ID (e.g. "track_47") -- that is a different identity
   space than workers.csv's worker_id and would silently corrupt every
   downstream rule that keys off worker_id (permit rosters, PPE level
   lookups, etc). This module already handles worker_id=None gracefully.

4. BOUNDING BOX
   -------------
   BoundingBox is optional on CVPPEDetection. It is not consumed by any
   rule in this module (dashboard overlay only) -- but populate it if
   your pipeline computes it anyway, coordinates normalized to [0, 1]
   relative to frame width/height, since it costs you nothing now and
   saves the dashboard team a re-integration later.

5. WHAT THIS MODULE DOES UNTIL YOU EXIST
   ----------------------------------------
   Every rule below checks its input collection first and returns an
   empty tuple if it's empty. That is the *normal*, expected state of
   this module today -- PlantSnapshot.cv_ppe_detections and
   PlantSnapshot.cv_events default to () everywhere upstream. The moment
   SnapshotBuilder starts populating them from your pipeline, fragments
   start flowing with no changes here.
============================================================================
"""

from typing import Mapping, Sequence

from risk_engine.context import PlantSnapshot, ZoneContext
from risk_engine.models import (
    CVEventType,
    EvidenceFragment,
    EvidenceSource,
    PPEItem,
    PPEObservation,
    RiskDimension,
)
from risk_engine.rules.base import make_fragment

# --- PPEViolationRule config -------------------------------------------
# Keyword synonyms used to decide whether a zone's free-text ppe_required
# column (zones.csv) actually requires a given PPEItem. NOTE: zone 3's
# ppe_required text is "full-face respirator, SCBA for entry" -- it never
# contains the literal word "mask", so MASK's keyword set must include
# "respirator" and "scba" or this rule would never fire in the one zone
# (the SCBA gallery) where a missing mask matters most.
_PPE_ITEM_KEYWORDS: Mapping[PPEItem, tuple[str, ...]] = {
    PPEItem.HELMET: ("helmet",),
    PPEItem.VEST: ("vest", "overalls", "coverall", "fr suit"),
    PPEItem.GLOVES: ("glove",),
    PPEItem.MASK: ("mask", "respirator", "scba"),
    PPEItem.SHOES: ("shoe", "boot"),
}

# Explicit modeling assumption (see review): relative danger of going
# without each item, independent of zone. Mirrors the spirit of
# worker_rules._minimum_ppe_level -- not sourced from any CSV.
_ITEM_CRITICALITY: Mapping[PPEItem, float] = {
    PPEItem.MASK: 0.90,
    PPEItem.HELMET: 0.75,
    PPEItem.VEST: 0.60,
    PPEItem.SHOES: 0.55,
    PPEItem.GLOVES: 0.45,
}
_SCBA_ZONE_MASK_MULTIPLIER = 1.3  # a missing mask in an SCBA-entry zone is worse
_MAX_WEIGHTED_SUM = sum(_ITEM_CRITICALITY.values()) + _ITEM_CRITICALITY[
    PPEItem.MASK
] * (_SCBA_ZONE_MASK_MULTIPLIER - 1)

_UNAUTHORIZED_ENTRY_CV_SEVERITY = 0.75  # matches worker_rules' static-data version
_SEVERITY_STRING_MAP = {"LOW": 0.4, "MEDIUM": 0.6, "HIGH": 0.85, "CRITICAL": 1.0}
_EMERGENCY_SEVERITY_FLOOR = {
    CVEventType.SMOKE_DETECTED: 0.70,
    CVEventType.FIRE_DETECTED: 0.90,
}


def _zone_requires(zone: ZoneContext, item: PPEItem) -> bool:
    joined = " ".join(zone.ppe_required).lower()
    return any(kw in joined for kw in _PPE_ITEM_KEYWORDS[item])


def _missing_items_severity(
    missing: Sequence[PPEObservation], zone: ZoneContext
) -> float:
    is_scba_zone = "scba" in " ".join(zone.ppe_required).lower()
    total = 0.0
    for obs in missing:
        weight = _ITEM_CRITICALITY[obs.item]
        if obs.item is PPEItem.MASK and is_scba_zone:
            weight *= _SCBA_ZONE_MASK_MULTIPLIER
        total += weight
    return min(1.0, total / _MAX_WEIGHTED_SUM)


def _confidence_from_metadata(metadata: Mapping[str, str]) -> float:
    """CVEvent has no dedicated confidence field; a CV pipeline may still
    surface one in metadata (e.g. {"confidence": "0.92"}). Defaults to
    1.0 -- absence of a number is not evidence of low confidence."""
    raw = metadata.get("confidence")
    if raw is None:
        return 1.0
    try:
        return max(0.0, min(1.0, float(raw)))
    except ValueError:
        return 1.0


class PPEViolationRule:
    """Fires when a CVPPEDetection shows an item missing that the
    detection's zone actually requires (per zones.csv ppe_required)."""

    rule_id = "CV_PPE_VIOLATION"

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        if not snapshot.cv_ppe_detections:
            return ()
        fragments = []
        for detection in snapshot.cv_ppe_detections:
            zone = snapshot.get_zone(detection.zone_id)
            if zone is None:
                continue
            missing = [
                obs
                for obs in detection.observations
                if not obs.present and _zone_requires(zone, obs.item)
            ]
            if not missing:
                continue
            fragments.append(
                self._make_fragment(detection, zone, missing, snapshot.timestamp)
            )
        return tuple(fragments)

    @classmethod
    def _make_fragment(cls, detection, zone, missing, timestamp):
        severity = _missing_items_severity(missing, zone)
        who = detection.worker_id or f"an unidentified person (camera {detection.camera_id})"
        items = ", ".join(obs.item.value for obs in missing)
        return make_fragment(
            rule_id=cls.rule_id,
            source=EvidenceSource.COMPUTER_VISION,
            dimension=RiskDimension.COMPLIANCE,
            finding=(
                f"CV detected {who} in Zone {detection.zone_id} missing required "
                f"PPE: {items} (zone requires: {', '.join(zone.ppe_required)})"
            ),
            severity_contribution=severity,
            timestamp=timestamp,
            zone_id=detection.zone_id,
            worker_id=detection.worker_id,
            confidence=detection.person_confidence,
            supporting_context=(
                f"camera_id={detection.camera_id}",
                f"missing_items={[obs.item.value for obs in missing]}",
                f"missing_confidences={[obs.confidence for obs in missing]}",
            ),
        )


class SmokeFireRule:
    """Fires on CVEvent(SMOKE_DETECTED | FIRE_DETECTED); always routed to
    RiskDimension.EMERGENCY since neither is ever a "process" concern."""

    rule_id = "CV_SMOKE_FIRE_DETECTION"
    _EVENT_TYPES = frozenset({CVEventType.SMOKE_DETECTED, CVEventType.FIRE_DETECTED})

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for event in snapshot.cv_events:
            if event.event_type not in self._EVENT_TYPES:
                continue
            mapped = _SEVERITY_STRING_MAP.get(event.severity.strip().upper(), 0.7)
            severity = max(mapped, _EMERGENCY_SEVERITY_FLOOR[event.event_type])
            label = "Fire" if event.event_type is CVEventType.FIRE_DETECTED else "Smoke"
            fragments.append(
                make_fragment(
                    rule_id=self.rule_id,
                    source=EvidenceSource.COMPUTER_VISION,
                    dimension=RiskDimension.EMERGENCY,
                    finding=(
                        f"{label} detected by CV in Zone {event.zone_id} "
                        f"(reported severity: {event.severity})"
                    ),
                    severity_contribution=severity,
                    timestamp=event.timestamp,
                    zone_id=event.zone_id,
                    worker_id=event.worker_id,
                    confidence=_confidence_from_metadata(event.metadata),
                    supporting_context=(
                        f"event_type={event.event_type.value}",
                        f"reported_severity={event.severity}",
                    ),
                )
            )
        return tuple(fragments)


class UnauthorizedEntryDetectionRule:
    """CV-side counterpart to worker_rules.UnauthorizedEntryRule.

    That rule reasons over static WorkerState.current_zone vs. active
    permits; this one reasons over a live CV sighting of someone entering
    a restricted zone. They are DIFFERENT evidence, INTENTIONALLY not
    deduplicated here -- fusion (not this module) decides whether two
    fragments for the same worker/zone corroborate or double-count.
    """

    rule_id = "CV_UNAUTHORIZED_ENTRY"

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for event in snapshot.cv_events:
            if event.event_type is not CVEventType.UNAUTHORIZED_ENTRY:
                continue
            who = event.worker_id or "an unidentified person (no RFID/CV identity fusion yet)"
            fragments.append(
                make_fragment(
                    rule_id=self.rule_id,
                    source=EvidenceSource.COMPUTER_VISION,
                    dimension=RiskDimension.COMPLIANCE,
                    finding=(
                        f"CV detected {who} entering restricted Zone "
                        f"{event.zone_id} without visual/permit authorization"
                    ),
                    severity_contribution=_UNAUTHORIZED_ENTRY_CV_SEVERITY,
                    timestamp=event.timestamp,
                    zone_id=event.zone_id,
                    worker_id=event.worker_id,
                    confidence=_confidence_from_metadata(event.metadata),
                    supporting_context=(f"reported_severity={event.severity}",),
                )
            )
        return tuple(fragments)