"""Sensor noise application for the simulator.

Applies configurable Gaussian or uniform noise to a single numeric value
using a deterministic, seedable random source. This module has no
knowledge of events, behaviours, sensors, or telemetry.
"""

import random
from typing import Callable, Optional


class NoiseEngine:
    """Applies configurable noise distributions to a numeric value."""

    def __init__(self, seed: Optional[int] = None) -> None:
        """Create the engine with an optional deterministic random seed."""
        self._random = random.Random(seed)
        self._distributions: dict[str, Callable[[float, float], float]] = {
            "gaussian": self._apply_gaussian,
            "uniform": self._apply_uniform,
        }

    def apply(
        self,
        value: float,
        noise_percent: float,
        distribution: str = "gaussian",
    ) -> float:
        """Return ``value`` perturbed by noise of the given distribution.

        Args:
            value: The ideal, noise-free value to perturb.
            noise_percent: Noise magnitude as a percentage of ``value``.
            distribution: Either "gaussian" or "uniform".

        Returns:
            The noisy value.

        Raises:
            ValueError: If ``distribution`` is not supported.
        """
        normalized = distribution.strip().lower()
        if normalized in {"noise_none"}:
            return value
        if normalized in {"noise_low", "noise_medium", "noise_high"}:
            normalized = "gaussian"
        applicator = self._distributions.get(normalized)
        if applicator is None:
            raise ValueError(f"Unsupported noise distribution '{distribution}'")
        magnitude = self._resolve_magnitude(value, noise_percent)
        return applicator(value, magnitude)

    @staticmethod
    def _resolve_magnitude(value: float, noise_percent: float) -> float:
        """Convert a noise percentage into an absolute noise magnitude."""
        return abs(value) * (noise_percent / 100.0)

    def _apply_gaussian(self, value: float, magnitude: float) -> float:
        """Add zero-mean Gaussian noise with std deviation ``magnitude``."""
        if magnitude <= 0.0:
            return value
        return value + self._random.gauss(0.0, magnitude)

    def _apply_uniform(self, value: float, magnitude: float) -> float:
        """Add uniform noise within +/- ``magnitude`` of ``value``."""
        if magnitude <= 0.0:
            return value
        return value + self._random.uniform(-magnitude, magnitude)