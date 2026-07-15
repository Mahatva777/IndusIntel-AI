"""CSV configuration loading for the Industrial Safety Intelligence simulator.

Reads the config/*.csv files and instantiates the typed dataclasses defined
in models.py. No business validation, telemetry generation, or behaviour
logic is performed here.
"""

import csv
from pathlib import Path
from typing import Optional

from simulator.models import (
    BehaviorProfile,
    Equipment,
    EventProfile,
    EventSensorMapping,
    Scenario,
    Sensor,
    Zone,
)

_LIST_DELIMITER = ";"


def _read_rows(path: Path) -> list[dict[str, str]]:
    """Read a CSV file into a list of raw string-keyed row dictionaries."""
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _parse_tuple(raw: str) -> tuple[str, ...]:
    """Split a delimited string field into a tuple, ignoring blanks."""
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(_LIST_DELIMITER) if part.strip())


def _parse_bool(raw: str) -> bool:
    """Parse a CSV boolean-like value."""
    return raw.strip().lower() in {"true", "1", "yes", "y"}


def _parse_optional_str(raw: Optional[str]) -> Optional[str]:
    """Return None for empty/missing string fields, otherwise the value."""
    if raw is None or raw.strip() == "":
        return None
    return raw.strip()


def _parse_float(raw: str) -> float:
    """Parse a required float field."""
    return float(raw)


def _parse_int(raw: str) -> int:
    """Parse a required int field."""
    return int(raw)


