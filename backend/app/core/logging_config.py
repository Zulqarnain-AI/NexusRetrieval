# app/core/logging_config.py
import logging
import logging.handlers
import sys
from pathlib import Path
from pythonjsonlogger import jsonlogger


def configure_logging(log_level: str = "INFO", log_dir: str = "./logs") -> None:
    """
    Configures the root logger with two handlers:
      1. StreamHandler  → structured JSON to stdout (for container/cloud log aggregators)
      2. RotatingFileHandler → JSON log files, 10 MB max, 5 backups kept

    Why JSON logs? Tools like Datadog, Loki, and CloudWatch can parse key=value
    fields automatically. A plain-text log is unsearchable at scale.
    """
    Path(log_dir).mkdir(parents=True, exist_ok=True)

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Prevent duplicate handlers if called more than once (e.g. in tests)
    if root_logger.handlers:
        root_logger.handlers.clear()

    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    # ── Handler 1: stdout ────────────────────────────────────────────────────
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(numeric_level)
    stream_handler.setFormatter(formatter)

    # ── Handler 2: rotating file ─────────────────────────────────────────────
    log_file = Path(log_dir) / "nexus.log"
    file_handler = logging.handlers.RotatingFileHandler(
        filename=log_file,
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(numeric_level)
    file_handler.setFormatter(formatter)

    root_logger.addHandler(stream_handler)
    root_logger.addHandler(file_handler)

    # Silence noisy third-party loggers
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)