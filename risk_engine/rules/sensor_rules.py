"""Sensor telemetry rules for the Risk Engine (risk_engine/rules/sensor_rules.py).

Reasons over SensorReading values inside a PlantSnapshot. Each rule is
independent, stateless per evaluate() call, and knows nothing about any
other rule. Threshold configuration is injected at construction as
SensorThresholds (built from simulator.Sensor by the caller at wiring
time) -- this module performs no CSV I/O and imports nothing from
simulator itself.
"""

from dataclasses import dataclass
from typing import Iterator, Mapping, Optional

from risk_engine.context import PlantSnapshot, SensorReading
from risk_engine.models import EvidenceFragment, EvidenceSource, RiskDimension
from risk_engine.rules.base import linear_severity, make_fragment

_GAS_SENSOR_TYPES = frozenset(
    {"Toxic Gas (H2S)", "Toxic Gas (CO)", "Flammable Gas (%LEL)"}
)
_OXYGEN_SENSOR_TYPE = "Oxygen"
_HOTSPOT_SENSOR_ID = "Z2_COKEHOTSPOT_01"
_TAR_TEMP_SENSOR_ID = "Z4_TAR_TEMP_01"
_TAR_PRESS_SENSOR_ID = "Z4_PRESS_01"
_OISD_Z3_REGULATION = "OISD-STD-116"
_CONFINED_SPACE_MULTIPLIER = 1.5


@dataclass(slots=True, frozen=True)
class SensorThresholds:
    """Risk-engine-owned projection of simulator.Sensor: only the fields
    these rules need, keeping this module decoupled from the simulator."""

    sensor_id: str
    zone_id: str
    equipment_id: str
    sensor_type: str
    unit: str
    normal_min: float
    normal_max: float
    warning_min: float
    warning_max: float
    critical_min: float
    critical_max: float


def _readings_of_type(
    snapshot: PlantSnapshot,
    thresholds: Mapping[str, SensorThresholds],
    sensor_types: frozenset,
) -> Iterator[tuple[SensorReading, SensorThresholds]]:
    """Yield (reading, cfg) pairs, for configured sensors of these types
    that actually have a reading present in this snapshot."""
    for sensor_id, cfg in thresholds.items():
        if cfg.sensor_type not in sensor_types:
            continue
        reading = snapshot.get_sensor_reading(sensor_id)
        if reading is not None:
            yield reading, cfg


class GasAccumulationRule:
    """Fires when a toxic/flammable gas sensor breaches its warning band."""

    rule_id = "SENSOR_GAS_ACCUMULATION"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for reading, cfg in _readings_of_type(
            snapshot, self._thresholds, _GAS_SENSOR_TYPES
        ):
            if reading.value < cfg.warning_max:
                continue
            severity = linear_severity(reading.value, cfg.warning_max, cfg.critical_max)
            zone = snapshot.get_zone(cfg.zone_id)
            is_confined = zone is not None and any(
                "confined space" in h.lower() for h in zone.hazard_classification
            )
            fragments.append(
                make_fragment(
                    rule_id=self.rule_id,
                    source=EvidenceSource.SENSOR_TELEMETRY,
                    dimension=RiskDimension.PROCESS,
                    finding=(
                        f"{cfg.sensor_type} at {reading.value:.2f}{cfg.unit} in "
                        f"zone {cfg.zone_id} exceeds warning threshold "
                        f"({cfg.warning_max}{cfg.unit})"
                    ),
                    severity_contribution=severity,
                    timestamp=snapshot.timestamp,
                    zone_id=cfg.zone_id,
                    equipment_id=cfg.equipment_id,
                    sensor_id=cfg.sensor_id,
                    applicable_regulation=(
                        _OISD_Z3_REGULATION if is_confined else None
                    ),
                    supporting_context=(
                        f"value={reading.value}",
                        f"warning_threshold={cfg.warning_max}",
                        f"critical_threshold={cfg.critical_max}",
                        f"unit={cfg.unit}",
                        f"confined_space={is_confined}",
                    ),
                )
            )
        return tuple(fragments)


