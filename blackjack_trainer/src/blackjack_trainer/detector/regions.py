"""Card-region geometry helpers.

All coordinates inside a detector are expressed as fractions of the
captured frame (0.0-1.0) so the same config works regardless of the
resolution at which the user captured their region.

A ``CardRegion`` can be converted to absolute pixel coordinates given
a concrete frame size.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

import numpy as np


class PixelRect(NamedTuple):
    """Absolute pixel rectangle within a frame."""

    x: int
    y: int
    w: int
    h: int

    def crop(self, frame: np.ndarray) -> np.ndarray:
        """Return the slice of *frame* defined by this rect.

        No copy is made; the caller should ``.copy()`` if needed.
        """
        return frame[self.y : self.y + self.h, self.x : self.x + self.w]

    @property
    def is_valid(self) -> bool:
        return self.w > 0 and self.h > 0


@dataclass(frozen=True)
class CardRegion:
    """A card-crop region expressed as fractions of the frame dimensions."""

    x_frac: float  # left edge
    y_frac: float  # top edge
    w_frac: float  # width
    h_frac: float  # height

    @classmethod
    def from_list(cls, lst: list[float]) -> "CardRegion":
        """Build from ``[x_frac, y_frac, w_frac, h_frac]``."""
        if len(lst) != 4:
            raise ValueError(f"Expected 4 floats, got {lst!r}")
        return cls(*lst)

    def to_pixel_rect(self, frame_w: int, frame_h: int) -> PixelRect:
        """Convert to absolute pixel coordinates for a frame of *frame_w* × *frame_h*."""
        x = int(self.x_frac * frame_w)
        y = int(self.y_frac * frame_h)
        w = max(1, int(self.w_frac * frame_w))
        h = max(1, int(self.h_frac * frame_h))
        # Clamp to frame bounds.
        x = min(x, frame_w - 1)
        y = min(y, frame_h - 1)
        w = min(w, frame_w - x)
        h = min(h, frame_h - y)
        return PixelRect(x=x, y=y, w=w, h=h)


def build_card_regions(fracs: list[list[float]]) -> list[CardRegion]:
    """Convert a list of ``[x_frac, y_frac, w_frac, h_frac]`` entries."""
    return [CardRegion.from_list(f) for f in fracs]
