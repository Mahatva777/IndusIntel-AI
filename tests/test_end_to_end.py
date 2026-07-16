"""End-to-end tests for the Risk Engine pipeline.

Validates the full produce → rule → fuse → alert chain against the
real CSV data in ``data/``.  Each test constructs a fresh engine via
``RiskEngine.from_config`` so state from one test never leaks into
another.
"""

import shutil
import tempfile
from pathlib import Path

import pytest

from risk_engine.engine import RiskEngine
from risk_engine.fusion import DEFAULT_DIMENSION_WEIGHTS
from risk_engine.models import RiskSeverityBand
from risk_engine.rules.permit_rules import (
    HotWorkGasOverlapRule,
    _CONFINED_SPACE_PERMIT_BOOST,
)
from risk_engine.rules.trend_rules import StatefulRule

_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_SCENARIO_GAS_LEAK = "SCN_GAS_LEAK_CONF_SPACE"
_SCENARIO_HOT_WORK = "SCN_HOT_WORK_TAR_PRESSURE"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _collect_assessments(engine: RiskEngine, scenario_id: str):
    """Drain *scenario_id* and return every ``CompoundRiskAssessment``."""
    acc: list = []
    for _snap, _alerts in engine.stream(scenario_id):
        acc.extend(engine.latest_assessments.values())
    return acc


def _data_dir_with_telemetry2() -> Path:
    """Return a temporary directory whose ``telemetry.csv`` is ``telemetry2.csv``."""
    tmp = Path(tempfile.mkdtemp())
    for f in _DATA_DIR.iterdir():
        if f.is_file() and f.suffix == ".csv":
            shutil.copy2(f, tmp / f.name)
    # replace telemetry.csv with telemetry2.csv
    shutil.copy2(_DATA_DIR / "telemetry2.csv", tmp / "telemetry.csv")
    return tmp


# ---------------------------------------------------------------------------
# 1 + 2  –  Compound risk in Zone 3 & CRITICAL band
# ---------------------------------------------------------------------------

def test_compound_risk_detected_zone3():
    """Zone 3 must show ``compound_risk_detected=True`` at some timestamp
    (at least 2 distinct ``EvidenceSource`` types corroborating)."""
    engine = RiskEngine.from_config(_CONFIG_DIR, _DATA_DIR)
    assessments = _collect_assessments(engine, _SCENARIO_GAS_LEAK)

    zone3 = [a for a in assessments if a.zone_id == "3"]
    assert zone3, "No assessments at all for Zone 3"

    compound = [a for a in zone3 if a.compound_risk_detected]
    assert compound, (
        "Zone 3 never had compound_risk_detected=True.  Expected at least one "
        "snapshot where both SENSOR_TELEMETRY and PERMIT_SYSTEM (or WORKER_CONTEXT) "
        "evidence co-exist in Zone 3.  Check that:\n"
        "  - P001 (confined-space permit) is active in the snapshot time range\n"
        "  - Gas sensors in Zone 3 breach their warning thresholds\n"
        "  - ConfinedSpaceGasRule fires and produces PERMIT_SYSTEM fragments\n"
        "  - A sensor rule or worker rule fires in the same zone"
    )


def test_critical_band_crossed():
    """The scenario must cross the CRITICAL severity band at least once.

    If it does not, report the uncalibrated constants most likely to be
    responsible, so the fix is a parameter adjustment, not a test change.
    """
    engine = RiskEngine.from_config(_CONFIG_DIR, _DATA_DIR)
    assessments = _collect_assessments(engine, _SCENARIO_GAS_LEAK)

    max_sev = max(a.overall_severity for a in assessments)
    if max_sev >= 0.75:
        return

    pytest.fail(
        f"CRITICAL band was never reached (max severity = {max_sev:.3f}).\n\n"
        "The likely cause is one of these uncalibrated constants:\n"
        f"  1. permit_rules._CONFINED_SPACE_PERMIT_BOOST = {_CONFINED_SPACE_PERMIT_BOOST}\n"
        f"     (reviewer explicitly flagged this as a guess that needs\n"
        f"      this test to validate it; the additive boost may be too\n"
        f"      small for the fusion noisy-OR to reach >= 0.75)\n\n"
        f"  2. fusion.DEFAULT_DIMENSION_WEIGHTS = {DEFAULT_DIMENSION_WEIGHTS}\n"
        f"     (EMERGENCY=2.0, WORKER=1.2 may not be aggressive enough;\n"
        f"      raising WORKER to ~1.5 and/or EMERGENCY to ~3.0 would\n"
        f"      amplify compounded evidence dimensions)\n\n"
        "Do NOT change this test to pass at a lower threshold — calibrate\n"
        "the constants above until the scenario legitimately crosses 0.75."
    )


# ---------------------------------------------------------------------------
# 3  –  HotWorkGasOverlapRule against telemetry2.csv
# ---------------------------------------------------------------------------

def test_hot_work_gas_overlap_fires():
    """HotWorkGasOverlapRule must produce at least one fragment when run
    against ``telemetry2.csv`` (SCN_HOT_WORK_TAR_PRESSURE)."""
    data_dir = _data_dir_with_telemetry2()
    try:
        engine = RiskEngine.from_config(_CONFIG_DIR, data_dir)
        assessments = _collect_assessments(engine, _SCENARIO_HOT_WORK)

        fragments = [f for a in assessments for f in a.evidence]
        hot_work = [
            f for f in fragments if f.rule_id == HotWorkGasOverlapRule.rule_id
        ]
        assert hot_work, (
            f"HotWorkGasOverlapRule ({HotWorkGasOverlapRule.rule_id}) never fired "
            f"against telemetry2.csv.  Check that:\n"
            f"  - P002 (hot-work permit) is active in the snapshot time range\n"
            f"  - LEL sensors in Zone 4 exceed 10%% "
            f"({HotWorkGasOverlapRule._active_hot_work_permit} threshold)\n"
            f"  - A zone with an active hot-work permit has a rising LEL reading"
        )
    finally:
        shutil.rmtree(data_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# 4  –  Reset idempotency
# ---------------------------------------------------------------------------

def test_reset_idempotent():
    """Running the same scenario twice (with ``reset()`` between runs) must
    produce identical alert counts — proves trend-rule state does not
    bleed across scenario boundaries."""
    engine = RiskEngine.from_config(_CONFIG_DIR, _DATA_DIR)

    before_run1 = len(engine._alert_history)
    alerts_run1 = engine.run(_SCENARIO_GAS_LEAK)
    count_run1 = len(alerts_run1) - before_run1

    engine._rule_engine.reset()
    engine._alert_manager.reset()

    before_run2 = len(engine._alert_history)
    alerts_run2 = engine.run(_SCENARIO_GAS_LEAK)
    count_run2 = len(alerts_run2) - before_run2

    assert count_run1 == count_run2, (
        f"Run 1 produced {count_run1} alerts; "
        f"Run 2 (after reset) produced {count_run2} alerts. "
        "This indicates trend-rule or alert-manager state "
        "persisted across the reset."
    )
