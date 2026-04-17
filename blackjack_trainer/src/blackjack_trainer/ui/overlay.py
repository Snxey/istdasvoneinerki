"""Always-on-top transparent overlay showing the strategy recommendation.

Layout
------
┌─────────────────────────────────────┐
│ ● BJ Trainer         [⏸] [DBG] [×] │  ← title bar (drag to move)
├─────────────────────────────────────┤
│  Player:  T ♠  6 ♥   (Hard 16)     │
│  Dealer:  9 ♣                       │
├─────────────────────────────────────┤
│           ██ SURRENDER ██           │  ← action banner
│  Hard 16 vs 9 → SURRENDER …        │  ← explanation
├─────────────────────────────────────┤
│  ◉ HIGH  conf: 0.87                 │  ← traffic light + confidence
└─────────────────────────────────────┘

Traffic-light colours
---------------------
●  Green  : confidence >= HIGH_THRESHOLD
●  Yellow : confidence >= MED_THRESHOLD
●  Red    : below MED_THRESHOLD  → shows "UNCERTAIN" instead of action
"""
from __future__ import annotations

import logging
from typing import Optional

from PySide6.QtCore import Qt, QPoint, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPalette, QKeySequence
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..strategy.engine import StrategyEngine, StrategyResult
from ..strategy.models import Action, GameState

logger = logging.getLogger(__name__)

# Confidence thresholds for traffic-light display.
_HIGH_THRESHOLD = 0.80
_MED_THRESHOLD = 0.60

# Action-to-colour mapping.
_ACTION_COLORS: dict[Action, str] = {
    Action.HIT: "#E05050",          # warm red
    Action.STAND: "#4CAF50",        # green
    Action.DOUBLE: "#2196F3",       # blue
    Action.SPLIT: "#FF9800",        # orange
    Action.SURRENDER: "#9C27B0",    # purple
}


