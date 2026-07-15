from pathlib import Path

from simulator.loader import ConfigLoader
from simulator.behaviors import BehaviorEngine
from simulator.noise import NoiseEngine
from simulator.validator import Validator
from simulator.exporter import CSVExporter
from simulator.generator import SimulationEngine

config_dir = Path("config")
output_path = Path("output/telemetry2.csv")

loader = ConfigLoader(config_dir)
config = loader.load_all()  # used here just to build the Validator's sensor lookup

engine = SimulationEngine(
    config_loader=loader,
    behavior_engine=BehaviorEngine(),
    noise_engine=NoiseEngine(seed=42),        # fixed seed = reproducible run
    validator=Validator(config["sensors"]),
    exporter=CSVExporter(output_path),
    time_step_seconds=0.5,
)

telemetry = engine.run(scenario_id="SCN_HOT_WORK_TAR_PRESSURE")
print(f"Generated {len(telemetry)} telemetry rows -> {output_path}")