class ConfigLoader:
    """Loads plant configuration CSVs into typed domain model instances."""

    def __init__(self, config_dir: Path) -> None:
        """Inject the directory containing the configuration CSV files."""
        self._config_dir = config_dir

    def _path(self, filename: str) -> Path:
        return self._config_dir / filename

    def load_zones(self) -> dict[str, Zone]:
        """Load zones.csv into a dict keyed by zone_id."""
        zones: dict[str, Zone] = {}
        for row in _read_rows(self._path("zones.csv")):
            zone = Zone(
                zone_id=row["zone_id"],
                zone_name=row["zone_name"],
                parent_area=row["parent_area"],
                camera_id=_parse_optional_str(row.get("camera_id")),
                layout_x=_parse_float(row["layout_x"]),
                layout_y=_parse_float(row["layout_y"]),
                layout_width=_parse_float(row["layout_width"]),
                layout_height=_parse_float(row["layout_height"]),
                hazard_classification=_parse_tuple(row["hazard_classification"]),
                ppe_required=_parse_tuple(row["ppe_required"]),
                permit_required=_parse_bool(row["permit_required"]),
                evacuation_route=row["evacuation_route"],
                description=row.get("description", ""),
            )
            zones[zone.zone_id] = zone
        return zones

    def load_equipment(self) -> dict[str, Equipment]:
        """Load equipment.csv into a dict keyed by equipment_id."""
        equipment: dict[str, Equipment] = {}
        for row in _read_rows(self._path("equipment.csv")):
            item = Equipment(
                equipment_id=row["equipment_id"],
                equipment_name=row["equipment_name"],
                zone_id=row["zone_id"],
                status=row["status"],
                manufacturer=_parse_optional_str(row.get("manufacturer")),
                model=_parse_optional_str(row.get("model")),
                criticality=row["criticality"],
                maintenance_interval_days=_parse_int(row["maintenance_interval_days"]),
                associated_sensors=_parse_tuple(row.get("associated_sensors", "")),
            )
            equipment[item.equipment_id] = item
        return equipment

    def load_sensors(self) -> dict[str, Sensor]:
        """Load sensors.csv into a dict keyed by sensor_id."""
        sensors: dict[str, Sensor] = {}
        for row in _read_rows(self._path("sensors.csv")):
            sensor = Sensor(
                sensor_id=row["sensor_id"],
                sensor_type=row["sensor_type"],
                zone_id=row["zone_id"],
                equipment_tag=row["equipment_tag"],
                unit=row["unit"],
                normal_min=_parse_float(row["normal_min"]),
                normal_max=_parse_float(row["normal_max"]),
                warning_min=_parse_float(row["warning_min"]),
                warning_max=_parse_float(row["warning_max"]),
                critical_min=_parse_float(row["critical_min"]),
                critical_max=_parse_float(row["critical_max"]),
                absolute_physical_min=_parse_float(row["absolute_physical_min"]),
                absolute_physical_max=_parse_float(row["absolute_physical_max"]),
                sampling_interval_seconds=_parse_float(
                    row["sampling_interval_seconds"]
                ),
                expected_noise_percent=_parse_float(row["expected_noise_percent"]),
                scada_tag=_parse_optional_str(row.get("SCADA_tag")),
                alarm_priority=row["alarm_priority"],
                behavior_profile_id=row["behavior_profile_id"],
                noise_profile_id=row["noise_profile_id"],
                physical_response_type=row["physical_response_type"],
                inertia_class=row["inertia_class"],
                max_physical_rate_of_change=_parse_float(
                    row["max_physical_rate_of_change"]
                ),
                min_physical_rate_of_change=_parse_float(
                    row["min_physical_rate_of_change"]
                ),
                failure_modes=_parse_tuple(row.get("failure_modes", "")),
                default_quality_mapping_profile_id=_parse_optional_str(
                    row.get("default_quality_mapping_profile_id")
                ),
                operational_phase_tags=_parse_tuple(
                    row.get("operational_phase_tags", "")
                ),
            )
            sensors[sensor.sensor_id] = sensor
        return sensors

    def load_behavior_profiles(self) -> dict[str, BehaviorProfile]:
        """Load behavior_profiles.csv into a dict keyed by behavior_profile_id."""
        profiles: dict[str, BehaviorProfile] = {}
        for row in _read_rows(self._path("behavior_profiles.csv")):
            profile = BehaviorProfile(
                behavior_profile_id=row["behavior_profile_id"],
                behavior_name=row["behavior_name"],
                description=row["description"],
                mathematical_model=row["mathematical_model"],
                default_duration=_parse_float(row["default_duration"]),
                supports_noise=_parse_bool(row["supports_noise"]),
                supports_recovery=_parse_bool(row["supports_recovery"]),
                maximum_rate_of_change=_parse_float(row["maximum_rate_of_change"]),
                minimum_rate_of_change=_parse_float(row["minimum_rate_of_change"]),
                recommended_sensor_types=_parse_tuple(
                    row.get("recommended_sensor_types", "")
                ),
                required_parameters=_parse_tuple(row.get("required_parameters", "")),
                example_graph_shape=_parse_optional_str(
                    row.get("example_graph_shape")
                ),
                industrial_examples=_parse_tuple(
                    row.get("industrial_examples", "")
                ),
            )
            profiles[profile.behavior_profile_id] = profile
        return profiles

    def load_event_profiles(self) -> dict[str, EventProfile]:
        """Load event_profiles.csv into a dict keyed by event_profile_id."""
        events: dict[str, EventProfile] = {}
        for row in _read_rows(self._path("event_profiles.csv")):
            event = EventProfile(
                event_profile_id=row["event_profile_id"],
                event_name=row["event_name"],
                description=row["description"],
                severity=row["severity"],
                priority=row["priority"],
                expected_duration_seconds=_parse_float(
                    row["expected_duration_seconds"]
                ),
                compound_risk_possible=_parse_bool(row["compound_risk_possible"]),
                recommended_response=row["recommended_response"],
                dashboard_color=row["dashboard_color"],
                heatmap_color=row["heatmap_color"],
                ai_reasoning_summary=_parse_optional_str(
                    row.get("ai_reasoning_summary")
                ),
            )
            events[event.event_profile_id] = event
        return events

    def load_event_sensor_mappings(self) -> list[EventSensorMapping]:
        """Load event_sensor_mapping.csv into a list of mapping records."""
        mappings: list[EventSensorMapping] = []
        for row in _read_rows(self._path("event_sensor_mapping.csv")):
            mapping = EventSensorMapping(
                event_profile_id=row["event_profile_id"],
                sensor_type=row["sensor_type"],
                behavior_profile_id=row["behavior_profile_id"],
                start_value_rule=row["start_value_rule"],
                target_value_rule=row["target_value_rule"],
                duration_seconds=_parse_float(row["duration_seconds"]),
                priority=row["priority"],
                supports_noise=_parse_bool(row["supports_noise"]),
                recovery_profile_id=_parse_optional_str(
                    row.get("recovery_profile_id")
                ),
                required_parameters=_parse_tuple(row.get("required_parameters", "")),
            )
            mappings.append(mapping)
        return mappings

    def load_scenarios(self) -> dict[str, Scenario]:
        """Load scenario.csv into a dict keyed by scenario_id."""
        scenarios: dict[str, Scenario] = {}
        for row in _read_rows(self._path("scenario.csv")):
            scenario = Scenario(
                scenario_id=row["scenario_id"],
                name=row["name"],
                description=row["description"],
                start_time=_parse_float(row["start_time"]),
                end_time=_parse_float(row["end_time"]),
                zones_involved=_parse_tuple(row["zones_involved"]),
                permits_involved=_parse_tuple(row.get("permits_involved", "")),
                events_timeline=_parse_tuple(row.get("events_timeline", "")),
                expected_ai_actions=_parse_optional_str(
                    row.get("expected_ai_actions")
                ),
            )
            scenarios[scenario.scenario_id] = scenario
        return scenarios

    def load_all(self) -> dict[str, object]:
        """Load every configuration table, keyed by table name."""
        return {
            "zones": self.load_zones(),
            "equipment": self.load_equipment(),
            "sensors": self.load_sensors(),
            "behavior_profiles": self.load_behavior_profiles(),
            "event_profiles": self.load_event_profiles(),
            "event_sensor_mappings": self.load_event_sensor_mappings(),
            "scenarios": self.load_scenarios(),
        }