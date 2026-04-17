"""Basic-strategy engine.

Strategy tables are encoded as plain Python dicts (player_total → 10-element
list indexed by dealer upcard 2-10, A) using single-character action codes:

    H   = HIT
    S   = STAND
    D   = DOUBLE (fallback: HIT if doubling not allowed)
    Ds  = DOUBLE (fallback: STAND if doubling not allowed)
    P   = SPLIT
    Ph  = SPLIT if DAS; else HIT
    Pd  = SPLIT if DAS; else DOUBLE (fallback HIT)
    R   = SURRENDER (fallback: HIT if surrender not allowed)
    Rs  = SURRENDER (fallback: STAND if surrender not allowed)
    Rp  = SURRENDER (fallback: SPLIT if surrender not allowed)

Dealer upcard index order: 2, 3, 4, 5, 6, 7, 8, 9, 10, A (11).

Sources: Wizard of Odds multi-deck basic strategy charts.
"""
from __future__ import annotations

import logging
from typing import Optional

from .models import Action, Card, GameState, Hand, Rank
from .rules import TableRules

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dealer upcard index (strategy tables use 0-9 → dealer 2,3,4,5,6,7,8,9,10,A)
# ---------------------------------------------------------------------------

_DEALER_INDEX: dict[int, int] = {
    2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9
}

