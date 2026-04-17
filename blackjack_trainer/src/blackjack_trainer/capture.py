"""Screen capture using ``mss``.

The ``CaptureWorker`` runs in a ``QThread`` and emits a ``frame_ready`` signal
with each captured ``numpy`` array.  The main thread's overlay simply connects
to that signal — no shared state or locks required.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import mss
import numpy as np
from PySide6.QtCore import QThread, Signal

from .config import RegionConfig

logger = logging.getLogger(__name__)


class ScreenCapture:
    """Thin synchronous wrapper around ``mss`` for single-frame grabs.

    Kept separate from the QThread worker so it can be used in unit tests
    and the template-capture script without a Qt event loop.
    """

    def __init__(self, region: RegionConfig) -> None:
        self.region = region
        self._sct: Optional[mss.base.MSSBase] = None

    def __enter__(self) -> "ScreenCapture":
        self._sct = mss.mss()
        return self

    def __exit__(self, *_) -> None:
        if self._sct:
            self._sct.close()
            self._sct = None

    def grab(self) -> np.ndarray:
        """Capture one frame and return it as a BGR numpy array.

        The returned array has shape ``(H, W, 3)`` with ``dtype=uint8``.
        Raises ``RuntimeError`` if called outside a ``with`` block.
        """
        if self._sct is None:
            raise RuntimeError("ScreenCapture must be used as a context manager")

        monitor = {
            "left": self.region.x,
            "top": self.region.y,
            "width": self.region.width,
            "height": self.region.height,
            "mon": 0,
        }
        # mss returns BGRA; drop the alpha channel.
        screenshot = self._sct.grab(monitor)
        frame = np.frombuffer(screenshot.raw, dtype=np.uint8)
        frame = frame.reshape((screenshot.height, screenshot.width, 4))
        return frame[:, :, :3].copy()  # BGR, contiguous


class CaptureWorker(QThread):
    """QThread that emits ``frame_ready(np.ndarray)`` at the configured FPS.

    Signals
    -------
    frame_ready : emitted with each BGR frame array.
    error       : emitted with an error message string on capture failure.
    """

    frame_ready = Signal(object)   # np.ndarray (object to avoid Qt type registration)
    error = Signal(str)

    def __init__(self, region: RegionConfig, fps: int = 5) -> None:
        super().__init__()
        self.region = region
        self.fps = max(1, min(fps, 30))
        self._running = False

    # ------------------------------------------------------------------
    # Public control API (called from main thread)
    # ------------------------------------------------------------------

    def stop(self) -> None:
        """Request the worker to stop gracefully."""
        self._running = False

    def update_region(self, region: RegionConfig) -> None:
        """Hot-swap the capture region while the worker is running."""
        self.region = region

    # ------------------------------------------------------------------
    # QThread entry point
    # ------------------------------------------------------------------

    def run(self) -> None:
        self._running = True
        interval = 1.0 / self.fps
        logger.info(
            "CaptureWorker starting: region=%s fps=%d", self.region.as_tuple(), self.fps
        )

        try:
            with ScreenCapture(self.region) as cap:
                while self._running:
                    t0 = time.monotonic()

                    try:
                        # Re-read region each loop so hot-swaps take effect.
                        cap.region = self.region
                        frame = cap.grab()
                        self.frame_ready.emit(frame)
                    except Exception as exc:
                        logger.warning("Frame grab error: %s", exc)
                        self.error.emit(str(exc))

                    elapsed = time.monotonic() - t0
                    sleep_time = interval - elapsed
                    if sleep_time > 0:
                        # Use QThread.msleep to keep the thread interruptible.
                        self.msleep(int(sleep_time * 1000))

        except Exception as exc:
            logger.error("CaptureWorker fatal error: %s", exc, exc_info=True)
            self.error.emit(str(exc))
        finally:
            logger.info("CaptureWorker stopped.")
