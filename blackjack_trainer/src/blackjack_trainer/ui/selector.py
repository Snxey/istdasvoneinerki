"""Full-screen region-selector dialog.

The user clicks and drags to select the Blackjack table region.  The
selected coordinates are returned as a ``RegionConfig`` instance.

Usage::

    from blackjack_trainer.ui.selector import RegionSelectorDialog
    from PySide6.QtWidgets import QApplication
    import sys

    app = QApplication(sys.argv)
    dialog = RegionSelectorDialog()
    region = dialog.run()  # blocks until selection is complete or cancelled
    if region:
        print(region)
"""
from __future__ import annotations

import logging
from typing import Optional

from PySide6.QtCore import QPoint, QRect, Qt
from PySide6.QtGui import QColor, QCursor, QFont, QPainter, QPen
from PySide6.QtWidgets import QApplication, QWidget

from ..config import RegionConfig

logger = logging.getLogger(__name__)


class RegionSelectorWidget(QWidget):
    """Transparent full-screen overlay for click-drag region selection."""

    def __init__(self) -> None:
        super().__init__()
        self._start: Optional[QPoint] = None
        self._end: Optional[QPoint] = None
        self._selection_done = False
        self._cancelled = False

        # Full screen, transparent, always on top, frameless.
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowOpacity(0.6)
        self.setCursor(QCursor(Qt.CursorShape.CrossCursor))

        # Cover all screens.
        screen_geo = QApplication.primaryScreen().virtualGeometry()
        self.setGeometry(screen_geo)

    # ------------------------------------------------------------------
    # Mouse events
    # ------------------------------------------------------------------

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._start = event.globalPosition().toPoint()
            self._end = self._start
            self.update()

    def mouseMoveEvent(self, event) -> None:
        if self._start is not None:
            self._end = event.globalPosition().toPoint()
            self.update()

    def mouseReleaseEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton and self._start is not None:
            self._end = event.globalPosition().toPoint()
            self._selection_done = True
            self.close()

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self._cancelled = True
            self.close()

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def paintEvent(self, _event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Semi-opaque dark overlay.
        painter.fillRect(self.rect(), QColor(0, 0, 0, 100))

        if self._start and self._end:
            sel_rect = QRect(self._start, self._end).normalized()

            # Cut out the selection (show it brighter).
            painter.setCompositionMode(
                QPainter.CompositionMode.CompositionMode_Clear
            )
            painter.fillRect(sel_rect, Qt.GlobalColor.transparent)
            painter.setCompositionMode(
                QPainter.CompositionMode.CompositionMode_SourceOver
            )

            # Draw selection border.
            pen = QPen(QColor(0, 200, 255), 2, Qt.PenStyle.SolidLine)
            painter.setPen(pen)
            painter.drawRect(sel_rect)

            # Dimension label.
            label = f"{sel_rect.width()} × {sel_rect.height()}  ({sel_rect.x()}, {sel_rect.y()})"
            font = QFont("Monospace", 11)
            painter.setFont(font)
            painter.setPen(QColor(0, 200, 255))
            painter.drawText(sel_rect.bottomLeft() + QPoint(4, 18), label)

        # Instructions.
        painter.setPen(QColor(255, 255, 255, 200))
        painter.setFont(QFont("Sans", 13))
        painter.drawText(
            20, 30,
            "Click and drag to select the Blackjack table region.  ESC to cancel.",
        )

        painter.end()

    # ------------------------------------------------------------------
    # Result
    # ------------------------------------------------------------------

    @property
    def selected_region(self) -> Optional[RegionConfig]:
        if self._cancelled or not self._selection_done:
            return None
        if self._start is None or self._end is None:
            return None
        rect = QRect(self._start, self._end).normalized()
        if rect.width() < 10 or rect.height() < 10:
            logger.warning("Selection too small: %s", rect)
            return None
        return RegionConfig(
            x=rect.x(),
            y=rect.y(),
            width=rect.width(),
            height=rect.height(),
        )


def run_region_selector() -> Optional[RegionConfig]:
    """Show the region-selector and return the chosen ``RegionConfig`` or None."""
    widget = RegionSelectorWidget()
    widget.showFullScreen()
    widget.activateWindow()

    # Block until the widget closes.
    app = QApplication.instance()
    assert app is not None
    while widget.isVisible():
        app.processEvents()

    result = widget.selected_region
    if result:
        logger.info("Region selected: %s", result)
    else:
        logger.info("Region selection cancelled.")
    return result
