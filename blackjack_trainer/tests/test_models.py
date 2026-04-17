"""Tests for strategy/models.py."""
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from blackjack_trainer.strategy.models import (
    Action,
    Card,
    GameState,
    Hand,
    Rank,
    Suit,
)


class TestRank:
    def test_pip_values(self) -> None:
        assert Rank.TWO.pip_value == 2
        assert Rank.TEN.pip_value == 10
        assert Rank.JACK.pip_value == 10
        assert Rank.QUEEN.pip_value == 10
        assert Rank.KING.pip_value == 10
        assert Rank.ACE.pip_value == 11

    def test_strategy_values(self) -> None:
        assert Rank.TEN.strategy_value == 10
        assert Rank.JACK.strategy_value == 10
        assert Rank.QUEEN.strategy_value == 10
        assert Rank.KING.strategy_value == 10
        assert Rank.ACE.strategy_value == 11

    def test_all_ranks_have_pip_value(self) -> None:
        for rank in Rank:
            assert isinstance(rank.pip_value, int)
            assert rank.pip_value >= 2


class TestCard:
    def test_from_str_with_suit(self) -> None:
        card = Card.from_str("AS")
        assert card.rank == Rank.ACE
        assert card.suit == Suit.SPADES

    def test_from_str_rank_only(self) -> None:
        card = Card.from_str("T")
        assert card.rank == Rank.TEN
        assert card.suit == Suit.UNKNOWN

    def test_from_str_lowercase(self) -> None:
        card = Card.from_str("kh")
        assert card.rank == Rank.KING
        assert card.suit == Suit.HEARTS

    def test_from_str_invalid(self) -> None:
        with pytest.raises(Exception):
            Card.from_str("")

    def test_str_representation(self) -> None:
        card = Card(Rank.ACE, Suit.SPADES)
        assert str(card) == "AS"


class TestHand:
    def _make_hand(self, *rank_strs: str) -> Hand:
        hand = Hand()
        for rs in rank_strs:
            hand.add_card(Card.from_str(rs))
        return hand

    # best_total
    def test_hard_total(self) -> None:
        hand = self._make_hand("T", "6")
        assert hand.best_total == 16
        assert not hand.is_soft

    def test_soft_total_basic(self) -> None:
        hand = self._make_hand("A", "7")
        assert hand.best_total == 18
        assert hand.is_soft

    def test_ace_reduces(self) -> None:
        hand = self._make_hand("A", "9", "5")
        assert hand.best_total == 15
        assert not hand.is_soft

    def test_two_aces(self) -> None:
        hand = self._make_hand("A", "A")
        assert hand.best_total == 12
        assert hand.is_soft

    def test_bust(self) -> None:
        hand = self._make_hand("T", "T", "5")
        assert hand.best_total == 25
        assert hand.is_bust

    def test_ace_plus_ten_blackjack(self) -> None:
        hand = self._make_hand("A", "K")
        assert hand.best_total == 21
        assert hand.is_blackjack
        assert hand.is_soft

    # is_pair
    def test_pair_detection(self) -> None:
        hand = self._make_hand("8", "8")
        assert hand.is_pair
        assert hand.pair_rank_value == 8

    def test_pair_face_cards(self) -> None:
        hand = self._make_hand("T", "K")  # both strategy_value=10
        assert hand.is_pair

    def test_not_pair_three_cards(self) -> None:
        hand = self._make_hand("8", "8", "3")
        assert not hand.is_pair

    def test_not_pair_different_ranks(self) -> None:
        hand = self._make_hand("8", "9")
        assert not hand.is_pair

    # is_soft / soft hand edge cases
    def test_soft_with_ace_worth_one(self) -> None:
        hand = self._make_hand("A", "T", "5")
        assert hand.best_total == 16
        assert not hand.is_soft  # ace must be counted as 1

    def test_length(self) -> None:
        hand = self._make_hand("2", "3", "4")
        assert len(hand) == 3


class TestGameState:
    def test_valid_state(self) -> None:
        hand = Hand([Card(Rank.TEN), Card(Rank.SIX)])
        dealer = Card(Rank.NINE)
        state = GameState(player_hand=hand, dealer_upcard=dealer, confidence=0.9)
        assert state.is_valid

    def test_invalid_state_single_card(self) -> None:
        hand = Hand([Card(Rank.TEN)])
        dealer = Card(Rank.NINE)
        state = GameState(player_hand=hand, dealer_upcard=dealer, confidence=0.9)
        assert not state.is_valid

    def test_invalid_state_no_dealer(self) -> None:
        hand = Hand([Card(Rank.TEN), Card(Rank.SIX)])
        state = GameState(player_hand=hand, dealer_upcard=None, confidence=0.9)
        assert not state.is_valid

    def test_invalid_state_bust(self) -> None:
        hand = Hand([Card(Rank.TEN), Card(Rank.TEN), Card(Rank.FIVE)])
        dealer = Card(Rank.NINE)
        state = GameState(player_hand=hand, dealer_upcard=dealer, confidence=0.9)
        assert not state.is_valid
