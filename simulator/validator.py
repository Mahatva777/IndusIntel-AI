"""Telemetry point validation for the simulator.

Clamps generated telemetry to physical sensor limits, enforces realistic
rate-of-change bounds against the previous reading, and assigns a
TelemetryQuality classification. This module performs no file I/O, no
simulation, and no event resolution.
"""

from dataclasses import replace
from typing import Optional

from simulator.models import Sensor, TelemetryPoint, TelemetryQuality


class Validator:
    """Validates and normalizes TelemetryPoint instances against sensor config."""

    def __init__(self, sensors: dict[str, Sensor]) -> None:
        """Inject the sensor lookup used to resolve limits and thresholds."""
        self._sensors = sensors

    def validate(
        self,
        point: TelemetryPoint,
        previous_point: Optional[TelemetryPoint] = None,
    ) -> TelemetryPoint:
        """Return a validated TelemetryPoint with clamped value and quality.

        Args:
            point: The raw telemetry point to validate.
            previous_point: The prior reading for the same sensor, if any,
                used for rate-of-change enforcement.

        Returns:
            A new TelemetryPoint with a physically plausible value and a
            correctly assigned quality classification.
        """
        sensor = self._get_sensor(point.sensor_id)
        value = self._clamp_to_physical_limits(point.value, sensor)
        value = self._enforce_rate_of_change(value, point, previous_point, sensor)
        quality = self._assign_quality(value, sensor)
        return replace(point, value=value, quality=quality)

    def _get_sensor(self, sensor_id: str) -> Sensor:
        """Look up a sensor's configuration, raising if it is unknown."""
        sensor = self._sensors.get(sensor_id)
        if sensor is None:
            raise KeyError(f"Unknown sensor_id '{sensor_id}'")
        return sensor

    @staticmethod
    def _clamp_to_physical_limits(value: float, sensor: Sensor) -> float:
        """Clamp a value within the sensor's absolute physical limits."""
        return min(
            max(value, sensor.absolute_physical_min),
            sensor.absolute_physical_max,
        )

    @staticmethod
    def _enforce_rate_of_change(
        value: float,
        point: TelemetryPoint,
        previous_point: Optional[TelemetryPoint],
        sensor: Sensor,
    ) -> float:
        """Clamp a value so its change since the prior reading is plausible."""
        if previous_point is None:
            return value
        elapsed = point.timestamp - previous_point.timestamp
        if elapsed <= 0:
            return value
        delta = value - previous_point.value
        max_delta = sensor.max_physical_rate_of_change * elapsed
        min_delta = sensor.min_physical_rate_of_change * elapsed
        clamped_delta = min(max(delta, min_delta), max_delta)
        return previous_point.value + clamped_delta

    @staticmethod
    def _assign_quality(value: float, sensor: Sensor) -> TelemetryQuality:
        """Classify a value's quality against the sensor's thresholds."""
        if value <= sensor.critical_min or value >= sensor.critical_max:
            return TelemetryQuality.CRIT
        if value <= sensor.warning_min or value >= sensor.warning_max:
            return TelemetryQuality.WARN
        return TelemetryQuality.OK