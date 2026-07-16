"""Worker-context rules for the Risk Engine (risk_engine/rules/worker_rules.py).

Reasons over WorkerState values inside a PlantSnapshot's ZoneContext, in
combination with concurrent gas readings and permit rosters. This is the
human-safety dimension: not "is the plant unsafe" but "is a specific,
named person unsafe right now, and is anyone tracking that."

Ground-truth notes on WorkerState (do not re-derive these):
- ppe_level is a *string* like "Level 3", not an int -- workers.csv reads
  that way and WorkerState.ppe_level is typed str. This module parses it.
- WorkerState has no ``name`` or ``shift_id`` field even though those
  columns exist in workers.csv; only worker_id/role/ppe_level/
  current_zone/medical_status/rfid_tag are populated. Findings therefore
  identify workers by worker_id only, which is what every rule below
  does and is also what the requirements ask for.
- ZoneContext.ppe_required may not be split into individual PPE items
  (zones.csv separates them with commas inside one field; the loader
  splits on ";"), so it can arrive as a single joined string instead of
  a clean tuple. Every check here does substring matching over the
  joined text rather than assuming per-item elements, so it is correct
  either way.

CV STUB NOTE: in the live system, worker_id-to-zone assignment would
come from CV zone-occupancy detection fused with RFID reads (see
models.CVEventType.ZONE_OCCUPANCY / WORKER_ENTER_ZONE), not from a
static CSV -- a worker's *true* location can drift from workers.csv the
moment they walk through a door. For this demo, WorkerState.current_zone
from workers.csv is the only location signal available, so every rule
below treats it as ground truth. When the CV pipeline exists, only
SnapshotBuilder's worker-loading step changes; these rules, which only
consume WorkerState off the snapshot, do not.

Threshold configuration is injected as SensorThresholds (reused from
sensor_rules.py) -- this module performs no CSV I/O.
"""

from typing import Mapping, Optional

from risk_engine.context import PermitState, PlantSnapshot, WorkerState, ZoneContext
from risk_engine.models import EvidenceFragment, EvidenceSource, RiskDimension
from risk_engine.rules.base import linear_severity, make_fragment
from risk_engine.rules.sensor_rules import SensorThresholds

_GAS_SENSOR_TYPES = frozenset(
    {"Toxic Gas (H2S)", "Toxic Gas (CO)", "Flammable Gas (%LEL)"}
)
_SCBA_KEYWORD = "scba"
_RESPIRATOR_KEYWORD = "respirator"
_BASELINE_PPE_LEVEL = 2  # any permit-worthy zone requires at least basic PPE
_UNAUTHORIZED_ENTRY_SEVERITY = 0.75


def _ppe_level_number(raw: str) -> Optional[int]:
    """Parse "Level 3" -> 3. Returns None for unparseable input rather than
    guessing, since silently defaulting a missing PPE level to "compliant"
    would hide exactly the gap this rule exists to catch."""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return int(digits) if digits else None


def _minimum_ppe_level(zone: ZoneContext) -> int:
    """Derive the minimum PPE level a zone's ppe_required text implies.

    zones.csv has no explicit level column, so this maps the equipment
    named in ppe_required to the levels defined in workers.csv (Level 2
    basic, Level 3 includes respirator, Level 4 full SCBA-capable): any
    mention of SCBA implies 4, any mention of "respirator" (without SCBA)
    implies 3, otherwise the baseline is 2. This is an explicit modeling
    assumption, not a value from any CSV -- see review for why.
    """
    joined = " ".join(zone.ppe_required).lower()
    if _SCBA_KEYWORD in joined:
        return 4
    if _RESPIRATOR_KEYWORD in joined:
        return 3
    return _BASELINE_PPE_LEVEL


