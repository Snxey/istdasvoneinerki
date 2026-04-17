"""Tests for strategy/rules.py."""
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from blackjack_trainer.strategy.rules import TableRules


class TestTableRules:
    def test_defaults(self) -> None:
        rules = TableRules()
        assert rules.num_decks == 6
        assert not rules.dealer_hits_soft17
        assert rules.double_after_split
        assert not rules.surrender_allowed

    def test_from_dict_partial(self) -> None:
        rules = TableRules.from_dict({"num_decks": 2, "dealer_hits_soft17": True})
        assert rules.num_decks == 2
        assert rules.dealer_hits_soft17
        # Unspecified fields use defaults.
        assert rules.double_after_split

    def test_from_dict_full(self) -> None:
        d = {
            "num_decks": 1,
            "dealer_hits_soft17": True,
            "double_after_split": False,
            "surrender_allowed": True,
            "resplit_aces": True,
            "double_on_any_two": False,
        }
        rules = TableRules.from_dict(d)
        assert rules.num_decks == 1
        assert rules.dealer_hits_soft17
        assert not rules.double_after_split
        assert rules.surrender_allowed

    def test_to_dict_roundtrip(self) -> None:
        rules = TableRules(num_decks=4, dealer_hits_soft17=True, surrender_allowed=True)
        rules2 = TableRules.from_dict(rules.to_dict())
        assert rules.num_decks == rules2.num_decks
        assert rules.dealer_hits_soft17 == rules2.dealer_hits_soft17
        assert rules.surrender_allowed == rules2.surrender_allowed

    def test_validate_valid_decks(self) -> None:
        for n in (1, 2, 4, 6, 8):
            TableRules(num_decks=n).validate()  # should not raise

    def test_validate_invalid_decks(self) -> None:
        with pytest.raises(ValueError, match="Unsupported deck count"):
            TableRules(num_decks=3).validate()

    def test_description(self) -> None:
        rules = TableRules(num_decks=6, dealer_hits_soft17=False, double_after_split=True, surrender_allowed=False)
        desc = rules.description()
        assert "6D" in desc
        assert "S17" in desc
        assert "DAS" in desc
        assert "noLS" in desc
