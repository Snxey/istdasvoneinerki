"""Application configuration: load/save from JSON, provide typed access.

The config file path defaults to ``~/.config/blackjack_trainer/config.json``
but can be overridden via the ``BLACKJACK_TRAINER_CONFIG`` environment variable.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

from .strategy.rules import TableRules

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_PATH = (
    Path.home() / ".config" / "blackjack_trainer" / "config.json"
)


@dataclass
class RegionConfig:
    x: int = 0
    y: int = 0
    width: int = 900
    height: int = 600

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.width, self.height)

    @classmethod
    def from_dict(cls, d: dict) -> "RegionConfig":
        return cls(
            x=d.get("x", 0),
            y=d.get("y", 0),
            width=d.get("width", 900),
            height=d.get("height", 600),
        )

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


@dataclass
class CaptureConfig:
    fps: int = 5
    debug: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> "CaptureConfig":
        return cls(fps=d.get("fps", 5), debug=d.get("debug", False))

    def to_dict(self) -> dict:
        return {"fps": self.fps, "debug": self.debug}


@dataclass
class DetectorConfig:
    """Detector parameters.

    ``player_card_regions`` and ``dealer_card_regions`` are lists of
    ``[x_frac, y_frac, w_frac, h_frac]`` — coordinates relative to the
    captured region (0.0–1.0).
    """

    template_dir: str = "assets/templates"
    confidence_threshold: float = 0.72
    template_scale_range: list[float] = field(default_factory=lambda: [0.8, 1.2])
    player_card_regions: list[list[float]] = field(
        default_factory=lambda: [
            [0.30, 0.58, 0.09, 0.18],
            [0.41, 0.58, 0.09, 0.18],
            [0.52, 0.58, 0.09, 0.18],
            [0.63, 0.58, 0.09, 0.18],
            [0.74, 0.58, 0.09, 0.18],
        ]
    )
    dealer_card_regions: list[list[float]] = field(
        default_factory=lambda: [
            [0.41, 0.12, 0.09, 0.18],
            [0.52, 0.12, 0.09, 0.18],
        ]
    )
    # Badge reader (Stake-style hand-total badges).
    use_badge_reader: bool = False
    dealer_badge_region: Optional[list[float]] = None  # [x,y,w,h] fractions
    player_badge_region: Optional[list[float]] = None

    @classmethod
    def from_dict(cls, d: dict) -> "DetectorConfig":
        return cls(
            template_dir=d.get("template_dir", "assets/templates"),
            confidence_threshold=d.get("confidence_threshold", 0.72),
            template_scale_range=d.get("template_scale_range", [0.8, 1.2]),
            player_card_regions=d.get(
                "player_card_regions",
                [[0.30, 0.58, 0.09, 0.18], [0.41, 0.58, 0.09, 0.18]],
            ),
            dealer_card_regions=d.get(
                "dealer_card_regions", [[0.41, 0.12, 0.09, 0.18]]
            ),
            use_badge_reader=d.get("use_badge_reader", False),
            dealer_badge_region=d.get("dealer_badge_region"),
            player_badge_region=d.get("player_badge_region"),
        )

    def to_dict(self) -> dict:
        return {
            "template_dir": self.template_dir,
            "confidence_threshold": self.confidence_threshold,
            "template_scale_range": self.template_scale_range,
            "player_card_regions": self.player_card_regions,
            "dealer_card_regions": self.dealer_card_regions,
            "use_badge_reader": self.use_badge_reader,
            "dealer_badge_region": self.dealer_badge_region,
            "player_badge_region": self.player_badge_region,
        }


@dataclass
class OverlayConfig:
    x: int = 50
    y: int = 50
    opacity: float = 0.90

    @classmethod
    def from_dict(cls, d: dict) -> "OverlayConfig":
        return cls(
            x=d.get("x", 50),
            y=d.get("y", 50),
            opacity=d.get("opacity", 0.90),
        )

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "opacity": self.opacity}


@dataclass
class HotkeyConfig:
    pause_resume: str = "F8"
    debug_toggle: str = "F9"

    @classmethod
    def from_dict(cls, d: dict) -> "HotkeyConfig":
        return cls(
            pause_resume=d.get("pause_resume", "F8"),
            debug_toggle=d.get("debug_toggle", "F9"),
        )

    def to_dict(self) -> dict:
        return {"pause_resume": self.pause_resume, "debug_toggle": self.debug_toggle}


@dataclass
class AppConfig:
    region: RegionConfig = field(default_factory=RegionConfig)
    capture: CaptureConfig = field(default_factory=CaptureConfig)
    detector: DetectorConfig = field(default_factory=DetectorConfig)
    rules: TableRules = field(default_factory=TableRules)
    overlay: OverlayConfig = field(default_factory=OverlayConfig)
    hotkeys: HotkeyConfig = field(default_factory=HotkeyConfig)

    @classmethod
    def from_dict(cls, d: dict) -> "AppConfig":
        return cls(
            region=RegionConfig.from_dict(d.get("region", {})),
            capture=CaptureConfig.from_dict(d.get("capture", {})),
            detector=DetectorConfig.from_dict(d.get("detector", {})),
            rules=TableRules.from_dict(d.get("rules", {})),
            overlay=OverlayConfig.from_dict(d.get("overlay", {})),
            hotkeys=HotkeyConfig.from_dict(d.get("hotkeys", {})),
        )

    def to_dict(self) -> dict:
        return {
            "region": self.region.to_dict(),
            "capture": self.capture.to_dict(),
            "detector": self.detector.to_dict(),
            "rules": self.rules.to_dict(),
            "overlay": self.overlay.to_dict(),
            "hotkeys": self.hotkeys.to_dict(),
        }


# ---------------------------------------------------------------------------
# Load / save helpers
# ---------------------------------------------------------------------------

def _config_path() -> Path:
    env = os.environ.get("BLACKJACK_TRAINER_CONFIG")
    if env:
        return Path(env)
    return _DEFAULT_CONFIG_PATH


def load_config(path: Optional[Path] = None) -> AppConfig:
    """Load config from *path* (or the default path).  Returns defaults on any error."""
    p = path or _config_path()
    if not p.exists():
        logger.info("No config file at %s; using defaults.", p)
        return AppConfig()
    try:
        with p.open() as fh:
            data: dict[str, Any] = json.load(fh)
        logger.info("Loaded config from %s", p)
        return AppConfig.from_dict(data)
    except Exception as exc:
        logger.warning("Could not load config from %s: %s — using defaults.", p, exc)
        return AppConfig()


def save_config(config: AppConfig, path: Optional[Path] = None) -> None:
    """Persist *config* to *path* (or the default path)."""
    p = path or _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        with p.open("w") as fh:
            json.dump(config.to_dict(), fh, indent=2)
        logger.info("Saved config to %s", p)
    except Exception as exc:
        logger.error("Could not save config to %s: %s", p, exc)