class OverlayWidget(QWidget):
    """Frameless, always-on-top overlay window.

    Signals
    -------
    closed : emitted when the user clicks the close button.
    """

    closed = Signal()
    pause_toggled = Signal(bool)  # True = paused
    debug_toggled = Signal(bool)

    def __init__(
        self,
        engine: StrategyEngine,
        pause_key: str = "F8",
        debug_key: str = "F9",
    ) -> None:
        super().__init__(parent=None)
        self._engine = engine
        self._paused = False
        self._debug = False
        self._drag_pos: Optional[QPoint] = None

        self._build_ui()
        self._apply_window_flags()
        self._register_shortcuts(pause_key, debug_key)

    # ------------------------------------------------------------------
    # Window setup
    # ------------------------------------------------------------------

    def _apply_window_flags(self) -> None:
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMinimumWidth(320)

    def _build_ui(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # --- Container with rounded background ---
        self._container = QWidget()
        self._container.setObjectName("container")
        self._container.setStyleSheet(
            "#container { background: rgba(15,15,25,215); "
            "border-radius: 10px; border: 1px solid rgba(80,80,120,180); }"
        )
        outer.addWidget(self._container)

        layout = QVBoxLayout(self._container)
        layout.setContentsMargins(12, 8, 12, 10)
        layout.setSpacing(6)

        # --- Title bar ---
        title_row = QHBoxLayout()
        title_row.setSpacing(4)

        dot = QLabel("●")
        dot.setStyleSheet("color: #4CAF50; font-size: 12px;")
        title_row.addWidget(dot)

        title = QLabel("BJ Trainer")
        title.setStyleSheet("color: #AAAACC; font-size: 11px; font-weight: bold;")
        title_row.addWidget(title)
        title_row.addStretch()

        self._pause_btn = self._small_button("⏸", "#888888")
        self._pause_btn.setCheckable(True)
        self._pause_btn.clicked.connect(self._on_pause_clicked)
        title_row.addWidget(self._pause_btn)

        self._debug_btn = self._small_button("DBG", "#888888")
        self._debug_btn.setCheckable(True)
        self._debug_btn.clicked.connect(self._on_debug_clicked)
        title_row.addWidget(self._debug_btn)

        close_btn = self._small_button("✕", "#CC4444")
        close_btn.clicked.connect(self._on_close)
        title_row.addWidget(close_btn)

        layout.addLayout(title_row)

        # Divider.
        layout.addWidget(self._divider())

        # --- Hand info ---
        self._player_label = self._info_label("Player: —")
        self._dealer_label = self._info_label("Dealer: —")
        layout.addWidget(self._player_label)
        layout.addWidget(self._dealer_label)

        layout.addWidget(self._divider())

        # --- Action banner ---
        self._action_label = QLabel("—")
        self._action_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._action_label.setStyleSheet(
            "color: #FFFFFF; font-size: 22px; font-weight: bold; padding: 6px 0;"
        )
        layout.addWidget(self._action_label)

        # --- Explanation ---
        self._explanation_label = QLabel("")
        self._explanation_label.setWordWrap(True)
        self._explanation_label.setStyleSheet(
            "color: #AAAAAA; font-size: 10px; padding: 2px 0;"
        )
        self._explanation_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._explanation_label)

        layout.addWidget(self._divider())

        # --- Traffic light row ---
        tl_row = QHBoxLayout()
        self._traffic_dot = QLabel("●")
        self._traffic_dot.setStyleSheet("color: #888888; font-size: 14px;")
        tl_row.addWidget(self._traffic_dot)

        self._conf_label = QLabel("conf: —")
        self._conf_label.setStyleSheet("color: #888888; font-size: 10px;")
        tl_row.addWidget(self._conf_label)
        tl_row.addStretch()

        self._status_label = QLabel("")
        self._status_label.setStyleSheet("color: #666680; font-size: 10px;")
        tl_row.addWidget(self._status_label)

        layout.addLayout(tl_row)

    # ------------------------------------------------------------------
    # Public update method (called from main thread via slot)
    # ------------------------------------------------------------------

    def update_state(self, state: GameState) -> None:
        """Refresh the overlay from a new ``GameState``."""
        if self._paused:
            self._status_label.setText("PAUSED")
            return

        # Hand labels.
        if len(state.player_hand) > 0:
            qualifier = "Soft" if state.player_hand.is_soft else "Hard"
            total = state.player_hand.best_total
            cards = " ".join(c.rank.value for c in state.player_hand.cards)
            pair_tag = " [pair]" if state.player_hand.is_pair else ""
            self._player_label.setText(
                f"Player: {cards}  ({qualifier} {total}{pair_tag})"
            )
        else:
            self._player_label.setText("Player: —")

        if state.dealer_upcard:
            self._dealer_label.setText(f"Dealer: {state.dealer_upcard.rank.value}")
        else:
            self._dealer_label.setText("Dealer: —")

        # Traffic light.
        conf = state.confidence
        self._conf_label.setText(f"conf: {conf:.2f}")
        if conf >= _HIGH_THRESHOLD:
            dot_color, level = "#4CAF50", "HIGH"
        elif conf >= _MED_THRESHOLD:
            dot_color, level = "#FFC107", "MED"
        else:
            dot_color, level = "#F44336", "LOW"
        self._traffic_dot.setStyleSheet(f"color: {dot_color}; font-size: 14px;")

        # Status / action.
        if state.status_message:
            self._status_label.setText(state.status_message)
            self._action_label.setText("—")
            self._action_label.setStyleSheet(
                "color: #AAAAAA; font-size: 22px; font-weight: bold; padding: 6px 0;"
            )
            self._explanation_label.setText("")
            return

        self._status_label.setText(f"{level} confidence")

        if conf < _MED_THRESHOLD or not state.is_valid:
            self._action_label.setText("UNCERTAIN")
            self._action_label.setStyleSheet(
                "color: #888888; font-size: 20px; font-weight: bold; padding: 6px 0;"
            )
            self._explanation_label.setText("Detection confidence too low.")
            return

        result: Optional[StrategyResult] = self._engine.recommend_from_state(state)
        if result is None:
            self._action_label.setText("—")
            self._explanation_label.setText("")
            return

        action = result.action
        color = _ACTION_COLORS.get(action, "#FFFFFF")
        self._action_label.setText(action.value)
        self._action_label.setStyleSheet(
            f"color: {color}; font-size: 22px; font-weight: bold; padding: 6px 0;"
        )
        self._explanation_label.setText(result.explanation)

        # Debug info.
        if self._debug:
            self._status_label.setText(
                f"{level} | raw={result.raw_code} conf={conf:.3f}"
            )

    # ------------------------------------------------------------------
    # Button callbacks
    # ------------------------------------------------------------------

    def _on_pause_clicked(self) -> None:
        self._paused = self._pause_btn.isChecked()
        icon = "▶" if self._paused else "⏸"
        self._pause_btn.setText(icon)
        self.pause_toggled.emit(self._paused)
        if not self._paused:
            self._status_label.setText("")

    def _on_debug_clicked(self) -> None:
        self._debug = self._debug_btn.isChecked()
        self.debug_toggled.emit(self._debug)

    def _on_close(self) -> None:
        self.closed.emit()
        self.hide()

    # ------------------------------------------------------------------
    # Keyboard shortcuts
    # ------------------------------------------------------------------

    def _register_shortcuts(self, pause_key: str, debug_key: str) -> None:
        from PySide6.QtGui import QShortcut
        QShortcut(QKeySequence(pause_key), self, self._on_pause_clicked)
        QShortcut(QKeySequence(debug_key), self, self._on_debug_clicked)

    # ------------------------------------------------------------------
    # Drag to move
    # ------------------------------------------------------------------

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, event) -> None:
        if self._drag_pos and event.buttons() & Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, _event) -> None:
        self._drag_pos = None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _small_button(text: str, color: str) -> QPushButton:
        btn = QPushButton(text)
        btn.setFixedSize(28, 20)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet(
            f"QPushButton {{ background: transparent; color: {color}; "
            f"font-size: 11px; border: none; }}"
            f"QPushButton:hover {{ color: #FFFFFF; }}"
            f"QPushButton:checked {{ color: #FFD700; }}"
        )
        return btn

    @staticmethod
    def _info_label(text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet("color: #CCCCEE; font-size: 11px; font-family: Monospace;")
        return lbl

    @staticmethod
    def _divider() -> QWidget:
        w = QWidget()
        w.setFixedHeight(1)
        w.setStyleSheet("background: rgba(80,80,120,120);")
        return w
