"""Centralised logging configuration."""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Optional


def configure_logging(
    level: int = logging.INFO,
    log_file: Optional[Path] = None,
    fmt: str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
) -> None:
    """Configure root logger with console + optional file handler."""
    root = logging.getLogger()
    root.setLevel(level)

    # Remove existing handlers to avoid duplicate output when called twice.
    root.handlers.clear()

    formatter = logging.Formatter(fmt, datefmt="%H:%M:%S")

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    # Suppress noisy third-party loggers.
    logging.getLogger("PySide6").setLevel(logging.WARNING)
    logging.getLogger("PIL").setLevel(logging.WARNING)
