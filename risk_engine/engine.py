"""Top-level orchestrator for the Risk Engine (risk_engine/engine.py).

The single public entry point every consumer (dashboard API, demo
script, future agents) calls. RiskEngine owns nothing that any other
module doesn't already own -- it only sequences calls in the right
order and accumulates the results every consumer needs read access to:

    SnapshotProducer.produce()
        -> (stateful Rule.update() for trend rules)
        -> FusionEngine.assess()          [risk_engine/fusion.py]
        -> AlertManager.process()         [risk_engine/alerts.py]

Every concrete type (CSVSnapshotProducer, ConfigLoader, which Rule
classes exist) is known ONLY inside ``from_config``. RiskEngine's own
constructor and instance methods see nothing narrower than the
SnapshotProducer / Rule / FusionEngine / AlertManager abstractions
already defined elsewhere in this package -- a live-streaming producer
(MQTT/Kafka, per snapshot_builder.py's docstring) is a drop-in
replacement with zero changes here.
"""

from pathlib import Path
from typing import Callable, Iterator, Mapping, Optional, Sequence

from risk_engine.alerts import Alert, AlertManager, PlantEmergencyAlert
from risk_engine.context import PlantSnapshot
from risk_engine.fusion import FusionEngine
from risk_engine.models import CompoundRiskAssessment, RiskSeverityBand
from risk_engine.rule_engine import RuleEngine
from risk_engine.rules.base import Rule, RuleSet
from risk_engine.rules.cv_rules import (
    PPEViolationRule,
    SmokeFireRule,
    UnauthorizedEntryDetectionRule,
)
from risk_engine.rules.permit_rules import (
    ConfinedSpaceGasRule,
    HotWorkGasOverlapRule,
    SimultaneousPermitConflictRule,
)
from risk_engine.rules.sensor_rules import (
    GasAccumulationRule,
    OxygenDeficiencyRule,
    PressureSurgeRule,
    SensorThresholds,
    ThermalAnomalyRule,
)
from risk_engine.rules.trend_rules import (
    GasRisingTrendRule,
    RapidEscalationRule,
    SustainedWarningRule,
)
from risk_engine.rules.worker_rules import (
    PPEComplianceRule,
    UnauthorizedEntryRule,
    WorkerInHazardousZoneRule,
)
from risk_engine.snapshot_builder import CSVSnapshotProducer, SnapshotProducer
from simulator.loader import ConfigLoader

# scenario_id -> ready-to-drain SnapshotProducer. from_config()'s producer
# factory closes over config_dir/data_root; RiskEngine itself never sees a
# path, satisfying "must not know about CSV formats or file paths beyond
# what it receives via dependency injection".
SnapshotProducerFactory = Callable[[str], SnapshotProducer]

_MEDIUM_PLUS = frozenset(
    {RiskSeverityBand.MEDIUM, RiskSeverityBand.HIGH, RiskSeverityBand.CRITICAL}
)


def _build_sensor_thresholds(
    config_loader: ConfigLoader,
) -> Mapping[str, SensorThresholds]:
    """Project simulator.Sensor config into the risk_engine-owned
    SensorThresholds shape every sensor/permit/worker/trend rule takes.

    ASSUMPTION FLAGGED FOR REVIEW: no module built so far actually
    exposes a sensor-loading method on ConfigLoader (only
    ``load_zones()`` is used, by snapshot_builder.py). This assumes a
    parallel ``config_loader.load_sensors() -> Mapping[str, Sensor]``
    exists with attributes matching SensorThresholds 1:1, mirroring how
    snapshot_builder.py already projects simulator.Zone -> ZoneContext.
    Verify against simulator/loader.py before relying on this in prod.
    """
    return {
        sensor_id: SensorThresholds(
            sensor_id=sensor.sensor_id,
            zone_id=sensor.zone_id,
            equipment_id=sensor.equipment_tag,
            sensor_type=sensor.sensor_type,
            unit=sensor.unit,
            normal_min=sensor.normal_min,
            normal_max=sensor.normal_max,
            warning_min=sensor.warning_min,
            warning_max=sensor.warning_max,
            critical_min=sensor.critical_min,
            critical_max=sensor.critical_max,
        )
        for sensor_id, sensor in config_loader.load_sensors().items()
    }


def _default_rules(thresholds: Mapping[str, SensorThresholds]) -> tuple[Rule, ...]:
    """The full, opinionated rule set for a standard deployment. Callers
    wanting a different mix (e.g. CV rules disabled, no CV pipeline yet
    wired) should not use this -- construct RiskEngine directly with a
    custom rules list instead of going through from_config's default."""
    return (
        GasAccumulationRule(thresholds),
        OxygenDeficiencyRule(thresholds),
        ThermalAnomalyRule(thresholds),
        PressureSurgeRule(thresholds),
        ConfinedSpaceGasRule(thresholds),
        HotWorkGasOverlapRule(thresholds),
        SimultaneousPermitConflictRule(thresholds),
        WorkerInHazardousZoneRule(thresholds),
        PPEComplianceRule(),
        UnauthorizedEntryRule(),
        PPEViolationRule(),
        SmokeFireRule(),
        UnauthorizedEntryDetectionRule(),
        GasRisingTrendRule(thresholds),
        RapidEscalationRule(thresholds),
        SustainedWarningRule(),
    )


