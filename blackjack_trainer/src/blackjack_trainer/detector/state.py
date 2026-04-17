"""Aggregates per-card detections into a ``GameState`` snapshot.

The ``TableStateDetector`` receives a raw BGR frame, crops each configured
card-region, runs ``CardDetector`` on each crop, and assembles the results into
a ``GameState`` that the strategy engine and overlay can consume.

Design notes
------------
* The first dealer region is the *up-card*; the second (if any) is the
  hole-card placeholder (usually face-down, expected to return low confidence).
* Player regions are iterated left-to-right.  Regions that return ``None``
  (low confidence) are treated as "no card present", not as errors, which
  means a partially-detected hand is possible.  The overlay will display
  "UNCERTAIN" when confidence is below the per-state threshold.
* Badge reader (optional): when ``config.use_badge_reader=True`` the detector
  also reads the Stake-style hand-total badges.  The badge total is used to
  cross-validate card detection and can boost confidence when it agrees.
* Debug mode saves cropped regions as PNGs to ``/tmp/bj_debug/`` and annotates
  confidence scores so you can diagnose detection failures.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from ..config import DetectorConfig
from ..strategy.models import Card, GameState, Hand
from .badge import BadgeReader
from .cards import CardDetector, MatchResult
from .regions import CardRegion, build_card_regions, PixelRect
from .templates import TemplateCache

logger = logging.getLogger(__name__)

_DEBUG_DIR = Path("/tmp/bj_debug")

# When badge total agrees with card-detection total, multiply confidence by this.
_BADGE_AGREEMENT_BOOST = 1.10
# When badge reader finds a total but card detection failed, use this confidence.
_BADGE_ONLY_CONFIDENCE = 0.55


class TableStateDetector:
    """Converts a captured frame into a ``GameState``.

    Parameters
    ----------
    config:
        Detector configuration (regions, threshold, template dir).
    debug:
        When True, save cropped regions and log match scores.
    """

    def __init__(self, config: DetectorConfig, debug: bool = False) -> None:
        self.config = config
        self.debug = debug

        self._template_dir = Path(config.template_dir)
        self._cache = TemplateCache(self._template_dir)
        self._cache.load()

        self._card_detector = CardDetector(
            template_cache=self._cache,
            confidence_threshold=config.confidence_threshold,
            scale_range=config.template_scale_range,
        )

        self._player_regions: list[CardRegion] = build_card_regions(
            config.player_card_regions
        )
        self._dealer_regions: list[CardRegion] = build_card_regions(
            config.dealer_card_regions
        )

        # Optional badge reader for Stake-style totals.
        self._badge_reader: Optional[BadgeReader] = (
            BadgeReader() if config.use_badge_reader else None
        )
        self._dealer_badge_region: Optional[CardRegion] = (
            CardRegion.from_list(config.dealer_badge_region)
            if config.dealer_badge_region
            else None
        )
        self._player_badge_region: Optional[CardRegion] = (
            CardRegion.from_list(config.player_badge_region)
            if config.player_badge_region
            else None
        )

        if debug:
            _DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, frame: np.ndarray) -> GameState:
        """Run full detection on *frame* and return a ``GameState`` snapshot."""
        fh, fw = frame.shape[:2]
        state = GameState()

        # --- Dealer up-card ---
        dealer_result = self._detect_slot(
            frame, fw, fh, self._dealer_regions, slot_index=0, label="dealer"
        )
        if dealer_result and dealer_result.card:
            state.dealer_upcard = dealer_result.card

        # --- Player cards ---
        player_hand = Hand()
        confidences: list[float] = []

        for idx, region in enumerate(self._player_regions):
            result = self._detect_slot(
                frame, fw, fh, [region], slot_index=idx, label=f"player_{idx}"
            )
            if result is None:
                continue
            if result.card is not None:
                player_hand.add_card(result.card)
                confidences.append(result.confidence)
            elif confidences:
                # First empty slot after a run of cards — stop scanning.
                break

        state.player_hand = player_hand

        # Aggregate confidence: minimum of all detected cards.
        if confidences:
            state.confidence = min(confidences)
        if dealer_result and dealer_result.card:
            state.confidence = (
                min(state.confidence, dealer_result.confidence)
                if confidences
                else dealer_result.confidence
            )

        # --- Badge cross-check (Stake / badge-reader mode) ---
        if self._badge_reader is not None:
            state = self._apply_badge_crosscheck(frame, fw, fh, state)

        # --- Status message ---
        if len(player_hand) == 0 and state.dealer_upcard is None:
            state.status_message = "No cards detected"
        elif len(player_hand) < 2:
            state.status_message = "Waiting for full hand…"
        elif state.dealer_upcard is None:
            state.status_message = "Dealer upcard not detected"
        else:
            state.status_message = ""

        return state

    def reload_templates(self) -> None:
        """Hot-reload templates from disk (e.g. after calibration)."""
        self._cache.load()
        logger.info("Templates reloaded.")

    # ------------------------------------------------------------------
    # Badge cross-check
    # ------------------------------------------------------------------

    def _apply_badge_crosscheck(
        self, frame: np.ndarray, fw: int, fh: int, state: GameState
    ) -> GameState:
        """Read badges and use them to validate or recover from low-confidence card detection."""
        assert self._badge_reader is not None

        # Read dealer badge (= upcard value).
        dealer_badge_total = self._read_badge(
            frame, fw, fh, self._dealer_badge_region, "dealer_badge"
        )
        # Read player badge (= hand total).
        player_badge_total = self._read_badge(
            frame, fw, fh, self._player_badge_region, "player_badge"
        )

        logger.debug(
            "Badge read: dealer=%s player=%s", dealer_badge_total, player_badge_total
        )

        # --- Dealer upcard validation ---
        if dealer_badge_total is not None:
            if state.dealer_upcard is None:
                # Card detection missed the dealer upcard; synthesise from badge.
                # We can't know the exact rank (e.g. badge "10" could be T/J/Q/K),
                # so mark confidence as badge-only.
                from ..strategy.models import Rank, Suit
                rank = _badge_value_to_rank(dealer_badge_total)
                if rank is not None:
                    state.dealer_upcard = Card(rank=rank, suit=Suit.UNKNOWN)
                    state.confidence = max(state.confidence, _BADGE_ONLY_CONFIDENCE)
                    logger.debug("Dealer upcard synthesised from badge: %s", rank)
            else:
                # Cross-check: badge value vs detected card strategy value.
                detected_sv = state.dealer_upcard.rank.strategy_value
                badge_sv = min(dealer_badge_total, 11)  # badge shows pip value
                if detected_sv == badge_sv:
                    # Agreement → boost confidence.
                    state.confidence = min(1.0, state.confidence * _BADGE_AGREEMENT_BOOST)
                    logger.debug("Dealer badge agrees with card detection.")
                else:
                    logger.debug(
                        "Dealer badge (%d) disagrees with card detection (%d); "
                        "keeping card detection result.",
                        dealer_badge_total, detected_sv,
                    )

        # --- Player total validation ---
        if player_badge_total is not None and len(state.player_hand) >= 2:
            computed_total = state.player_hand.best_total
            if computed_total == player_badge_total:
                state.confidence = min(1.0, state.confidence * _BADGE_AGREEMENT_BOOST)
                logger.debug(
                    "Player badge %d agrees with computed total %d.",
                    player_badge_total, computed_total,
                )
            elif len(state.player_hand) == 0:
                # No cards detected at all; badge gives us the total but
                # not the hand composition.  Record in status.
                state.status_message = (
                    f"Badge: player total={player_badge_total} "
                    f"(card detection failed — run --debug to calibrate)"
                )
            else:
                logger.debug(
                    "Player badge (%d) disagrees with computed total (%d).",
                    player_badge_total, computed_total,
                )

        return state

    def _read_badge(
        self,
        frame: np.ndarray,
        fw: int,
        fh: int,
        region: Optional[CardRegion],
        label: str,
    ) -> Optional[int]:
        if region is None or self._badge_reader is None:
            return None
        rect = region.to_pixel_rect(fw, fh)
        if not rect.is_valid:
            return None
        crop = rect.crop(frame)
        if self.debug:
            self._save_debug_crop(crop, label, 0)
        return self._badge_reader.read(crop)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _detect_slot(
        self,
        frame: np.ndarray,
        frame_w: int,
        frame_h: int,
        regions: list[CardRegion],
        slot_index: int,
        label: str,
    ) -> Optional[MatchResult]:
        """Detect the card in *regions[0]* (or *regions[slot_index]*) and return result."""
        if not regions:
            return None

        region = regions[0] if len(regions) == 1 else regions[slot_index % len(regions)]
        rect = region.to_pixel_rect(frame_w, frame_h)

        if not rect.is_valid:
            logger.debug("Invalid rect for %s: %s", label, rect)
            return None

        crop = rect.crop(frame)

        if self.debug:
            self._save_debug_crop(crop, label, slot_index)

        result = self._card_detector.detect(crop)
        logger.debug(
            "Slot %s: rank=%s confidence=%.3f", label, result.rank, result.confidence
        )
        return result

    def _save_debug_crop(
        self, crop: np.ndarray, label: str, index: int
    ) -> None:
        fname = _DEBUG_DIR / f"{label}_{index}.png"
        try:
            cv2.imwrite(str(fname), crop)
        except Exception as exc:
            logger.debug("Could not write debug crop: %s", exc)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _badge_value_to_rank(value: int):
    """Convert a badge integer (2-11) to the most natural Rank.

    For value 10 we return ``Rank.TEN`` rather than J/Q/K because we cannot
    distinguish face cards from the total alone.
    """
    from ..strategy.models import Rank

    _MAP = {
        2: Rank.TWO, 3: Rank.THREE, 4: Rank.FOUR, 5: Rank.FIVE,
        6: Rank.SIX, 7: Rank.SEVEN, 8: Rank.EIGHT, 9: Rank.NINE,
        10: Rank.TEN, 11: Rank.ACE,
    }
    return _MAP.get(value)
