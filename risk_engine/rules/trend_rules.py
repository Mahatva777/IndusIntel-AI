"""Temporal trend rules for the Risk Engine (risk_engine/rules/trend_rules.py).

Unlike every other rule module in risk_engine/rules/*.py, the rules here
are STATEFUL: they remember a bounded window of recent PlantSnapshots per
sensor and reason over the *shape* of a value's history, not just its
current reading. This is the "the Risk Engine remembers previous events"
requirement -- a single-point threshold breach cannot tell an operator
whether a gas reading is climbing steadily, spiking suddenly, or has been
stuck in a warning band for minutes; that requires memory.

Because of this, each rule below exposes an ``update(snapshot)`` method
IN ADDITION to the standard ``evaluate(snapshot)`` from base.Rule. The
calling RuleEngine must call ``update`` once per snapshot, in timestamp
order, before calling ``evaluate`` for that same snapshot. The two steps
are deliberately separate (not fused into one method) so a rule's
internal window can be inspected or reset independently of triggering a
fragment computation -- this is what makes a stateful rule testable:
construct it empty, call update() N times with synthetic snapshots, then
assert on evaluate()'s output, with no hidden global state anywhere.

The state itself (per-sensor deques / start-timestamps) lives on the
rule instance, never on PlantSnapshot -- PlantSnapshot stays an
immutable, single-instant value object, matching every other consumer's
assumption about it (see context.py's docstring).
"""

from collections import deque
from dataclasses import dataclass
from typing import Deque, Mapping, Protocol, runtime_checkable

from risk_engine.context import PlantSnapshot, SensorQuality
from risk_engine.models import EvidenceFragment, EvidenceSource, RiskDimension
from risk_engine.rules.base import make_fragment
from risk_engine.rules.sensor_rules import SensorThresholds

_GAS_SENSOR_TYPES = frozenset(
    {"Toxic Gas (H2S)", "Toxic Gas (CO)", "Toxic Gas (NH3)", "Flammable Gas (%LEL)"}
)
# Sensor types for which a large fractional swing within one window is a
# meaningful physical event. Deliberately excludes boolean/position types
# (Position/Pressure Switch, Boolean) whose critical_max-normal_min span
# is tiny (often 0-1), which would make RapidEscalationRule fire on every
# ordinary state change -- see Step 2 review.
_ESCALATION_SENSOR_TYPES = _GAS_SENSOR_TYPES | {
    "Infrared Thermal",
    "Temperature",
    "Pressure (Draft)",
}


@runtime_checkable
class StatefulRule(Protocol):
    """Structural contract for a Rule that also carries a memory window.

    Deliberately NOT merged into base.Rule: most rules in this codebase
    are pure, and forcing every rule to implement a no-op update() would
    blur that distinction for no benefit. A RuleEngine that wants to
    drive stateful rules checks `isinstance(rule, StatefulRule)` and
    calls update() before evaluate(); pure rules never see update().
    
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id: str

    def update(self, snapshot: PlantSnapshot) -> None: ...

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]: ...

    def reset(self) -> None: ...


@dataclass(slots=True, frozen=True)
class _Sample:
    """One (timestamp, value) observation retained in a trend window."""

    timestamp: float
    value: float


class GasRisingTrendRule:
    """Fires when a gas sensor's last N readings rise monotonically AND
    the current value already sits outside its normal band.

    This is distinct from sensor_rules.GasAccumulationRule: that rule
    fires on a single point above the warning threshold, this one fires
    on the *trajectory* -- it catches acceleration, which is what tells
    an operator "this is going to breach critical soon" rather than
    "this already breached warning".
    
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "TREND_GAS_RISING"

    def __init__(
        self, thresholds: Mapping[str, SensorThresholds], window_size: int = 10
    ) -> None:
        self._thresholds = thresholds
        self._window_size = window_size
        self._windows: dict[str, Deque[_Sample]] = {}

    def reset(self) -> None:
        self._windows.clear()

    def update(self, snapshot: PlantSnapshot) -> None:
        for sensor_id, cfg in self._thresholds.items():
            if cfg.sensor_type not in _GAS_SENSOR_TYPES:
                continue
            reading = snapshot.get_sensor_reading(sensor_id)
            if reading is None:
                continue
            window = self._windows.setdefault(sensor_id, deque(maxlen=self._window_size))
            window.append(_Sample(snapshot.timestamp, reading.value))

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for sensor_id, window in self._windows.items():
            cfg = self._thresholds.get(sensor_id)
            if cfg is None or len(window) < 2 or not self._is_rising(window):
                continue
            if window[-1].value <= cfg.normal_max:
                continue
            fragments.append(self._make_fragment(sensor_id, cfg, window))
        return tuple(fragments)

    @staticmethod
    def _is_rising(window: Deque[_Sample]) -> bool:
        values = [s.value for s in window]
        return all(b >= a for a, b in zip(values, values[1:]))

    @staticmethod
    def _make_fragment(sensor_id: str, cfg: SensorThresholds, window: Deque[_Sample]):
        first, last = window[0], window[-1]
        elapsed = max(last.timestamp - first.timestamp, 1e-6)
        rate = (last.value - first.value) / elapsed
        span = max(cfg.critical_max - cfg.normal_max, 1e-6)
        severity = max(0.0, min(1.0, (last.value - cfg.normal_max) / span))
        return make_fragment(
            rule_id=GasRisingTrendRule.rule_id,
            source=EvidenceSource.HISTORICAL_TREND,
            dimension=RiskDimension.PROCESS,
            finding=(
                f"{sensor_id} increased from {first.value:.2f}{cfg.unit} to "
                f"{last.value:.2f}{cfg.unit} over the last {elapsed:.1f}s "
                f"(rate: {rate:+.2f}{cfg.unit}/s)"
            ),
            severity_contribution=severity,
            timestamp=last.timestamp,
            zone_id=cfg.zone_id,
            equipment_id=cfg.equipment_id,
            sensor_id=sensor_id,
            supporting_context=(
                f"window_readings={len(window)}",
                f"first_value={first.value}",
                f"last_value={last.value}",
                f"rate_per_second={rate}",
            ),
        )


