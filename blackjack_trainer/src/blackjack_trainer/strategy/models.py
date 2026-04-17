"""Core data models for the Blackjack trainer.

Kept deliberately simple: frozen dataclasses and enums so that strategy-engine
code can treat them as pure values and unit-test them without any UI or capture
dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Card primitives
# ---------------------------------------------------------------------------

class Rank(str, Enum):
    """Card rank.  The string value is the single-character display label."""

    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"
    SIX = "6"
    SEVEN = "7"
    EIGHT = "8"
    NINE = "9"
    TEN = "T"
    JACK = "J"
    QUEEN = "Q"
    KING = "K"
    ACE = "A"

    @property
    def pip_value(self) -> int:
        """Numeric pip value: 2-9 face, T/J/Q/K = 10, A = 11 (pre-bust reduction)."""
        _MAP: dict[str, int] = {
            "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
            "7": 7, "8": 8, "9": 9,
            "T": 10, "J": 10, "Q": 10, "K": 10,
            "A": 11,
        }
        return _MAP[self.value]

    @property
    def strategy_value(self) -> int:
        """Value used as lookup key in strategy tables (2-10 for normal, 11 for Ace)."""
        return self.pip_value  # T/J/Q/K all return 10; A returns 11


class Suit(str, Enum):
    CLUBS = "C"
    DIAMONDS = "D"
    HEARTS = "H"
    SPADES = "S"
    UNKNOWN = "?"


@dataclass(frozen=True)
class Card:
    rank: Rank
    suit: Suit = Suit.UNKNOWN

    def __str__(self) -> str:
        return f"{self.rank.value}{self.suit.value}"

    @classmethod
    def from_str(cls, s: str) -> "Card":
        """Parse shorthand like ``'AS'``, ``'TH'``, ``'2'`` (suit optional)."""
        s = s.strip().upper()
        if not s:
            raise ValueError(f"Empty card string")
        rank = Rank(s[0])
        suit = Suit(s[1]) if len(s) > 1 else Suit.UNKNOWN
        return cls(rank=rank, suit=suit)


# ---------------------------------------------------------------------------
# Action
# ---------------------------------------------------------------------------

class Action(str, Enum):
    HIT = "HIT"
    STAND = "STAND"
    DOUBLE = "DOUBLE"
    SPLIT = "SPLIT"
    SURRENDER = "SURRENDER"


# ---------------------------------------------------------------------------
# Hand
# ---------------------------------------------------------------------------

@dataclass
class Hand:
    """Mutable collection of cards representing one player or dealer hand."""

    cards: list[Card] = field(default_factory=list)

    def add_card(self, card: Card) -> None:
        self.cards.append(card)

    @property
    def best_total(self) -> int:
        """Highest total <= 21; reduces aces from 11 to 1 as needed."""
        total = 0
        aces = 0
        for card in self.cards:
            if card.rank == Rank.ACE:
                aces += 1
                total += 11
            else:
                total += card.rank.pip_value
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return total

    @property
    def is_soft(self) -> bool:
        """True when at least one ace is still counted as 11."""
        total = 0
        aces = 0
        for card in self.cards:
            if card.rank == Rank.ACE:
                aces += 1
                total += 11
            else:
                total += card.rank.pip_value
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return aces > 0

    @property
    def is_pair(self) -> bool:
        """True when the hand has exactly 2 cards of equal strategy value."""
        if len(self.cards) != 2:
            return False
        return (
            self.cards[0].rank.strategy_value
            == self.cards[1].rank.strategy_value
        )

    @property
    def pair_rank_value(self) -> Optional[int]:
        """Strategy value of the pair cards, or None if not a pair."""
        return self.cards[0].rank.strategy_value if self.is_pair else None

    @property
    def is_blackjack(self) -> bool:
        return len(self.cards) == 2 and self.best_total == 21

    @property
    def is_bust(self) -> bool:
        return self.best_total > 21

    def __str__(self) -> str:
        cards_str = " ".join(str(c) for c in self.cards)
        qualifier = "soft" if self.is_soft else "hard"
        return f"[{cards_str}] ({qualifier} {self.best_total})"

    def __len__(self) -> int:
        return len(self.cards)


# ---------------------------------------------------------------------------
# Game state snapshot (passed to the overlay and strategy engine)
# ---------------------------------------------------------------------------

@dataclass
class GameState:
    """Snapshot of detected table state passed between detector and engine."""

    player_hand: Hand = field(default_factory=Hand)
    dealer_upcard: Optional[Card] = None
    # Confidence 0.0-1.0: minimum match score across all detected cards.
    confidence: float = 0.0
    # True when the capture worker is running.
    is_active: bool = True
    # Freeform status for the overlay (e.g. "calibrating", "no cards detected").
    status_message: str = ""

    @property
    def is_valid(self) -> bool:
        """Enough information for a strategy recommendation."""
        return (
            len(self.player_hand) >= 2
            and self.dealer_upcard is not None
            and not self.player_hand.is_bust
        )
