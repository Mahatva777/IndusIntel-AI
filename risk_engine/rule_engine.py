"""Thin orchestration layer between SnapshotProducer and FusionEngine.

Owns the update-then-evaluate lifecycle for StatefulRules, provides
per-rule error isolation so a single failing rule cannot corrupt an
entire snapshot's evidence, and supports reset() for clean scenario
reuse.
"""

import logging
from typing import Sequence

from risk_engine.context import PlantSnapshot
from risk_engine.models import EvidenceFragment
from risk_engine.rules.base import Rule, RuleSet
from risk_engine.rules.trend_rules import StatefulRule

logger = logging.getLogger(__name__)


class RuleEngine:
    """Orchestrates rules across snapshots.

    For every snapshot::

        1. Call ``update(snapshot)`` on each StatefulRule.
        2. Call ``evaluate(snapshot)`` on **every** rule (stateful and
           pure alike).

    Each ``evaluate()`` call is individually wrapped in try/except so
    a bug in one rule never prevents other rules from contributing
    their evidence.  ``reset()`` clears all stateful rule windows so
    trend state does not bleed from one scenario run into the next.
    """

    def __init__(self, rules: RuleSet) -> None:
        self._rules: tuple[Rule, ...] = tuple(rules)

    def evaluate(self, snapshot: PlantSnapshot) -> tuple[EvidenceFragment, ...]:
        """Advance stateful rule windows, then collect evidence from all rules.

        Args:
            snapshot: The current plant snapshot.

        Returns:
            Every EvidenceFragment produced by every rule, in rule-declaration
            order, for this snapshot.
        """
        for rule in self._rules:
            if isinstance(rule, StatefulRule):
                try:
                    rule.update(snapshot)
                except Exception:
                    logger.exception(
                        "StatefulRule.update() crashed for %s — continuing",
                        rule.rule_id,
                    )

        fragments: list[EvidenceFragment] = []
        for rule in self._rules:
            try:
                fragments.extend(rule.evaluate(snapshot))
            except Exception:
                logger.exception(
                    "Rule.evaluate() crashed for %s — continuing",
                    rule.rule_id,
                )
        return tuple(fragments)

    def reset(self) -> None:
        """Reset all stateful rules so trend windows don't carry over.

        Call this once between scenario runs if the same RuleEngine
        instance is reused with a different scenario.
        """
        for rule in self._rules:
            if isinstance(rule, StatefulRule):
                try:
                    rule.reset()
                except Exception:
                    logger.exception(
                        "StatefulRule.reset() failed for %s — continuing",
                        rule.rule_id,
                    )
