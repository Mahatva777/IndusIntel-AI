"""Scenario event timeline parsing for the simulator.

Parses Scenario.events_timeline entries into concrete time intervals and
answers which events are active at a given timestamp. This module knows
nothing about sensors, behaviours, telemetry, or noise.
"""

from dataclasses import dataclass

from simulator.models import EventProfile, Scenario

_ENTRY_DELIMITER = "@"
_RANGE_DELIMITER = "-"


@dataclass(slots=True, frozen=True)
class EventInterval:
    """A single event's active time window within a scenario."""

    event_profile_id: str
    start_time: float
    end_time: float

    def contains(self, timestamp: float) -> bool:
        """Return True if ``timestamp`` falls within this interval."""
        return self.start_time <= timestamp <= self.end_time


class EventManager:
    """Parses scenario timelines and resolves active events per timestamp."""

    def __init__(
        self,
        scenarios: dict[str, Scenario],
        event_profiles: dict[str, EventProfile],
    ) -> None:
        """Store scenario and event profile lookups, and prime the cache."""
        self._scenarios = scenarios
        self._event_profiles = event_profiles
        self._interval_cache: dict[str, tuple[EventInterval, ...]] = {}

    def get_intervals(self, scenario_id: str) -> tuple[EventInterval, ...]:
        """Return the parsed event intervals for a scenario, building once."""
        if scenario_id not in self._interval_cache:
            scenario = self._get_scenario(scenario_id)
            self._interval_cache[scenario_id] = self._parse_timeline(
                scenario.events_timeline
            )
        return self._interval_cache[scenario_id]

    def get_active_event_ids(self, scenario_id: str, timestamp: float) -> tuple[str, ...]:
        """Return the event_profile_ids active at ``timestamp`` in a scenario."""
        intervals = self.get_intervals(scenario_id)
        return tuple(
            interval.event_profile_id
            for interval in intervals
            if interval.contains(timestamp)
        )

    def get_active_events(
        self, scenario_id: str, timestamp: float
    ) -> tuple[EventProfile, ...]:
        """Return the EventProfile objects active at ``timestamp``."""
        return tuple(
            self._event_profiles[event_id]
            for event_id in self.get_active_event_ids(scenario_id, timestamp)
            if event_id in self._event_profiles
        )

    def _get_scenario(self, scenario_id: str) -> Scenario:
        """Look up a scenario, raising a clear error if it is unknown."""
        scenario = self._scenarios.get(scenario_id)
        if scenario is None:
            raise KeyError(f"Unknown scenario_id '{scenario_id}'")
        return scenario

    @staticmethod
    def _parse_timeline(events_timeline: tuple[str, ...]) -> tuple[EventInterval, ...]:
        """Parse entries like 'EV_GAS_LEAK_MINOR@18-28' into EventIntervals."""
        intervals: list[EventInterval] = []
        for entry in events_timeline:
            entry = entry.strip()
            if not entry:
                continue
            event_id, _, time_range = entry.partition(_ENTRY_DELIMITER)
            start_str, _, end_str = time_range.partition(_RANGE_DELIMITER)
            intervals.append(
                EventInterval(
                    event_profile_id=event_id.strip(),
                    start_time=float(start_str),
                    end_time=float(end_str),
                )
            )
        return tuple(intervals)