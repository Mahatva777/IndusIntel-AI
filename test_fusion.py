from pathlib import Path
from risk_engine.engine import RiskEngine
from risk_engine.fusion import _combine_severities, _weighted_overall, DimensionScore

_CONFIG_DIR = Path("/Users/mahatva/Desktop/ET/config")
_DATA_ROOT = Path("/Users/mahatva/Desktop/ET/data")
_DEMO_SCENARIO = "SCN_GAS_LEAK_CONF_SPACE"

engine = RiskEngine.from_config(config_dir=_CONFIG_DIR, data_root=_DATA_ROOT)

for snapshot, _ in engine.stream(_DEMO_SCENARIO):
    t = snapshot.timestamp
    fragments = engine._rule_engine.evaluate(snapshot)
    assessments = engine._fusion.assess(snapshot, fragments)
    assessment = next((a for a in assessments if a.zone_id == "3"), None)
    
    if assessment:
        permit_f = next((f for f in assessment.evidence if f.source.name == "PERMIT_SYSTEM"), None)
        permit_boost = permit_f.severity_contribution if permit_f else 0.0
        
        by_dimension = {}
        for f in assessment.evidence:
            if f != permit_f:
                by_dimension.setdefault(f.dimension, []).append(f.severity_contribution)
        
        dimension_scores = [
            DimensionScore(dimension=dim, score=_combine_severities(scores))
            for dim, scores in by_dimension.items()
        ]
        
        base_overall = _weighted_overall(
            {d.dimension: d.score for d in dimension_scores}, engine._fusion._weights
        )
        
        print(f"t={t}s | Base Score (no permit): {base_overall:.3f} | Permit Boost: +{permit_boost:.3f} | Final Fused Score: {assessment.overall_severity:.3f} ({assessment.severity_band.value})")
