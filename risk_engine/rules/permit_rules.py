"""Permit-context rules for the Risk Engine (risk_engine/rules/permit_rules.py).

Reasons over PermitState values inside a PlantSnapshot's ZoneContext, in
combination with concurrent sensor readings. This is where compound risk
first appears in the pipeline: a gas reading alone is SensorRules' job, a
permit alone would be a compliance checklist, but a gas reading *plus* an
active confined-space permit in the same zone is the "8.5 ppm H2S is
routine noise, 8.5 ppm H2S during a confined-space entry is an emergency"
distinction the whole project exists to make.

Ground-truth note on permit temporality (do not re-derive this): by the
time a PermitState reaches a rule, SnapshotBuilder has already resolved
the start_time/end_time window against the snapshot's wall clock.
PermitState itself carries no time fields -- that resolution happens
upstream, once, in SnapshotBuilder. ``ZoneContext.active_permits`` is a
derived property that additionally filters on ``status == "ACTIVE"``,
so by the time a rule reads it, both temporal overlap and status are
already guaranteed. Rules below do not re-check ``is_active`` -- that
would be redundant with a contract ``ZoneContext`` already enforces.
(``ZoneContext.permits_in_window`` is the escape hatch for a rule that
specifically needs to see PLANNED/CANCELLED permits; none of the three
rules here need it.)

Threshold configuration is injected as SensorThresholds (defined in
sensor_rules.py, reused here rather than duplicated) -- this module
performs no CSV I/O and knows nothing about simulator internals.
"""

from dataclasses import dataclass
from itertools import combinations
from typing import Mapping

from risk_engine.context import PermitState, PlantSnapshot, ZoneContext
from risk_engine.models import EvidenceFragment, EvidenceSource, RiskDimension
from risk_engine.rules.base import make_fragment
from risk_engine.rules.sensor_rules import SensorThresholds

_GAS_SENSOR_TYPES = frozenset(
    {"Toxic Gas (H2S)", "Toxic Gas (CO)", "Flammable Gas (%LEL)"}
)
_LEL_SENSOR_TYPE = "Flammable Gas (%LEL)"
_LEL_DANGER_THRESHOLD_PCT = 10.0  # universal LEL action threshold, not sensor-specific
_CONFINED_SPACE_PERMIT_BOOST = 0.30  # additive elevation; see review for rationale
_HOT_WORK_SEVERITY_FLOOR = 0.90  # this rule must outrank every other single rule
_OISD_CONFINED_SPACE_REG = (
    "Confined Space Entry Procedure - continuous gas monitoring mandatory "
    "(OISD-STD-116)"
)


def _severity_band(value: float, cfg: SensorThresholds) -> str:
    """Return a human-readable band label for a gas reading, for findings only."""
    if value >= cfg.critical_max:
        return "critical"
    if value >= cfg.warning_max:
        return "warning"
    return "elevated"


def _gas_readings_in_zone(
    snapshot: PlantSnapshot,
    thresholds: Mapping[str, SensorThresholds],
    zone_id: str,
):
    """Yield (reading, cfg) for gas sensors in ``zone_id`` reading above normal."""
    for reading in snapshot.sensors_in_zone(zone_id):
        cfg = thresholds.get(reading.sensor_id)
        if cfg is None or cfg.sensor_type not in _GAS_SENSOR_TYPES:
            continue
        if reading.value > cfg.normal_max:
            yield reading, cfg


