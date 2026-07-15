"""Mathematical behaviour evaluation for the simulator.

Given a BehaviorProfile and a time/value window, computes the ideal
(noise-free) sensor value at a point in time. This module has no
knowledge of sensors, events, files, or noise.
"""

import math
import random
from typing import Callable

from simulator.models import BehaviorProfile


class BehaviorEngine:
    """Evaluates the mathematical model described by a BehaviorProfile."""

    def __init__(self) -> None:
        """Build the dispatch table mapping model names to evaluators."""
        self._rng = random.Random(0)
        self._models: dict[str, Callable[[float, float, float], float]] = {
            "linear": self._linear,
            "linear_ramp": self._linear,
            "linear_ramp_down": self._linear,
            "step": self._step,
            "exponential_rise": self._exponential_rise,
            "exponential": self._exponential_rise,
            "exponential_decay": self._exponential_decay,
            "asymptotic": self._asymptotic,
            "sigmoid": self._sigmoid,
            "logarithmic": self._logarithmic,
            "oscillating": self._oscillating,
            "sinusoidal": self._oscillating,
            "bounded_random_walk": self._bounded_random_walk,
            "constant": self._constant,
            "first_order_lag": self._exponential_rise,
            "exponential_with_lag": self._exponential_rise,
            "linear_slow": self._linear,
            "triangle_wave": self._triangle_wave,
            "step_plus_decay": self._step_plus_decay,
            "linear_or_exponential": self._linear_or_exponential,
        }

    def compute_value(
        self,
        profile: BehaviorProfile,
        current_time: float,
        start_value: float,
        target_value: float,
        duration: float,
    ) -> float:
        """Compute the ideal value for a sensor at ``current_time``.

        Args:
            profile: The behaviour profile defining the mathematical model.
            current_time: Elapsed time since the behaviour started, in seconds.
            start_value: The value at the start of the behaviour.
            target_value: The value the behaviour tends toward.
            duration: Total duration of the behaviour, in seconds.

        Returns:
            The ideal (noise-free) sensor value at ``current_time``.

        Raises:
            ValueError: If the profile references an unsupported model.
        """
        model_name = profile.mathematical_model.strip().lower()
        evaluator = self._models.get(model_name)
        if evaluator is None:
            raise ValueError(
                f"Unsupported mathematical_model '{profile.mathematical_model}' "
                f"for behavior_profile_id '{profile.behavior_profile_id}'"
            )
        fraction = self._fraction(current_time, duration)
        return evaluator(fraction, start_value, target_value)

    @staticmethod
    def _fraction(current_time: float, duration: float) -> float:
        """Clamp elapsed time into a normalized [0, 1] progress fraction."""
        if duration <= 0:
            return 1.0
        return min(max(current_time / duration, 0.0), 1.0)

    @staticmethod
    def _linear(fraction: float, start_value: float, target_value: float) -> float:
        """Constant-rate transition from start_value to target_value."""
        return start_value + (target_value - start_value) * fraction

    @staticmethod
    def _constant(fraction: float, start_value: float, target_value: float) -> float:
        """Return the baseline value for stable profiles."""
        return start_value

    @staticmethod
    def _step(fraction: float, start_value: float, target_value: float) -> float:
        """Instantaneous jump from start_value to target_value."""
        return target_value if fraction > 0.0 else start_value

    @staticmethod
    def _triangle_wave(fraction: float, start_value: float, target_value: float) -> float:
        """Triangle-wave oscillation between start_value and target_value."""
        period = 0.5
        if fraction <= period:
            return start_value + (target_value - start_value) * (fraction / period)
        return target_value + (start_value - target_value) * ((fraction - period) / period)

    @staticmethod
    def _step_plus_decay(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Immediate spike followed by a smooth decay toward the baseline."""
        if fraction <= 0.0:
            return start_value
        decay = math.exp(-5.0 * fraction)
        return target_value + (start_value - target_value) * decay

    @staticmethod
    def _linear_or_exponential(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Blend linear falloff and exponential decay for recovery profiles."""
        linear = start_value + (target_value - start_value) * fraction
        exponential = target_value + (start_value - target_value) * math.exp(-5.0 * fraction)
        return 0.5 * (linear + exponential)

    @staticmethod
    def _exponential_rise(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Fast-then-slowing approach toward target_value from below or above."""
        growth = 1.0 - math.exp(-5.0 * fraction)
        return start_value + (target_value - start_value) * growth

    @staticmethod
    def _exponential_decay(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Fast-then-slowing decay from start_value toward target_value."""
        decay = math.exp(-5.0 * fraction)
        return target_value + (start_value - target_value) * decay

    @staticmethod
    def _asymptotic(fraction: float, start_value: float, target_value: float) -> float:
        """Smooth approach toward target_value that never quite reaches it."""
        approach = fraction / (1.0 + fraction)
        normalizer = 1.0 / 1.5
        return start_value + (target_value - start_value) * (approach / normalizer)

    @staticmethod
    def _sigmoid(fraction: float, start_value: float, target_value: float) -> float:
        """S-shaped transition, slow start and end, fast in the middle."""
        steepness = 10.0
        midpoint = 0.5
        curve = 1.0 / (1.0 + math.exp(-steepness * (fraction - midpoint)))
        curve_min = 1.0 / (1.0 + math.exp(steepness * midpoint))
        curve_max = 1.0 / (1.0 + math.exp(-steepness * midpoint))
        normalized = (curve - curve_min) / (curve_max - curve_min)
        return start_value + (target_value - start_value) * normalized

    @staticmethod
    def _logarithmic(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Rapid initial change that flattens out approaching target_value."""
        scale = math.log(1.0 + 9.0 * fraction) / math.log(10.0)
        return start_value + (target_value - start_value) * scale

    @staticmethod
    def _oscillating(
        fraction: float, start_value: float, target_value: float
    ) -> float:
        """Damped oscillation settling on target_value."""
        amplitude = (target_value - start_value) * math.exp(-3.0 * fraction)
        wave = math.sin(2.0 * math.pi * 3.0 * fraction)
        return target_value + amplitude * wave

    def _bounded_random_walk(
        self, fraction: float, start_value: float, target_value: float
    ) -> float:
        """Small bounded random walk around the current baseline."""
        step = self._rng.uniform(-0.1, 0.1)
        baseline = start_value + (target_value - start_value) * fraction
        return baseline + step