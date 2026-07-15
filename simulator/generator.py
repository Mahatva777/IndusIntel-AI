"""Simulation orchestration for the Industrial Safety Intelligence simulator.

SimulationEngine coordinates already-implemented collaborators (config
loading, event resolution, behaviour evaluation, noise application,
validation, and CSV export) to produce a full telemetry timeline for a
scenario. It contains no mathematical models, no CSV parsing, and no
noise logic of its own.
"""

from typing import Optional

from simulator.behaviors import BehaviorEngine
from simulator.events import EventInterval, EventManager
from simulator.exporter import CSVExporter
from simulator.loader import ConfigLoader
from simulator.models import (
    BehaviorProfile,
    EventProfile,
    EventSensorMapping,
    Scenario,
    Sensor,
    SimulationState,
    TelemetryPoint,
    TelemetryQuality,
)
from simulator.noise import NoiseEngine
from simulator.validator import Validator


class SimulationEngine:
    """Coordinates configuration, events, behaviours, and noise into telemetry."""

    def __init__(
        self,
        config_loader: ConfigLoader,
        behavior_engine: BehaviorEngine,
        noise_engine: NoiseEngine,
        validator: Validator,
        exporter: CSVExporter,
        time_step_seconds: float = 0.5,
    ) -> None:
        """Inject all collaborators required to run a simulation."""
        self._config_loader = config_loader
        self._behavior_engine = behavior_engine
        self._noise_engine = noise_engine
        self._validator = validator
        self._exporter = exporter
        self._time_step_seconds = time_step_seconds

    def run(self, scenario_id: str) -> list[TelemetryPoint]:
        """Run a full simulation for ``scenario_id`` and export the result."""
        config = self._load_configuration()
        scenario = self._get_scenario(config, scenario_id)
        event_manager = self._build_event_manager(config)
        telemetry = self._simulate_scenario(scenario, config, event_manager)
        self._export(telemetry)
        return telemetry

    def _load_configuration(self) -> dict[str, object]:
        """Load and validate all configuration tables."""
        config = self._config_loader.load_all()
        # self._validator.validate(config)
        return config

    @staticmethod
    def _get_scenario(config: dict[str, object], scenario_id: str) -> Scenario:
        """Look up the requested scenario from loaded configuration."""
        scenarios: dict[str, Scenario] = config["scenarios"]  # type: ignore[assignment]
        scenario = scenarios.get(scenario_id)
        if scenario is None:
            raise KeyError(f"Unknown scenario_id '{scenario_id}'")
        return scenario

    @staticmethod
    def _build_event_manager(config: dict[str, object]) -> EventManager:
        """Construct an EventManager from loaded scenarios and event profiles."""
        return EventManager(
            scenarios=config["scenarios"],  # type: ignore[arg-type]
            event_profiles=config["event_profiles"],  # type: ignore[arg-type]
        )

    def _simulate_scenario(
        self,
        scenario: Scenario,
        config: dict[str, object],
        event_manager: EventManager,
    ) -> list[TelemetryPoint]:
        """Step through the scenario's time axis, generating telemetry rows."""
        sensors: dict[str, Sensor] = config["sensors"]  # type: ignore[assignment]
        mappings_by_type = self._index_mappings_by_type(
            config["event_sensor_mappings"]  # type: ignore[arg-type]
        )
        last_values: dict[str, float] = {
            sensor_id: sensor.normal_min for sensor_id, sensor in sensors.items()
        }
        telemetry: list[TelemetryPoint] = []
        for timestamp in self._build_time_axis(scenario):
            telemetry.extend(
                self._generate_timestamp_points(
                    timestamp,
                    scenario,
                    config,
                    event_manager,
                    mappings_by_type,
                    last_values,
                )
            )
        return telemetry

    def _build_time_axis(self, scenario: Scenario) -> list[float]:
        """Build the list of timestamps to simulate for a scenario."""
        axis: list[float] = []
        current = scenario.start_time
        while current <= scenario.end_time:
            axis.append(current)
            current += self._time_step_seconds
        return axis

    @staticmethod
    def _index_mappings_by_type(
        mappings: list[EventSensorMapping],
    ) -> dict[str, list[EventSensorMapping]]:
        """Group event-sensor mappings by the sensor_type they affect."""
        index: dict[str, list[EventSensorMapping]] = {}
        for mapping in mappings:
            index.setdefault(mapping.sensor_type, []).append(mapping)
        return index

    def _generate_timestamp_points(
        self,
        timestamp: float,
        scenario: Scenario,
        config: dict[str, object],
        event_manager: EventManager,
        mappings_by_type: dict[str, list[EventSensorMapping]],
        last_values: dict[str, float],
    ) -> list[TelemetryPoint]:
        """Generate one TelemetryPoint per sensor for a single timestamp."""
        sensors: dict[str, Sensor] = config["sensors"]  # type: ignore[assignment]
        behavior_profiles: dict[str, BehaviorProfile] = config[
            "behavior_profiles"
        ]  # type: ignore[assignment]
        active_event_ids = event_manager.get_active_event_ids(
            scenario.scenario_id, timestamp
        )
        active_events = event_manager.get_active_events(
            scenario.scenario_id, timestamp
        )
        intervals = event_manager.get_intervals(scenario.scenario_id)
        simulation_state = self._determine_simulation_state(active_events)

        # points: list[TelemetryPoint] = []
        # for sensor_id, sensor in sensors.items():
        #     mapping = self._select_mapping(
        #         sensor, active_event_ids, mappings_by_type
        #     )
        #     ideal_value = self._compute_ideal_value(
        #         sensor, mapping, behavior_profiles, intervals, timestamp, last_values
        #     )
        #     last_values[sensor_id] = ideal_value
        #     noisy_value = self._apply_noise(sensor, ideal_value)
        #     point = self._make_telemetry_point(
        #         timestamp, sensor, noisy_value, simulation_state, mapping
        #     )
        #     points.append(point)
        # return points
        points: list[TelemetryPoint] = []
        for sensor_id, sensor in sensors.items():
            mapping = self._select_mapping(
                sensor, active_event_ids, mappings_by_type
            )
            ideal_value = self._compute_ideal_value(
                sensor, mapping, behavior_profiles, intervals, timestamp, last_values
            )
            last_values[sensor_id] = ideal_value
            noisy_value = self._apply_noise(sensor, ideal_value)
            
            # 1. Create the raw point
            raw_point = self._make_telemetry_point(
                timestamp, sensor, noisy_value, simulation_state, mapping
            )
            
            # 2. Pass it through the validator (You might need to track previous_point here if tracking rate-of-change)
            validated_point = self._validator.validate(raw_point)
            
            # 3. Append the validated point instead of the raw one
            points.append(validated_point)
        return points


    @staticmethod
    def _select_mapping(
        sensor: Sensor,
        active_event_ids: tuple[str, ...],
        mappings_by_type: dict[str, list[EventSensorMapping]],
    ) -> Optional[EventSensorMapping]:
        """Pick the highest-priority active mapping affecting this sensor."""
        candidates = [
            mapping
            for mapping in mappings_by_type.get(sensor.sensor_type, [])
            if mapping.event_profile_id in active_event_ids
        ]
        if not candidates:
            return None
        return sorted(candidates, key=lambda mapping: mapping.priority)[0]

    def _compute_ideal_value(
        self,
        sensor: Sensor,
        mapping: Optional[EventSensorMapping],
        behavior_profiles: dict[str, BehaviorProfile],
        intervals: tuple[EventInterval, ...],
        timestamp: float,
        last_values: dict[str, float],
    ) -> float:
        """Compute the noise-free value for a sensor at a timestamp."""
        last_value = last_values.get(sensor.sensor_id, sensor.normal_min)
        if mapping is None:
            profile = behavior_profiles[sensor.behavior_profile_id]
            return self._behavior_engine.compute_value(
                profile,
                current_time=self._time_step_seconds,
                start_value=last_value,
                target_value=last_value,
                duration=profile.default_duration,
            )
        profile = behavior_profiles[mapping.behavior_profile_id]
        start_value = self._resolve_rule_value(
            mapping.start_value_rule, sensor, last_value
        )
        target_value = self._resolve_rule_value(
            mapping.target_value_rule, sensor, last_value
        )
        elapsed = self._elapsed_since_start(
            intervals, mapping.event_profile_id, timestamp
        )
        return self._behavior_engine.compute_value(
            profile,
            current_time=elapsed,
            start_value=start_value,
            target_value=target_value,
            duration=mapping.duration_seconds,
        )

    @staticmethod
    def _elapsed_since_start(
        intervals: tuple[EventInterval, ...],
        event_profile_id: str,
        timestamp: float,
    ) -> float:
        """Compute elapsed time since the matching event interval began."""
        for interval in intervals:
            if interval.event_profile_id == event_profile_id:
                return max(timestamp - interval.start_time, 0.0)
        return 0.0

    @staticmethod
    def _resolve_rule_value(rule: str, sensor: Sensor, last_value: float) -> float:
        """Resolve a start/target value rule string against sensor config."""
        rule = rule.strip().lower()
        keyword_values = {
            "use_current": last_value,
            "use_normal_mid": (sensor.normal_min + sensor.normal_max) / 2.0,
            "normal_mid": (sensor.normal_min + sensor.normal_max) / 2.0,
            "normal_min": sensor.normal_min,
            "normal_max": sensor.normal_max,
            "warning_min": sensor.warning_min,
            "warning_max": sensor.warning_max,
            "critical_min": sensor.critical_min,
            "critical_max": sensor.critical_max,
            "absolute_physical_min": sensor.absolute_physical_min,
            "absolute_physical_max": sensor.absolute_physical_max,
        }
        if rule in keyword_values:
            return keyword_values[rule]
        for keyword, base_value in keyword_values.items():
            if rule.startswith(keyword):
                offset = rule[len(keyword):]
                return base_value + float(offset) if offset else base_value
        return float(rule)

    def _apply_noise(self, sensor: Sensor, ideal_value: float) -> float:
        """Apply the sensor's configured noise to an ideal value."""
        return self._noise_engine.apply(
            ideal_value, sensor.expected_noise_percent, sensor.noise_profile_id
        )

    @staticmethod
    def _determine_quality(sensor: Sensor, value: float) -> TelemetryQuality:
        """Classify a value's quality against the sensor's thresholds."""
        if value <= sensor.critical_min or value >= sensor.critical_max:
            return TelemetryQuality.CRIT
        if value <= sensor.warning_min or value >= sensor.warning_max:
            return TelemetryQuality.WARN
        return TelemetryQuality.OK

    @staticmethod
    def _determine_simulation_state(
        active_events: tuple[EventProfile, ...],
    ) -> SimulationState:
        """Derive the overall simulation phase from currently active events."""
        if not active_events:
            return SimulationState.NORMAL
        severities = {event.severity.strip().lower() for event in active_events}
        if "critical" in severities or "emergency" in severities:
            return SimulationState.EMERGENCY
        if "major" in severities:
            return SimulationState.MAJOR_EVENT
        if "minor" in severities:
            return SimulationState.MINOR_EVENT
        return SimulationState.RECOVERY

    def _make_telemetry_point(
        self,
        timestamp: float,
        sensor: Sensor,
        value: float,
        simulation_state: SimulationState,
        mapping: Optional[EventSensorMapping],
    ) -> TelemetryPoint:
        """Assemble a fully populated TelemetryPoint for one sensor reading."""
        return TelemetryPoint(
            timestamp=timestamp,
            zone_id=sensor.zone_id,
            sensor_id=sensor.sensor_id,
            value=value,
            quality=self._determine_quality(sensor, value),
            simulation_state=simulation_state,
            event_id=mapping.event_profile_id if mapping else None,
        )

    def _export(self, telemetry: list[TelemetryPoint]) -> None:
        """Write the generated telemetry using the injected exporter."""
        self._exporter.export(telemetry)