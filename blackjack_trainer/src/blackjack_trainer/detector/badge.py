"""Stake-style hand-total badge reader.

Stake.com (and some other online casinos) display the current hand total in a
small circular badge above each hand.  Reading this badge is far more reliable
than template-matching individual card ranks because:

  - The number is always rendered at the same size and font.
  - It is unoccluded and always visible.
  - It updates instantly when a card is added.

However the badge alone cannot tell us:
  - Whether the hand is soft (ace counted as 11).
  - Whether the two cards form a pair.

For those two cases the badge total is cross-checked against (or supplemented
by) the individual-card detector in ``state.py``.

Detection approach
------------------
1. Crop the badge region from the frame.
2. Convert to grayscale and apply adaptive thresholding to isolate the white
   digit pixels against the dark circular background.
3. If ``pytesseract`` is installed, hand the cleaned crop to Tesseract with a
   digit-only character whitelist → very reliable.
4. If Tesseract is not available, fall back to a lightweight contour-based
   approach: count connected components, classify 1 vs 2 digits, and use a
   simple width/height heuristic to distinguish common digits.

FAILURE-PRONE NOTES
-------------------
* The badge disappears briefly during card-deal animation.  The reader returns
  ``None`` in that case; callers must tolerate None.
* Badge position varies slightly when the player has split hands.  Configure
  multiple badge regions if you play splits.
* Tesseract 4.x+ with the LSTM engine (`--oem 1`) gives best accuracy on
  small crops.  Install with `sudo apt install tesseract-ocr` on Ubuntu.
"""
from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Tesseract is optional — imported lazily.
_TESSERACT_AVAILABLE: Optional[bool] = None


def _try_import_tesseract() -> bool:
    global _TESSERACT_AVAILABLE
    if _TESSERACT_AVAILABLE is not None:
        return _TESSERACT_AVAILABLE
    try:
        import pytesseract  # noqa: F401
        _TESSERACT_AVAILABLE = True
    except ImportError:
        _TESSERACT_AVAILABLE = False
        logger.info(
            "pytesseract not installed; badge reader will use fallback OCR. "
            "Install with: pip install pytesseract  (and tesseract-ocr binary)"
        )
    return _TESSERACT_AVAILABLE


class BadgeReader:
    """Read the integer hand total displayed in a Stake-style round badge.

    Parameters
    ----------
    min_total / max_total:
        Plausible range for a Blackjack hand total.  Any value outside this
        range is treated as a failed read and returns ``None``.
    """

    def __init__(self, min_total: int = 2, max_total: int = 21) -> None:
        self.min_total = min_total
        self.max_total = max_total
        self._tess_config = "--psm 8 --oem 1 -c tessedit_char_whitelist=0123456789"

    def read(self, crop: np.ndarray) -> Optional[int]:
        """Return the integer shown in *crop*, or ``None`` on failure."""
        if crop is None or crop.size == 0:
            return None

        gray = _to_gray(crop)
        clean = _preprocess_badge(gray)

        if _try_import_tesseract():
            return self._read_with_tesseract(clean)
        return self._read_fallback(clean)

    # ------------------------------------------------------------------
    # Tesseract path
    # ------------------------------------------------------------------

    def _read_with_tesseract(self, clean: np.ndarray) -> Optional[int]:
        import pytesseract

        # Upscale for better Tesseract accuracy on small images.
        scale = max(1, 60 // max(clean.shape[0], 1))
        if scale > 1:
            clean = cv2.resize(
                clean, (clean.shape[1] * scale, clean.shape[0] * scale),
                interpolation=cv2.INTER_NEAREST,
            )

        try:
            text = pytesseract.image_to_string(clean, config=self._tess_config).strip()
            digits = "".join(c for c in text if c.isdigit())
            if not digits:
                return None
            val = int(digits)
        except Exception as exc:
            logger.debug("Tesseract badge read failed: %s", exc)
            return None

        return val if self.min_total <= val <= self.max_total else None

    # ------------------------------------------------------------------
    # Fallback: contour-based digit estimation
    # ------------------------------------------------------------------

    def _read_fallback(self, clean: np.ndarray) -> Optional[int]:
        """Estimate a 1–2 digit number from a thresholded badge crop.

        This is intentionally simple: count non-zero pixel columns to separate
        digit glyphs, then classify each glyph by its aspect ratio and
        column density into rough digit buckets.  Accuracy is ~70 % for
        the digits 2-21 seen in Blackjack; use Tesseract for production use.
        """
        # Find bounding box of non-zero pixels.
        coords = cv2.findNonZero(clean)
        if coords is None:
            return None
        x, y, w, h = cv2.boundingRect(coords)
        if w < 3 or h < 3:
            return None

        digit_crop = clean[y : y + h, x : x + w]

        # Estimate digit count from aspect ratio.
        aspect = w / max(h, 1)
        if aspect > 1.4:
            # Two digits side by side.
            mid = w // 2
            left = digit_crop[:, :mid]
            right = digit_crop[:, mid:]
            d1 = _classify_digit_glyph(left)
            d2 = _classify_digit_glyph(right)
            if d1 is None or d2 is None:
                return None
            val = d1 * 10 + d2
        else:
            val = _classify_digit_glyph(digit_crop)
            if val is None:
                return None

        return val if self.min_total <= val <= self.max_total else None


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def _preprocess_badge(gray: np.ndarray) -> np.ndarray:
    """Isolate white badge digits on a black background.

    Stake badges have light/white digits on a dark circular background.
    We threshold to pull out only the bright pixels (the number).
    """
    # Upscale slightly so that small badge crops are easier to threshold.
    if gray.shape[0] < 20:
        scale = max(1, 30 // gray.shape[0])
        gray = cv2.resize(
            gray, (gray.shape[1] * scale, gray.shape[0] * scale),
            interpolation=cv2.INTER_CUBIC,
        )

    # OTSU threshold: automatically separates bright digit from dark bg.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    # If the image is inverted (white bg, dark text), flip it.
    if np.sum(binary) > binary.size * 128:
        binary = cv2.bitwise_not(binary)

    # Morphological close to fill gaps in digits.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)


def _classify_digit_glyph(glyph: np.ndarray) -> Optional[int]:
    """Very rough aspect-ratio / density classifier for a single digit glyph.

    Returns an integer 0–9 or ``None``.  Accuracy is low; use only when
    pytesseract is unavailable.
    """
    if glyph.size == 0:
        return None
    h, w = glyph.shape[:2]
    if h == 0 or w == 0:
        return None

    density = np.sum(glyph > 0) / glyph.size
    aspect = w / h

    # These heuristics are tuned for Stake's badge font (clean sans-serif).
    # They will NOT generalise well to other fonts.
    if density < 0.15:
        return 1
    if density > 0.80:
        return 8
    if aspect < 0.5:
        return 1
    # For digits 0 / 6 / 9: check top and bottom thirds.
    top_density = np.sum(glyph[: h // 3] > 0) / max(glyph[: h // 3].size, 1)
    bot_density = np.sum(glyph[2 * h // 3 :] > 0) / max(glyph[2 * h // 3 :].size, 1)

    if top_density > 0.55 and bot_density < 0.35:
        return 7
    if bot_density > 0.55 and top_density < 0.35:
        return 6  # or could be 2 / 5
    # Fall back to density buckets — very rough.
    if density < 0.35:
        return 4
    if density < 0.50:
        return 2
    return 0
