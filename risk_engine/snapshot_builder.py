"""CSV-backed snapshot production for the Risk Engine (risk_engine/snapshot_builder.py).

The only module in risk_engine permitted to touch raw CSV files. Reads
telemetry.csv, permits.csv, workers.csv, and maintenance.csv and yields one
PlantSnapshot per distinct telemetry timestamp, ascending. Downstream code
depends only on the SnapshotProducer Protocol, so a future live-streaming
producer (MQTT/Kafka) can replace CSVSnapshotProducer without touching any
rule, fusion, or alerting module.

Assumption: permit/maintenance windows are ISO wall-clock timestamps while
telemetry timestamps are elapsed seconds. ``scenario_start`` maps the two;
if not supplied it defaults to midnight of the earliest permit/maintenance
date found, so elapsed_seconds == seconds-since-midnight.
"""

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional, Protocol

from risk_engine.context import (
    MaintenanceState,
    PermitState,
    PlantSnapshot,
    SensorQuality,
    SensorReading,
    WorkerState,
    ZoneContext,
)
from simulator.loader import ConfigLoader


class SnapshotProducer(Protocol):
    """Anything that can yield a time-ordered sequence of PlantSnapshots."""

    def produce(self) -> Iterator[PlantSnapshot]:
        ...


def _parse_bool(raw: str) -> bool:
    return raw.strip().lower() in {"true", "1", "yes", "y"}


