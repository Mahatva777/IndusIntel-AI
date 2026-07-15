"""Domain models for the Industrial Safety Intelligence simulator.

Contains only dataclasses, enums, and type aliases representing the
configuration and telemetry schema. No simulation logic, I/O, or
validation beyond lightweight field checks live here.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SimulationState(Enum):
    """Phase of the simulation a telemetry point was generated under."""

    NORMAL = "normal"
    MINOR_EVENT = "minor_event"
    MAJOR_EVENT = "major_event"
    EMERGENCY = "emergency"
    RECOVERY = "recovery"


class TelemetryQuality(Enum):
    """Quality classification of a telemetry reading."""

    OK = "OK"
    WARN = "WARN"
    CRIT = "CRIT"


@dataclass(slots=True, frozen=True)
class Zone:
    """A spatial zone in the plant digital twin (from zones.csv)."""

    zone_id: str
    zone_name: str
    parent_area: str
    camera_id: Optional[str]
    layout_x: float
    layout_y: float
    layout_width: float
    layout_height: float
    hazard_classification: tuple[str, ...]
    ppe_required: tuple[str, ...]
    permit_required: bool
    evacuation_route: str
    description: str = ""


@dataclass(slots=True, frozen=True)
class Equipment:
    """A physical equipment asset grouping sensors (from equipment.csv)."""

    equipment_id: str
    equipment_name: str
    zone_id: str
    status: str
    manufacturer: Optional[str]
    model: Optional[str]
    criticality: str
    maintenance_interval_days: int
    associated_sensors: tuple[str, ...] = field(default_factory=tuple)


@dataclass(slots=True, frozen=True)
class Sensor:
    """A sensor's configuration and physical/behavioural metadata."""

    sensor_id: str
    sensor_type: str
    zone_id: str
    equipment_tag: str
    unit: str
    normal_min: float
    normal_max: float
    warning_min: float
    warning_max: float
    critical_min: float
    critical_max: float
    absolute_physical_min: float
    absolute_physical_max: float
    sampling_interval_seconds: float
    expected_noise_percent: float
    scada_tag: Optional[str]
    alarm_priority: str
    behavior_profile_id: str
    noise_profile_id: str
    physical_response_type: str
    inertia_class: str
    max_physical_rate_of_change: float
    min_physical_rate_of_change: float
    failure_modes: tuple[str, ...] = field(default_factory=tuple)
    default_quality_mapping_profile_id: Optional[str] = None
    operational_phase_tags: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if self.absolute_physical_min > self.absolute_physical_max:
            raise ValueError(
                f"Sensor {self.sensor_id}: absolute_physical_min exceeds max"
            )


@dataclass(slots=True, frozen=True)
class BehaviorProfile:
    """A reusable mathematical behaviour model for sensor value evolution."""

    behavior_profile_id: str
    behavior_name: str
    description: str
    mathematical_model: str
    default_duration: float
    supports_noise: bool
    supports_recovery: bool
    maximum_rate_of_change: float
    minimum_rate_of_change: float
    recommended_sensor_types: tuple[str, ...] = field(default_factory=tuple)
    required_parameters: tuple[str, ...] = field(default_factory=tuple)
    example_graph_shape: Optional[str] = None
    industrial_examples: tuple[str, ...] = field(default_factory=tuple)


@dataclass(slots=True, frozen=True)
class EventProfile:
    """Metadata describing an operational event (no sensor logic)."""

    event_profile_id: str
    event_name: str
    description: str
    severity: str
    priority: str
    expected_duration_seconds: float
    compound_risk_possible: bool
    recommended_response: str
    dashboard_color: str
    heatmap_color: str
    ai_reasoning_summary: Optional[str] = None


@dataclass(slots=True, frozen=True)
class EventSensorMapping:
    """Defines how an active event affects a class of sensors."""

    event_profile_id: str
    sensor_type: str
    behavior_profile_id: str
    start_value_rule: str
    target_value_rule: str
    duration_seconds: float
    priority: str
    supports_noise: bool
    recovery_profile_id: Optional[str] = None
    required_parameters: tuple[str, ...] = field(default_factory=tuple)


@dataclass(slots=True, frozen=True)
class Scenario:
    """A plant-level scenario defining an event timeline for simulation."""

    scenario_id: str
    name: str
    description: str
    start_time: float
    end_time: float
    zones_involved: tuple[str, ...]
    permits_involved: tuple[str, ...] = field(default_factory=tuple)
    events_timeline: tuple[str, ...] = field(default_factory=tuple)
    expected_ai_actions: Optional[str] = None

    def __post_init__(self) -> None:
        if self.start_time >= self.end_time:
            raise ValueError(
                f"Scenario {self.scenario_id}: start_time must precede end_time"
            )


@dataclass(slots=True, frozen=True)
class TelemetryPoint:
    """A single generated telemetry sample (one sensor, one timestamp)."""

    timestamp: float
    zone_id: str
    sensor_id: str
    value: float
    quality: TelemetryQuality
    simulation_state: SimulationState
    event_id: Optional[str] = None