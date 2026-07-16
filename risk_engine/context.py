"""Read-only plant context objects for the Risk Engine.

Defines the synchronized view of plant state that every rule module
consumes: PlantSnapshot and the lightweight context records it is built
from (SensorReading, PermitState, WorkerState, MaintenanceState, and the
per-zone aggregate ZoneContext). This module is intentionally decoupled
from simulator/models.py -- it is the Risk Engine's own bounded context,
translated at the ingestion boundary (SnapshotBuilder, not yet built).

No fusion logic, no scoring, no I/O. Only structure and pure navigation
helpers (lookups/filters) live here.
"""

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Optional

from risk_engine.models import CVEvent


def _require_non_empty(value: str, field_name: str) -> None:
    """Raise ValueError if ``value`` is an empty or whitespace-only string."""
    if not value.strip():
        raise ValueError(f"{field_name} must not be empty")


class SensorQuality(Enum):
    """Risk-engine-owned quality vocabulary, decoupled from the simulator's
    TelemetryQuality so a simulator refactor cannot silently break rules."""

    OK = "OK"
    WARN = "WARN"
    CRIT = "CRIT"


@dataclass(slots=True, frozen=True)
class SensorReading:
    """One sensor's value at the snapshot instant."""

    sensor_id: str
    zone_id: str
    value: float
    quality: SensorQuality
    event_id: Optional[str] = None

    def __post_init__(self) -> None:
        _require_non_empty(self.sensor_id, "SensorReading.sensor_id")
        _require_non_empty(self.zone_id, "SensorReading.zone_id")


@dataclass(slots=True, frozen=True)
class PermitState:
    """Read-only view of one permit-to-work record active at this instant."""

    permit_id: str
    zone_id: str
    equipment_id: str
    permit_type: str
    status: str
    workers_assigned: tuple[str, ...]
    isolation_complete: bool
    gas_test_completed: bool
    hot_work: bool
    confined_space: bool
    lockout_tagout: bool
    risk_level: str

    def __post_init__(self) -> None:
        _require_non_empty(self.permit_id, "PermitState.permit_id")
        _require_non_empty(self.zone_id, "PermitState.zone_id")

    @property
    def is_active(self) -> bool:
        """Whether this permit's status marks it as currently in force."""
        return self.status.strip().upper() == "ACTIVE"


@dataclass(slots=True, frozen=True)
class WorkerState:
    """Read-only view of one worker's identity and current location."""

    worker_id: str
    role: str
    ppe_level: str
    current_zone: str
    medical_status: str
    rfid_tag: Optional[str] = None

    def __post_init__(self) -> None:
        _require_non_empty(self.worker_id, "WorkerState.worker_id")


@dataclass(slots=True, frozen=True)
class MaintenanceState:
    """Read-only view of one maintenance task active at this instant."""

    maintenance_id: str
    equipment_id: str
    zone_id: str
    maintenance_type: str
    priority: str
    status: str
    permit_reference: Optional[str] = None

    def __post_init__(self) -> None:
        _require_non_empty(self.maintenance_id, "MaintenanceState.maintenance_id")

    @property
    def is_in_progress(self) -> bool:
        """Whether this task's status marks it as currently underway."""
        return self.status.strip().upper() == "IN_PROGRESS"


@dataclass(slots=True, frozen=True)
class ZoneContext:
    """Fused static configuration + runtime state for one zone.

    Combines zones.csv-derived hazard/PPE metadata with the permits,
    workers, and maintenance tasks currently associated with this zone,
    so a rule can ask one object instead of cross-referencing four tables.
    """

    zone_id: str
    hazard_classification: tuple[str, ...]
    ppe_required: tuple[str, ...]
    permit_required: bool
    permits_in_window: tuple[PermitState, ...] = field(default_factory=tuple)
    workers_present: tuple[WorkerState, ...] = field(default_factory=tuple)
    active_maintenance: tuple[MaintenanceState, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        _require_non_empty(self.zone_id, "ZoneContext.zone_id")

    @property
    def active_permits(self) -> tuple[PermitState, ...]:
        """Permits that are both temporally in-window AND status ACTIVE.

        This is what every rule should read by default. ``permits_in_window``
        is the raw, unfiltered feed SnapshotBuilder produces from time-range
        matching alone -- it can and does contain PLANNED, CANCELLED, or
        EXPIRED permits whose schedule happens to overlap this instant. Only
        reach for ``permits_in_window`` directly if a rule specifically needs
        to reason about non-active permits (e.g. a future "permit scheduled
        but never activated" process-risk rule).
        """
        return tuple(p for p in self.permits_in_window if p.is_active)

    def has_confined_space_permit(self) -> bool:
        """Whether any active permit in this zone is a confined-space entry."""
        return any(p.confined_space for p in self.active_permits)

    def has_hot_work_permit(self) -> bool:
        """Whether any active permit in this zone is hot work."""
        return any(p.hot_work for p in self.active_permits)


@dataclass(slots=True, frozen=True)
class PlantSnapshot:
    """Synchronized view of the entire plant at a single timestamp.

    Constructed once per timestep by a future SnapshotBuilder and handed,
    read-only, to every rule module (SensorRules, PermitRules, WorkerRules,
    CVRules, TrendRules). No rule mutates this object; each rule only reads
    from it and emits EvidenceFragment values.
    """

    timestamp: float
    scenario_id: Optional[str]
    zones: Mapping[str, ZoneContext]
    sensor_readings: Mapping[str, SensorReading]
    cv_events: tuple[CVEvent, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if not isinstance(self.zones, MappingProxyType):
            object.__setattr__(self, "zones", MappingProxyType(dict(self.zones)))
        if not isinstance(self.sensor_readings, MappingProxyType):
            object.__setattr__(
                self, "sensor_readings", MappingProxyType(dict(self.sensor_readings))
            )

    def get_zone(self, zone_id: str) -> Optional[ZoneContext]:
        """Look up a zone's context by id, or None if absent from this snapshot."""
        return self.zones.get(zone_id)

    def get_sensor_reading(self, sensor_id: str) -> Optional[SensorReading]:
        """Look up one sensor's reading by id, or None if absent."""
        return self.sensor_readings.get(sensor_id)

    def sensors_in_zone(self, zone_id: str) -> tuple[SensorReading, ...]:
        """Return all sensor readings whose zone_id matches ``zone_id``."""
        return tuple(
            reading
            for reading in self.sensor_readings.values()
            if reading.zone_id == zone_id
        )

    def cv_events_in_zone(self, zone_id: str) -> tuple[CVEvent, ...]:
        """Return all CV events whose zone_id matches ``zone_id``."""
        return tuple(event for event in self.cv_events if event.zone_id == zone_id)