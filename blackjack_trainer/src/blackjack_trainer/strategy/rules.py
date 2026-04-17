"""Table rule configuration for the strategy engine."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TableRules:
    """Configurable casino rule set.

    All fields correspond directly to common table-rule variations that affect
    basic strategy.  Default values represent a common multi-deck S17 game.
    """

    num_decks: int = 6
    """Number of decks in play (1, 2, 4, 6, or 8)."""

    dealer_hits_soft17: bool = False
    """Dealer hits soft-17 (H17) when True; stands on all 17s (S17) when False."""

    double_after_split: bool = True
    """Allow doubling down on split hands (DAS)."""

    surrender_allowed: bool = False
    """Late surrender permitted."""

    resplit_aces: bool = False
    """Allow re-splitting aces (rarely offered)."""

    double_on_any_two: bool = True
    """Double allowed on any two cards; if False, only on 9/10/11."""

    def validate(self) -> None:
        """Raise ValueError for unsupported configurations."""
        if self.num_decks not in {1, 2, 4, 6, 8}:
            raise ValueError(f"Unsupported deck count: {self.num_decks}")

    @classmethod
    def from_dict(cls, d: dict) -> "TableRules":
        return cls(
            num_decks=d.get("num_decks", 6),
            dealer_hits_soft17=d.get("dealer_hits_soft17", False),
            double_after_split=d.get("double_after_split", True),
            surrender_allowed=d.get("surrender_allowed", False),
            resplit_aces=d.get("resplit_aces", False),
            double_on_any_two=d.get("double_on_any_two", True),
        )

    def to_dict(self) -> dict:
        return {
            "num_decks": self.num_decks,
            "dealer_hits_soft17": self.dealer_hits_soft17,
            "double_after_split": self.double_after_split,
            "surrender_allowed": self.surrender_allowed,
            "resplit_aces": self.resplit_aces,
            "double_on_any_two": self.double_on_any_two,
        }

    def description(self) -> str:
        parts = [
            f"{self.num_decks}D",
            "H17" if self.dealer_hits_soft17 else "S17",
            "DAS" if self.double_after_split else "noDAS",
            "LS" if self.surrender_allowed else "noLS",
        ]
        return " ".join(parts)
