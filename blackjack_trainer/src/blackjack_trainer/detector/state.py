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
* Debug mode saves cropped regions as PNGs to ``/tmp/bj_debug/`` and annotates
  confidence scores so you can diagnose detection failures.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from ..config import DetectorConfig
from ..strategy.models import Card, GameState, Hand
from .cards import CardDetector, MatchResult
from .regions import CardRegion, build_card_regions, PixelRect
from .templates import TemplateCache

logger = logging.getLogger(__name__)

_DEBUG_DIR = Path("/tmp/bj_debug")


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

        if debug:
            _DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, frame: np.ndarray) -> GameState:
        """Run full detection on *frame* and return a ``GameState`` snapshot."""
        h, w = frame.shape[:2]
        state = GameState()

        # --- Dealer up-card ---
        dealer_result = self._detect_slot(
            frame, w, h, self._dealer_regions, slot_index=0, label="dealer"
        )
        if dealer_result and dealer_result.card:
            state.dealer_upcard = dealer_result.card

        # --- Player cards ---
        player_hand = Hand()
        confidences: list[float] = []

        for idx, region in enumerate(self._player_regions):
            result = self._detect_slot(
                frame, w, h, [region], slot_index=idx, label=f"player_{idx}"
            )
            if result is None:
                # Region out of bounds — skip silently.
                continue
            if result.card is not None:
                player_hand.add_card(result.card)
                confidences.append(result.confidence)
            # Stop after we hit the first empty slot (cards are contiguous).
            elif confidences:
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

        # Status message.
        if len(player_hand) == 0 and state.dealer_upcard is None:
            state.status_message = "No cards detected"
        elif len(player_hand) < 2:
            state.status_message = "Waiting for full hand..."
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
        """Detect the card in the first region of *regions* that yields a valid crop."""
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
            "Slot %s: rank=%s confidence=%.3f",
            label,
            result.rank,
            result.confidence,
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