def _parse_iso(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    return datetime.fromisoformat(raw) if raw else None


@dataclass(slots=True, frozen=True)
class _TimedRecord:
    """A state object paired with its wall-clock activity window."""

    state: object
    start: Optional[datetime]
    end: Optional[datetime]

    def active_at(self, wall_time: Optional[float]) -> bool:
        if wall_time is None:
            if isinstance(self.state, PermitState):
                return self.state.is_active
            if isinstance(self.state, MaintenanceState):
                return self.state.is_in_progress
            return True
        start_ok = self.start is None or self.start.timestamp() <= wall_time
        end_ok = self.end is None or wall_time <= self.end.timestamp()
        return start_ok and end_ok


class CSVSnapshotProducer:
    """Builds PlantSnapshots from pre-generated CSVs in ``data_dir``."""

    def __init__(
        self,
        data_dir: Path,
        config_dir: Path,
        scenario_id: Optional[str] = None,
        scenario_start: Optional[datetime] = None,
    ) -> None:
        self._data_dir = data_dir
        self._config_dir = config_dir
        self._config_loader = ConfigLoader(config_dir)
        self._scenario_id = scenario_id
        self._scenario_start = scenario_start

    def produce(self) -> Iterator[PlantSnapshot]:
        zones = self._config_loader.load_zones()
        permit_required_flags = self._load_permit_required_flags()
        permits = self._load_permits()
        maintenance = self._load_maintenance()
        workers_by_zone = self._load_workers()
        scenario_start = self._scenario_start or self._infer_scenario_start(
            permits, maintenance
        )

        for timestamp, readings in self._iter_telemetry_by_timestamp():
            wall_time = (
                scenario_start.timestamp() + timestamp
                if scenario_start is not None
                else None
            )
            active_permits = [r.state for r in permits if r.active_at(wall_time)]
            active_maint = [r.state for r in maintenance if r.active_at(wall_time)]

            zone_contexts = {
                zone_id: ZoneContext(
                    zone_id=zone_id,
                    hazard_classification=zone.hazard_classification,
                    ppe_required=zone.ppe_required,
                    permit_required=permit_required_flags.get(zone_id, False),
                    permits_in_window=tuple(
                        p for p in active_permits if p.zone_id == zone_id
                    ),
                    workers_present=tuple(workers_by_zone.get(zone_id, [])),
                    active_maintenance=tuple(
                        m for m in active_maint if m.zone_id == zone_id
                    ),
                )
                for zone_id, zone in zones.items()
            }
            yield PlantSnapshot(
                timestamp=timestamp,
                scenario_id=self._scenario_id,
                zones=zone_contexts,
                sensor_readings={r.sensor_id: r for r in readings},
            )

    def _iter_telemetry_by_timestamp(
        self,
    ) -> Iterator[tuple[float, list[SensorReading]]]:
        grouped: dict[float, list[SensorReading]] = {}
        with (self._data_dir / "telemetry.csv").open(
            newline="", encoding="utf-8"
        ) as handle:
            for row in csv.DictReader(handle):
                ts = float(row["timestamp"])
                grouped.setdefault(ts, []).append(
                    SensorReading(
                        sensor_id=row["sensor_id"],
                        zone_id=row["zone_id"],
                        value=float(row["value"]),
                        quality=SensorQuality(row["quality"]),
                        event_id=row.get("event_id") or None,
                    )
                )
        for ts in sorted(grouped):
            yield ts, grouped[ts]

    def _load_permit_required_flags(self) -> dict[str, bool]:
        """Correctly derive permit_required per zone from raw zones.csv.

        simulator.loader.Zone.permit_required is unusable as-is: its
        source column holds permit *type* text ("Confined Space, Gas
        Testing, Isolation"), not a true/false literal, and
        simulator's ``_parse_bool`` only recognizes true/1/yes/y --
        so it evaluates to False for every zone regardless of content.
        simulator/ is not ours to modify, so this reads the same
        column directly and treats "any text present" as required,
        which matches what the column actually encodes.
        """
        flags: dict[str, bool] = {}
        with (self._config_dir / "zones.csv").open(
            newline="", encoding="utf-8"
        ) as handle:
            for row in csv.DictReader(handle):
                flags[row["zone_id"]] = bool(row["permit_required"].strip())
        return flags

    def _load_permits(self) -> list[_TimedRecord]:
        records = []
        with (self._data_dir / "permits.csv").open(
            newline="", encoding="utf-8"
        ) as handle:
            for row in csv.DictReader(handle):
                state = PermitState(
                    permit_id=row["permit_id"],
                    zone_id=row["zone_id"],
                    equipment_id=row["equipment_id"],
                    permit_type=row["permit_type"],
                    status=row["status"],
                    workers_assigned=tuple(
                        w.strip()
                        for w in row["workers_assigned"].split(";")
                        if w.strip()
                    ),
                    isolation_complete=_parse_bool(row["isolation_complete"]),
                    gas_test_completed=_parse_bool(row["gas_test_completed"]),
                    hot_work=_parse_bool(row["hot_work"]),
                    confined_space=_parse_bool(row["confined_space"]),
                    lockout_tagout=_parse_bool(row["lockout_tagout"]),
                    risk_level=row["risk_level"],
                )
                records.append(
                    _TimedRecord(
                        state=state,
                        start=_parse_iso(row["start_time"]),
                        end=_parse_iso(row["end_time"]),
                    )
                )
        return records

    def _load_maintenance(self) -> list[_TimedRecord]:
        records = []
        with (self._data_dir / "maintenance.csv").open(
            newline="", encoding="utf-8"
        ) as handle:
            for row in csv.DictReader(handle):
                state = MaintenanceState(
                    maintenance_id=row["maintenance_id"],
                    equipment_id=row["equipment_id"],
                    zone_id=row["zone_id"],
                    maintenance_type=row["maintenance_type"],
                    priority=row["priority"],
                    status=row["status"],
                    permit_reference=row.get("permit_reference") or None,
                )
                records.append(
                    _TimedRecord(
                        state=state,
                        start=_parse_iso(row["start_time"]),
                        end=_parse_iso(row["end_time"]),
                    )
                )
        return records

    def _load_workers(self) -> dict[str, list[WorkerState]]:
        by_zone: dict[str, list[WorkerState]] = {}
        with (self._data_dir / "workers.csv").open(
            newline="", encoding="utf-8"
        ) as handle:
            for row in csv.DictReader(handle):
                state = WorkerState(
                    worker_id=row["worker_id"],
                    role=row["role"],
                    ppe_level=row["ppe_level"],
                    current_zone=row["current_zone"],
                    medical_status=row["medical_status"],
                    rfid_tag=row.get("rfid_tag") or None,
                )
                by_zone.setdefault(state.current_zone, []).append(state)
        return by_zone

    def _infer_scenario_start(
        self,
        permits: list[_TimedRecord],
        maintenance: list[_TimedRecord],
    ) -> Optional[datetime]:
        relevant: list[_TimedRecord] = []
        if self._scenario_id is not None:
            try:
                scenarios = self._config_loader.load_scenarios()
                scenario = scenarios[self._scenario_id]
                involved = set(scenario.permits_involved)
                if involved:
                    relevant = [
                        r
                        for r in permits
                        if isinstance(r.state, PermitState)
                        and r.state.permit_id in involved
                    ]
            except (KeyError, Exception):
                pass
        if not relevant:
            relevant = permits

        starts = [
            r.start
            for r in relevant + maintenance
            if r.start is not None
        ]
        if not starts:
            return None
        return min(starts)