class WorkerInHazardousZoneRule:
    """Fires when a worker is physically present in a zone where a gas
    sensor is above warning (or critical) threshold. Severity scales with
    the gas reading; the finding names the worker, zone, and hazard
    together since none of those alone tells an operator who to evacuate."""

    rule_id = "WORKER_IN_HAZARDOUS_ZONE"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for zone_id, zone in snapshot.zones.items():
            if not zone.workers_present:
                continue
            hazards = list(self._gas_hazards_in_zone(snapshot, zone_id))
            if not hazards:
                continue
            for worker in zone.workers_present:
                for reading, cfg in hazards:
                    fragments.append(
                        self._make_fragment(worker, zone_id, reading, cfg, snapshot.timestamp)
                    )
        return tuple(fragments)

    def _gas_hazards_in_zone(self, snapshot: PlantSnapshot, zone_id: str):
        for reading in snapshot.sensors_in_zone(zone_id):
            cfg = self._thresholds.get(reading.sensor_id)
            if cfg is None or cfg.sensor_type not in _GAS_SENSOR_TYPES:
                continue
            if reading.value >= cfg.warning_max:
                yield reading, cfg

    @staticmethod
    def _make_fragment(worker: WorkerState, zone_id: str, reading, cfg, timestamp: float):
        severity = linear_severity(reading.value, cfg.warning_max, cfg.critical_max)
        is_critical = reading.value >= cfg.critical_max
        finding = (
            f"Worker {worker.worker_id} is present in Zone {zone_id} where "
            f"{cfg.sensor_type} reads {reading.value:.2f}{cfg.unit}"
            + (
                " -- CRITICAL, immediate evacuation warranted"
                if is_critical
                else " -- above warning threshold"
            )
        )
        return make_fragment(
            rule_id="WORKER_IN_HAZARDOUS_ZONE",
            source=EvidenceSource.WORKER_CONTEXT,
            dimension=RiskDimension.WORKER,
            finding=finding,
            severity_contribution=severity,
            timestamp=timestamp,
            zone_id=zone_id,
            sensor_id=cfg.sensor_id,
            worker_id=worker.worker_id,
            supporting_context=(
                f"value={reading.value}",
                f"warning_threshold={cfg.warning_max}",
                f"critical_threshold={cfg.critical_max}",
                f"is_critical={is_critical}",
            ),
        )


class PPEComplianceRule:
    """Fires when a present worker's PPE level is below what their zone's
    ppe_required text implies is the minimum (see _minimum_ppe_level)."""

    rule_id = "WORKER_PPE_COMPLIANCE"

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for zone_id, zone in snapshot.zones.items():
            if not zone.workers_present:
                continue
            required_level = _minimum_ppe_level(zone)
            for worker in zone.workers_present:
                worker_level = _ppe_level_number(worker.ppe_level)
                if worker_level is None or worker_level >= required_level:
                    continue
                gap = required_level - worker_level
                severity = min(1.0, gap / 3.0)
                fragments.append(
                    make_fragment(
                        rule_id=self.rule_id,
                        source=EvidenceSource.WORKER_CONTEXT,
                        dimension=RiskDimension.COMPLIANCE,
                        finding=(
                            f"Worker {worker.worker_id} in Zone {zone_id} has PPE "
                            f"Level {worker_level} but the zone requires at least "
                            f"Level {required_level} ({', '.join(zone.ppe_required)})"
                        ),
                        severity_contribution=severity,
                        timestamp=snapshot.timestamp,
                        zone_id=zone_id,
                        worker_id=worker.worker_id,
                        supporting_context=(
                            f"worker_ppe_level={worker_level}",
                            f"zone_required_level={required_level}",
                        ),
                    )
                )
        return tuple(fragments)


class UnauthorizedEntryRule:
    """Fires when a worker occupies a permit-required zone without being
    named on any currently active permit for that zone."""

    rule_id = "WORKER_UNAUTHORIZED_ENTRY"

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for zone_id, zone in snapshot.zones.items():
            if not zone.permit_required or not zone.workers_present:
                continue
            authorized_ids = self._authorized_worker_ids(zone.active_permits)
            for worker in zone.workers_present:
                if worker.worker_id in authorized_ids:
                    continue
                fragments.append(
                    make_fragment(
                        rule_id=self.rule_id,
                        source=EvidenceSource.WORKER_CONTEXT,
                        dimension=RiskDimension.COMPLIANCE,
                        finding=(
                            f"Worker {worker.worker_id} is present in Zone {zone_id}, "
                            f"which requires a permit, but is not listed on any "
                            f"active permit for that zone"
                            + (
                                f" (active: {', '.join(p.permit_id for p in zone.active_permits)})"
                                if zone.active_permits
                                else " (no active permit exists in this zone)"
                            )
                        ),
                        severity_contribution=_UNAUTHORIZED_ENTRY_SEVERITY,
                        timestamp=snapshot.timestamp,
                        zone_id=zone_id,
                        worker_id=worker.worker_id,
                        supporting_context=(
                            f"active_permit_ids={[p.permit_id for p in zone.active_permits]}",
                        ),
                    )
                )
        return tuple(fragments)

    @staticmethod
    def _authorized_worker_ids(active_permits: tuple[PermitState, ...]) -> frozenset[str]:
        return frozenset(
            worker_id
            for permit in active_permits
            for worker_id in permit.workers_assigned
        )