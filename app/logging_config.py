import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_logging(level: str = "INFO", fmt: str = "json", log_file: str | None = None):
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    if fmt == "json":
        try:
            from pythonjsonlogger import jsonlogger
            console.setFormatter(
                jsonlogger.JsonFormatter("%(asctime)s %(name)s %(levelname)s %(message)s")
            )
        except ImportError:
            console.setFormatter(
                logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
            )
    else:
        console.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )

    handlers: list[logging.Handler] = [console]

    # File handler (plain text — easier to tail / serve via API)
    if log_file:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        handlers.append(file_handler)

    root.handlers = handlers

    # Quiet noisy third-party loggers
    for noisy in ("httpx", "httpcore", "chromadb", "urllib3", "transformers", "sentence_transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