class RiskEngine:
    """Drains a scenario's snapshots through the rule engine, fusion,
    and alerting, and retains everything a dashboard needs to read
    back afterward."""

    def __init__(
        self,
        producer_factory: SnapshotProducerFactory,
        rule_engine: RuleEngine,
        fusion: FusionEngine,
        alert_manager: AlertManager,
        config_loader: Optional[ConfigLoader] = None,
    ) -> None:
        self._producer_factory = producer_factory
        self._rule_engine = rule_engine
        self._fusion = fusion
        self._alert_manager = alert_manager
        self._config_loader = config_loader  # retained for dashboard/debug use only
        self._latest_assessments: dict[str, CompoundRiskAssessment] = {}
        self._alert_history: list[Alert] = []
        self._emergency_history: list[PlantEmergencyAlert] = []

    @classmethod
    def from_config(
        cls,
        config_dir: Path,
        data_root: Path,
        alert_manager: Optional[AlertManager] = None,
    ) -> "RiskEngine":
        """Wire a standard deployment from disk."""
        config_loader = ConfigLoader(config_dir)
        thresholds = _build_sensor_thresholds(config_loader)
        rules = _default_rules(thresholds)
        rule_engine = RuleEngine(rules)
        fusion = FusionEngine()

        def producer_factory(scenario_id: str) -> SnapshotProducer:
            return CSVSnapshotProducer(
                data_dir=data_root,
                config_dir=config_dir,
                scenario_id=scenario_id,
            )

        return cls(
            producer_factory=producer_factory,
            rule_engine=rule_engine,
            fusion=fusion,
            alert_manager=alert_manager or AlertManager(),
            config_loader=config_loader,
        )

    @property
    def latest_assessments(self) -> Mapping[str, CompoundRiskAssessment]:
        """Most recent CompoundRiskAssessment per zone_id seen so far."""
        return dict(self._latest_assessments)

    @property
    def alert_history(self) -> tuple[Alert, ...]:
        """Every alert emitted across all run()/stream() calls so far."""
        return tuple(self._alert_history)

    @property
    def emergency_history(self) -> tuple[PlantEmergencyAlert, ...]:
        """Every plant-wide emergency banner raised so far."""
        return tuple(self._emergency_history)

    def run(self, scenario_id: str) -> list[Alert]:
        """Drain a scenario's full snapshot sequence and return every
        alert raised, in emission order."""
        for _snapshot, _alerts in self.stream(scenario_id):
            pass  # stream() already records state as it goes
        return list(self._alert_history)

    def stream(
        self, scenario_id: str
    ) -> Iterator[tuple[PlantSnapshot, tuple[Alert, ...]]]:
        """Demo/dashboard mode: yield one (snapshot, alerts) pair per
        timestamp as it's produced, instead of draining to a list."""
        producer = self._producer_factory(scenario_id)
        for snapshot in producer.produce():
            fragments = self._rule_engine.evaluate(snapshot)
            assessments = self._fusion.assess(snapshot, fragments)
            self._record_assessments(assessments)
            alerts, emergency = self._alert_manager.process(assessments)
            self._alert_history.extend(alerts)
            if emergency is not None:
                self._emergency_history.append(emergency)
            yield snapshot, alerts

    def _record_assessments(
        self, assessments: Sequence[CompoundRiskAssessment]
    ) -> None:
        for assessment in assessments:
            self._latest_assessments[assessment.zone_id] = assessment


if __name__ == "__main__":
    _CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
    _DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
    _DEMO_SCENARIO = "SCN_GAS_LEAK_CONF_SPACE"

    engine = RiskEngine.from_config(config_dir=_CONFIG_DIR, data_root=_DATA_ROOT)
    all_alerts = engine.run(_DEMO_SCENARIO)
    surfaced = [a for a in all_alerts if a.severity_band in _MEDIUM_PLUS]

    print(f"=== Risk Engine Demo: {_DEMO_SCENARIO} ===")
    print(f"{len(surfaced)} MEDIUM+ alert(s) of {len(all_alerts)} total emitted\n")

    for alert in surfaced:
        print(f"[{alert.severity_band.value}] t={alert.timestamp:.1f}s  {alert.title}")
        print(f"  {alert.explanation}")
        print(f"  Action: {alert.recommended_action}")
        print("  Evidence chain:")
        for finding in alert.evidence_summary:
            print(f"    - {finding}")
        print()

    if engine.emergency_history:
        print(f"!!! {len(engine.emergency_history)} plant emergency banner(s) !!!")
        for emergency in engine.emergency_history:
            print(f"  t={emergency.timestamp:.1f}s  {emergency.summary}")