class RapidEscalationRule:
    """Fires when a sensor's value swings by more than a fraction of its
    critical range within a single window, regardless of monotonicity.

    Complements GasRisingTrendRule: a value that spikes and jitters
    (up-down-up-down but net far higher) would never satisfy the strict
    "every step non-decreasing" check above, yet is just as dangerous --
    this rule looks only at the net displacement across the window.
    
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "TREND_RAPID_ESCALATION"
    _ESCALATION_FRACTION = 0.20

    def __init__(
        self, thresholds: Mapping[str, SensorThresholds], window_size: int = 10
    ) -> None:
        self._thresholds = thresholds
        self._window_size = window_size
        self._windows: dict[str, Deque[_Sample]] = {}

    def reset(self) -> None:
        self._windows.clear()

    def update(self, snapshot: PlantSnapshot) -> None:
        for sensor_id, cfg in self._thresholds.items():
            if cfg.sensor_type not in _ESCALATION_SENSOR_TYPES:
                continue
            reading = snapshot.get_sensor_reading(sensor_id)
            if reading is None:
                continue
            window = self._windows.setdefault(sensor_id, deque(maxlen=self._window_size))
            window.append(_Sample(snapshot.timestamp, reading.value))

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for sensor_id, window in self._windows.items():
            cfg = self._thresholds.get(sensor_id)
            if cfg is None or len(window) < 2:
                continue
            span = cfg.critical_max - cfg.normal_min
            if span <= 0:
                continue
            values = [s.value for s in window]
            delta_fraction = (max(values) - min(values)) / span
            if delta_fraction < self._ESCALATION_FRACTION or values[-1] < max(values):
                continue
            fragments.append(self._make_fragment(sensor_id, cfg, window, delta_fraction))
        return tuple(fragments)

    @staticmethod
    def _make_fragment(sensor_id, cfg, window, delta_fraction):
        first, last = window[0], window[-1]
        severity = max(0.75, min(1.0, delta_fraction))
        return make_fragment(
            rule_id=RapidEscalationRule.rule_id,
            source=EvidenceSource.HISTORICAL_TREND,
            dimension=RiskDimension.EMERGENCY,
            finding=(
                f"{sensor_id} escalated rapidly: {first.value:.2f}{cfg.unit} -> "
                f"{last.value:.2f}{cfg.unit} within the last {len(window)} readings "
                f"({delta_fraction * 100:.0f}% of critical range)"
            ),
            severity_contribution=severity,
            timestamp=last.timestamp,
            zone_id=cfg.zone_id,
            equipment_id=cfg.equipment_id,
            sensor_id=sensor_id,
            supporting_context=(
                f"min_value={min(s.value for s in window)}",
                f"max_value={max(s.value for s in window)}",
                f"delta_fraction={delta_fraction}",
            ),
        )


class SustainedWarningRule:
    """Fires when a sensor has remained continuously in the WARN quality
    band for at least ``min_duration_seconds``.

    A brief excursion into WARN that clears on the next reading is
    ordinary noise; a sensor stuck in WARN signals the plant has settled
    into a genuinely abnormal steady state -- something no single-point
    check can distinguish from a transient blip.
    
    This agent independently inspects its domain and reports evidence without knowledge of other agents' findings.
    """

    rule_id = "TREND_SUSTAINED_WARNING"

    def __init__(self, min_duration_seconds: float = 10.0) -> None:
        self._min_duration_seconds = min_duration_seconds
        self._warn_since: dict[str, float] = {}
        self._latest_value: dict[str, tuple[float, str]] = {}  # sensor_id -> (value, zone_id)

    def reset(self) -> None:
        self._warn_since.clear()
        self._latest_value.clear()

    def update(self, snapshot: PlantSnapshot) -> None:
        for sensor_id, reading in snapshot.sensor_readings.items():
            self._latest_value[sensor_id] = (reading.value, reading.zone_id)
            if reading.quality == SensorQuality.WARN:
                self._warn_since.setdefault(sensor_id, snapshot.timestamp)
            else:
                self._warn_since.pop(sensor_id, None)

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        fragments = []
        for sensor_id, started_at in self._warn_since.items():
            duration = snapshot.timestamp - started_at
            if duration < self._min_duration_seconds:
                continue
            value, zone_id = self._latest_value.get(sensor_id, (None, None))
            if value is None:
                continue
            fragments.append(
                self._make_fragment(sensor_id, zone_id, value, duration, snapshot.timestamp)
            )
        return tuple(fragments)

    @staticmethod
    def _make_fragment(
        sensor_id: str, zone_id: str, value: float, duration: float, timestamp: float
    ):
        severity = min(1.0, duration / 60.0)
        return make_fragment(
            rule_id=SustainedWarningRule.rule_id,
            source=EvidenceSource.HISTORICAL_TREND,
            dimension=RiskDimension.PROCESS,
            finding=(
                f"{sensor_id} has remained in the WARNING band for "
                f"{duration:.1f}s continuously (current value={value:.2f})"
            ),
            severity_contribution=severity,
            timestamp=timestamp,
            zone_id=zone_id,
            sensor_id=sensor_id,
            supporting_context=(f"duration_seconds={duration}", f"value={value}"),
        )