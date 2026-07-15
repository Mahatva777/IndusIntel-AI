"""Telemetry CSV export for the simulator.

Writes TelemetryPoint objects to telemetry.csv using csv.DictWriter,
supporting both overwrite and append modes. This module performs no
simulation, validation, event, or behaviour logic.
"""

import csv
from pathlib import Path
from typing import Iterable

from simulator.models import TelemetryPoint

_FIELDNAMES = (
    "timestamp",
    "zone_id",
    "sensor_id",
    "value",
    "quality",
    "simulation_state",
    "event_id",
)


class CSVExporter:
    """Writes TelemetryPoint records to a CSV file."""

    def __init__(self, output_path: Path) -> None:
        """Inject the destination CSV file path."""
        self._output_path = output_path

    def export(
        self,
        telemetry: Iterable[TelemetryPoint],
        mode: str = "overwrite",
    ) -> None:
        """Write telemetry points to the configured CSV file.

        Args:
            telemetry: An iterable of TelemetryPoint instances to write.
            mode: Either "overwrite" (replace file contents) or "append"
                (add rows to an existing file, creating it if missing).

        Raises:
            ValueError: If ``mode`` is not "overwrite" or "append".
        """
        file_mode = self._resolve_file_mode(mode)
        write_header = self._should_write_header(mode)
        self._output_path.parent.mkdir(parents=True, exist_ok=True)
        with self._output_path.open(mode=file_mode, newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=_FIELDNAMES)
            if write_header:
                writer.writeheader()
            for point in telemetry:
                writer.writerow(self._row_from_point(point))

    @staticmethod
    def _resolve_file_mode(mode: str) -> str:
        """Translate an export mode name into a file open mode."""
        normalized = mode.strip().lower()
        if normalized == "overwrite":
            return "w"
        if normalized == "append":
            return "a"
        raise ValueError(f"Unsupported export mode '{mode}'")

    def _should_write_header(self, mode: str) -> bool:
        """Determine whether a CSV header row needs to be written."""
        normalized = mode.strip().lower()
        if normalized == "overwrite":
            return True
        return not self._output_path.exists() or self._output_path.stat().st_size == 0

    @staticmethod
    def _row_from_point(point: TelemetryPoint) -> dict[str, str]:
        """Convert a TelemetryPoint into a CSV-writable string row."""
        return {
            "timestamp": str(point.timestamp),
            "zone_id": point.zone_id,
            "sensor_id": point.sensor_id,
            "value": str(point.value),
            "quality": point.quality.value,
            "simulation_state": point.simulation_state.value,
            "event_id": point.event_id if point.event_id is not None else "",
        }