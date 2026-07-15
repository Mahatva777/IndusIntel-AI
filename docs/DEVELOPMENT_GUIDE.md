# 11 – Development Guide

## Purpose

This guide explains how new contributors should extend the project safely.

## Adding a New Zone

1. Add a row to `config/zones.csv`:

   - Unique `zone_id`.
   - Layout coordinates.
   - Hazard classification, PPE, permit requirements.
   - Evacuation route and description.

2. Link equipment and sensors:

   - Add equipment entries with `zone_id`.
   - Add sensors with `zone_id` and `equipment_tag`.

3. Update digital twin rendering (if zone layout changes).

## Adding a New Sensor

1. Add a row to `config/sensors.csv`:

   - Unique `sensor_id`.
   - Proper `sensor_type`, unit, ranges, thresholds.
   - `zone_id` and `equipment_tag`.
   - `behavior_profile_id`, `noise_profile_id`, `physical_response_type`, `inertia_class`.

2. Ensure physical limits and thresholds are realistic (e.g., based on typical gas alarm settings).[web:214][web:119]

3. Update relevant `equipment.associated_sensors`.

## Adding a New Event

1. Add an event to `config/event_profiles.csv`:

   - Unique `event_profile_id`.
   - Name, description, severity, priority.
   - Expected duration and compound‑risk capability.
   - Recommended response and colours.

2. Add mappings to `config/event_sensor_mapping.csv`:

   - `event_profile_id`, `sensor_type`, `behavior_profile_id`.
   - `start_value_rule`, `target_value_rule`, `duration_seconds`, etc.

3. Optionally, add scenario usage in `config/scenario.csv`.

## Adding a New Behaviour

1. Add behaviour to `config/behavior_profiles.csv`:

   - Unique `behavior_profile_id`.
   - Mathematical model and parameter schema.
   - Recommended sensor types.

2. Reference it in:

   - `sensors.behavior_profile_id` for baseline behaviour.
   - `event_sensor_mapping.behavior_profile_id` for event‑driven behaviour.

## Adding a New Scenario

1. Add a row to `config/scenario.csv`:

   - `scenario_id`, `name`, `description`.
   - `start_time`, `end_time`.
   - `zones_involved`, `permits_involved`.
   - `events_timeline` (event IDs and time ranges).
   - `expected_ai_actions`.

2. Run the simulator to generate new telemetry.

No Python changes are required if using existing engine.

## Adding a New Dashboard Widget

1. Define a new component in `dashboard/ui/components`:

   - Document data dependencies (API endpoints, fields).

2. Expose data via `dashboard/api`:

   - Add endpoints in `telemetry_api.py` or `risk_api.py`.

3. Update routing and layout as needed.

Ensure the widget uses existing data model; do not bypass config or telemetry.

## Adding a New CV Model

1. Add a pipeline module in `cv_engine/pipelines`:

   - For PPE, smoke, fire, occupancy, etc.

2. Ensure output events follow standard schema:

   - `event_type`, `zone_id`, `worker_id`, `timestamp`, `severity`.

3. Integrate into risk_engine via CV event adapter.

## Adding a New AI Agent

1. Implement agent module in `agents/`:

   - Define triggers (risk levels, events).
   - Define actions (messages, reports, API calls).

2. Wire agent into orchestration layer:

   - Subscribe to risk engine events and telemetry.

## Coding Conventions

- Python:

  - Use type hints and docstrings.
  - Keep modules small and focused.
  - Avoid hardcoding plant logic; always go through config.

- Git:

  - Use feature branches.
  - Write descriptive commit messages (“Add EV_H2_LEAK_MAJOR event and mappings”).
  - Update relevant docs (`ARCHITECTURE`, `DATA_MODEL`) when changing data model.

- Folder:

  - Do not create new top‑level packages without updating `02_ARCHITECTURE.md`.
  - Keep config as the single source of truth for plant behaviour.

This guide should be updated as new features are added.