class ConfinedSpaceGasRule:
    """Fires when an active confined-space permit overlaps a rising gas
    reading in the same zone. The finding names both conditions together
    because neither one alone is what makes this dangerous.
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "PERMIT_CONFINED_SPACE_GAS"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for zone_id, zone in snapshot.zones.items():
            permit = self._active_confined_space_permit(zone)
            if permit is None:
                continue
            for reading, cfg in _gas_readings_in_zone(snapshot, self._thresholds, zone_id):
                base_severity = min(
                    1.0,
                    max(0.0, (reading.value - cfg.normal_max) / (cfg.critical_max - cfg.normal_max)),
                )
                severity = min(1.0, base_severity + _CONFINED_SPACE_PERMIT_BOOST)
                band = _severity_band(reading.value, cfg)
                workers = permit.workers_assigned or (None,)
                for dimension in (RiskDimension.WORKER, RiskDimension.COMPLIANCE):
                    for worker_id in workers:
                        fragments.append(
                            make_fragment(
                                rule_id=self.rule_id,
                                source=EvidenceSource.PERMIT_SYSTEM,
                                dimension=dimension,
                                finding=(
                                    f"{cfg.sensor_type} at {reading.value:.2f}{cfg.unit} "
                                    f"[{band}] while confined space entry permit "
                                    f"{permit.permit_id} is active in Zone {zone_id}"
                                ),
                                severity_contribution=severity,
                                timestamp=snapshot.timestamp,
                                zone_id=zone_id,
                                equipment_id=permit.equipment_id,
                                sensor_id=cfg.sensor_id,
                                worker_id=worker_id,
                                applicable_regulation=_OISD_CONFINED_SPACE_REG,
                                supporting_context=(
                                    f"permit_id={permit.permit_id}",
                                    f"gas_test_completed={permit.gas_test_completed}",
                                    f"value={reading.value}",
                                    f"normal_max={cfg.normal_max}",
                                ),
                            )
                        )
        return tuple(fragments)

    @staticmethod
    def _active_confined_space_permit(zone: ZoneContext) -> PermitState | None:
        for permit in zone.active_permits:
            if permit.confined_space:
                return permit
        return None


class HotWorkGasOverlapRule:
    """Fires when an active hot-work permit overlaps LEL exceeding the 10%
    danger threshold in the same zone -- an explosion precursor, so this
    rule is deliberately calibrated to outrank every other single rule.
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "PERMIT_HOT_WORK_GAS_OVERLAP"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for zone_id, zone in snapshot.zones.items():
            permit = self._active_hot_work_permit(zone)
            if permit is None:
                continue
            for reading, cfg in _gas_readings_in_zone(snapshot, self._thresholds, zone_id):
                if cfg.sensor_type != _LEL_SENSOR_TYPE:
                    continue
                if reading.value <= _LEL_DANGER_THRESHOLD_PCT:
                    continue
                span = max(cfg.critical_max - _LEL_DANGER_THRESHOLD_PCT, 1e-6)
                scaled = (reading.value - _LEL_DANGER_THRESHOLD_PCT) / span
                severity = max(_HOT_WORK_SEVERITY_FLOOR, min(1.0, scaled))
                fragments.append(
                    make_fragment(
                        rule_id=self.rule_id,
                        source=EvidenceSource.PERMIT_SYSTEM,
                        dimension=RiskDimension.EMERGENCY,
                        finding=(
                            f"LEL at {reading.value:.2f}{cfg.unit} in Zone {zone_id} "
                            f"exceeds the {_LEL_DANGER_THRESHOLD_PCT:.0f}% explosion "
                            f"danger threshold while hot work permit {permit.permit_id} "
                            f"is active"
                        ),
                        severity_contribution=severity,
                        timestamp=snapshot.timestamp,
                        zone_id=zone_id,
                        equipment_id=permit.equipment_id,
                        sensor_id=cfg.sensor_id,
                        applicable_regulation=(
                            "Hot Work Permit Procedure - gas test mandatory prior "
                            "to and during hot work"
                        ),
                        supporting_context=(
                            f"permit_id={permit.permit_id}",
                            f"isolation_complete={permit.isolation_complete}",
                            f"value={reading.value}",
                            f"danger_threshold={_LEL_DANGER_THRESHOLD_PCT}",
                        ),
                    )
                )
        return tuple(fragments)

    @staticmethod
    def _active_hot_work_permit(zone: ZoneContext) -> PermitState | None:
        for permit in zone.active_permits:
            if permit.hot_work:
                return permit
        return None


class SimultaneousPermitConflictRule:
    """Fires when two active permits in different zones both have rising
    gas readings at the same instant -- evidence the permit issuer spread
    high-risk work too thin to be monitored properly, independent of
    what either permit's own risk looks like in isolation.
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "PERMIT_SIMULTANEOUS_CONFLICT"
    _SEVERITY = 0.65

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        elevated_zones: dict[str, PermitState] = {}
        for zone_id, zone in snapshot.zones.items():
            active = zone.active_permits
            if not active:
                continue
            if any(_gas_readings_in_zone(snapshot, self._thresholds, zone_id)):
                elevated_zones[zone_id] = active[0]

        fragments = []
        for (zone_a, permit_a), (zone_b, permit_b) in combinations(
            elevated_zones.items(), 2
        ):
            fragments.append(
                make_fragment(
                    rule_id=self.rule_id,
                    source=EvidenceSource.PERMIT_SYSTEM,
                    dimension=RiskDimension.COMPLIANCE,
                    finding=(
                        f"Permits {permit_a.permit_id} (Zone {zone_a}) and "
                        f"{permit_b.permit_id} (Zone {zone_b}) are both active with "
                        f"concurrent rising gas readings -- permit issuance did not "
                        f"account for simultaneous high-risk work"
                    ),
                    severity_contribution=self._SEVERITY,
                    timestamp=snapshot.timestamp,
                    applicable_regulation=(
                        "Permit-to-Work Coordination - concurrent high-risk permits "
                        "require dedicated monitoring per permit"
                    ),
                    supporting_context=(
                        f"permit_a={permit_a.permit_id}",
                        f"permit_b={permit_b.permit_id}",
                        f"zone_a={zone_a}",
                        f"zone_b={zone_b}",
                    ),
                )
            )
        return tuple(fragments)