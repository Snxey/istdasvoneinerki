# Blackjack Trainer

A local desktop assistant that watches a user-selected screen region containing
a Blackjack table, detects the current hand state via template matching, and
shows real-time **basic-strategy** recommendations in a small always-on-top overlay.

```
┌─────────────────────────────────────┐
│ ● BJ Trainer         [⏸] [DBG] [×] │
├─────────────────────────────────────┤
│  Player: T ♠  6 ♥    (Hard 16)     │
│  Dealer: 9 ♣                        │
├─────────────────────────────────────┤
│            ██ SURRENDER ██          │
│  Hard 16 vs 9 → SURRENDER …        │
├─────────────────────────────────────┤
│  ◉ HIGH  conf: 0.87                 │
└─────────────────────────────────────┘
```

---

## Quick Start

### 1 — Install dependencies

```bash
cd blackjack_trainer
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

> **Tesseract** is *not required* — the detector uses template matching only.

### 2 — Capture card templates

Before using the trainer you must capture rank-pip templates from the specific
table theme you are playing.

```bash
python scripts/capture_templates.py --output assets/templates
```

Follow the interactive prompts.  You need one clean image per rank (13 total:
2–9, T, J, Q, K, A).

See **Calibration** section below for details.

### 3 — Launch the overlay

```bash
blackjack-trainer
```

On first launch a full-screen region-selector will appear.  Click and drag
over the Blackjack table area.  The selection is saved to
`~/.config/blackjack_trainer/config.json`.

Force re-selection at any time:

```bash
blackjack-trainer --select-region
```

### 4 — Run tests

```bash
pytest
```

---

## CLI Options

| Flag | Description |
|---|---|
| `--config PATH` | Use a specific config JSON file |
| `--select-region` | Force region-selection dialog |
| `--debug` | Save card crops to `/tmp/bj_debug/` |
| `--log-level LEVEL` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## Configuration

Copy `config.example.json` to `~/.config/blackjack_trainer/config.json` and edit:

```jsonc
{
  "region": { "x": 100, "y": 100, "width": 900, "height": 600 },
  "capture": { "fps": 5, "debug": false },
  "detector": {
    "template_dir": "assets/templates",
    "confidence_threshold": 0.72,
    // Card crop regions as fractions [x, y, w, h] of the captured frame:
    "player_card_regions": [[0.30, 0.58, 0.09, 0.18], [0.41, 0.58, 0.09, 0.18]],
    "dealer_card_regions": [[0.41, 0.12, 0.09, 0.18]]
  },
  "rules": {
    "num_decks": 6,
    "dealer_hits_soft17": false,
    "double_after_split": true,
    "surrender_allowed": false
  },
  "hotkeys": { "pause_resume": "F8", "debug_toggle": "F9" }
}
```

### Card region layout

The `player_card_regions` and `dealer_card_regions` values are fractions of the
captured frame.  Each entry is `[x_frac, y_frac, width_frac, height_frac]`.

To find the correct values:
1. Run with `--debug` to save crops to `/tmp/bj_debug/`.
2. Open the debug crops and check whether the rank pip is visible.
3. Adjust fractions until the pip is clearly centred in the crop.

---

## Calibration

### Recalibrating for a new table theme

1. Launch the table in your browser at the zoom level you will use during play.
2. Run:
   ```bash
   python scripts/capture_templates.py --output assets/templates
   ```
3. For each rank, switch to the table, wait for a card with that rank to appear,
   then press ENTER and drag over the **top-left rank pip** (the small character
   in the corner of the card).
4. Inspect the preview window — the pip should be centred and sharp.
5. Repeat for all 13 ranks.
6. Restart the trainer.

### Tips for high confidence scores

- Capture pips at **exactly** the browser zoom level you use during play (Ctrl+0
  for 100 % is recommended).
- Use cards with **unobstructed** corners (no other card overlapping the pip).
- If J/Q/K are rendered differently by suit, capture the most common variant.
- If confidence is consistently below 0.70 for a rank, increase the
  `template_scale_range` to `[0.75, 1.25]` in config to enable multi-scale
  matching (slightly higher CPU usage).

---

## Project Structure

```
src/blackjack_trainer/
├── app.py              Entry point, Qt application setup
├── config.py           Config dataclasses, load/save JSON
├── capture.py          mss screen-grab, QThread worker
├── detector/
│   ├── regions.py      Fractional card-region geometry
│   ├── templates.py    Template loader and cache
│   ├── cards.py        OpenCV template-matching logic
│   └── state.py        Aggregates detections → GameState
├── strategy/
│   ├── models.py       Card, Hand, GameState, Action
│   ├── rules.py        TableRules configuration
│   └── engine.py       Basic-strategy lookup tables
└── ui/
    ├── overlay.py      Always-on-top transparent overlay
    └── selector.py     Click-drag region selection dialog
```

---

## Hotkeys

| Key | Action |
|---|---|
| **F8** | Pause / resume capture |
| **F9** | Toggle debug mode |
| Drag overlay | Move the overlay window |

---

## Strategy Tables

The engine implements standard multi-deck basic strategy (Wizard of Odds) with
support for the following rule variations:

| Rule | Option | Effect |
|---|---|---|
| Decks | 1 / 2 / 4 / 6 / 8 | Changes edge calculations |
| Soft 17 | `dealer_hits_soft17` | H17 adds ~0.2 % house edge |
| DAS | `double_after_split` | Fewer splits without DAS |
| Late Surrender | `surrender_allowed` | Adds SURRENDER action |

Strategy tables use action-code fallback chains so every rule combination
resolves to a concrete `HIT / STAND / DOUBLE / SPLIT / SURRENDER`.

---

## Known Limitations

- **Template sensitivity**: Match quality depends heavily on the captured
  templates matching the rendered card resolution and font rendering exactly.
  A 5 % browser zoom change can drop confidence significantly.

- **Single table theme**: The detector is calibrated for one table skin at a
  time.  Switching to a different casino theme requires re-capturing templates.

- **Suit detection not implemented**: Strategy does not require suit information
  so suits are ignored; the overlay always shows rank only.

- **Partial occlusion**: If the rank pip is covered by another card the
  detector will return `None` (low confidence) and the overlay shows
  `UNCERTAIN` rather than guessing.

- **Animated transitions**: During card-deal animations the crop may be
  partially drawn.  The confidence guard handles this gracefully.

- **Multi-monitor**: The region selector covers only the primary monitor's
  virtual geometry; multi-monitor setups may need manual config coordinates.

- **No live deck counting**: The strategy engine implements basic strategy
  only — it does not track which cards have been played.

---

## Future Improvements

- **Suit detection** using a second template set for suit pips (enables
  strategy notes like "coloured suits" in some jurisdictions).

- **Neural-network card detector** replacing template matching — a small
  CNN trained on synthetic card renders would be far more robust to zoom,
  font, and theme variation.

- **Automatic region calibration** — detect the table boundary automatically
  from the game UI's characteristic colour/shape profile.

- **Running count display** — track a Hi-Lo running count from detected cards
  as an optional educational feature.

- **Deviation chart support** — for advanced players, show index deviations
  (Illustrious 18) when count conditions are met.

- **Config GUI** — a settings panel within the overlay for changing rules
  without editing JSON.

- **macOS / Windows testing** — the capture and UI code should work cross-
  platform, but needs explicit CI testing.

- **OCR fallback** — optional `pytesseract` path when template matching fails
  (already listed as an optional dependency).
