import os
import logging
from collections import deque
from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logs", tags=["logs"])

# In-memory ring buffer: captures last 500 log records regardless of file config
_log_buffer: deque[dict] = deque(maxlen=500)


class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord):
        try:
            _log_buffer.append({
                "ts": self.formatter.formatTime(record, "%Y-%m-%d %H:%M:%S") if self.formatter else "",
                "level": record.levelname,
                "name": record.name.split(".")[-1],
                "msg": record.getMessage(),
            })
        except Exception:
            pass


def attach_buffer_handler():
    """Call once at startup to attach the in-memory buffer to the root logger."""
    handler = _BufferHandler()
    handler.setFormatter(logging.Formatter())
    logging.getLogger().addHandler(handler)


@router.get("", response_class=PlainTextResponse)
def get_logs_text(lines: int = Query(default=200, ge=1, le=500), level: str = Query(default="ALL")):
    """Return last N log lines as plain text (easy to display in a <pre>)."""
    wanted = level.upper()
    filtered = [
        r for r in _log_buffer
        if wanted == "ALL" or r["level"] == wanted
    ]
    tail = list(filtered)[-lines:]
    return "\n".join(f"{r['ts']} [{r['level']:8}] {r['name']}: {r['msg']}" for r in tail)


@router.get("/json")
def get_logs_json(lines: int = Query(default=200, ge=1, le=500), level: str = Query(default="ALL")):
    """Return last N log records as JSON array."""
    wanted = level.upper()
    filtered = [
        r for r in _log_buffer
        if wanted == "ALL" or r["level"] == wanted
    ]
    return list(filtered)[-lines:]


@router.get("/file", response_class=PlainTextResponse)
def get_log_file(lines: int = Query(default=200, ge=1, le=2000)):
    """Read last N lines from the log file on disk (if configured)."""
    log_path = os.environ.get("LOG_FILE", "")
    if not log_path or not os.path.isfile(log_path):
        return "(no log file configured — set LOG_FILE env var)"
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        return "".join(all_lines[-lines:])
    except Exception as e:
        return f"Error reading log file: {e}"