class OxygenDeficiencyRule:
    """Fires when O2 drops below warning/critical minimums; zones whose
    hazard classification names a confined space get a severity multiplier."""

    rule_id = "SENSOR_OXYGEN_DEFICIENCY"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for reading, cfg in _readings_of_type(
            snapshot, self._thresholds, frozenset({_OXYGEN_SENSOR_TYPE})
        ):
            if reading.value > cfg.warning_min:
                continue
            severity = linear_severity(
                -reading.value, -cfg.warning_min, -cfg.critical_min
            )
            zone = snapshot.get_zone(cfg.zone_id)
            is_confined = zone is not None and any(
                "confined space" in h.lower() for h in zone.hazard_classification
            )
            if is_confined:
                severity = min(1.0, severity * _CONFINED_SPACE_MULTIPLIER)
            finding = (
                f"Oxygen at {reading.value:.2f}{cfg.unit} in zone {cfg.zone_id} "
                f"below warning minimum ({cfg.warning_min}{cfg.unit})"
                + (" -- confined space" if is_confined else "")
            )
            context = (
                f"value={reading.value}",
                f"warning_threshold={cfg.warning_min}",
                f"critical_threshold={cfg.critical_min}",
                f"unit={cfg.unit}",
                f"confined_space={is_confined}",
            )
            for dimension in (RiskDimension.PROCESS, RiskDimension.WORKER):
                fragments.append(
                    make_fragment(
                        rule_id=self.rule_id,
                        source=EvidenceSource.SENSOR_TELEMETRY,
                        dimension=dimension,
                        finding=finding,
                        severity_contribution=severity,
                        timestamp=snapshot.timestamp,
                        zone_id=cfg.zone_id,
                        equipment_id=cfg.equipment_id,
                        sensor_id=cfg.sensor_id,
                        supporting_context=context,
                    )
                )
        return tuple(fragments)


class ThermalAnomalyRule:
    """Fires on coke-bed hotspot (IR spike) or tar-decanter over-temperature."""

    rule_id = "SENSOR_THERMAL_ANOMALY"
    _MONITORED_SENSORS = (_HOTSPOT_SENSOR_ID, _TAR_TEMP_SENSOR_ID)

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for sensor_id in self._MONITORED_SENSORS:
            cfg = self._thresholds.get(sensor_id)
            reading = snapshot.get_sensor_reading(sensor_id)
            if cfg is None or reading is None or reading.value < cfg.warning_max:
                continue
            severity = linear_severity(reading.value, cfg.warning_max, cfg.critical_max)
            fragments.append(
                make_fragment(
                    rule_id=self.rule_id,
                    source=EvidenceSource.SENSOR_TELEMETRY,
                    dimension=RiskDimension.EQUIPMENT,
                    finding=(
                        f"{cfg.sensor_type} at {reading.value:.2f}{cfg.unit} "
                        f"exceeds warning threshold ({cfg.warning_max}{cfg.unit})"
                    ),
                    severity_contribution=severity,
                    timestamp=snapshot.timestamp,
                    zone_id=cfg.zone_id,
                    equipment_id=cfg.equipment_id,
                    sensor_id=cfg.sensor_id,
                    supporting_context=(
                        f"value={reading.value}",
                        f"warning_threshold={cfg.warning_max}",
                        f"critical_threshold={cfg.critical_max}",
                        f"unit={cfg.unit}",
                    ),
                )
            )
        return tuple(fragments)


class PressureSurgeRule:
    """Fires when tar-extractor draft pressure exits its normal band.

    The band is negative (-10 to -5 mmWC); breaching high (toward/above 0)
    and breaching low (more negative, toward vacuum) are both detected by
    negating value/thresholds before reuse of the shared high-is-bad
    ``linear_severity`` helper.
    """

    rule_id = "SENSOR_PRESSURE_SURGE"

    def __init__(self, thresholds: Mapping[str, SensorThresholds]) -> None:
        self._thresholds = thresholds

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        cfg = self._thresholds.get(_TAR_PRESS_SENSOR_ID)
        reading = snapshot.get_sensor_reading(_TAR_PRESS_SENSOR_ID)
        if cfg is None or reading is None:
            return ()

        severity: Optional[float] = None
        direction = ""
        if reading.value > cfg.warning_max:
            severity = linear_severity(reading.value, cfg.warning_max, cfg.critical_max)
            direction = "above"
        elif reading.value < cfg.warning_min:
            severity = linear_severity(
                -reading.value, -cfg.warning_min, -cfg.critical_min
            )
            direction = "below"
        if severity is None:
            return ()

        return (
            make_fragment(
                rule_id=self.rule_id,
                source=EvidenceSource.SENSOR_TELEMETRY,
                dimension=RiskDimension.PROCESS,
                finding=(
                    f"Draft pressure at {reading.value:.2f}{cfg.unit} in zone "
                    f"{cfg.zone_id} is {direction} the normal band "
                    f"({cfg.normal_min} to {cfg.normal_max}{cfg.unit})"
                ),
                severity_contribution=severity,
                timestamp=snapshot.timestamp,
                zone_id=cfg.zone_id,
                equipment_id=cfg.equipment_id,
                sensor_id=cfg.sensor_id,
                supporting_context=(
                    f"value={reading.value}",
                    f"warning_band=({cfg.warning_min},{cfg.warning_max})",
                    f"critical_band=({cfg.critical_min},{cfg.critical_max})",
                    f"unit={cfg.unit}",
                ),
            ),
        )