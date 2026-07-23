import os
import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import Settings
from app.logging_config import setup_logging
from app.services.document_service import init_db
from app.dependencies import get_settings, get_registry
from app.api.auth_api import router as auth_router
from app.api.components import router as components_router
from app.api.documents import router as documents_router
from app.api.pipelines import router as pipelines_router
from app.api.search import router as search_router
from app.api.logs import router as logs_router, attach_buffer_handler
from app.api.playground import router as playground_router

# Allowed Host values — prevents DNS rebinding (attacker maps evil.com → 127.0.0.1)
_ALLOWED_HOSTS = {"localhost", "127.0.0.1"}


def _warm_default_model() -> None:
    """Load the most-used embedding model in a background thread when the
    operator explicitly enables warm-up. This keeps startup fast and defers the
    heavy model download/load until the first actual request needs it."""
    try:
        from app.core.registry import ComponentRegistry
        embedder = ComponentRegistry.get_embedder("all_mpnet_base_v2")
        embedder.get_embeddings()
        logging.getLogger(__name__).info("Background model warm-up complete (all_mpnet_base_v2)")
    except Exception as exc:
        logging.getLogger(__name__).warning("Background model warm-up failed: %s", exc)


def _configure_tesseract() -> None:
    import platform
    if platform.system() != "Windows":
        return
    tess_dir = r"C:\Program Files\Tesseract-OCR"
    tess_exe = os.path.join(tess_dir, "tesseract.exe")
    if not os.path.isfile(tess_exe):
        return
    current_path = os.environ.get("PATH", "")
    if tess_dir not in current_path:
        os.environ["PATH"] = tess_dir + os.pathsep + current_path
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = tess_exe
        logging.getLogger(__name__).info("Tesseract configured: %s", tess_exe)
    except ImportError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    attach_buffer_handler()
    log_file = str(settings.log_file)
    setup_logging(settings.log_level, settings.log_format, log_file=log_file)
    os.environ["LOG_FILE"]  = log_file
    os.environ["HF_HOME"]   = str(settings.hf_home)
    if settings.transformers_offline != "0":
        os.environ["TRANSFORMERS_OFFLINE"] = settings.transformers_offline
    _configure_tesseract()
    settings.ensure_dirs()
    init_db(str(settings.db_path))
    try:
        get_registry()
    except Exception as e:
        logging.getLogger(__name__).error("Component registration failed: %s", e)
    logger = logging.getLogger(__name__)
    logger.info("RAG Studio started")
    for key, val in settings.storage_summary().items():
        logger.info("  storage.%-10s = %s", key, val)
    if settings.warm_default_model:
        threading.Thread(target=_warm_default_model, daemon=True, name="model-warmup").start()
    else:
        logger.info("Background model warm-up disabled; embedding models load lazily on first use")
    yield
    logging.getLogger(__name__).info("RAG Studio shutting down")


app = FastAPI(title="RAG Studio", version="1.0.0", lifespan=lifespan)

# ── Security middleware ───────────────────────────────────────────────────────

# CORS: only allow requests from the local server itself.
# This blocks cross-origin fetch attempts from malicious websites.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def host_guard(request: Request, call_next):
    """Reject requests whose Host header is not localhost/127.0.0.1.

    Prevents DNS-rebinding attacks: a malicious page changes DNS so
    'evil.com' resolves to 127.0.0.1, but the Host header still carries
    'evil.com' — this middleware blocks it at HTTP level.
    """
    host = request.headers.get("host", "").split(":")[0]
    if host not in _ALLOWED_HOSTS:
        logging.getLogger(__name__).warning(
            "Blocked request with unexpected Host header: %r", host
        )
        return JSONResponse(
            status_code=421,
            content={"detail": "Misdirected request — only localhost access is allowed"},
        )
    return await call_next(request)


# ── Exception handler ─────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger("rag_studio.error").exception(
        "Unhandled error on %s %s: %s", request.method, request.url.path, exc
    )
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(components_router)
app.include_router(documents_router)
app.include_router(pipelines_router)
app.include_router(search_router)
app.include_router(logs_router)
app.include_router(playground_router)

# ── Static + SPA ──────────────────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def serve_spa():
    return FileResponse(
        os.path.join(static_dir, "index.html"),
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
