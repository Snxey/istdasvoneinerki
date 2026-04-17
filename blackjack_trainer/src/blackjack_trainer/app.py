"""Application entry point.

Wiring
------
1. Load (or create) ``AppConfig``.
2. If no region is saved, run the region-selector dialog.
3. Build the ``TableStateDetector``, ``StrategyEngine``, and ``OverlayWidget``.
4. Start the ``CaptureWorker`` QThread.
5. Connect signals: frame → detector → state → overlay update.
6. Enter the Qt event loop.

The capture/detection pipeline runs in a background QThread; the overlay
lives on the main thread.  Cross-thread communication uses Qt signals which
are inherently thread-safe.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np
from PySide6.QtCore import QObject, Qt, Slot
from PySide6.QtWidgets import QApplication

from .capture import CaptureWorker
from .config import AppConfig, RegionConfig, load_config, save_config
from .detector.state import TableStateDetector
from .strategy.engine import StrategyEngine
from .strategy.models import GameState
from .ui.overlay import OverlayWidget
from .ui.selector import run_region_selector
from .utils.logging_config import configure_logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Controller: wires capture worker ↔ detector ↔ overlay
# ---------------------------------------------------------------------------

class AppController(QObject):
    """Owns all runtime components and manages their lifecycle."""

    def __init__(self, config: AppConfig) -> None:
        super().__init__()
        self.config = config

        self._detector = TableStateDetector(
            config=config.detector,
            debug=config.capture.debug,
        )
        self._engine = StrategyEngine(rules=config.rules)
        self._overlay = OverlayWidget(
            engine=self._engine,
            pause_key=config.hotkeys.pause_resume,
            debug_key=config.hotkeys.debug_toggle,
        )
        self._worker: Optional[CaptureWorker] = None

        # Connect overlay signals.
        self._overlay.closed.connect(self._on_overlay_closed)
        self._overlay.debug_toggled.connect(self._on_debug_toggled)
        self._overlay.pause_toggled.connect(self._on_pause_toggled)

    def start(self) -> None:
        """Show overlay and start capture."""
        x, y = self.config.overlay.x, self.config.overlay.y
        self._overlay.move(x, y)
        self._overlay.show()

        self._start_worker()

    def stop(self) -> None:
        """Gracefully stop the capture worker."""
        if self._worker and self._worker.isRunning():
            self._worker.stop()
            self._worker.wait(3000)

    # ------------------------------------------------------------------
    # Capture worker management
    # ------------------------------------------------------------------

    def _start_worker(self) -> None:
        self._worker = CaptureWorker(
            region=self.config.region,
            fps=self.config.capture.fps,
        )
        self._worker.frame_ready.connect(self._on_frame)
        self._worker.error.connect(self._on_worker_error)
        self._worker.start()
        logger.info("Capture worker started.")

    # ------------------------------------------------------------------
    # Slots
    # ------------------------------------------------------------------

    @Slot(object)
    def _on_frame(self, frame: np.ndarray) -> None:
        """Called on the main thread (Qt auto-connection) for each captured frame."""
        try:
            state = self._detector.detect(frame)
            self._overlay.update_state(state)
        except Exception as exc:
            logger.warning("Detection error: %s", exc, exc_info=True)

    @Slot(str)
    def _on_worker_error(self, msg: str) -> None:
        logger.error("CaptureWorker error: %s", msg)

    @Slot()
    def _on_overlay_closed(self) -> None:
        logger.info("Overlay closed; shutting down.")
        self.stop()
        QApplication.quit()

    @Slot(bool)
    def _on_debug_toggled(self, enabled: bool) -> None:
        self._detector.debug = enabled
        logger.info("Debug mode %s.", "enabled" if enabled else "disabled")

    @Slot(bool)
    def _on_pause_toggled(self, paused: bool) -> None:
        if paused and self._worker:
            self._worker.stop()
            self._worker.wait(2000)
            logger.info("Capture paused.")
        elif not paused:
            self._start_worker()
            logger.info("Capture resumed.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="blackjack-trainer",
        description="Real-time Blackjack basic-strategy overlay.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to config JSON file (default: ~/.config/blackjack_trainer/config.json).",
    )
    parser.add_argument(
        "--select-region",
        action="store_true",
        help="Force the region-selection dialog even if a region is saved.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode (saves card crops to /tmp/bj_debug/).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    configure_logging(level=getattr(logging, args.log_level))

    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName("Blackjack Trainer")

    # Load config.
    config = load_config(args.config)
    if args.debug:
        config.capture.debug = True

    # Region selection.
    if args.select_region or config.region.width == 0:
        logger.info("Launching region selector…")
        region = run_region_selector()
        if region is None:
            logger.info("Region selection cancelled; exiting.")
            sys.exit(0)
        config.region = region
        save_config(config, args.config)

    logger.info(
        "Starting with region %s, rules: %s",
        config.region.as_tuple(),
        config.rules.description(),
    )

    controller = AppController(config)
    controller.start()

    exit_code = app.exec()
    controller.stop()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
