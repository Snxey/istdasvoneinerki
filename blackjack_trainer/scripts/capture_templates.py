"""Calibration helper: capture card-rank templates from live screenshots.

Workflow
--------
1. Open the target Blackjack table in your browser/app at the normal zoom level.
2. Run this script::

       python scripts/capture_templates.py --output assets/templates

3. When the crosshair cursor appears, click and drag a tight rectangle around
   the **rank area** (top-left corner pip) of the desired card.
4. Enter the rank label when prompted (2-9, T, J, Q, K, A).
5. Repeat for each rank.  You need at least one clean template per rank.
6. Run the trainer; if confidence is low for certain ranks, re-capture them.

Tips
----
* Capture rank pips at the same zoom/DPI as they will appear during play.
* Use a card with a clear, unobscured corner pip.
* Grayscale templates are saved; lighting/colour of the suit does not matter.
* For J/Q/K, the rank letter is usually shown as a single character in the
  pip area.  If it renders with serifs that vary by suit, capture one
  representative example.
"""
from __future__ import annotations

import sys
import argparse
import logging
from pathlib import Path

# Allow running without installation: add src/ to path.
_src = Path(__file__).resolve().parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

import cv2
import numpy as np

try:
    from PySide6.QtWidgets import QApplication
except ImportError:
    print("PySide6 is required: pip install PySide6")
    sys.exit(1)

from blackjack_trainer.capture import ScreenCapture
from blackjack_trainer.config import RegionConfig
from blackjack_trainer.ui.selector import RegionSelectorWidget
from blackjack_trainer.strategy.models import Rank
from blackjack_trainer.utils.logging_config import configure_logging

logger = logging.getLogger(__name__)

VALID_RANKS = {r.value for r in Rank}


def grab_full_screen() -> np.ndarray:
    """Capture the entire primary monitor."""
    import mss
    with mss.mss() as sct:
        mon = sct.monitors[1]  # primary monitor
        shot = sct.grab(mon)
        frame = np.frombuffer(shot.raw, dtype=np.uint8)
        frame = frame.reshape((shot.height, shot.width, 4))
        return frame[:, :, :3].copy()


def select_crop_region(app: QApplication) -> RegionConfig | None:
    """Use the region-selector widget to get a rectangle."""
    widget = RegionSelectorWidget()
    widget.showFullScreen()
    widget.activateWindow()
    while widget.isVisible():
        app.processEvents()
    return widget.selected_region


def save_template(crop: np.ndarray, rank_label: str, output_dir: Path) -> Path:
    """Convert to grayscale, equalise, and save as ``{rank}.png``."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    # Light CLAHE to normalise brightness — matches what CardDetector does.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    gray = clahe.apply(gray)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"{rank_label}.png"
    cv2.imwrite(str(out_path), gray)
    logger.info("Saved template: %s (%dx%d)", out_path, gray.shape[1], gray.shape[0])
    return out_path


def preview_template(gray: np.ndarray, rank_label: str) -> None:
    """Show the captured template in a small OpenCV window for inspection."""
    disp = cv2.resize(gray, (80, 120), interpolation=cv2.INTER_NEAREST)
    cv2.imshow(f"Template: {rank_label} (press any key)", disp)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def main() -> None:
    configure_logging(logging.INFO)
    parser = argparse.ArgumentParser(description="Capture card-rank templates.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("assets/templates"),
        help="Directory to save templates (default: assets/templates).",
    )
    parser.add_argument(
        "--ranks",
        nargs="+",
        default=None,
        help="Ranks to capture (default: all).  E.g.: --ranks A K Q J T",
    )
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Skip the preview window after each capture.",
    )
    args = parser.parse_args()

    app = QApplication.instance() or QApplication(sys.argv)

    target_ranks = args.ranks or [r.value for r in Rank]
    invalid = [r for r in target_ranks if r.upper() not in VALID_RANKS]
    if invalid:
        print(f"Unknown ranks: {invalid}.  Valid: {sorted(VALID_RANKS)}")
        sys.exit(1)

    print(
        "\n=== Blackjack Trainer — Template Capture ===\n"
        f"Output directory: {args.output.resolve()}\n"
        f"Ranks to capture: {target_ranks}\n"
        "\nFor each rank:\n"
        "  1. Switch to the Blackjack table window.\n"
        "  2. Come back here and press ENTER when ready.\n"
        "  3. A selection overlay will appear — drag over the rank pip.\n"
    )

    for rank_label in target_ranks:
        rank_label = rank_label.upper()
        input(f"Ready to capture rank [{rank_label}]?  Press ENTER (or Ctrl-C to quit)... ")

        # Take a screenshot of the full screen.
        full_frame = grab_full_screen()

        # Let user select the exact rank region.
        print("Select the rank-pip area with click-drag.  ESC to skip this rank.")
        region = select_crop_region(app)
        if region is None:
            print(f"  Skipped {rank_label}.")
            continue

        # Crop from the full-screen frame.
        x, y, w, h = region.x, region.y, region.width, region.height
        crop = full_frame[y : y + h, x : x + w]
        if crop.size == 0:
            print(f"  Empty crop for {rank_label}; skipping.")
            continue

        # Convert and optionally preview.
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        if not args.no_preview:
            preview_template(gray, rank_label)

        confirm = input(f"  Save as '{rank_label}.png'? [Y/n] ").strip().lower()
        if confirm in ("", "y", "yes"):
            out = save_template(crop, rank_label, args.output)
            print(f"  Saved → {out}")
        else:
            print("  Discarded.")

    print(
        f"\nDone.  Templates in: {args.output.resolve()}\n"
        "Run 'blackjack-trainer' to start the overlay."
    )


if __name__ == "__main__":
    main()
