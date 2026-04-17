"""Card-rank detection via OpenCV template matching.

Pipeline per card crop
----------------------
1. Convert crop to grayscale.
2. Optionally apply histogram equalization (helps with table-theme variations).
3. For each rank template, run ``cv2.matchTemplate`` with ``TM_CCOEFF_NORMED``.
4. Record the best (rank, score) pair.
5. If ``score >= confidence_threshold`` return the rank; otherwise return None.

Multi-scale matching
--------------------
When ``scale_range`` is set (e.g. ``[0.8, 1.2]``), templates are resized to
several scales and the highest-scoring result across all scales is used.  This
is slower but handles tables where the rendered card size differs slightly from
the template size.  Enable only if single-scale confidence is consistently poor.

FAILURE-PRONE NOTES
-------------------
* ``TM_CCOEFF_NORMED`` is robust to global brightness differences but NOT to
  large colour-shift or table skin changes.  Recapture templates if the table
  theme changes.
* Partial occlusion of the rank area (overlapping cards) will reduce confidence.
  The detector returns ``None`` rather than guessing in that case.
* If the crop region is smaller than the template, ``cv2.matchTemplate`` raises
  an error.  The code guards against this but logs a warning when it occurs.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from ..strategy.models import Card, Rank, Suit
from .templates import TemplateCache

logger = logging.getLogger(__name__)

_NUM_SCALES = 5  # steps within scale_range for multi-scale matching


@dataclass
class MatchResult:
    rank: Optional[Rank]
    confidence: float  # 0.0-1.0 (TM_CCOEFF_NORMED score)
    suit: Suit = Suit.UNKNOWN  # suit detection is future work

    @property
    def card(self) -> Optional[Card]:
        if self.rank is None:
            return None
        return Card(rank=self.rank, suit=self.suit)


class CardDetector:
    """Matches a single card crop against all loaded templates.

    Parameters
    ----------
    template_cache:
        Pre-loaded ``TemplateCache``.
    confidence_threshold:
        Minimum normalised match score to accept a detection (0.0–1.0).
        Values around 0.65–0.80 work well depending on image quality.
    scale_range:
        ``[min_scale, max_scale]`` for multi-scale matching, or ``None``
        to use templates at their native resolution only.
    equalize_hist:
        Apply CLAHE histogram equalisation before matching.  Helps with
        inconsistent lighting / monitor brightness.
    """

    def __init__(
        self,
        template_cache: TemplateCache,
        confidence_threshold: float = 0.72,
        scale_range: Optional[list[float]] = None,
        equalize_hist: bool = True,
    ) -> None:
        self._cache = template_cache
        self.confidence_threshold = confidence_threshold
        self.scale_range = scale_range
        self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
        self.equalize_hist = equalize_hist

    def detect(self, crop: np.ndarray) -> MatchResult:
        """Run template matching on a single BGR or grayscale crop.

        Returns ``MatchResult`` with ``rank=None`` when confidence is below
        threshold or no templates are loaded.
        """
        if self._cache.is_empty:
            return MatchResult(rank=None, confidence=0.0)

        gray = _to_gray(crop)
        if self.equalize_hist:
            gray = self._clahe.apply(gray)

        best_rank: Optional[Rank] = None
        best_score: float = -1.0

        for rank in self._cache.loaded_ranks:
            score = self._best_score_for_rank(rank, gray)
            if score > best_score:
                best_score = score
                best_rank = rank

        if best_score < self.confidence_threshold:
            logger.debug(
                "Low confidence %.3f for best rank %s; returning None",
                best_score,
                best_rank,
            )
            return MatchResult(rank=None, confidence=best_score)

        return MatchResult(rank=best_rank, confidence=best_score)

    def _best_score_for_rank(self, rank: Rank, gray_crop: np.ndarray) -> float:
        """Return the highest match score for *rank* across all scales."""
        if self.scale_range is None:
            return self._match_at_scale(rank, gray_crop, scale=1.0)

        min_s, max_s = self.scale_range
        scales = np.linspace(min_s, max_s, _NUM_SCALES)
        best = -1.0
        for scale in scales:
            score = self._match_at_scale(rank, gray_crop, float(scale))
            if score > best:
                best = score
        return best

    def _match_at_scale(
        self, rank: Rank, gray_crop: np.ndarray, scale: float
    ) -> float:
        """Run ``TM_CCOEFF_NORMED`` for *rank*'s template resized to *scale*."""
        tmpl = self._cache.get(rank)
        if tmpl is None:
            return -1.0

        th, tw = tmpl.shape[:2]
        if scale != 1.0:
            new_w = max(1, int(tw * scale))
            new_h = max(1, int(th * scale))
            tmpl = cv2.resize(tmpl, (new_w, new_h), interpolation=cv2.INTER_AREA)

        ch, cw = gray_crop.shape[:2]
        tth, ttw = tmpl.shape[:2]

        if tth > ch or ttw > cw:
            # Template is larger than crop — cannot match.
            logger.debug(
                "Template %s (%dx%d) larger than crop (%dx%d) at scale %.2f; skipping.",
                rank.value, ttw, tth, cw, ch, scale,
            )
            return -1.0

        result = cv2.matchTemplate(gray_crop, tmpl, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, _ = cv2.minMaxLoc(result)
        return float(max_val)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_gray(image: np.ndarray) -> np.ndarray:
    """Convert BGR or BGRA to grayscale; pass through if already single-channel."""
    if image.ndim == 2:
        return image
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
