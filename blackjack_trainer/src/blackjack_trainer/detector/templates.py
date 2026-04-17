"""Template loading and caching for card-rank detection.

Templates are grayscale PNG images stored in ``assets/templates/`` with
filenames matching the rank's single-character label:
    2.png, 3.png, 4.png, 5.png, 6.png, 7.png, 8.png, 9.png,
    T.png, J.png, Q.png, K.png, A.png

Only rank (not suit) templates are required for basic-strategy purposes.
Suit templates can optionally be placed in ``assets/templates/suits/``.

FAILURE-PRONE NOTES
-------------------
* Template size must closely match the rendered card-rank area in the
  captured frames.  If matches are consistently poor, resize templates
  using ``scripts/capture_templates.py`` or adjust ``template_scale_range``
  in config to trigger multi-scale matching.
* Templates must be captured from the same rendering path (zoom, DPI scaling,
  browser font rendering) that will be seen at runtime.  A 1 px anti-aliasing
  difference can drop match confidence by 0.15+.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from ..strategy.models import Rank

logger = logging.getLogger(__name__)

# All ranks we attempt to detect.
ALL_RANKS: list[Rank] = list(Rank)

# Minimum template dimensions; smaller images are likely corrupt or misnamed.
_MIN_TEMPLATE_DIM = 8


class TemplateCache:
    """Loads, validates, and caches grayscale card-rank templates.

    Usage::

        cache = TemplateCache(Path("assets/templates"))
        cache.load()
        tmpl = cache.get(Rank.ACE)   # np.ndarray or None
    """

    def __init__(self, template_dir: Path | str) -> None:
        self.template_dir = Path(template_dir)
        self._cache: dict[Rank, np.ndarray] = {}

    def load(self) -> None:
        """Scan template directory and load all found rank images."""
        self._cache.clear()
        if not self.template_dir.exists():
            logger.warning(
                "Template directory %s does not exist. "
                "Run scripts/capture_templates.py to generate templates.",
                self.template_dir,
            )
            return

        loaded = 0
        for rank in ALL_RANKS:
            path = self.template_dir / f"{rank.value}.png"
            if not path.exists():
                logger.debug("Template not found: %s", path)
                continue
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                logger.warning("Failed to read template image: %s", path)
                continue
            h, w = img.shape[:2]
            if h < _MIN_TEMPLATE_DIM or w < _MIN_TEMPLATE_DIM:
                logger.warning(
                    "Template %s is too small (%dx%d); skipping.", path, w, h
                )
                continue
            self._cache[rank] = img
            loaded += 1

        logger.info(
            "TemplateCache loaded %d/%d templates from %s",
            loaded,
            len(ALL_RANKS),
            self.template_dir,
        )

    def get(self, rank: Rank) -> Optional[np.ndarray]:
        """Return the grayscale template for *rank*, or ``None`` if not loaded."""
        return self._cache.get(rank)

    @property
    def loaded_ranks(self) -> list[Rank]:
        return list(self._cache.keys())

    @property
    def is_empty(self) -> bool:
        return len(self._cache) == 0

    def resize_for_crop(
        self, rank: Rank, crop_w: int, crop_h: int
    ) -> Optional[np.ndarray]:
        """Return a resized copy of the template scaled to fit *crop_w × crop_h*.

        The template is scaled proportionally so its largest dimension fits
        within the crop, then returned as-is for matching.

        FAILURE-PRONE: When crop dimensions vary significantly from template
        dimensions, match quality degrades.  Enable multi-scale matching in
        ``cards.py`` for better robustness at the cost of CPU time.
        """
        tmpl = self.get(rank)
        if tmpl is None:
            return None
        th, tw = tmpl.shape[:2]
        scale = min(crop_w / tw, crop_h / th)
        new_w = max(1, int(tw * scale))
        new_h = max(1, int(th * scale))
        if new_w == tw and new_h == th:
            return tmpl
        return cv2.resize(tmpl, (new_w, new_h), interpolation=cv2.INTER_AREA)