# ---------------------------------------------------------------------------
# Hard-total strategy table (S17, multi-deck, DAS, no surrender baseline)
# Rows are hard totals 8-16 (≤7 always hits; ≥17 always stands).
# ---------------------------------------------------------------------------
# fmt: off
_HARD_S17: dict[int, list[str]] = {
    #         2    3    4    5    6    7    8    9   10    A
    8:  [    'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
    9:  [    'H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
    10: [    'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
    11: [    'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
    12: [    'H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    13: [    'S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    14: [    'S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
    15: [    'S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'R',  'H'],
    16: [    'S', 'S', 'S', 'S', 'S', 'H', 'H', 'R', 'R',  'R'],
    17: [    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'],
}
# fmt: on

# H17 overrides only for hard totals that change.
_HARD_H17_OVERRIDES: dict[int, dict[int, str]] = {
    11: {9: 'D'},   # dealer A: D instead of H
    17: {9: 'S'},   # dealer A: S (no surrender needed)
}

# ---------------------------------------------------------------------------
# Soft-total strategy table (S17, multi-deck)
# Keys are the non-ace card's pip value (2 = A,2 … 9 = A,9).
# ---------------------------------------------------------------------------
# fmt: off
_SOFT_S17: dict[int, list[str]] = {
    #  key = second card value
    #         2    3    4    5    6    7    8    9   10    A
    2:  [    'H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  # A,2 = soft 13
    3:  [    'H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  # A,3 = soft 14
    4:  [    'H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  # A,4 = soft 15
    5:  [    'H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  # A,5 = soft 16
    6:  [    'H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],  # A,6 = soft 17
    7:  [   'Ds','Ds','Ds','Ds','Ds', 'S', 'S', 'H', 'H', 'H'],   # A,7 = soft 18
    8:  [    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  # A,8 = soft 19
    9:  [    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  # A,9 = soft 20
}
# fmt: on

# H17 overrides for soft totals.
_SOFT_H17_OVERRIDES: dict[int, dict[int, str]] = {
    6: {9: 'H'},   # A,6 soft 17 vs A: H (dealer likely to improve)
    7: {9: 'H'},   # A,7 soft 18 vs A: H (slight EV gain)
    8: {4: 'Ds'},  # A,8 soft 19 vs 6: Ds (dealer weak)
}

# ---------------------------------------------------------------------------
# Pair strategy table (DAS allowed, multi-deck)
# Keys are the strategy_value of one card in the pair (2-11).
# ---------------------------------------------------------------------------
# fmt: off
_PAIRS_DAS: dict[int, list[str]] = {
    #         2    3    4    5    6    7    8    9   10    A
    2:  [    'P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    3:  [    'P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    4:  [    'H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
    5:  [    'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],  # 5,5 = treat as hard 10
    6:  [    'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
    7:  [    'P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    8:  [    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    9:  [    'P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
    10: [    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
    11: [    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],  # A,A
}
# Without DAS, 2/3/6/7 pairs become slightly more conservative.
_PAIRS_NO_DAS: dict[int, list[str]] = {
    #         2    3    4    5    6    7    8    9   10    A
    2:  [    'H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    3:  [    'H', 'H', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    4:  [    'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
    5:  [    'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
    6:  [    'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
    7:  [    'P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
    8:  [    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    9:  [    'P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
    10: [    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
    11: [    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
}
# fmt: on


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------

def _dealer_idx(upcard_value: int) -> int:
    """Convert dealer strategy_value (2-10, 11=A) to table column index 0-9."""
    idx = _DEALER_INDEX.get(upcard_value)
    if idx is None:
        raise ValueError(f"Unknown dealer upcard strategy value: {upcard_value}")
    return idx


def _resolve_code(code: str, rules: TableRules) -> Action:
    """Convert a strategy-table code into a concrete Action given rule set."""
    double_ok = rules.double_on_any_two  # simplification: caller checks card count
    surrender_ok = rules.surrender_allowed

    match code:
        case 'H':
            return Action.HIT
        case 'S':
            return Action.STAND
        case 'D':
            return Action.DOUBLE if double_ok else Action.HIT
        case 'Ds':
            return Action.DOUBLE if double_ok else Action.STAND
        case 'P':
            return Action.SPLIT
        case 'Ph':
            return Action.SPLIT if rules.double_after_split else Action.HIT
        case 'Pd':
            return Action.SPLIT if rules.double_after_split else (
                Action.DOUBLE if double_ok else Action.HIT
            )
        case 'R':
            return Action.SURRENDER if surrender_ok else Action.HIT
        case 'Rs':
            return Action.SURRENDER if surrender_ok else Action.STAND
        case 'Rp':
            return Action.SURRENDER if surrender_ok else Action.SPLIT
        case _:
            logger.warning("Unknown strategy code %r; defaulting to HIT", code)
            return Action.HIT


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class StrategyResult:
    """Return value of the strategy engine."""

    __slots__ = ("action", "explanation", "raw_code")

    def __init__(self, action: Action, explanation: str, raw_code: str = "") -> None:
        self.action = action
        self.explanation = explanation
        self.raw_code = raw_code

    def __repr__(self) -> str:
        return f"StrategyResult(action={self.action!r}, explanation={self.explanation!r})"


class StrategyEngine:
    """Deterministic basic-strategy lookup engine.

    >>> engine = StrategyEngine(TableRules())
    >>> from blackjack_trainer.strategy.models import Hand, Card, Rank, Suit
    >>> hand = Hand([Card(Rank.TEN), Card(Rank.SIX)])
    >>> dealer = Card(Rank.TEN)
    >>> engine.recommend(hand, dealer).action
    <Action.SURRENDER: 'SURRENDER'>
    """

    def __init__(self, rules: Optional[TableRules] = None) -> None:
        self.rules = rules or TableRules()

    def recommend(self, player_hand: Hand, dealer_upcard: Card) -> StrategyResult:
        """Return the basic-strategy recommendation for *player_hand* vs *dealer_upcard*.

        Raises ``ValueError`` if either hand or upcard carries unknown values.
        """
        dealer_sv = dealer_upcard.rank.strategy_value
        d_idx = _dealer_idx(dealer_sv)
        dealer_label = dealer_upcard.rank.value

        total = player_hand.best_total
        is_soft = player_hand.is_soft
        is_pair = player_hand.is_pair

        # --- Pair check first ---
        if is_pair:
            pair_val = player_hand.pair_rank_value  # type: ignore[assignment]
            assert pair_val is not None
            table = _PAIRS_DAS if self.rules.double_after_split else _PAIRS_NO_DAS
            row = table.get(pair_val)
            if row is None:
                logger.error("No pair table entry for pair_val=%d", pair_val)
                return StrategyResult(Action.HIT, "Unknown pair — defaulting to HIT")
            code = row[d_idx]
            action = _resolve_code(code, self.rules)
            pair_display = "A" if pair_val == 11 else str(pair_val)
            explanation = (
                f"{pair_display},{pair_display} pair vs dealer {dealer_label} "
                f"→ {action.value} [{self.rules.description()}]"
            )
            return StrategyResult(action, explanation, code)

        # --- Soft hand ---
        if is_soft and len(player_hand) == 2:
            # Identify the non-ace card's pip value as the soft-table key.
            # A,7 → key=7; A,2 → key=2 etc.
            non_ace_vals = [
                c.rank.pip_value for c in player_hand.cards if c.rank != Rank.ACE
            ]
            if non_ace_vals:
                soft_key = non_ace_vals[0]
                # Ace pip_value = 11; "A,A" is caught by pair check above.
                if soft_key > 9:
                    # e.g. A,T — treat as hard total (soft 21 = blackjack, always stands)
                    pass
                else:
                    table_s17 = _SOFT_S17.get(soft_key)
                    if table_s17:
                        code = table_s17[d_idx]
                        # Apply H17 overrides
                        if self.rules.dealer_hits_soft17:
                            code = _SOFT_H17_OVERRIDES.get(soft_key, {}).get(d_idx, code)
                        action = _resolve_code(code, self.rules)
                        explanation = (
                            f"Soft {total} (A,{soft_key}) vs dealer {dealer_label} "
                            f"→ {action.value} [{self.rules.description()}]"
                        )
                        return StrategyResult(action, explanation, code)

        # --- Hard total (or soft with 3+ cards, or soft total ≥ 19) ---
        # Hard 18+ and soft 19+ always stand (no surrender applies at these totals).
        # Hard 17 is still looked up in the table because of the Rs (surrender vs A) cell.
        if total >= 18 or (is_soft and total >= 19):
            explanation = (
                f"{'Soft' if is_soft else 'Hard'} {total} vs dealer {dealer_label} "
                f"→ STAND (always) [{self.rules.description()}]"
            )
            return StrategyResult(Action.STAND, explanation, 'S')

        if total <= 7:
            explanation = (
                f"Hard {total} vs dealer {dealer_label} "
                f"→ HIT (always) [{self.rules.description()}]"
            )
            return StrategyResult(Action.HIT, explanation, 'H')

        row = _HARD_S17.get(total)
        if row is None:
            explanation = f"Hard {total} vs dealer {dealer_label} → HIT (fallback)"
            return StrategyResult(Action.HIT, explanation, 'H')

        code = row[d_idx]
        # Apply H17 overrides
        if self.rules.dealer_hits_soft17:
            code = _HARD_H17_OVERRIDES.get(total, {}).get(d_idx, code)

        # Can only double on first two cards
        if len(player_hand) > 2 and code in ('D', 'Ds'):
            code = 'S' if code == 'Ds' else 'H'

        action = _resolve_code(code, self.rules)
        qualifier = "Soft" if is_soft else "Hard"
        explanation = (
            f"{qualifier} {total} vs dealer {dealer_label} "
            f"→ {action.value} [{self.rules.description()}]"
        )
        return StrategyResult(action, explanation, code)

    def recommend_from_state(self, state: GameState) -> Optional[StrategyResult]:
        """Convenience wrapper; returns None when state is not valid."""
        if not state.is_valid:
            return None
        assert state.dealer_upcard is not None
        return self.recommend(state.player_hand, state.dealer_upcard)
